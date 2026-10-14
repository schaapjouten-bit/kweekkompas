/* Optional local JSON backup folder. Garden data remains saved in the app first. */
(function attachLocalBackup(root, makeApi) {
    const api = makeApi();
    root.KweekLocalBackup = api;
    if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createModule() {
    const DATABASE = 'KweekKompasBackupLocation';
    const STORE = 'settings';
    const DIRECTORY_KEY = 'directory';
    const STATUS_KEY = 'last-saved';
    const FILE_NAME = 'KweekKompas-back-up.json';

    function create(options = {}) {
        const io = {
            indexedDB: options.indexedDB || globalThis.indexedDB,
            pickDirectory: options.pickDirectory || (typeof globalThis.showDirectoryPicker === 'function'
                ? settings => globalThis.showDirectoryPicker(settings)
                : null),
            capture: options.capture || (() => globalThis.KweekLocalData?.capture()),
            document: options.document || globalThis.document,
            persistence: options.persistence || null,
            now: options.now || (() => new Date())
        };

        let databasePromise = null;
        let directory = null;
        let lastSaved = null;
        let busy = false;
        let dirty = false;
        let failure = '';
        let permissionNeeded = false;
        let persistenceWarning = false;
        let writer = null;
        let connectedStatus = null;
        let connectedOriginal = null;
        let initialized = false;
        let initPromise = null;

        function openDatabase() {
            if (!io.indexedDB) return Promise.reject(new Error('Lokale opslag is niet beschikbaar.'));
            if (databasePromise) return databasePromise;
            databasePromise = new Promise((resolve, reject) => {
                const request = io.indexedDB.open(DATABASE, 1);
                request.onupgradeneeded = event => {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' });
                };
                request.onsuccess = event => resolve(event.target.result);
                request.onerror = event => reject(event.target.error || new Error('Lokale opslag is niet beschikbaar.'));
            });
            return databasePromise;
        }

        async function readStored(key) {
            if (io.persistence) return io.persistence.get(key);
            const db = await openDatabase();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE, 'readonly');
                const request = tx.objectStore(STORE).get(key);
                request.onsuccess = () => resolve(request.result?.value);
                request.onerror = () => reject(request.error || new Error('De back-upinstelling kon niet worden gelezen.'));
                tx.onabort = () => reject(tx.error || new Error('De back-upinstelling kon niet worden gelezen.'));
            });
        }

        async function writeStored(key, value) {
            if (io.persistence) return io.persistence.set(key, value);
            const db = await openDatabase();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE, 'readwrite');
                tx.objectStore(STORE).put({ key, value });
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error || new Error('De back-upinstelling kon niet worden bewaard.'));
                tx.onabort = () => reject(tx.error || new Error('De back-upinstelling kon niet worden bewaard.'));
            });
        }

        function formatDate(value) {
            try {
                return new Intl.DateTimeFormat('nl-NL', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
            } catch { return new Date(value).toLocaleString(); }
        }

        function statusMessage() {
            if (!io.pickDirectory) return 'Deze browser kan niet automatisch naar een gekozen map schrijven. Je kunt wel een back-up downloaden.';
            if (!directory) return 'Nog geen back-upmap gekozen. Je tuin wordt wel automatisch in deze browser bewaard.';
            if (permissionNeeded) return 'De browser vraagt opnieuw toegang tot de map. Kies de map opnieuw om de back-up te hervatten.';
            if (busy) return 'Back-up wordt bijgewerkt…';
            if (failure) return `${failure} Je tuin staat nog op dit apparaat.`;
            if (lastSaved?.savedAt) {
                const count = Number.isFinite(lastSaved.seedCount) ? ` · ${lastSaved.seedCount} planten` : '';
                return `Back-up bijgewerkt ${formatDate(lastSaved.savedAt)}${count}${persistenceWarning ? ' · mapkeuze kan niet worden onthouden' : ''}.`;
            }
            return `Gekozen map: ${directory.name || 'back-upmap'}. De eerste back-up wordt gemaakt zodra je tuin wijzigt.`;
        }

        function render(target = io.document) {
            if (!target) return;
            const status = target.querySelector?.('#local-backup-status');
            const button = target.querySelector?.('#local-backup-choose');
            if (status) status.textContent = statusMessage();
            if (button) {
                button.hidden = !io.pickDirectory;
                button.textContent = permissionNeeded ? 'Map opnieuw kiezen' : directory ? 'Back-upmap wijzigen' : 'Kies back-upmap';
                button.disabled = busy;
            }
        }

        async function requestWritePermission(handle, request = false) {
            if (typeof handle.queryPermission !== 'function') return true;
            let permission = await handle.queryPermission({ mode: 'readwrite' });
            if (permission !== 'granted' && request && typeof handle.requestPermission === 'function') {
                permission = await handle.requestPermission({ mode: 'readwrite' });
            }
            return permission === 'granted';
        }

        function friendlyWriteError(error) {
            if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
                permissionNeeded = true;
                return 'Geen toegang tot de back-upmap.';
            }
            return 'De back-up kon niet naar de gekozen map worden geschreven.';
        }

        async function writeSnapshot() {
            if (!directory) return;
            permissionNeeded = !(await requestWritePermission(directory));
            if (permissionNeeded) throw Object.assign(new Error('Geen toegang tot de back-upmap.'), { name: 'NotAllowedError' });
            if (typeof directory.getFileHandle !== 'function') throw new Error('Deze map kan niet worden gebruikt voor een back-up.');

            const backup = await io.capture();
            if (!backup || !Array.isArray(backup.seeds) || !Number.isInteger(Number(backup.backupVersion))) {
                throw new Error('De tuin kon niet veilig als back-up worden klaargemaakt.');
            }
            const file = await directory.getFileHandle(FILE_NAME, { create: true });
            const writable = await file.createWritable();
            try {
                await writable.write(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
                await writable.close();
            } catch (error) {
                try { await writable.abort?.(); } catch { /* The browser may already have closed the file. */ }
                throw error;
            }

            lastSaved = { savedAt: io.now().toISOString(), seedCount: backup.seeds.length };
            failure = '';
            try { await writeStored(STATUS_KEY, lastSaved); }
            catch { persistenceWarning = true; }
        }

        function flush() {
            if (!directory) return Promise.resolve(false);
            dirty = true;
            if (writer) return writer;
            writer = (async () => {
                while (dirty && directory) {
                    dirty = false;
                    busy = true;
                    failure = '';
                    render();
                    try {
                        await writeSnapshot();
                    } catch (error) {
                        dirty = false;
                        failure = friendlyWriteError(error);
                        console.warn('[KweekKompas] Lokale back-up is niet bijgewerkt.');
                    } finally {
                        busy = false;
                        render();
                    }
                }
                return !failure;
            })().finally(() => { writer = null; });
            return writer;
        }

        function changed() {
            if (!directory) return Promise.resolve(false);
            return flush();
        }

        async function chooseDirectory() {
            if (!io.pickDirectory) return false;
            try {
                await init();
                const selected = await io.pickDirectory({ mode: 'readwrite' });
                if (!selected) return false;
                directory = selected;
                failure = '';
                permissionNeeded = !(await requestWritePermission(directory, true));
                persistenceWarning = false;
                try { await writeStored(DIRECTORY_KEY, directory); }
                catch { persistenceWarning = true; }
                render();
                if (permissionNeeded) {
                    failure = 'Geen toegang tot de back-upmap.';
                    render();
                    return false;
                }
                await flush();
                return !failure;
            } catch (error) {
                if (error?.name === 'AbortError') return false;
                failure = error?.name === 'NotAllowedError'
                    ? 'Geen toegang tot de gekozen map.'
                    : 'De back-upmap kon niet worden gekozen.';
                render();
                return false;
            }
        }

        function connect(status = globalThis.KweekCloudStatus) {
            if (!status || typeof status.changed !== 'function' || connectedStatus === status) return;
            connectedStatus = status;
            connectedOriginal = status.changed;
            status.changed = function changedAndBackUp(...args) {
                try { return connectedOriginal.apply(this, args); }
                finally { changed(); }
            };
        }

        function init() {
            if (initPromise) return initPromise;
            initPromise = (async () => {
                try {
                    const savedDirectory = await readStored(DIRECTORY_KEY);
                    if (savedDirectory) directory = savedDirectory;
                    lastSaved = await readStored(STATUS_KEY) || null;
                    initialized = true;
                    if (directory) {
                        permissionNeeded = !(await requestWritePermission(directory));
                        if (!permissionNeeded) await flush();
                    }
                } catch {
                    initialized = true;
                    persistenceWarning = true;
                }
                render();
                return statusMessage();
            })();
            return initPromise;
        }

        function state() {
            return { initialized, hasDirectory: !!directory, busy, failure, permissionNeeded, persistenceWarning, lastSaved: lastSaved && { ...lastSaved }, status: statusMessage() };
        }

        return { init, connect, changed, flush, chooseDirectory, render, state };
    }

    return { create, FILE_NAME };
});

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
    const HISTORY_DIRECTORY = 'KweekKompas-versies';

    function create(options = {}) {
        const io = {
            indexedDB: options.indexedDB || globalThis.indexedDB,
            pickDirectory: options.pickDirectory || (typeof globalThis.showDirectoryPicker === 'function'
                ? settings => globalThis.showDirectoryPicker(settings)
                : null),
            capture: options.capture || (() => globalThis.KweekLocalData?.capture()),
            document: options.document || globalThis.document,
            persistence: options.persistence || null,
            scope: typeof options.scope === 'function' ? options.scope : () => options.scope ?? globalThis.KweekScope,
            now: options.now || (() => new Date())
        };

        let databasePromise = null;
        let directory = null;
        let lastSaved = null;
        let busy = false;
        let dirty = false;
        let forceWrite = false;
        let failure = '';
        let feedback = '';
        let permissionNeeded = false;
        let persistenceWarning = false;
        let protectedBackup = false;
        let writer = null;
        let connectedStatus = null;
        let connectedOriginal = null;
        let initialized = false;
        let initPromise = null;

        function activeScope() {
            return io.scope?.() || null;
        }

        function openDatabase() {
            if (!io.indexedDB) return Promise.reject(new Error('Lokale opslag is niet beschikbaar.'));
            if (databasePromise) return databasePromise;
            databasePromise = new Promise((resolve, reject) => {
                const request = io.indexedDB.open(activeScope()?.database(DATABASE) || DATABASE, 1);
                request.onupgradeneeded = event => {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' });
                };
                request.onsuccess = event => {
                    const db = event.target.result;
                    db.onclose = () => { databasePromise = null; };
                    db.onversionchange = () => { db.close(); databasePromise = null; };
                    resolve(db);
                };
                request.onerror = event => reject(event.target.error || new Error('Lokale opslag is niet beschikbaar.'));
                request.onblocked = () => reject(new Error('Lokale opslag is niet beschikbaar.'));
            }).catch(error => {
                databasePromise = null;
                throw error;
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

        function normalizeLastSaved(value) {
            if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
            if (typeof value.savedAt !== 'string' || !Number.isFinite(Date.parse(value.savedAt))) return null;
            const seedCount = Number.isInteger(value.seedCount) && value.seedCount >= 0 ? value.seedCount : null;
            if (seedCount === null) return null;
            return { savedAt: value.savedAt, seedCount };
        }

        function formatSeedCount(count) {
            return count === 1 ? '1 plant' : `${count} planten`;
        }

        function lastSavedSummary() {
            if (!lastSaved?.savedAt || !Number.isFinite(Date.parse(lastSaved.savedAt))) return '';
            const count = Number.isInteger(lastSaved.seedCount) && lastSaved.seedCount >= 0
                ? ` · ${formatSeedCount(lastSaved.seedCount)}`
                : '';
            return `Laatste back-up: ${formatDate(lastSaved.savedAt)}${count}`;
        }

        function statusMessage() {
            if (!io.pickDirectory) return 'Deze browser kan niet automatisch naar een gekozen map schrijven. Je kunt wel een back-up downloaden.';
            if (!directory) return failure || 'Nog geen back-upmap gekozen. Je tuin wordt wel automatisch in deze browser bewaard.';
            if (permissionNeeded) {
                const last = lastSavedSummary();
                return `De browser vraagt opnieuw toegang tot de map. Klik op Back-up nu maken om toegang te geven of kies de map opnieuw.${last ? ` ${last}.` : ''}`;
            }
            if (busy) return 'Back-up wordt bijgewerkt…';
            if (protectedBackup) return 'Je tuin is leeg. De bestaande back-up is behouden. Gebruik Back-up herstellen om je tuin terug te halen.';
            if (failure) {
                const last = lastSavedSummary();
                return `${failure} Je tuin staat nog op dit apparaat.${last ? ` ${last}.` : ''}`;
            }
            if (lastSaved?.savedAt) {
                const prefix = feedback ? `${feedback} ` : '';
                const count = Number.isInteger(lastSaved.seedCount) && lastSaved.seedCount >= 0 ? ` · ${formatSeedCount(lastSaved.seedCount)}` : '';
                const folder = directory.name ? ` · map: ${directory.name}` : '';
                return `${prefix}Back-up bijgewerkt ${formatDate(lastSaved.savedAt)}${count}${folder}${persistenceWarning ? ' · mapkeuze kan niet worden onthouden' : ''}.`;
            }
            return `Gekozen map: ${directory.name || 'back-upmap'}. De eerste back-up wordt automatisch gemaakt zodra je tuin wijzigt of via Back-up nu maken.`;
        }

        function render(target = io.document) {
            if (!target) return;
            const status = target.querySelector?.('#local-backup-status');
            const button = target.querySelector?.('#local-backup-choose');
            const nowButton = target.querySelector?.('#local-backup-now');
            if (status) status.textContent = statusMessage();
            if (button) {
                button.hidden = !io.pickDirectory;
                button.textContent = permissionNeeded ? 'Map opnieuw kiezen' : directory ? 'Back-upmap wijzigen' : 'Kies back-upmap';
                button.disabled = busy;
            }
            if (nowButton) {
                nowButton.hidden = !io.pickDirectory;
                nowButton.textContent = busy ? 'Bezig met back-up…' : 'Back-up nu maken';
                nowButton.disabled = busy || !directory;
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

        async function readExisting(handle) {
            let file;
            try { file = await handle.getFileHandle(FILE_NAME); }
            catch (error) { if (error?.name === 'NotFoundError') return null; throw error; }
            const contents = await file.getFile();
            return { text: await contents.text(), lastModified: contents.lastModified };
        }

        function hasGardenRecords(backup) {
            if (Array.isArray(backup)) return backup.length > 0; // Older downloaded seed-only backups.
            return ['seeds', 'wishlist', 'reminders', 'calendar'].some(key => {
                const value = backup?.[key];
                return value && typeof value === 'object' && Object.keys(value).length > 0;
            });
        }

        async function writeFile(file, text) {
            const writable = await file.createWritable();
            try {
                await writable.write(new Blob([text], { type: 'application/json' }));
                await writable.close();
            } catch (error) {
                try { await writable.abort?.(); } catch { /* The browser may already have closed the file. */ }
                throw error;
            }
        }

        async function preservePrevious(handle, text) {
            const history = await handle.getDirectoryHandle(HISTORY_DIRECTORY, { create: true });
            const stamp = io.now().toISOString().replace(/[:.]/g, '-');
            const name = `KweekKompas-back-up-${stamp}-${globalThis.crypto.randomUUID()}.json`;
            const file = await history.getFileHandle(name, { create: true });
            // Only replace the current backup after the previous bytes are safely closed.
            await writeFile(file, text);
        }

        async function resolveBackupDirectory(rootHandle, create = false) {
            const scope = activeScope();
            if (!scope || scope.legacy || !scope.id) return rootHandle;
            const safeId = String(scope.id).replace(/[^a-zA-Z0-9_-]/g, '_');
            const subName = `KweekKompas-account-${safeId}`;
            try {
                return await rootHandle.getDirectoryHandle(subName, { create });
            } catch (error) {
                if (!create && error?.name === 'NotFoundError') return null;
                throw error;
            }
        }

        async function writeSnapshot({ force = false } = {}) {
            if (!directory) return;
            const rootHandle = directory;
            permissionNeeded = !(await requestWritePermission(rootHandle));
            if (permissionNeeded) throw Object.assign(new Error('Geen toegang tot de back-upmap.'), { name: 'NotAllowedError' });
            if (typeof rootHandle.getFileHandle !== 'function') throw new Error('Deze map kan niet worden gebruikt voor een back-up.');
            const target = await resolveBackupDirectory(rootHandle, true);

            const backup = await io.capture();
            if (!backup || !Array.isArray(backup.seeds) || !Number.isInteger(Number(backup.backupVersion))) {
                throw new Error('De tuin kon niet veilig als back-up worden klaargemaakt.');
            }
            const previous = await readExisting(target);
            const text = JSON.stringify(backup, null, 2);
            protectedBackup = false;
            if (previous && !hasGardenRecords(backup)) {
                let previousBackup;
                try { previousBackup = JSON.parse(previous.text); } catch { /* Preserve an unreadable existing backup too. */ }
                if (!previousBackup || hasGardenRecords(previousBackup)) {
                    protectedBackup = true;
                    return;
                }
            }
            if (!previous || previous.text !== text || force) {
                if (previous && previous.text !== text) await preservePrevious(target, previous.text);
                const file = await target.getFileHandle(FILE_NAME, { create: true });
                await writeFile(file, text);
            }

            lastSaved = {
                savedAt: (!force && previous?.text === text && Number.isFinite(previous.lastModified))
                    ? new Date(previous.lastModified).toISOString()
                    : io.now().toISOString(),
                seedCount: backup.seeds.length
            };
            failure = '';
            if (force) feedback = 'Back-up nu opgeslagen.';
            try { await writeStored(STATUS_KEY, lastSaved); }
            catch { persistenceWarning = true; }
        }

        function flush({ force = false } = {}) {
            if (!directory) return Promise.resolve(false);
            dirty = true;
            if (force) forceWrite = true;
            if (writer) return writer;
            writer = (async () => {
                while (dirty && directory) {
                    const runForce = forceWrite;
                    dirty = false;
                    forceWrite = false;
                    busy = true;
                    failure = '';
                    if (!runForce) feedback = '';
                    render();
                    try {
                        await writeSnapshot({ force: runForce });
                    } catch (error) {
                        dirty = false;
                        forceWrite = false;
                        feedback = '';
                        failure = friendlyWriteError(error);
                        console.warn('[KweekKompas] Lokale back-up is niet bijgewerkt.');
                    } finally {
                        busy = false;
                        render();
                    }
                }
                return !failure && !protectedBackup;
            })().finally(() => { writer = null; });
            return writer;
        }

        async function changed() {
            if (!initialized && initPromise) {
                try { await initPromise; } catch { /* ignore init error */ }
            }
            if (!directory) return false;
            return flush();
        }

        async function backupNow() {
            if (!io.pickDirectory || !directory) {
                failure = 'Kies eerst een back-upmap.';
                feedback = '';
                render();
                return false;
            }
            if (busy) return false;
            try {
                const granted = await requestWritePermission(directory, true);
                if (!granted) {
                    permissionNeeded = true;
                    failure = 'Geen toegang tot de back-upmap.';
                    feedback = '';
                    render();
                    return false;
                }
                permissionNeeded = false;
                failure = '';
                feedback = '';
                return await flush({ force: true });
            } catch (error) {
                failure = friendlyWriteError(error);
                feedback = '';
                render();
                return false;
            }
        }

        async function chooseDirectory() {
            if (!io.pickDirectory || busy) return false;
            try {
                // Call the browser folder picker directly inside the user gesture before any async storage read.
                const selected = await io.pickDirectory({ mode: 'readwrite' });
                if (!selected) return false;
                directory = selected;
                lastSaved = null;
                failure = '';
                feedback = '';
                protectedBackup = false;
                permissionNeeded = !(await requestWritePermission(directory, true));
                persistenceWarning = false;
                try {
                    await writeStored(DIRECTORY_KEY, directory);
                    await writeStored(STATUS_KEY, null);
                } catch { persistenceWarning = true; }
                render();
                if (permissionNeeded) {
                    failure = 'Geen toegang tot de gekozen map.';
                    render();
                    return false;
                }
                const ok = await flush();
                if (ok) {
                    feedback = 'Back-upmap ingesteld.';
                    render();
                }
                return ok;
            } catch (error) {
                if (error?.name === 'AbortError') return false;
                feedback = '';
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
                    const savedStatus = normalizeLastSaved(await readStored(STATUS_KEY));
                    if (!directory && savedDirectory) {
                        directory = savedDirectory;
                        lastSaved = savedStatus;
                    } else if (!directory) {
                        lastSaved = savedStatus;
                    }
                    initialized = true;
                    if (directory && !writer) {
                        permissionNeeded = !(await requestWritePermission(directory));
                        if (!permissionNeeded) await flush();
                    }
                } catch {
                    initialized = true;
                    persistenceWarning = true;
                    initPromise = null;
                }
                render();
                return statusMessage();
            })();
            return initPromise;
        }

        function state() {
            return { initialized, hasDirectory: !!directory, busy, failure, feedback, protectedBackup, permissionNeeded, persistenceWarning, lastSaved: lastSaved && { ...lastSaved }, status: statusMessage() };
        }

        return { init, connect, changed, flush, backupNow, chooseDirectory, render, state };
    }

    return { create, FILE_NAME, HISTORY_DIRECTORY };
});

const assert = require('node:assert/strict');
const test = require('node:test');
const { create, FILE_NAME, HISTORY_DIRECTORY } = require('../local-backup.js');

function createHarness({ initial = {}, permission = 'granted', pickError } = {}) {
    const values = new Map(Object.entries(initial));
    const writes = [];
    const files = new Map();
    const history = new Map();
    let historyFailure = false;
    let readFailure = false;
    let backup = { backupVersion: 1, seeds: [{ id: 1, naam: 'Tomaat' }] };
    let permissionState = permission;
    const persistence = {
        async get(key) { return values.get(key); },
        async set(key, value) { values.set(key, value); }
    };
    function fileHandle(collection, name, main = false) {
        return {
            async getFile() {
                if (readFailure) throw new Error('Read failed');
                return { text: async () => collection.get(name), lastModified: Date.parse('2026-10-14T10:30:00.000Z') };
            },
            async createWritable() {
                let content = '';
                return {
                    async write(blob) { content = await blob.text(); },
                    async close() {
                        if (!main && historyFailure) throw new Error('Archive failed');
                        collection.set(name, content);
                        if (main) writes.push(JSON.parse(content));
                    }
                };
            }
        };
    }
    const directory = {
        name: 'KweekKompas back-ups',
        async queryPermission() { return permissionState; },
        async requestPermission() { permissionState = 'granted'; return permissionState; },
        async getFileHandle(name, options = {}) {
            assert.equal(name, FILE_NAME);
            if (!files.has(name) && !options.create) throw Object.assign(new Error('Missing'), { name: 'NotFoundError' });
            return fileHandle(files, name, true);
        },
        async getDirectoryHandle(name, { create }) {
            assert.equal(name, HISTORY_DIRECTORY);
            assert.equal(create, true);
            return { getFileHandle: async name => fileHandle(history, name) };
        }
    };
    const manager = create({
        persistence,
        pickDirectory: async () => {
            if (pickError) throw pickError;
            return directory;
        },
        capture: async () => structuredClone(backup),
        now: () => new Date('2026-10-14T10:30:00.000Z')
    });
    return {
        manager, values, writes, directory, persistence, files, history,
        setBackup(value) { backup = value; },
        setPermission(value) { permissionState = value; },
        failHistory(value = true) { historyFailure = value; },
        failRead(value = true) { readFailure = value; }
    };
}

test('chosen folder receives a valid backup and later garden changes update it', async () => {
    const h = createHarness();
    await h.manager.init();
    assert.equal(h.manager.state().hasDirectory, false);

    assert.equal(await h.manager.chooseDirectory(), true);
    assert.equal(h.writes.length, 1);
    assert.equal(h.writes[0].seeds[0].naam, 'Tomaat');
    assert.equal(h.values.get('directory'), h.directory);
    assert.deepEqual(h.manager.state().lastSaved, { savedAt: '2026-10-14T10:30:00.000Z', seedCount: 1 });

    h.setBackup({ backupVersion: 1, seeds: [{ id: 1, naam: 'Komkommer' }, { id: 2, naam: 'Sla' }] });
    await h.manager.changed();
    assert.equal(h.writes.length, 2);
    assert.deepEqual(h.writes[1].seeds.map(seed => seed.naam), ['Komkommer', 'Sla']);
    assert.equal(h.manager.state().lastSaved.seedCount, 2);
    assert.equal(h.history.size, 1);
    assert.equal(JSON.parse([...h.history.values()][0]).seeds[0].naam, 'Tomaat');
});

test('saved folder is reused on next app start and refreshed from the latest garden', async () => {
    const first = createHarness();
    await first.manager.chooseDirectory();

    const second = createHarness({ initial: Object.fromEntries(first.values) });
    second.setBackup({ backupVersion: 1, seeds: [{ id: 3, naam: 'Courgette' }] });
    await second.manager.init();

    assert.equal(second.manager.state().hasDirectory, true);
    assert.equal(first.writes.length, 2);
    assert.equal(first.writes[1].seeds[0].naam, 'Courgette');
});

test('missing permission keeps the local garden safe and reports that the folder must be chosen again', async () => {
    const h = createHarness({ permission: 'prompt' });
    await h.manager.chooseDirectory();
    h.setPermission('prompt');
    h.writes.length = 0;

    await h.manager.flush();
    assert.equal(h.writes.length, 0);
    assert.equal(h.manager.state().permissionNeeded, true);
    assert.match(h.manager.state().status, /toegang tot de map/i);
});

test('canceling folder selection does not remove the existing location', async () => {
    const h = createHarness();
    await h.manager.chooseDirectory();
    const before = h.values.get('directory');
    const manager = create({ persistence: h.persistence, pickDirectory: async () => { throw Object.assign(new Error('cancel'), { name: 'AbortError' }); } });
    // Exercise the picker-cancel behavior independently: cancellation is quiet and non-destructive.
    assert.equal(await manager.chooseDirectory(), false);
    assert.equal(h.values.get('directory'), before);
});

test('status hook triggers a backup after saved garden changes', async () => {
    const h = createHarness();
    await h.manager.chooseDirectory();
    const status = { calls: 0, changed() { this.calls++; } };
    h.manager.connect(status);
    h.setBackup({ backupVersion: 1, seeds: [{ id: 1, naam: 'Gewijzigde tomaat' }] });
    status.changed('restore-internal');
    await new Promise(resolve => setTimeout(resolve, 0));

    assert.equal(status.calls, 1);
    assert.equal(h.writes.length, 2);
});

test('empty app with remembered folder preserves the backup during startup and later flushes', async () => {
    const h = createHarness();
    await h.manager.chooseDirectory();
    const original = h.files.get(FILE_NAME);
    const savedStatus = h.values.get('last-saved');
    const empty = { backupVersion: 1, seeds: [], calendar: {}, wishlist: [], reminders: [] };
    const reopened = create({ persistence: h.persistence, capture: async () => empty, pickDirectory: async () => h.directory });
    await reopened.init();
    assert.equal(reopened.state().protectedBackup, true);
    assert.match(reopened.state().status, /bestaande back-up is behouden.*Back-up herstellen/);
    assert.equal(await reopened.changed(), false);
    assert.equal(h.files.get(FILE_NAME), original);
    assert.equal(h.writes.length, 1);
    assert.equal(h.history.size, 0);
    assert.deepEqual(h.values.get('last-saved'), savedStatus, 'Never claim an empty snapshot was saved');
});

test('cleared browser storage followed by selecting the same folder preserves the old file', async () => {
    const h = createHarness();
    await h.manager.chooseDirectory();
    const original = h.files.get(FILE_NAME);
    let backup = { backupVersion: 1, seeds: [] };
    const fresh = create({
        persistence: { get: async () => undefined, set: async () => {} },
        capture: async () => backup,
        pickDirectory: async () => h.directory,
        now: () => new Date('2026-10-14T10:30:00.000Z')
    });
    await fresh.init();
    assert.equal(fresh.state().hasDirectory, false);
    assert.equal(await fresh.chooseDirectory(), false);
    assert.equal(h.files.get(FILE_NAME), original);
    assert.equal(fresh.state().protectedBackup, true);

    backup = { backupVersion: 1, seeds: [{ id: 'new', naam: 'Nieuwe plant na opslagverlies' }] };
    assert.equal(await fresh.changed(), true);
    assert.equal(fresh.state().protectedBackup, false);
    assert.equal([...h.history.values()][0], original, 'Adding a new plant still preserves the pre-clear backup');
    backup = { backupVersion: 1, seeds: [{ id: 'newer', naam: 'Nog een wijziging' }] };
    await fresh.changed();
    assert.equal(h.history.size, 2, 'Versions remain distinct even within the same timestamp');
    assert.equal(JSON.parse([...h.history.values()][0]).seeds[0].naam, 'Tomaat');
});

test('unchanged startup and duplicate change signals create no extra versions', async () => {
    const h = createHarness();
    await h.manager.chooseDirectory();
    await h.manager.changed();
    await h.manager.flush();
    assert.equal(h.writes.length, 1);
    assert.equal(h.history.size, 0);
});

test('failed archive or reading the current file prevents any replacement', async () => {
    const h = createHarness();
    await h.manager.chooseDirectory();
    const original = h.files.get(FILE_NAME);
    h.setBackup({ backupVersion: 1, seeds: [{ id: 'new', naam: 'Nieuwe plant' }] });
    h.failHistory();
    assert.equal(await h.manager.changed(), false);
    assert.equal(h.files.get(FILE_NAME), original);
    assert.equal(h.writes.length, 1);
    h.failHistory(false);
    h.failRead();
    assert.equal(await h.manager.changed(), false);
    assert.equal(h.files.get(FILE_NAME), original);
    assert.equal(h.writes.length, 1);
});

test('empty app preserves wishlists and planning as well as plant records', async () => {
    for (const dataset of [{ wishlist: [{ name: 'Bewaren' }] }, { reminders: [{ id: 1 }] }, { calendar: { '2026-10-17': ['Taak'] } }]) {
        const h = createHarness();
        h.setBackup({ backupVersion: 1, seeds: [], ...dataset });
        await h.manager.chooseDirectory();
        const original = h.files.get(FILE_NAME);
        h.setBackup({ backupVersion: 1, seeds: [], wishlist: [], calendar: {}, reminders: [] });
        assert.equal(await h.manager.changed(), false);
        assert.equal(h.files.get(FILE_NAME), original);
    }
});

test('chooseDirectory invokes pickDirectory synchronously before pending init completes and resets stale metadata', async () => {
    const events = [];
    let releaseInit;
    const persistence = {
        async get(key) {
            events.push(`get:${key}`);
            if (key === 'directory') await new Promise(resolve => { releaseInit = resolve; });
            return key === 'last-saved' ? { savedAt: '2025-01-01T08:00:00.000Z', seedCount: 99 } : undefined;
        },
        async set(key, value) { events.push(`set:${key}:${value ? 'val' : 'null'}`); }
    };
    const files = new Map();
    const newDir = {
        name: 'Nieuwe map',
        async queryPermission() { return 'granted'; },
        async requestPermission() { return 'granted'; },
        async getFileHandle(name, opts = {}) {
            if (!files.has(name) && !opts.create) throw Object.assign(new Error('Missing'), { name: 'NotFoundError' });
            return {
                async getFile() { return { text: async () => files.get(name), lastModified: Date.parse('2026-10-14T10:30:00.000Z') }; },
                async createWritable() {
                    let content = '';
                    return { async write(blob) { content = await blob.text(); }, async close() { files.set(name, content); } };
                }
            };
        },
        async getDirectoryHandle() { return { getFileHandle: async () => ({}) }; }
    };
    const manager = create({
        persistence,
        pickDirectory: async () => {
            events.push('pickDirectory');
            return newDir;
        },
        capture: async () => ({ backupVersion: 1, seeds: [{ id: 1, naam: 'Tomaat' }] }),
        now: () => new Date('2026-10-14T10:30:00.000Z')
    });

    const initTask = manager.init();
    const pickTask = manager.chooseDirectory();
    // pickDirectory must be invoked synchronously before init's persistence get resolves.
    assert.ok(events.includes('pickDirectory'));
    releaseInit();
    await initTask;
    assert.equal(await pickTask, true);
    assert.equal(manager.state().lastSaved.seedCount, 1);
    assert.match(manager.state().status, /Back-upmap ingesteld\..*1 plant.*Nieuwe map/);
});

test('backupNow writes immediately, archives changed versions, re-requests permission, and reports denied access', async () => {
    const h = createHarness();
    assert.equal(await h.manager.backupNow(), false);
    assert.match(h.manager.state().status, /Kies eerst een back-upmap/);

    await h.manager.chooseDirectory();
    assert.equal(h.writes.length, 1);

    // Force write even if unchanged, and update timestamp.
    assert.equal(await h.manager.backupNow(), true);
    assert.equal(h.writes.length, 2);
    assert.equal(h.history.size, 0);
    assert.match(h.manager.state().status, /Back-up nu opgeslagen/);

    // Changed garden archives previous version before writing new one.
    h.setBackup({ backupVersion: 1, seeds: [{ id: 1, naam: 'Paprika' }, { id: 2, naam: 'Ui' }] });
    assert.equal(await h.manager.backupNow(), true);
    assert.equal(h.writes.length, 3);
    assert.equal(h.history.size, 1);
    assert.match(h.manager.state().status, /2 planten/);

    // Prompt permission is re-requested and succeeds.
    h.setPermission('prompt');
    assert.equal(await h.manager.backupNow(), true);
    assert.equal(h.manager.state().permissionNeeded, false);

    // Denied permission gives clear feedback.
    h.directory.queryPermission = async () => 'denied';
    h.directory.requestPermission = async () => 'denied';
    assert.equal(await h.manager.backupNow(), false);
    assert.equal(h.manager.state().permissionNeeded, true);
    assert.match(h.manager.state().status, /toegang tot de map/i);
});

test('changed() waits for in-flight init() so early changes are still backed up', async () => {
    const first = createHarness();
    await first.manager.chooseDirectory();

    let releaseDir;
    const delayedPersistence = {
        async get(key) {
            if (key === 'directory') await new Promise(resolve => { releaseDir = resolve; });
            return first.values.get(key);
        },
        async set(key, value) { first.values.set(key, value); }
    };
    let currentBackup = { backupVersion: 1, seeds: [{ id: 1, naam: 'Vroege wijziging' }] };
    const second = create({
        persistence: delayedPersistence,
        pickDirectory: async () => first.directory,
        capture: async () => currentBackup,
        now: () => new Date('2026-10-14T10:35:00.000Z')
    });

    const initTask = second.init();
    const changeTask = second.changed();
    releaseDir();
    await initTask;
    assert.equal(await changeTask, true);
    assert.equal(first.writes.at(-1).seeds[0].naam, 'Vroege wijziging');
});

test('account scopes isolate databases and backup subdirectories inside the same folder', async () => {
    const dbNames = [];
    const subFiles = new Map();
    const makeSubDir = subName => ({
        async getFileHandle(name, opts = {}) {
            const key = `${subName}/${name}`;
            if (!subFiles.has(key) && !opts.create) throw Object.assign(new Error('Missing'), { name: 'NotFoundError' });
            return {
                async getFile() { return { text: async () => subFiles.get(key), lastModified: Date.parse('2026-10-14T10:30:00.000Z') }; },
                async createWritable() {
                    let content = '';
                    return { async write(blob) { content = await blob.text(); }, async close() { subFiles.set(key, content); } };
                }
            };
        },
        async getDirectoryHandle(name) {
            return makeSubDir(`${subName}/${name}`);
        }
    });
    const sharedDir = {
        name: 'Gedeelde map',
        async queryPermission() { return 'granted'; },
        async requestPermission() { return 'granted'; },
        async getFileHandle(name, opts = {}) { return makeSubDir('root').getFileHandle(name, opts); },
        async getDirectoryHandle(name) { return makeSubDir(name); }
    };

    const scopeA = { id: '11111111-1111-4111-8111-111111111111', legacy: false, database: n => `${n}::${scopeA.id}` };
    const scopeB = { id: '22222222-2222-4222-8222-222222222222', legacy: false, database: n => `${n}::${scopeB.id}` };
    const makeIndexedDB = () => {
        const storeMap = new Map();
        return {
            open(name) {
                dbNames.push(name);
                const req = {};
                queueMicrotask(() => {
                    const db = {
                        objectStoreNames: { contains: () => true },
                        transaction: () => {
                            const tx = {};
                            return {
                                objectStore: () => ({
                                    get(key) {
                                        const getReq = {};
                                        queueMicrotask(() => { getReq.result = storeMap.has(key) ? { key, value: storeMap.get(key) } : undefined; getReq.onsuccess?.(); });
                                        return getReq;
                                    },
                                    put({ key, value }) {
                                        storeMap.set(key, value);
                                        queueMicrotask(() => tx.oncomplete?.());
                                    }
                                }),
                                set oncomplete(fn) { tx.oncomplete = fn; },
                                get oncomplete() { return tx.oncomplete; }
                            };
                        }
                    };
                    req.onsuccess?.({ target: { result: db } });
                });
                return req;
            }
        };
    };

    const managerA = create({ scope: () => scopeA, indexedDB: makeIndexedDB(), pickDirectory: async () => sharedDir, capture: async () => ({ backupVersion: 1, seeds: [{ id: 1, naam: 'Tuin A' }] }) });
    const managerB = create({ scope: () => scopeB, indexedDB: makeIndexedDB(), pickDirectory: async () => sharedDir, capture: async () => ({ backupVersion: 1, seeds: [{ id: 2, naam: 'Tuin B' }] }) });

    await managerA.chooseDirectory();
    await managerB.chooseDirectory();

    assert.ok(dbNames.includes(`KweekKompasBackupLocation::${scopeA.id}`));
    assert.ok(dbNames.includes(`KweekKompasBackupLocation::${scopeB.id}`));
    assert.equal(JSON.parse(subFiles.get(`KweekKompas-account-${scopeA.id}/${FILE_NAME}`)).seeds[0].naam, 'Tuin A');
    assert.equal(JSON.parse(subFiles.get(`KweekKompas-account-${scopeB.id}/${FILE_NAME}`)).seeds[0].naam, 'Tuin B');
    assert.equal(subFiles.has(`root/${FILE_NAME}`), false);
});

test('render() updates status, choose button, and backup-now button states accurately', async () => {
    const elements = {
        '#local-backup-status': { textContent: '' },
        '#local-backup-choose': { hidden: false, textContent: '', disabled: false },
        '#local-backup-now': { hidden: false, textContent: '', disabled: false }
    };
    const doc = { querySelector: sel => elements[sel] || null };
    const h = createHarness();
    const manager = create({
        persistence: h.persistence,
        pickDirectory: async () => h.directory,
        capture: async () => ({ backupVersion: 1, seeds: [{ id: 1, naam: 'Tomaat' }] }),
        document: doc,
        now: () => new Date('2026-10-14T10:30:00.000Z')
    });

    await manager.init();
    assert.equal(elements['#local-backup-now'].disabled, true);
    assert.equal(elements['#local-backup-choose'].textContent, 'Kies back-upmap');

    await manager.chooseDirectory();
    assert.equal(elements['#local-backup-now'].disabled, false);
    assert.equal(elements['#local-backup-now'].textContent, 'Back-up nu maken');
    assert.equal(elements['#local-backup-choose'].textContent, 'Back-upmap wijzigen');
    assert.match(elements['#local-backup-status'].textContent, /1 plant/);
});

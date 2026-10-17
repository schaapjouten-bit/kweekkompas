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

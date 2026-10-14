const assert = require('node:assert/strict');
const test = require('node:test');
const { create, FILE_NAME } = require('../local-backup.js');

function createHarness({ initial = {}, permission = 'granted', pickError } = {}) {
    const values = new Map(Object.entries(initial));
    const writes = [];
    let backup = { backupVersion: 1, seeds: [{ id: 1, naam: 'Tomaat' }] };
    let permissionState = permission;
    const persistence = {
        async get(key) { return values.get(key); },
        async set(key, value) { values.set(key, value); }
    };
    const directory = {
        name: 'KweekKompas back-ups',
        async queryPermission() { return permissionState; },
        async requestPermission() { permissionState = 'granted'; return permissionState; },
        async getFileHandle(name, { create }) {
            assert.equal(name, FILE_NAME);
            assert.equal(create, true);
            return {
                async createWritable() {
                    let content = '';
                    return {
                        async write(blob) { content = await blob.text(); },
                        async close() { writes.push(JSON.parse(content)); }
                    };
                }
            };
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
        manager, values, writes, directory, persistence,
        setBackup(value) { backup = value; },
        setPermission(value) { permissionState = value; }
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
    status.changed('restore-internal');
    await new Promise(resolve => setTimeout(resolve, 0));

    assert.equal(status.calls, 1);
    assert.equal(h.writes.length, 2);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { create, PREFIX } = require('../auto-sync');
const clone = value => structuredClone(value);
function fixture() {
    const data = new Map(), log = [], records = []; let local = { seeds: [{ id: 'a', naam: 'Plant' }], wishlist: [], userProfile: { name: 'Tuin' } }, remote = { revision: 0 }, owner = null, time = 0, choice = false, uploadHook, hydrateHook;
    const io = {
        storage: { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }, now: () => time, nonce: () => String(++time), owner: () => owner, claim: id => { owner = id; }, visible: () => true, manualBusy: () => false,
        lock: fn => fn(), capture: async () => clone(local), hash: async value => JSON.stringify(value), equal: async (a, b) => JSON.stringify(a) === JSON.stringify(b), remote: async () => { log.push('read'); return clone(remote); },
        hydrate: async payload => { if (hydrateHook) await hydrateHook(); return clone(payload); }, safety: async () => log.push('safety'), restore: async payload => { log.push('restore'); local = clone(payload); },
        upload: async (payload, revision, id, signal, check) => { log.push('photos'); if (uploadHook) await uploadHook(payload, signal); check(); assert.equal(revision, remote.revision); log.push('snapshot'); remote = { revision: revision + 1, payload: clone(payload), userId: id }; return clone(remote); },
        record: async (result, payload, direction, id, check) => { check(); records.push({ revision: result.revision, payload: clone(payload), direction, id }); }, confirm: () => true, choice: show => { choice = show; }, status: () => {}
    };
    const make = () => create(io, { debounce: 100000, backoff: [100000, 200000] });
    let engine = make();
    return { io, get e() { return engine; }, local: () => local, remote: () => remote, data, log, records, choice: () => choice, edit: name => { local.seeds[0].naam = name; engine.changed(); }, remoteEdit: name => { remote = { revision: remote.revision + 1, payload: { ...clone(local), seeds: [{ id: 'a', naam: name }] } }; }, uploadHook: value => { uploadHook = value; }, hydrateHook: value => { hydrateHook = value; }, advance: () => { time += 1000000; }, reopen: () => { engine.dispose(); engine = make(); engine.setAccount('A'); }, active: async () => { engine.setAccount('A'); await engine.enable(); assert.equal(choice, true); assert.equal(log.includes('snapshot'), false); await engine.choose('local'); engine.cancel(); await engine.tick(); engine.cancel(); } };
}
test('explicit basis; rapid edits batch; edits during upload survive next round', async () => {
    const f = fixture(); try {
        await f.active(); assert.equal(f.remote().revision, 1);
        for (let i = 0; i < 20; i++) f.edit('Edit ' + i);
        f.uploadHook(async () => { f.edit('During upload'); f.uploadHook(null); });
        await f.e.tick(); assert.equal(f.remote().payload.seeds[0].naam, 'Edit 19'); assert(f.e.state().counter > f.e.state().done);
        await f.e.tick(); assert.equal(f.remote().payload.seeds[0].naam, 'During upload'); assert.equal(f.e.state().counter, f.e.state().done);
        assert.equal(f.remote().revision, 3); assert(f.log.indexOf('photos') < f.log.indexOf('snapshot'));
    } finally { f.e.dispose(); }
});
test('durable offline queue, bounded retry delays and reload', async () => {
    const f = fixture(); try {
        await f.active(); f.edit('Offline'); const fail = Object.assign(new Error('Offline'), { status: 503 });
        f.uploadHook(async () => { throw fail; }); await f.e.tick(); const reads = f.log.filter(x => x === 'read').length;
        await f.e.tick(); assert.equal(f.log.filter(x => x === 'read').length, reads);
        f.reopen(); assert(f.e.state().counter > f.e.state().done); f.advance(); await f.e.tick(); f.advance(); await f.e.tick();
        assert.equal(f.e.state().paused, 'offline'); assert.equal(f.remote().revision, 1); assert.equal(f.local().seeds[0].naam, 'Offline');
        f.uploadHook(null); f.e.online(); f.e.cancel(); await f.e.tick(); assert.equal(f.remote().payload.seeds[0].naam, 'Offline');
    } finally { f.e.dispose(); }
});

test('version choice stays pending until the server confirms the upload', async () => {
    const f = fixture();
    try {
        f.e.setAccount('A'); await f.e.enable(); await f.e.choose('local'); f.e.cancel();
        assert.equal(f.e.state().resolving, true);
        assert.equal(f.choice(), true);
        assert.equal(f.records.length, 0);
        await f.e.tick();
        assert.equal(f.e.state().resolving, false);
        assert.equal(f.choice(), false);
        assert.equal(f.records.length, 1);
    } finally { f.e.dispose(); }
});

test('closing during a server-accepted upload does not mark the queue done without acknowledgement', async () => {
    const f = fixture();
    try {
        await f.active(); f.edit('Unacknowledged');
        const original = f.io.upload;
        f.io.upload = async (payload, revision, id, signal) => {
            const result = await original(payload, revision, id, signal, () => {});
            f.e.cancel();
            return result;
        };
        await f.e.tick();
        assert.equal(f.remote().revision, 2);
        assert.equal(f.e.state().basis.revision, 1);
        assert(f.e.state().counter > f.e.state().done);
        assert.equal(f.records.length, 1);
        f.reopen(); await f.e.tick();
        assert.equal(f.e.state().paused, 'conflict');
        assert.equal(f.local().seeds[0].naam, 'Unacknowledged');
        assert.equal(f.remote().revision, 2);
    } finally { f.e.dispose(); }
});

test('offline queue resumes on reopening with a connection; manual resolution leaves automatic sync paused', async () => {
    const f = fixture();
    try {
        await f.active(); f.edit('Offline');
        f.io.online = () => false; await f.e.tick();
        assert.equal(f.e.state().paused, 'offline');
        f.io.online = () => true; f.reopen(); f.e.cancel(); await f.e.tick();
        assert.equal(f.remote().payload.seeds[0].naam, 'Offline');
        f.e.external('import');
        await f.e.manualBaseline(f.remote(), f.local(), 'download', 'A');
        assert.equal(f.e.state().paused, 'manual');
        assert.equal(f.choice(), false);
    } finally { f.e.dispose(); }
});
test('clean remote restore uses safety; pending edits conflict without replacing', async () => {
    const f = fixture(); try {
        await f.active(); f.remoteEdit('Other device'); await f.e.tick(); assert.equal(f.local().seeds[0].naam, 'Other device'); assert(f.log.indexOf('safety') < f.log.indexOf('restore'));
        f.edit('Own edit'); f.remoteEdit('Concurrent'); await f.e.tick(); assert.equal(f.e.state().paused, 'conflict'); assert.equal(f.local().seeds[0].naam, 'Own edit'); assert.equal(f.remote().payload.seeds[0].naam, 'Concurrent');
        f.reopen(); assert.equal(f.e.state().paused, 'conflict'); await f.e.tick(); assert.equal(f.local().seeds[0].naam, 'Own edit');
    } finally { f.e.dispose(); }
});
test('own edit during remote hydration blocks automatic replacement', async () => {
    const f = fixture(); try { await f.active(); f.remoteEdit('Remote'); f.hydrateHook(async () => f.edit('During download')); await f.e.tick(); assert.equal(f.local().seeds[0].naam, 'During download'); assert.equal(f.e.state().paused, 'conflict'); } finally { f.e.dispose(); }
    const g = fixture(); try {
        await g.active(); g.remoteEdit('Remote'); let editing = false; g.io.canRestore = () => !editing;
        g.hydrateHook(async () => { editing = true; }); await g.e.tick();
        assert.equal(g.local().seeds[0].naam, 'Plant'); assert(!g.log.includes('restore'));
        editing = false; g.hydrateHook(null); await g.e.tick(); assert.equal(g.local().seeds[0].naam, 'Remote');
    } finally { g.e.dispose(); }
});
test('examples/imports never leak into a later automatic upload', async () => {
    for (const source of ['example', 'import']) { const f = fixture(); try {
        await f.active(); f.e.external(source); f.edit('Imported ' + source); await f.e.tick(); assert.equal(f.remote().revision, 1);
        f.reopen(); await f.e.tick(); assert.equal(f.remote().revision, 1); assert.equal(f.e.state().paused, source);
        await f.e.enable(); assert(f.choice()); assert.equal(f.remote().revision, 1); await f.e.choose('local'); f.e.cancel(); await f.e.tick(); assert.equal(f.remote().payload.seeds[0].naam, 'Imported ' + source);
    } finally { f.e.dispose(); } }
});
test('disable, logout and account switch abort in-flight work and metadata association', async () => {
    for (const mode of ['disable', 'logout', 'switch']) { const f = fixture(); try {
        await f.active(); f.edit('Pending'); let release; const gate = new Promise(resolve => release = resolve); f.uploadHook(() => gate);
        const work = f.e.tick(); while (f.log.filter(x => x === 'photos').length < 2) await new Promise(resolve => setImmediate(resolve));
        if (mode === 'disable') f.e.disable(); else f.e.setAccount(mode === 'logout' ? null : 'B'); release(); await work;
        assert.equal(f.remote().revision, 1); assert.equal(f.records.length, 1); assert.equal(f.local().seeds[0].naam, 'Pending');
        assert.equal(JSON.parse(f.data.get(PREFIX + 'A')).done, 1);
        if (mode === 'switch') { f.edit('B edit'); f.e.setAccount('A'); await f.e.tick(); assert.equal(f.remote().revision, 1); assert.equal(f.e.state().paused, 'account'); }
    } finally { f.e.dispose(); } }
});
test('an already accepted snapshot never updates bookkeeping for a later account', async () => {
    const f = fixture(); try {
        await f.active(); f.edit('Accepted for A');
        const upload = f.io.upload;
        f.io.upload = async (...args) => { const result = await upload(...args); f.e.setAccount('B'); return result; };
        await f.e.tick(); assert.equal(f.remote().revision, 2); assert.equal(f.remote().userId, 'A');
        assert.equal(f.records.length, 1); assert.equal(JSON.parse(f.data.get(PREFIX + 'A')).basis.revision, 1);
        assert.equal(f.e.state().basis, null); assert.equal(f.e.state().retries, 0);
    } finally { f.e.dispose(); }
});
test('import during photo upload cancels snapshot; stopping error does not retry for new user', async () => {
    const f = fixture(); try {
        await f.active(); f.edit('Own pending');
        f.uploadHook(async () => { f.e.external('example'); f.edit('Example'); });
        await f.e.tick(); assert.equal(f.remote().revision, 1); assert.equal(f.e.state().paused, 'example');
        await f.e.enable(); await f.e.choose('local'); f.e.cancel();
        f.uploadHook(async () => { f.e.setAccount('B'); throw Object.assign(new Error('Old network error'), { status: 503 }); });
        await f.e.tick(); assert.equal(f.e.state().retries, 0); assert.equal(f.e.state().enabled, false); assert.equal(f.remote().revision, 1);
    } finally { f.e.dispose(); }
});
test('only one operation runs, even when wake and edit callbacks overlap', async () => {
    const f = fixture(); try {
        await f.active(); f.edit('Pending'); let release; const gate = new Promise(resolve => release = resolve);
        f.uploadHook(() => gate); const work = f.e.tick();
        while (f.log.filter(x => x === 'photos').length < 2) await new Promise(resolve => setImmediate(resolve));
        const reads = f.log.filter(x => x === 'read').length;
        await f.e.tick(); await f.e.tick(); assert.equal(f.log.filter(x => x === 'read').length, reads);
        release(); await work; assert.equal(f.remote().revision, 2);
    } finally { f.e.dispose(); }
});

test('edit during snapshot hashing stays durably pending, also after reload', async () => {
    const f = fixture(); try {
        await f.active(); f.edit('Captured'); const hash = f.io.hash; let once = true;
        f.io.hash = async payload => { if (once) { once = false; f.edit('After capture'); } return hash(payload); };
        await f.e.tick(); assert.equal(f.remote().payload.seeds[0].naam, 'Captured');
        assert(f.e.state().counter > f.e.state().done);
        f.reopen(); await f.e.tick(); assert.equal(f.remote().payload.seeds[0].naam, 'After capture');
    } finally { f.e.dispose(); }
});

test('edit between clean snapshot and restore preparation blocks remote replacement', async () => {
    const f = fixture(); try {
        await f.active(); f.remoteEdit('Remote'); let once = true;
        f.io.canRestore = () => { if (once) { once = false; f.edit('Just before restore'); } return true; };
        await f.e.tick(); assert.equal(f.local().seeds[0].naam, 'Just before restore');
        assert.equal(f.e.state().paused, 'conflict'); assert(!f.log.includes('restore'));
    } finally { f.e.dispose(); }
});

test('edits in another-account tab invalidate the shared garden for the old queue', async () => {
    const f = fixture(); let other;
    try {
        await f.active(); other = create(f.io, { debounce: 100000 }); other.setAccount('B');
        f.local().seeds[0].naam = 'B edit'; other.changed(); await f.e.tick();
        assert.equal(f.remote().revision, 1); assert.equal(f.e.state().paused, 'account');
        assert.equal(other.state().paused, 'account'); assert.equal(f.local().seeds[0].naam, 'B edit');
    } finally { f.e.dispose(); other?.dispose(); }
});

test('cancelled restore checks again after storage preparation; status leaves synchronising', async () => {
    const f = fixture(); try {
        const reports = []; f.io.status = report => reports.push(report);
        await f.active(); f.remoteEdit('Remote'); const restore = f.io.restore;
        f.io.restore = async (payload, check) => { f.e.disable(); check(); await restore(payload); };
        await f.e.tick(); assert.equal(f.local().seeds[0].naam, 'Plant');
        assert.equal(f.e.state().enabled, false); assert.equal(f.e.state().basis.revision, 1);
        assert.equal(reports.at(-1).text, 'Opgeslagen op dit apparaat'); assert(!f.log.includes('restore'));
    } finally { f.e.dispose(); }
});

test('disable in shared storage stops follow-up requests before tab events arrive', async () => {
    const f = fixture(); try {
        await f.active(); f.edit('Pending');
        f.uploadHook(async () => { const s = f.e.state(); s.enabled = false; f.data.set(PREFIX + 'A', JSON.stringify(s)); });
        await f.e.tick(); assert.equal(f.remote().revision, 1); assert.equal(f.e.state().done, 1);
        assert.equal(f.e.state().retries, 0); assert.equal(f.local().seeds[0].naam, 'Pending');
    } finally { f.e.dispose(); }
});

test('normalized legacy cloud restore becomes the basis without a return upload', async () => {
    const f = fixture(); try {
        await f.active(); const restore = f.io.restore;
        f.io.restore = async payload => { await restore(payload); f.local().seeds[0].normalized = true; };
        f.remoteEdit('Legacy remote'); await f.e.tick();
        assert.equal(f.local().seeds[0].normalized, true); assert.equal(f.e.state().basis.hash, await f.io.hash(f.local()));
        await f.e.tick(); assert.equal(f.remote().revision, 2); assert.equal(f.e.state().counter, f.e.state().done);
    } finally { f.e.dispose(); }
});

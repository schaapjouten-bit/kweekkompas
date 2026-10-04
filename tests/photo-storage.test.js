const test = require('node:test');
const assert = require('node:assert/strict');
const photos = require('../photo-storage');
const cloud = require('../cloud-data');
const { endpoint } = require('../netlify/functions/_shared/lib/http');
const photoAccess = endpoint(require('../netlify/functions/_shared/photos').handlePhotoAccess);
const { handler: sync } = require('../netlify/functions/_shared/cloud-sync');
const { startFixtures, configureFixtures } = require('./service-fixtures.cjs');
const old = () => ({ backupVersion: 1, seeds: [{ id: 'test', naam: 'Testplant', images: [{ url: 'data:image/png;base64,QUJDRA==' }], featuredImageUrl: 'data:image/png;base64,QUJDRA==' }, { id: 'static', naam: 'Voorbeeld', images: [{ url: 'assets/example-garden/photos/tomaat.jpg' }] }], wishlist: [{ name: 'Testwens', image: 'data:image/png;base64,QUJDRA==' }], userProfile: { photo: 'data:image/png;base64,QUJDRA==' } });

test('annuleren onderbreekt lopende fotodownload en voorkomt nieuwe aanvragen', async () => {
    const a = '11111111-1111-4111-8111-111111111111';
    const prepared = await photos.prepare(old(), a), controller = new AbortController();
    const originalFetch = global.fetch; let started, requests = 0;
    const ready = new Promise(resolve => { started = resolve; });
    global.fetch = async (url, { signal }) => new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true }); started();
    });
    try {
        const request = async () => { requests++; return { userId: a, path: prepared.files[0].path, signedUrl: 'http://fixture/photo' }; };
        const work = photos.hydrate(prepared.payload, a, request, () => {}, { signal: controller.signal });
        await ready; controller.abort(); await assert.rejects(work, { name: 'AbortError' });
        await assert.rejects(photos.hydrate(prepared.payload, a, request, () => {}, { signal: controller.signal }), { name: 'AbortError' });
        assert.equal(requests, 1);
    } finally { global.fetch = originalFetch; }
});

test('oude ingebedde backup blijft zelfstandig; alle fotoslots, stabiele paden en appgrenzen', async () => {
    const a = '11111111-1111-4111-8111-111111111111', original = old();
    const prepared = await photos.prepare(original, a);
    assert.deepEqual(original, old()); assert.equal(prepared.files.length, 1);
    assert.deepEqual((await photos.prepare(old(), a)).payload, prepared.payload);
    assert.equal(prepared.payload.seeds[1].images[0].url, original.seeds[1].images[0].url);
    assert(!JSON.stringify(prepared.payload).includes('data:image'));
    assert.equal(photos.references(prepared.payload, a).length, 1);
    const aliases = old(); aliases.seeds[0].images[0].imageUrl = aliases.seeds[0].images[0].url;
    const aliasPrepared = await photos.prepare(aliases, a);
    assert.equal(aliasPrepared.files.length, 1); assert(!JSON.stringify(aliasPrepared.payload).includes('data:image'));
    assert.equal(aliasPrepared.payload.seeds[0].images[0].imageUrl, aliasPrepared.payload.seeds[0].images[0].url);
    assert.deepEqual(await photos.hydrate(original, a, () => { throw Error('No network for old backup'); }), original);
    assert.throws(() => photos.references(original, a, true), /eerst apart/);
    assert.throws(() => photos.references(prepared.payload, '22222222-2222-4222-8222-222222222222'), /ingelogde account/);
    assert.throws(() => photos.estimate({ seeds: [{ image: 'blob:temporary' }] }), /tijdelijk/);
    assert.throws(() => photos.estimate({ seeds: [{ image: 'data:image/svg+xml;base64,QUJDRA==' }] }), /ongeldig/);
    assert.equal(photos.MAX_FILE_BYTES, 1_000_000);
    await assert.rejects(photos.processDataURL('data:image/png;base64,' + 'A'.repeat(1_333_336)), /maximaal 1 MB/);
    const largePhoto = { seeds: [{ image: 'data:image/png;base64,' + 'A'.repeat(4_000_000) }] };
    assert(cloud.bytes(largePhoto) > cloud.MAX_BYTES);
    assert(cloud.bytes(photos.estimate(largePhoto, a).payload) < 1000);
});

test('echte backend/SDK tegen lokale Storage-fixture: dedup, herstel, fouten, conflict en twee gebruikers', async () => {
    const fixture = await startFixtures(); configureFixtures(fixture);
    const event = (name, body, method = 'POST') => ({ httpMethod: method, headers: { host: 'localhost:4173', origin: 'http://localhost:4173', cookie: `kk_access=${fixture.tokens[name]}` }, body: JSON.stringify({ ...body, expectedUserId: fixture.ids[name] }) });
    const requestFor = name => async (route, body) => {
        const result = await (route === 'photo-access' ? photoAccess : sync)(event(name, body));
        const value = JSON.parse(result.body);
        if (result.statusCode !== 200) throw Object.assign(new Error(value.error), { status: result.statusCode });
        return value;
    };
    try {
        const request = requestFor('a'), prepared = await photos.prepare(old(), fixture.ids.a);
        await photos.upload(prepared, fixture.ids.a, request);
        assert.equal(fixture.storage.uploads, 1);
        await request('cloud-sync', { payload: prepared.payload, revision: 0 });
        await photos.upload(prepared, fixture.ids.a, request); assert.equal(fixture.storage.uploads, 1);
        fixture.storage.expireDownloadOnce = true;
        assert.deepEqual(await photos.hydrate(prepared.payload, fixture.ids.a, request), old());
        const path = prepared.files[0].path;
        const tooBig = await photoAccess(event('a', { action: 'upload', sha256: prepared.files[0].sha256, extension: 'png', size: 1_000_001 })); assert.equal(tooBig.statusCode, 400); assert.match(tooBig.body, /1 MB/);
        const foreign = await photoAccess(event('b', { action: 'download', path })); assert.equal(foreign.statusCode, 403);
        const ownCloud = await sync(event('b', {}, 'GET')); assert.equal(JSON.parse(ownCloud.body).snapshot, null);
        assert.equal((await sync(event('b', { payload: prepared.payload, revision: 0 }))).statusCode, 400);
        const directForeign = await fetch(fixture.base + '/storage/v1/object/info/kweekkompas-photos/' + path, { headers: { Authorization: 'Bearer ' + fixture.tokens.b } }); assert.equal(directForeign.status, 403);
        assert.equal((await sync(event('a', { payload: prepared.payload, revision: 0 }))).statusCode, 409);
        assert.equal(fixture.snapshots.get(fixture.ids.a).revision, 1);
        const saved = fixture.objects.get(path); fixture.objects.delete(path);
        await assert.rejects(photos.hydrate(prepared.payload, fixture.ids.a, request), /cloudfoto ontbreekt/);
        assert.equal((await sync(event('a', { payload: prepared.payload, revision: 1 }))).statusCode, 404);
        assert.equal(fixture.snapshots.get(fixture.ids.a).revision, 1); fixture.objects.set(path, saved);
        fixture.objects.set(path, { ...saved, bytes: Buffer.from('WXYZ') });
        await assert.rejects(photos.hydrate(prepared.payload, fixture.ids.a, request), /onvolledig, gewijzigd/);
        fixture.objects.set(path, saved);
        // Existing cloud objects larger than the new write limit remain readable.
        const legacyBytes = Buffer.alloc(1_100_000, 1);
        const legacyHash = require('node:crypto').createHash('sha256').update(legacyBytes).digest('hex');
        const legacyPath = `${fixture.ids.a}/${legacyHash}.png`;
        fixture.objects.set(legacyPath, { bytes: legacyBytes, mime: 'image/png' });
        const legacy = { backupVersion: 1, seeds: [{ id: 'legacy', naam: 'Oude foto', image: photos.PREFIX + legacyPath }] };
        const restoredLegacy = await photos.hydrate(legacy, fixture.ids.a, request);
        assert(restoredLegacy.seeds[0].image.length > 1_000_000);
        assert.equal((await sync(event('a', { payload: legacy, revision: 1 }))).statusCode, 400);
        assert(fixture.objects.has(legacyPath));
        fixture.storage.failUpload = true;
        const next = old(); next.seeds[0].image = 'data:image/jpeg;base64,V1hZWg==';
        await assert.rejects(photos.upload(await photos.prepare(next, fixture.ids.a), fixture.ids.a, request), /Foto-upload is geweigerd/);
        assert.equal(fixture.snapshots.get(fixture.ids.a).revision, 1);
        assert.equal((await sync(event('a', { payload: old(), revision: 1 }))).statusCode, 400);
    } finally { await fixture.stop(); }
});

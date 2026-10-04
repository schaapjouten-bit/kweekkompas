const test = require('node:test');
const assert = require('node:assert/strict');
const contract = require('../cloud-data');
const { startFixtures } = require('./service-fixtures.cjs');
const { handler: sync } = require('../netlify/functions/_shared/cloud-sync');
const garden = () => ({ backupVersion: 1,
    seeds: [{ id: 'isolated', naam: 'Testplant', type: 'Groente', status: 'Groeit', images: [{ url: 'data:image/png;base64,AA==' }], featuredImageUrl: 'data:image/png;base64,AA==', isFavorite: true, apiKey: 'never-upload', fase_groeit: true, plant_months: [5] }],
    calendar: { '2026-10-03': ['Testplanning'] }, reminders: [{ id: 1, title: 'Water', date: '2026-10-03', done: false }], dailyProgress: { '2026-10-03': ['water'] },
    wishlist: [{ id: 'w', name: 'Wens', type: 'item', image: 'data:image/png;base64,AA==' }],
    userProfile: { name: 'Isolated', gardenType: 'Balkon', gardenPlaces: ['Bakken of potten'], primaryGardenPlace: 'Bakken of potten', photo: 'data:image/png;base64,AA==', photoZoom: 1.2, units: 'Imperial', access_token: 'never-upload' },
    theme: 'dark', uiState: { layout_width: 'wide' }, settings: { apiKey: 'never-upload' }, authSession: 'never-upload', onboardingDone: 'true'
});
test('cloudcontract bevat volledige tuin en foto’s, zonder apparaatinstellingen of geheimen', () => {
    const payload = contract.select(garden());
    assert.deepEqual(Object.keys(payload).sort(), ['backupVersion', 'calendar', 'dailyProgress', 'reminders', 'seeds', 'userProfile', 'wishlist']);
    assert.equal(payload.seeds[0].isFavorite, true); assert.equal(payload.seeds[0].images[0].url, garden().seeds[0].images[0].url);
    assert.deepEqual(payload.seeds[0].plant_months, [5]); assert.equal(payload.userProfile.photoZoom, 1.2);
    assert.equal(payload.userProfile.units, undefined);
    assert.doesNotMatch(JSON.stringify(payload), /never-upload|access_token|apiKey|uiState|onboardingDone/);
    assert.equal(contract.stable({ b: 1, a: 2 }), contract.stable({ a: 2, b: 1 }));
    assert.throws(() => contract.select({ backupVersion: 9, seeds: [] }));
    assert.throws(() => contract.assertSize({ ...payload, seeds: [{ ...payload.seeds[0], images: [{ url: 'data:image/png;base64,' + 'A'.repeat(contract.MAX_BYTES) }] }] }), /te groot/);
});
test('backend filtert beide richtingen en weigert omvang vóór database-write; conflictcontrole behouden', async () => {
    const fixture = await startFixtures(); const originalFetch = global.fetch;
    Object.assign(process.env, { SUPABASE_URL: fixture.base, SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture', KWEEK_LOCAL_DEV: 'true' });
    const noPhotos = () => { const value = garden(); value.seeds[0].images = []; delete value.seeds[0].featuredImageUrl; delete value.wishlist[0].image; delete value.userProfile.photo; return value; };
    const event = (method, payload, revision = 0) => ({ httpMethod: method, headers: { host: 'localhost:4173', origin: 'http://localhost:4173', cookie: `kk_access=${fixture.tokens.a}` }, body: JSON.stringify({ payload, revision, expectedUserId: fixture.ids.a }) });
    try {
        assert.equal((await sync(event('POST', noPhotos()))).statusCode, 200);
        assert.deepEqual(fixture.snapshots.get(fixture.ids.a).payload, contract.select(noPhotos()));
        // A stored legacy snapshot must not restore settings from another device.
        fixture.snapshots.get(fixture.ids.a).payload = garden();
        assert.deepEqual(JSON.parse((await sync(event('GET'))).body).snapshot.payload, contract.select(garden()));
        assert.equal((await sync(event('POST', noPhotos(), 0))).statusCode, 409);
        const tooBig = garden(); tooBig.seeds[0].images = [{ url: 'data:image/png;base64,' + 'A'.repeat(3_600_000) }];
        assert.equal((await sync(event('POST', tooBig, 1))).statusCode, 413);
        assert.equal(fixture.snapshots.get(fixture.ids.a).revision, 1);
        assert.equal((await sync(event('POST', { backupVersion: 99, seeds: [] }, 1))).statusCode, 400);
        global.fetch = (url, options) => String(url).includes('/rest/v1/') ? Promise.resolve(new Response(JSON.stringify({ code: '23514' }), { status: 400, headers: { 'Content-Type': 'application/json' } })) : originalFetch(url, options);
        const dbLimit = await sync(event('POST', noPhotos(), 1)); assert.equal(dbLimit.statusCode, 413); assert.match(dbLimit.body, /cloudopslaglimiet/);
        assert.equal(fixture.snapshots.get(fixture.ids.a).revision, 1);
    } finally { global.fetch = originalFetch; await fixture.stop(); }
});

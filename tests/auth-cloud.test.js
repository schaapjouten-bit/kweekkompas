// Local HTTP fixtures only. No live Supabase users or garden data are modified.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startFixtures } = require('./service-fixtures.cjs');
const { handler: auth } = require('../netlify/functions/_shared/auth');
const { handler: sync } = require('../netlify/functions/_shared/cloud-sync');
const event = (method, body, cookie = '') => ({ httpMethod: method, headers: { host: 'localhost:4173', origin: 'http://localhost:4173', cookie }, body: JSON.stringify(body) });

test('configuratie ontbreekt alleen bij lege waarden; bevoorrechte sleutel wordt geweigerd', async () => {
    process.env.KWEEK_LOCAL_DEV = 'true';
    process.env.SUPABASE_URL = '  ';
    process.env.SUPABASE_PUBLISHABLE_KEY = '  ';
    delete process.env.SUPABASE_ANON_KEY;
    assert.deepEqual(JSON.parse((await auth(event('GET'))).body), { configured: false, user: null });
    process.env.SUPABASE_URL = 'https://cmsthawjpxgyrmfwplfj.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_secret_forbidden-test-value';
    const rejected = await auth(event('GET'));
    assert.equal(rejected.statusCode, 503);
    assert.match(JSON.parse(rejected.body).error, /geen bevoorrechte sleutel/);
    assert.doesNotMatch(rejected.body, /nog niet geconfigureerd|forbidden-test-value/);
});

test('auth en handmatige sync: accounts, conflicten, vernieuwde cookies en ontbrekende tabel', async () => {
    const fixture = await startFixtures();
    const originalFetch = global.fetch;
    Object.assign(process.env, { SUPABASE_URL: fixture.base, SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture', KWEEK_LOCAL_DEV: 'true' });
    try {
        assert.deepEqual(JSON.parse((await auth(event('GET'))).body), { configured: true, user: null });
        const wrong = await auth(event('POST', { action: 'login', email: 'a@example.test', password: 'wrong' }));
        assert.equal(wrong.statusCode, 401);
        const login = await auth(event('POST', { action: 'login', email: 'a@example.test', password: 'test-password' }));
        assert.equal(login.statusCode, 200);
        assert.equal(fixture.snapshots.size, 0, 'login does not upload');
        assert.doesNotMatch(login.body, /access_token|refresh_token|test-password/);
        const cookies = login.multiValueHeaders['Set-Cookie'];
        assert.ok(cookies.every(value => /HttpOnly; SameSite=Strict/.test(value)));
        const cookie = cookies.map(value => value.split(';')[0]).join('; ');
        const payload = { backupVersion: 1, seeds: [{ id: 'test', naam: 'Afzonderlijke testplant' }] };
        assert.equal((await sync(event('POST', { payload, revision: 0, expectedUserId: fixture.ids.a }))).statusCode, 401);
        assert.equal((await sync(event('POST', { payload, revision: 0, expectedUserId: fixture.ids.b }, cookie))).statusCode, 409);
        assert.equal((await sync(event('POST', { payload, revision: 0, expectedUserId: fixture.ids.a, user_id: fixture.ids.b }, cookie))).statusCode, 200);
        assert.deepEqual(JSON.parse((await sync(event('GET', undefined, cookie))).body).snapshot.payload, payload);
        assert.equal(JSON.parse((await sync(event('GET', undefined, `kk_access=${fixture.tokens.b}`))).body).snapshot, null);
        assert.equal((await sync(event('POST', { payload, revision: 0, expectedUserId: fixture.ids.a }, cookie))).statusCode, 409);
        assert.equal((await sync(event('POST', { payload, revision: 1, expectedUserId: fixture.ids.a }, cookie))).statusCode, 200);
        assert.equal((await sync(event('POST', { payload, revision: 1, expectedUserId: fixture.ids.a }, cookie))).statusCode, 409);
        const renewed = await auth(event('GET', undefined, 'kk_access=expired; kk_refresh=refresh-a'));
        assert.equal(JSON.parse(renewed.body).user.id, fixture.ids.a);
        assert.equal(renewed.multiValueHeaders['Set-Cookie'].length, 2);
        global.fetch = (url, options) => String(url).includes('/rest/v1/')
            ? Promise.resolve(new Response(JSON.stringify({ code: 'PGRST205', message: 'fixture missing table' }), { status: 404, headers: { 'Content-Type': 'application/json' } }))
            : originalFetch(url, options);
        const missing = await sync(event('GET', undefined, cookie));
        assert.equal(missing.statusCode, 503);
        assert.match(missing.body, /Cloudopslag moet nog worden ingericht/);
        assert.doesNotMatch(missing.body, /Supabase is nog niet geconfigureerd/);
        global.fetch = (url, options) => String(url).includes('/auth/v1/user')
            ? Promise.reject(new Error('fixture network failure')) : originalFetch(url, options);
        const offline = await auth(event('GET', undefined, cookie));
        assert.equal(offline.statusCode, 503);
        assert.match(offline.body, /kan nu niet worden gecontroleerd/);
        assert.equal(offline.multiValueHeaders, undefined, 'connection failure must not discard the session');
        global.fetch = originalFetch;
        const logout = await auth(event('POST', { action: 'logout' }, cookie));
        assert.equal(logout.statusCode, 200);
        assert.ok(logout.multiValueHeaders['Set-Cookie'].every(value => /Max-Age=0/.test(value)));
    } finally { global.fetch = originalFetch; await fixture.stop(); }
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { startFixtures, configureFixtures } = require('./service-fixtures.cjs');
const { handler: auth } = require('../netlify/functions/_shared/auth');
const { handler: sync } = require('../netlify/functions/_shared/cloud-sync');
const { handler: garden } = require('../netlify/functions/_shared/tuinassistent');
const { handler: seed } = require('../netlify/functions/_shared/seed-info');
const { handler: config } = require('../netlify/functions/_shared/ai-config');
const event = (method, body, cookie = '', origin = 'http://localhost:4173') => ({ httpMethod: method, headers: { host: 'localhost:4173', origin, cookie }, body: JSON.stringify(body) });
test('backend: login, sessievernieuwing, accountisolatie, syncconflict en beide AI-hulpen', async () => {
    const fixture = await startFixtures(); configureFixtures(fixture);
    process.env.GEMINI_API_KEY = 'test-gemini-secret';
    const originalFetch = global.fetch;
    global.fetch = (url, options) => originalFetch(String(url).startsWith('https://generativelanguage.googleapis.com/') ? fixture.base + '/gemini' : url, options);
    try {
        assert.equal((await auth(event('POST', { action: 'login', email: 'a@example.test', password: 'wrong' }))).statusCode, 401);
        assert.equal((await auth(event('POST', { action: 'login', email: 'a@example.test', password: 'test-password' }, '', 'https://evil.test'))).statusCode, 403);
        const login = await auth(event('POST', { action: 'login', email: 'a@example.test', password: 'test-password' }));
        assert.equal(login.statusCode, 200);
        assert.doesNotMatch(login.body, /access_token|refresh_token|test-password/);
        const cookie = login.multiValueHeaders['Set-Cookie'].map(value => value.split(';')[0]).join('; ');
        assert(login.multiValueHeaders['Set-Cookie'].every(value => /HttpOnly; SameSite=Strict/.test(value)));
        const renewed = await auth(event('GET', undefined, 'kk_access=expired; kk_refresh=refresh-a'));
        assert.equal(JSON.parse(renewed.body).user.id, fixture.ids.a);
        assert.equal(renewed.multiValueHeaders['Set-Cookie'].length, 2);
        const payload = { backupVersion: 1, seeds: [{ id: 1, naam: 'Tomaat', type: 'Groente' }], userProfile: { name: 'Eigen profiel' } };
        assert.equal((await sync(event('POST', { payload, revision: 0, expectedUserId: fixture.ids.a }))).statusCode, 401);
        const upload = await sync(event('POST', { payload, revision: 0, expectedUserId: fixture.ids.a, user_id: fixture.ids.b }, cookie));
        assert.equal(upload.statusCode, 200);
        assert.equal(JSON.parse(upload.body).userId, fixture.ids.a);
        const own = await sync(event('GET', undefined, cookie));
        assert.deepEqual(JSON.parse(own.body).snapshot.payload, payload);
        const other = await sync(event('GET', undefined, `kk_access=${fixture.tokens.b}`));
        assert.equal(JSON.parse(other.body).snapshot, null);
        assert.equal((await sync(event('POST', { payload, revision: 0, expectedUserId: fixture.ids.a }, cookie))).statusCode, 409);
        assert.equal((await sync(event('POST', { payload, revision: 1, expectedUserId: fixture.ids.a }, cookie))).statusCode, 200);
        assert.equal((await sync(event('POST', { payload, revision: 1, expectedUserId: fixture.ids.a }, cookie))).statusCode, 409);
        assert.equal((await sync(event('POST', { payload, revision: 0, expectedUserId: fixture.ids.a }, `kk_access=${fixture.tokens.b}`))).statusCode, 409);
        assert.equal(fixture.snapshots.has(fixture.ids.b), false);
        for (const provider of ['gemini', 'ollama', 'openai-compatible']) {
            for (const [handler, input] of [[garden, { question: 'Hoe verzorg ik tomaat?' }], [seed, { name: 'Tomaat' }]]) {
                const result = await handler(event('POST', { ...input, ai: { provider, model: 'test-model' } }, cookie));
                assert.equal(result.statusCode, 200, result.body);
                if (provider !== 'gemini') assert.equal(fixture.calls.at(-1).body.model, 'test-model');
                assert.doesNotMatch(result.body, /test-backend-secret/);
            }
        }
        assert.equal((await garden(event('POST', { question: 'Test', ai: { provider: 'ollama', model: 'fail' } }, cookie))).statusCode, 502);
        const invalid = await garden(event('POST', { question: 'Test', ai: { provider: 'ollama', model: 'invalid-json' } }, cookie));
        assert.equal(invalid.statusCode, 502);
        const failure = await garden(event('POST', { question: 'Test', ai: { provider: 'openai-compatible', model: 'fail' } }, cookie));
        assert.doesNotMatch(failure.body, /secret-provider-value/);
        const refreshedFailure = await garden(event('POST', { question: 'Test', ai: { provider: 'ollama', model: 'fail' } }, 'kk_access=expired; kk_refresh=refresh-a'));
        assert.equal(refreshedFailure.statusCode, 502);
        assert.equal(refreshedFailure.multiValueHeaders['Set-Cookie'].length, 2);
        assert.equal((await garden(event('POST', { question: 'Test', ai: { provider: 'invalid', model: 'foo' } }, cookie))).statusCode, 400);
        assert.equal((await garden(event('POST', { question: 'Test', ai: { provider: 'ollama', model: '../../bad model' } }, cookie))).statusCode, 400);
        assert.equal((await garden(event('POST', { question: 'Test' }))).statusCode, 401);
        const configuration = await config(event('GET'));
        assert.doesNotMatch(configuration.body, /test-backend-secret|test-gemini-secret|127\.0\.0\.1|API_KEY|SUPABASE/);
        const logout = await auth(event('POST', { action: 'logout' }, cookie));
        assert.equal(logout.statusCode, 200);
        assert(logout.multiValueHeaders['Set-Cookie'].every(value => value.includes('Max-Age=0')));
        process.env.KWEEK_LOCAL_DEV = 'false';
        const secureLogin = await auth({ ...event('POST', { action: 'login', email: 'a@example.test', password: 'test-password' }, '', 'https://localhost:4173') });
        assert(secureLogin.multiValueHeaders['Set-Cookie'].every(value => value.endsWith('; Secure')));
    } finally { global.fetch = originalFetch; await fixture.stop(); }
});

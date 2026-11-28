const test = require('node:test');
const assert = require('node:assert/strict');
const { startFixtures } = require('./service-fixtures.cjs');
const { handler } = require('../netlify/functions/_shared/auth');

test('invitation endpoint remains unavailable, including for an administrator', async () => {
    const fixture = await startFixtures();
    const oldFetch = global.fetch;
    Object.assign(process.env, { SUPABASE_URL: fixture.base, SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture', SUPABASE_SECRET_KEY: 'sb_secret_fixture', KWEEK_LOCAL_DEV: 'true' });
    let role = 'user', invites = 0;
    global.fetch = async (url, options = {}) => {
        const path = new URL(url).pathname;
        const response = value => new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });
        if (path === '/auth/v1/user') return response({ id: fixture.ids.a, email: 'a@example.test', user_metadata: { kweek_role: 'admin' }, app_metadata: { kweek_role: role } });
        if (path === '/auth/v1/invite') { invites++; return response({ id: fixture.ids.b, email: 'b@example.test' }); }
        return oldFetch(url, options);
    };
    const event = { httpMethod: 'POST', headers: { host: 'localhost:4173', origin: 'http://localhost:4173', cookie: `kk_access=${fixture.tokens.a}` }, body: JSON.stringify({ action: 'invite', email: 'b@example.test' }) };
    try {
        assert.equal((await handler(event)).statusCode, 403);
        assert.equal(invites, 0);
        role = 'admin';
        assert.equal((await handler(event)).statusCode, 403);
        assert.equal(invites, 0);
    } finally { global.fetch = oldFetch; delete process.env.SUPABASE_SECRET_KEY; await fixture.stop(); }
});

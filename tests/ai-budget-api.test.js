const test = require('node:test');
const assert = require('node:assert/strict');
const { startFixtures } = require('./service-fixtures.cjs');
const { handler } = require('../netlify/functions/_shared/ai-budget');
test('budget endpoint restricts administration and users can only read their own allowance', async () => {
    const fixture = await startFixtures(), oldFetch = global.fetch;
    Object.assign(process.env, { SUPABASE_URL: fixture.base, SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture', SUPABASE_SECRET_KEY: 'sb_secret_fixture', KWEEK_LOCAL_DEV: 'true' });
    let role = 'user', requests = [];
    global.fetch = async (url, options = {}) => {
        const path = new URL(url).pathname;
        if (path === '/auth/v1/user') return Response.json({ id: fixture.ids.a, email: 'a@example.test', app_metadata: { kweek_role: role } });
        if (path === '/rest/v1/rpc/kweek_ai_budget') { requests.push(JSON.parse(options.body)); return Response.json({ remaining: 20, limit: 500, month: '2026-11-01', used: 480 }); }
        return oldFetch(url, options);
    };
    const event = body => ({ httpMethod: 'POST', headers: { host: 'localhost:4173', origin: 'http://localhost:4173', cookie: `kk_access=${fixture.tokens.a}` }, body: JSON.stringify(body) });
    try {
        const status = await handler(event({ action: 'status', userId: fixture.ids.b }));
        assert.equal(status.statusCode, 200); assert.deepEqual(JSON.parse(status.body), { remaining: 20, limit: 500, month: '2026-11-01' });
        assert.equal(requests.at(-1).p_user, fixture.ids.a);
        for (const action of ['list','set-default','set-limit','clear-limit']) assert.equal((await handler(event({ action, userId: fixture.ids.b, limit: 5 }))).statusCode, 403);
        role = 'admin';
        assert.equal((await handler(event({ action: 'set-limit', userId: fixture.ids.b, limit: 10 }))).statusCode, 200);
        assert.equal((await handler(event({ action: 'set-default', limit: -1 }))).statusCode, 400);
        assert.equal((await handler(event({ action: 'set-limit', userId: 'wrong', limit: 10 }))).statusCode, 400);
        assert.equal((await handler(event({ action: 'list' }))).statusCode, 200);
    } finally { global.fetch = oldFetch; delete process.env.SUPABASE_SECRET_KEY; await fixture.stop(); }
});

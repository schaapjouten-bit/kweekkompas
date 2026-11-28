const test = require('node:test');
const assert = require('node:assert/strict');
const { startFixtures } = require('./service-fixtures.cjs');
const { handler } = require('../netlify/functions/_shared/user-management');
const { handler: auth } = require('../netlify/functions/_shared/auth');
const { authenticate } = require('../netlify/functions/_shared/lib/supabase');

test('admin creates users, blocks and restores access, and resets passwords', async () => {
    const fixture = await startFixtures(), oldFetch = global.fetch;
    Object.assign(process.env, { SUPABASE_URL: fixture.base, SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture', SUPABASE_SECRET_KEY: 'sb_secret_fixture', KWEEK_LOCAL_DEV: 'true' });
    let role = 'admin', user = null, password = '', blocked = false, adminCalls = 0, sessionRevocations = 0;
    global.fetch = async (url, options = {}) => {
        const path = new URL(url).pathname, method = options.method || 'GET', body = options.body ? JSON.parse(options.body) : {};
        if (path === '/auth/v1/user') {
            const authHeader = options.headers?.Authorization || options.headers?.authorization || '';
            if (authHeader.startsWith(`Bearer ${fixture.tokens.b}`) || authHeader.startsWith('Bearer header.')) return Response.json({ ...user, banned_until: blocked ? '2099-01-01T00:00:00Z' : null });
            return Response.json({ id: fixture.ids.a, email: 'a@example.test', app_metadata: { kweek_role: role } });
        }
        if (path === '/auth/v1/admin/users' && method === 'POST') { adminCalls++; password = body.password; user = { id: fixture.ids.b, email: body.email, user_metadata: body.user_metadata, app_metadata: body.app_metadata }; assert.equal(body.email_confirm, true); return Response.json(user); }
        if (path === `/auth/v1/admin/users/${fixture.ids.b}` && method === 'GET') return Response.json(user);
        if (path === `/auth/v1/admin/users/${fixture.ids.b}` && method === 'PUT') { adminCalls++; if (body.password) password = body.password; if (body.ban_duration) blocked = body.ban_duration !== 'none'; if (body.app_metadata) user.app_metadata = body.app_metadata; return Response.json(user); }
        if (path === '/rest/v1/rpc/kweek_revoke_user_sessions' && method === 'POST') { sessionRevocations++; return Response.json({ ok: true }); }
        if (path === '/auth/v1/token') {
            if (!user || blocked || body.password !== password) return Response.json({ msg: 'Invalid login credentials', error_code: 'invalid_credentials' }, { status: 400 });
            return Response.json({ access_token: fixture.tokens.b, refresh_token: 'refresh-b', expires_in: 3600, token_type: 'bearer', user });
        }
        return oldFetch(url, options);
    };
    const event = body => ({ httpMethod: 'POST', headers: { host: 'localhost:4173', origin: 'http://localhost:4173', cookie: `kk_access=${fixture.tokens.a}` }, body: JSON.stringify(body) });
    try {
        role = 'user'; assert.equal((await handler(event({ action: 'create', name: 'Test', email: 'b@example.test', password: 'temporary-123' }))).statusCode, 403); assert.equal(adminCalls, 0);
        role = 'admin'; const created = await handler(event({ action: 'create', name: 'Test', email: 'b@example.test', password: 'temporary-123' }));
        assert.equal(created.statusCode, 200); assert.doesNotMatch(created.body, /temporary-123/); assert.deepEqual(user.app_metadata, { kweek_role: 'user' }); assert.equal(user.user_metadata.name, 'Test');
        assert.equal((await auth(event({ action: 'login', email: user.email, password: 'temporary-123' }))).statusCode, 200);
        assert.equal((await handler(event({ action: 'set-active', userId: fixture.ids.b, active: false }))).statusCode, 200);
        assert.equal(sessionRevocations, 1);
        await assert.rejects(authenticate({ headers: { cookie: `kk_access=${fixture.tokens.b}` } }), error => error.status === 401);
        assert.equal((await auth(event({ action: 'login', email: user.email, password: 'temporary-123' }))).statusCode, 401);
        assert.equal((await handler(event({ action: 'set-active', userId: fixture.ids.b, active: true }))).statusCode, 200);
        assert.equal(sessionRevocations, 1);
        assert.equal((await handler(event({ action: 'reset-password', userId: fixture.ids.b, password: 'replacement-123' }))).statusCode, 200);
        assert.equal(sessionRevocations, 2);
        assert.equal(typeof user.app_metadata.kweek_session_not_before, 'number');
        const oldJwt = `header.${Buffer.from(JSON.stringify({ iat: user.app_metadata.kweek_session_not_before - 10 })).toString('base64url')}.sig`;
        await assert.rejects(authenticate({ headers: { cookie: `kk_access=${oldJwt}` } }), error => error.status === 401);
        assert.equal((await auth(event({ action: 'login', email: user.email, password: 'temporary-123' }))).statusCode, 401);
        assert.equal((await auth(event({ action: 'login', email: user.email, password: 'replacement-123' }))).statusCode, 200);
        assert.equal((await handler(event({ action: 'set-active', userId: fixture.ids.a, active: false }))).statusCode, 400);
        user.app_metadata.kweek_role = 'admin';
        assert.equal((await handler(event({ action: 'reset-password', userId: fixture.ids.b, password: 'replacement-456' }))).statusCode, 403);
        assert.equal((await handler(event({ action: 'create', name: 'Test', email: 'b@example.test', password: 'short' }))).statusCode, 400);
    } finally { global.fetch = oldFetch; delete process.env.SUPABASE_SECRET_KEY; await fixture.stop(); }
});

test('a user can replace the temporary password without email', async () => {
    const fixture = await startFixtures(), oldFetch = global.fetch;
    Object.assign(process.env, { SUPABASE_URL: fixture.base, SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture', KWEEK_LOCAL_DEV: 'true' });
    let password = 'temporary-123', signOutScope = null;
    const user = { id: fixture.ids.b, email: 'b@example.test', app_metadata: { kweek_role: 'user' } };
    global.fetch = async (url, options = {}) => {
        const parsed = new URL(url), path = parsed.pathname, method = options.method || 'GET', body = options.body ? JSON.parse(options.body) : {};
        if (path === '/auth/v1/token') {
            if (body.password !== password) return Response.json({ msg: 'Invalid login credentials', error_code: 'invalid_credentials' }, { status: 400 });
            return Response.json({ access_token: fixture.tokens.b, refresh_token: 'refresh-b', expires_in: 3600, token_type: 'bearer', user });
        }
        if (path === '/auth/v1/logout') { signOutScope = parsed.searchParams.get('scope'); return new Response(null, { status: 204 }); }
        if (path === '/auth/v1/user' && method === 'PUT') { password = body.password; return Response.json(user); }
        if (path === '/auth/v1/user') return Response.json(user);
        return oldFetch(url, options);
    };
    const event = body => ({ httpMethod: 'POST', headers: { host: 'localhost:4173', origin: 'http://localhost:4173', cookie: `kk_access=${fixture.tokens.b}` }, body: JSON.stringify(body) });
    try {
        assert.equal((await auth(event({ action: 'change-password', currentPassword: 'wrong', password: 'new-password-123' }))).statusCode, 401);
        const result = await auth(event({ action: 'change-password', currentPassword: 'temporary-123', password: 'new-password-123' }));
        assert.equal(result.statusCode, 200); assert.equal(password, 'new-password-123'); assert.equal(signOutScope, 'others');
        assert.doesNotMatch(result.body, /temporary-123|new-password-123/);
    } finally { global.fetch = oldFetch; await fixture.stop(); }
});

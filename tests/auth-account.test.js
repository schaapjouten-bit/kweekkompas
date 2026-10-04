// Isolated HTTP Auth fixture: no live accounts, mail or garden data.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startFixtures } = require('./service-fixtures.cjs');
const { handler } = require('../netlify/functions/_shared/auth');
const event = (body, cookie = '', local = true) => ({ httpMethod: 'POST', headers: { host: local ? '127.0.0.1:4173' : 'kweekkompas.netlify.app', origin: local ? 'http://127.0.0.1:4173' : 'https://kweekkompas.netlify.app', cookie }, body: JSON.stringify(body) });
const jar = result => result.multiValueHeaders['Set-Cookie'].map(v => v.split(';')[0]).join('; ');
test('registration, confirmation, reset, recovery and error distinctions', async () => {
    const fixture = await startFixtures();
    const originalFetch = global.fetch;
    const calls = [];
    let failure;
    let confirmed = false;
    Object.assign(process.env, { SUPABASE_URL: fixture.base, SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture', KWEEK_LOCAL_DEV: 'true' });
    global.fetch = async (input, options) => {
        const url = new URL(input); const body = options?.body ? JSON.parse(options.body) : {};
        calls.push({ path: url.pathname, redirect: url.searchParams.get('redirect_to'), body });
        const send = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
        if (failure) return send({ msg: 'fixture private detail', error_code: failure }, failure === 'over_email_send_rate_limit' ? 429 : 400);
        if (url.pathname === '/auth/v1/signup') return send({ id: fixture.ids.a, email: 'a@example.test' });
        if (url.pathname === '/auth/v1/recover' || url.pathname === '/auth/v1/resend') return send({});
        if (url.pathname === '/auth/v1/verify') {
            if (body.token_hash !== 'valid-fixture-hash') return send({ msg: 'expired', error_code: 'otp_expired' }, 403);
            confirmed = true;
            return send({ access_token: fixture.tokens.a, refresh_token: 'refresh-a', expires_in: 3600, token_type: 'bearer', user: { id: fixture.ids.a, email: 'a@example.test' } });
        }
        if (url.pathname === '/auth/v1/user' && options.method === 'PUT') return send({ id: fixture.ids.a, email: 'a@example.test' });
        if (url.pathname === '/auth/v1/token' && body.password === 'unconfirmed-password' && !confirmed) return send({ msg: 'Email not confirmed', error_code: 'email_not_confirmed' }, 400);
        return originalFetch(input, options);
    };
    try {
        const signup = await handler(event({ action: 'signup', email: 'a@example.test', password: 'test-password' }));
        assert.equal(signup.statusCode, 200); assert.match(signup.body, /bevestigingsmail/); assert.equal(signup.multiValueHeaders, undefined);
        assert.equal(calls.find(c => c.path.endsWith('/signup')).redirect, 'http://127.0.0.1:4173/');
        const unconfirmed = await handler(event({ action: 'login', email: 'a@example.test', password: 'unconfirmed-password' }));
        assert.match(unconfirmed.body, /Bevestig eerst/);
        const resend = await handler(event({ action: 'resend', email: 'a@example.test' })); assert.equal(resend.statusCode, 200);
        const reset = await handler(event({ action: 'reset', email: 'a@example.test' })); assert.equal(reset.statusCode, 200); assert.match(reset.body, /Als er/);
        process.env.KWEEK_LOCAL_DEV = 'false';
        await handler(event({ action: 'reset', email: 'a@example.test' }, '', false));
        assert.equal(calls.filter(c => c.path.endsWith('/recover')).at(-1).redirect, 'https://kweekkompas.netlify.app/');
        process.env.KWEEK_LOCAL_DEV = 'true';
        const expired = await handler(event({ action: 'callback', type: 'recovery', token_hash: 'expired' })); assert.match(expired.body, /verlopen/);
        const confirm = await handler(event({ action: 'callback', type: 'email', token_hash: 'valid-fixture-hash' }));
        assert.equal(JSON.parse(confirm.body).recovery, false);
        const denied = await handler(event({ action: 'password', password: 'new-password' }, jar(confirm))); assert.equal(denied.statusCode, 401);
        const recovery = await handler(event({ action: 'callback', type: 'recovery', access_token: fixture.tokens.a, refresh_token: 'refresh-a' }));
        assert.equal(recovery.statusCode, 200); assert.equal(JSON.parse(recovery.body).recovery, true); assert.doesNotMatch(recovery.body, /access_token|refresh_token/);
        const changed = await handler(event({ action: 'password', password: 'new-password' }, jar(recovery))); assert.equal(changed.statusCode, 200);
        assert.ok(changed.multiValueHeaders['Set-Cookie'].some(c => c.startsWith('kk_recovery=;') && c.includes('Max-Age=0')));
        assert.equal(calls.find(c => c.path.endsWith('/user') && c.body.password).body.password, 'new-password');
        for (const [code, message] of [['signup_disabled', /staat nog uit/], ['weak_password', /sterker wachtwoord/], ['same_password', /ander wachtwoord/], ['over_email_send_rate_limit', /te snel/]]) {
            failure = code;
            const result = await handler(event({ action: 'signup', email: 'a@example.test', password: 'test-password' })); assert.match(result.body, message); assert.doesNotMatch(result.body, /private detail/);
        }
        failure = undefined;
        assert.equal(fixture.snapshots.size, 0);
        assert.ok(calls.every(c => !c.path.includes('/rest/')), 'account flows never access garden storage');
        const foreign = event({ action: 'reset', email: 'a@example.test' }); foreign.headers.origin = 'https://foreign.example';
        assert.equal((await handler(foreign)).statusCode, 403);
    } finally { global.fetch = originalFetch; await fixture.stop(); }
});

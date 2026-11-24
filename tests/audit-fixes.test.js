const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const dns = require('node:dns/promises');
const https = require('node:https');
const contract = require('../ai-contract');
const localBackup = require('../local-backup');
const { handler: productSearch } = require('../netlify/functions/_shared/product-search');
const { providerConfig } = require('../netlify/functions/_shared/lib/ai');

const postEvent = (body, cookie = '', origin = 'http://localhost:4173') => ({
    httpMethod: 'POST',
    headers: { host: 'localhost:4173', origin, cookie },
    body: JSON.stringify(body)
});

test('product-search: custom DNS lookup supports options.all and single callback while preserving IP checks', async () => {
    const oldLookup = dns.lookup;
    const oldGet = https.get;
    const oldLocalDev = process.env.KWEEK_LOCAL_DEV;
    const oldSupaUrl = process.env.SUPABASE_URL;
    const oldSupaKey = process.env.SUPABASE_PUBLISHABLE_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
    process.env.KWEEK_LOCAL_DEV = 'true';

    let allResult = null;
    let singleResult = null;
    dns.lookup = async () => [{ address: '93.184.216.34', family: 4 }];
    https.get = (_url, options, onResponse) => {
        options.lookup('example.com', { all: true }, (err, list) => {
            assert.equal(err, null);
            allResult = list;
        });
        options.lookup('example.com', { all: false }, (err, addr, family) => {
            assert.equal(err, null);
            singleResult = { addr, family };
        });
        const req = new EventEmitter();
        req.destroy = () => {};
        const res = new EventEmitter();
        res.statusCode = 200;
        res.headers = { 'content-type': 'text/html; charset=utf-8' };
        res.setEncoding = () => {};
        res.complete = true;
        process.nextTick(() => {
            onResponse(res);
            res.emit('data', '<html><body><h1>Tomatenvoeding</h1></body></html>');
            res.emit('end');
        });
        return req;
    };

    try {
        const ok = await productSearch(postEvent({ action: 'page', url: 'https://example.com/product' }));
        assert.equal(ok.statusCode, 200);
        assert.equal(JSON.parse(ok.body).text, 'Tomatenvoeding');
        assert.deepEqual(allResult, [{ address: '93.184.216.34', family: 4 }]);
        assert.deepEqual(singleResult, { addr: '93.184.216.34', family: 4 });

        dns.lookup = async () => [{ address: '127.0.0.1', family: 4 }];
        const blocked = await productSearch(postEvent({ action: 'page', url: 'https://internal.example/secret' }));
        assert.equal(blocked.statusCode, 400);
    } finally {
        dns.lookup = oldLookup;
        https.get = oldGet;
        if (oldLocalDev === undefined) delete process.env.KWEEK_LOCAL_DEV; else process.env.KWEEK_LOCAL_DEV = oldLocalDev;
        if (oldSupaUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldSupaUrl;
        if (oldSupaKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY; else process.env.SUPABASE_PUBLISHABLE_KEY = oldSupaKey;
    }
});

test('product-search: rejects cleanly on >1 MB response, timeout and aborted connection', async () => {
    const oldLookup = dns.lookup;
    const oldGet = https.get;
    const oldLocalDev = process.env.KWEEK_LOCAL_DEV;
    const oldSupaUrl = process.env.SUPABASE_URL;
    const oldSupaKey = process.env.SUPABASE_PUBLISHABLE_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
    process.env.KWEEK_LOCAL_DEV = 'true';
    dns.lookup = async () => [{ address: '93.184.216.34', family: 4 }];

    try {
        // 1. Oversized (> 1 MB)
        let destroyedWith = null;
        https.get = (_url, _options, onResponse) => {
            const req = new EventEmitter();
            req.destroy = err => { destroyedWith = err; };
            const res = new EventEmitter();
            res.statusCode = 200;
            res.headers = { 'content-type': 'text/html' };
            res.setEncoding = () => {};
            process.nextTick(() => {
                onResponse(res);
                res.emit('data', 'a'.repeat(1_000_001));
            });
            return req;
        };
        const tooBig = await productSearch(postEvent({ action: 'page', url: 'https://example.com/big' }));
        assert.equal(tooBig.statusCode, 413);
        assert.ok(destroyedWith instanceof Error);

        // 2. Timeout
        destroyedWith = null;
        https.get = () => {
            const req = new EventEmitter();
            req.destroy = err => { destroyedWith = err; };
            process.nextTick(() => req.emit('timeout'));
            return req;
        };
        const timedOut = await productSearch(postEvent({ action: 'page', url: 'https://example.com/slow' }));
        assert.equal(timedOut.statusCode, 504);
        assert.ok(destroyedWith instanceof Error);

        // 3. Aborted / premature close
        https.get = (_url, _options, onResponse) => {
            const req = new EventEmitter();
            req.destroy = () => {};
            const res = new EventEmitter();
            res.statusCode = 200;
            res.headers = { 'content-type': 'text/html' };
            res.setEncoding = () => {};
            res.complete = false;
            process.nextTick(() => {
                onResponse(res);
                res.emit('close');
            });
            return req;
        };
        const aborted = await productSearch(postEvent({ action: 'page', url: 'https://example.com/drop' }));
        assert.equal(aborted.statusCode, 502);
    } finally {
        dns.lookup = oldLookup;
        https.get = oldGet;
        if (oldLocalDev === undefined) delete process.env.KWEEK_LOCAL_DEV; else process.env.KWEEK_LOCAL_DEV = oldLocalDev;
        if (oldSupaUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldSupaUrl;
        if (oldSupaKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY; else process.env.SUPABASE_PUBLISHABLE_KEY = oldSupaKey;
    }
});

test('product-search: sends refreshed session cookies on both success and error', async () => {
    const oldFetch = global.fetch;
    const oldLookup = dns.lookup;
    const oldGet = https.get;
    const oldSupaUrl = process.env.SUPABASE_URL;
    const oldSupaKey = process.env.SUPABASE_PUBLISHABLE_KEY;
    const oldLocalDev = process.env.KWEEK_LOCAL_DEV;
    process.env.SUPABASE_URL = 'https://fixture.supabase.test';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_fixture';
    process.env.KWEEK_LOCAL_DEV = 'true';
    dns.lookup = async () => [{ address: '93.184.216.34', family: 4 }];
    global.fetch = async (input, options = {}) => {
        const url = new URL(input);
        const authHeader = new Headers(options.headers).get('authorization') || '';
        const send = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
        if (url.pathname === '/auth/v1/user') {
            if (authHeader === 'Bearer fresh-token') return send({ id: '11111111-1111-1111-1111-111111111111', email: 'a@example.test', is_anonymous: false });
            return send({ msg: 'expired' }, 401);
        }
        if (url.pathname === '/auth/v1/token') {
            return send({ access_token: 'fresh-token', refresh_token: 'fresh-refresh', expires_in: 3600, token_type: 'bearer', user: { id: '11111111-1111-1111-1111-111111111111', email: 'a@example.test' } });
        }
        throw new Error('Unexpected fetch: ' + url.href);
    };
    try {
        https.get = (_url, _options, onResponse) => {
            const req = new EventEmitter();
            req.destroy = () => {};
            const res = new EventEmitter();
            res.statusCode = 200;
            res.headers = { 'content-type': 'text/html' };
            res.setEncoding = () => {};
            res.complete = true;
            process.nextTick(() => {
                onResponse(res);
                res.emit('data', '<p>OK</p>');
                res.emit('end');
            });
            return req;
        };
        const ok = await productSearch(postEvent({ action: 'page', url: 'https://example.com/ok' }, 'kk_access=expired; kk_refresh=refresh-a'));
        assert.equal(ok.statusCode, 200);
        assert.equal(ok.multiValueHeaders?.['Set-Cookie']?.length, 2);
        assert.ok(ok.multiValueHeaders['Set-Cookie'].some(c => c.startsWith('kk_refresh=fresh-refresh')));

        https.get = () => {
            const req = new EventEmitter();
            req.destroy = () => {};
            process.nextTick(() => req.emit('error', new Error('boom')));
            return req;
        };
        const failed = await productSearch(postEvent({ action: 'page', url: 'https://example.com/fail' }, 'kk_access=expired; kk_refresh=refresh-a'));
        assert.equal(failed.statusCode, 502);
        assert.equal(failed.multiValueHeaders?.['Set-Cookie']?.length, 2);
        assert.ok(failed.multiValueHeaders['Set-Cookie'].some(c => c.startsWith('kk_refresh=fresh-refresh')));
    } finally {
        global.fetch = oldFetch;
        dns.lookup = oldLookup;
        https.get = oldGet;
        if (oldSupaUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldSupaUrl;
        if (oldSupaKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY; else process.env.SUPABASE_PUBLISHABLE_KEY = oldSupaKey;
        if (oldLocalDev === undefined) delete process.env.KWEEK_LOCAL_DEV; else process.env.KWEEK_LOCAL_DEV = oldLocalDev;
    }
});

test('ai-contract: bounds existingFields and context with clear 400 errors', () => {
    const normal = contract.build('seed-info', { name: 'Tomaat', existingFields: { type: 'Groente', notes: 'Lekkere soort' } });
    assert.match(normal.prompt, /Lekkere soort/);
    const normalGarden = contract.build('tuinassistent', { question: 'Wat zaai ik nu?', context: { month: 'april', plants: ['Tomaat', 'Sla'] } });
    assert.match(normalGarden.prompt, /april/);

    assert.throws(
        () => contract.build('seed-info', { name: 'Tomaat', existingFields: { notes: 'x'.repeat(17_000) } }),
        err => err.status === 400 && /te groot/i.test(err.message)
    );
    assert.throws(
        () => contract.build('tuinassistent', { question: 'Vraag', context: { plants: ['x'.repeat(17_000)] } }),
        err => err.status === 400 && /te groot/i.test(err.message)
    );
    assert.throws(
        () => contract.build('seed-info', { name: 'Tomaat', existingFields: ['not-an-object'] }),
        err => err.status === 400
    );
});

test('ai providerConfig: isolates corrupt local OpenAI and custom API config', () => {
    const oldLocalDev = process.env.KWEEK_LOCAL_DEV;
    const oldOpenAI = globalThis.KweekOpenAIPersonal;
    const oldLocalAPI = globalThis.KweekLocalAPI;
    process.env.KWEEK_LOCAL_DEV = 'true';
    globalThis.KweekOpenAIPersonal = { getKey: () => { throw new Error('corrupt openai'); } };
    globalThis.KweekLocalAPI = { get: () => { throw new Error('corrupt local api'); } };
    try {
        const cfg = providerConfig();
        assert.equal(cfg.openai.configured, false);
        assert.equal(cfg['openai-compatible'].configured, false);
        assert.equal(cfg.ollama.configured, true);
    } finally {
        if (oldLocalDev === undefined) delete process.env.KWEEK_LOCAL_DEV; else process.env.KWEEK_LOCAL_DEV = oldLocalDev;
        globalThis.KweekOpenAIPersonal = oldOpenAI;
        globalThis.KweekLocalAPI = oldLocalAPI;
    }
});

test('local-backup: retries IndexedDB open and init after transient open error', async () => {
    let attempts = 0;
    const fakeIndexedDB = {
        open() {
            attempts++;
            const req = {};
            process.nextTick(() => {
                if (attempts === 1) {
                    req.error = new Error('transient');
                    req.onerror?.({ target: req });
                } else {
                    const fakeDb = {
                        transaction() {
                            return {
                                objectStore() {
                                    return {
                                        get() {
                                            const getReq = {};
                                            process.nextTick(() => {
                                                getReq.result = undefined;
                                                getReq.onsuccess?.();
                                            });
                                            return getReq;
                                        }
                                    };
                                }
                            };
                        }
                    };
                    req.result = fakeDb;
                    req.onsuccess?.({ target: req });
                }
            });
            return req;
        }
    };
    const manager = localBackup.create({ indexedDB: fakeIndexedDB, pickDirectory: () => null });
    await manager.init();
    assert.equal(manager.state().persistenceWarning, true);
    assert.equal(attempts, 1);

    await manager.init();
    assert.equal(attempts, 2);
});

test('auth recovery: requires verifyOtp, signs/binds kk_recovery to session, rejects forged/expired/other-session/normal cookies', async () => {
    const { handler: auth } = require('../netlify/functions/_shared/auth');
    const oldFetch = global.fetch;
    const oldNow = Date.now;
    const oldSupaUrl = process.env.SUPABASE_URL;
    const oldSupaKey = process.env.SUPABASE_PUBLISHABLE_KEY;
    const oldLocalDev = process.env.KWEEK_LOCAL_DEV;
    process.env.SUPABASE_URL = 'https://fixture.supabase.test';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_fixture';
    process.env.KWEEK_LOCAL_DEV = 'true';

    const userId = '11111111-1111-1111-1111-111111111111';
    const baseTime = 1_760_000_000_000;
    const makeJwt = sessionId => {
        const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
        const p = Buffer.from(JSON.stringify({ sub: userId, session_id: sessionId, exp: Math.floor(baseTime / 1000) + 3600 })).toString('base64url');
        return `${h}.${p}.sig`;
    };
    const tokenSessionA = makeJwt('sess-a');
    const tokenSessionB = makeJwt('sess-b');
    const validTokens = new Set([tokenSessionA, tokenSessionB]);
    let passwordUpdates = 0;

    global.fetch = async (input, options = {}) => {
        const url = new URL(input);
        const body = options.body ? JSON.parse(options.body) : {};
        const authHeader = new Headers(options.headers).get('authorization') || '';
        const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
        const send = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

        if (url.pathname === '/auth/v1/verify') {
            if (body.type === 'recovery' && body.token_hash === 'valid-recovery-hash') {
                return send({ access_token: tokenSessionA, refresh_token: 'refresh-a', expires_in: 3600, token_type: 'bearer', user: { id: userId, email: 'a@example.test', is_anonymous: false } });
            }
            return send({ msg: 'expired', error_code: 'otp_expired' }, 403);
        }
        if (url.pathname === '/auth/v1/token') {
            if (body.email === 'a@example.test' && body.password === 'test-password') {
                return send({ access_token: tokenSessionB, refresh_token: 'refresh-b', expires_in: 3600, token_type: 'bearer', user: { id: userId, email: 'a@example.test', is_anonymous: false } });
            }
            return send({ msg: 'invalid', error_code: 'invalid_credentials' }, 400);
        }
        if (url.pathname === '/auth/v1/signup') {
            return send({ id: userId, email: body.email });
        }
        if (url.pathname === '/auth/v1/user') {
            if (!validTokens.has(bearer)) return send({ msg: 'unauthorized' }, 401);
            if (options.method === 'PUT') {
                passwordUpdates++;
                return send({ id: userId, email: 'a@example.test', is_anonymous: false });
            }
            return send({ id: userId, email: 'a@example.test', is_anonymous: false });
        }
        throw new Error('Unexpected fetch: ' + url.href);
    };

    const jar = res => (res.multiValueHeaders?.['Set-Cookie'] || []).map(v => v.split(';')[0]).join('; ');
    const cookieMap = res => Object.fromEntries((res.multiValueHeaders?.['Set-Cookie'] || []).map(v => {
        const pair = v.split(';')[0];
        const i = pair.indexOf('=');
        return [pair.slice(0, i), pair.slice(i + 1)];
    }));

    try {
        // 1. Normal login & signup keep working
        const signup = await auth(postEvent({ action: 'signup', email: 'a@example.test', password: 'test-password' }));
        assert.equal(signup.statusCode, 200);
        const login = await auth(postEvent({ action: 'login', email: 'a@example.test', password: 'test-password' }));
        assert.equal(login.statusCode, 200);
        const loginJar = jar(login);

        // 2. Normal session cannot change password
        const noRecovery = await auth(postEvent({ action: 'password', password: 'new-strong-password' }, loginJar));
        assert.equal(noRecovery.statusCode, 401);

        // 3. setSession with client type:'recovery' is rejected
        const setSessionRecovery = await auth(postEvent({ action: 'callback', type: 'recovery', access_token: tokenSessionB, refresh_token: 'refresh-b' }));
        assert.equal(setSessionRecovery.statusCode, 400);
        assert.equal(setSessionRecovery.multiValueHeaders, undefined);

        // 4. Valid verifyOtp recovery link issues signed, short-lived cookie
        Date.now = () => baseTime;
        const recovery = await auth(postEvent({ action: 'callback', type: 'recovery', token_hash: 'valid-recovery-hash' }));
        assert.equal(recovery.statusCode, 200);
        assert.equal(JSON.parse(recovery.body).recovery, true);
        const recoveryHeader = recovery.multiValueHeaders['Set-Cookie'].find(c => c.startsWith('kk_recovery='));
        assert.match(recoveryHeader, /HttpOnly; SameSite=Strict; Max-Age=900/);
        const recoveryVal = cookieMap(recovery).kk_recovery;
        assert.notEqual(recoveryVal, userId);
        assert.match(recoveryVal, /^\d+\.[A-Za-z0-9_-]+$/);

        // 5. Forged cookie (raw userId or tampered exp) is rejected
        const forgedRaw = await auth(postEvent({ action: 'password', password: 'new-strong-password' }, `kk_access=${tokenSessionA}; kk_refresh=refresh-a; kk_recovery=${userId}`));
        assert.equal(forgedRaw.statusCode, 401);
        const [expPart, macPart] = recoveryVal.split('.');
        const forgedExp = await auth(postEvent({ action: 'password', password: 'new-strong-password' }, `kk_access=${tokenSessionA}; kk_refresh=refresh-a; kk_recovery=${Number(expPart) + 1}.${macPart}`));
        assert.equal(forgedExp.statusCode, 401);

        // 6. Cookie from Session A cannot be used with Session B (same user!)
        const otherSession = await auth(postEvent({ action: 'password', password: 'new-strong-password' }, `kk_access=${tokenSessionB}; kk_refresh=refresh-b; kk_recovery=${recoveryVal}`));
        assert.equal(otherSession.statusCode, 401);
        const otherSessionGet = await auth({ httpMethod: 'GET', headers: { host: 'localhost:4173', cookie: `kk_access=${tokenSessionB}; kk_refresh=refresh-b; kk_recovery=${recoveryVal}` }, body: '' });
        assert.equal(JSON.parse(otherSessionGet.body).recovery, false);

        // 7. Expired cookie (> 15 min) is rejected
        Date.now = () => baseTime + 901_000;
        const expired = await auth(postEvent({ action: 'password', password: 'new-strong-password' }, jar(recovery)));
        assert.equal(expired.statusCode, 401);
        const expiredGet = await auth({ httpMethod: 'GET', headers: { host: 'localhost:4173', cookie: jar(recovery) }, body: '' });
        assert.equal(JSON.parse(expiredGet.body).recovery, false);

        // 8. Valid recovery cookie within window succeeds and clears kk_recovery
        Date.now = () => baseTime + 60_000;
        const activeGet = await auth({ httpMethod: 'GET', headers: { host: 'localhost:4173', cookie: jar(recovery) }, body: '' });
        assert.equal(JSON.parse(activeGet.body).recovery, true);
        const changed = await auth(postEvent({ action: 'password', password: 'new-strong-password' }, jar(recovery)));
        assert.equal(changed.statusCode, 200);
        assert.equal(JSON.parse(changed.body).recovery, false);
        assert.ok(changed.multiValueHeaders['Set-Cookie'].some(c => c.startsWith('kk_recovery=;') && c.includes('Max-Age=0')));
        assert.equal(passwordUpdates, 1);

        // 9. Hosted mode without RECOVERY_COOKIE_SECRET fails closed (no public key fallback)
        process.env.KWEEK_LOCAL_DEV = 'false';
        delete process.env.RECOVERY_COOKIE_SECRET;
        const missingSecret = await auth({ httpMethod: 'POST', headers: { host: 'kweekkompas.netlify.app', origin: 'https://kweekkompas.netlify.app' }, body: JSON.stringify({ action: 'callback', type: 'recovery', token_hash: 'valid-recovery-hash' }) });
        assert.equal(missingSecret.statusCode, 503);
        assert.equal(missingSecret.multiValueHeaders, undefined);

        // 10. Hosted mode with server-side RECOVERY_COOKIE_SECRET succeeds and sets Secure cookie
        process.env.RECOVERY_COOKIE_SECRET = 'test-server-side-recovery-secret-0123456789';
        const hostedRecovery = await auth({ httpMethod: 'POST', headers: { host: 'kweekkompas.netlify.app', origin: 'https://kweekkompas.netlify.app' }, body: JSON.stringify({ action: 'callback', type: 'recovery', token_hash: 'valid-recovery-hash' }) });
        assert.equal(hostedRecovery.statusCode, 200);
        assert.ok(hostedRecovery.multiValueHeaders['Set-Cookie'].some(c => c.startsWith('kk_recovery=') && c.includes('; Secure')));
    } finally {
        global.fetch = oldFetch;
        Date.now = oldNow;
        delete process.env.RECOVERY_COOKIE_SECRET;
        if (oldSupaUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldSupaUrl;
        if (oldSupaKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY; else process.env.SUPABASE_PUBLISHABLE_KEY = oldSupaKey;
        if (oldLocalDev === undefined) delete process.env.KWEEK_LOCAL_DEV; else process.env.KWEEK_LOCAL_DEV = oldLocalDev;
    }
});

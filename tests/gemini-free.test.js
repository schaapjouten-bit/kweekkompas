const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { startFixtures, configureFixtures } = require('./service-fixtures.cjs');

test('Gemini Free tier: session, fixed shared model, account limits, sanitized errors and independent legacy key', async () => {
    const { createServer } = require('../scripts/dev-server.cjs');
    const fixture = await startFixtures({ admins: ['a', 'b'] });
    configureFixtures(fixture);
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kweek-shared-gemini-'));
    const legacyFile = path.join(directory, '.kweek-gemini-free.json');
    const personalFile = path.join(directory, '.kweek-gemini.json');
    fs.writeFileSync(legacyFile, JSON.stringify({ apiKey: 'legacy-personal-key' }));
    fs.writeFileSync(personalFile, JSON.stringify({ apiKey: 'existing-personal-key' }));
    const app = createServer({ geminiFreeFile: legacyFile, geminiPersonalFile: personalFile, chatGPTFile: path.join(directory, 'chatgpt.json') });
    const originalFetch = global.fetch;
    const calls = [];
    let quotaExhausted = false;
    global.fetch = async (url, options) => {
        if (!String(url).startsWith('https://generativelanguage.googleapis.com/')) return originalFetch(url, options);
        calls.push({ url: String(url), key: options.headers['x-goog-api-key'] });
        if (quotaExhausted) return Response.json({ error: { message: 'shared-fixture-secret' } }, { status: 429 });
        if (JSON.parse(options.body).generationConfig.maxOutputTokens) {
            return Response.json({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] });
        }
        return originalFetch(fixture.base + '/gemini', options);
    };
    try {
        await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
        const base = 'http://127.0.0.1:' + app.address().port;
        const post = (route, body, cookie = '', origin = base) => originalFetch(base + '/api/' + route, {
            method: 'POST', headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        });
        const a = 'kk_access=' + fixture.tokens.a;
        const b = 'kk_access=' + fixture.tokens.b;
        const free = { provider: 'gemini-free', model: 'gemini-wrong-model', apiKey: 'browser-injected-key', id: fixture.ids.b };
        const garden = { question: 'Kan ik tomaten buiten zetten?', ai: free };
        const status = { action: 'status' };
        delete process.env.GEMINI_FREE_API_KEY;
        const unconfigured = await post('tuinassistent', garden, a);
        assert.equal(unconfigured.status, 503);
        assert.match((await unconfigured.json()).error, /gedeelde sleutel ontbreekt/);
        assert.equal((await post('gemini-free', status, a)).status, 503);
        assert.equal(calls.length, 0);

        process.env.GEMINI_FREE_API_KEY = 'shared-fixture-secret';
        const noSession = await post('tuinassistent', garden);
        assert.equal(noSession.status, 401);
        assert.match((await noSession.json()).error, /Log in bij KweekKompas/);
        assert.equal((await post('gemini-free', status)).status, 401);
        assert.equal((await post('tuinassistent', garden, 'kk_access=invalid')).status, 401);
        assert.equal((await post('tuinassistent', garden, a, 'https://other.example')).status, 403);
        assert.deepEqual(await (await post('gemini-free', status, a)).json(), { model: 'gemini-3.5-flash-lite' });
        assert.equal((await post('gemini-free', { action: 'save-test', apiKey: 'old-key' }, a)).status, 400);
        assert.equal(calls.length, 0);

        for (const [route, body] of [
            ['tuinassistent', garden],
            ['seed-info', { name: 'Tomaat', ai: free }],
            ['gemini-ai', { mode: 'garden_assistant', input: 'Testvraag', ai: free }]
        ]) {
            const result = await post(route, body, a);
            const text = await result.text();
            assert.equal(result.status, 200, text);
            assert.doesNotMatch(text, /shared-fixture-secret|browser-injected-key/);
            assert.ok(calls.at(-1).key === 'shared-fixture-secret');
            assert.match(calls.at(-1).url, /\/gemini-3\.5-flash-lite:generateContent$/);
        }
        assert.equal(fixture.geminiFreeUsage.get('a'), 3);
        assert.equal(fixture.geminiFreeUsage.has('b'), false);
        fixture.geminiFreeUsage.set('a', 20);
        const limited = await post('tuinassistent', garden, a);
        assert.equal(limited.status, 429);
        assert.match((await limited.json()).error, /daglimiet/);
        assert.equal(calls.length, 3);
        quotaExhausted = true;
        const sharedLimited = await post('tuinassistent', garden, b);
        assert.equal(sharedLimited.status, 429);
        const message = await sharedLimited.text();
        assert.match(message, /gedeelde Gemini-quotum/);
        assert.doesNotMatch(message, /shared-fixture-secret/);
        quotaExhausted = false;
        assert.equal((await post('tuinassistent', garden, b)).status, 200);
        assert.equal(fixture.geminiFreeUsage.get('b'), 2);

        const personalStatus = await (await post('gemini-personal', { action: 'get' })).json();
        assert.deepEqual(personalStatus, { keyConfigured: true, legacyKeyAvailable: true, usingLegacyKey: false });
        const personal = { provider: 'gemini', model: 'gemini-4-neon' };
        assert.equal((await post('tuinassistent', { ...garden, ai: personal })).status, 200);
        assert.ok(calls.at(-1).key === 'existing-personal-key');
        const migrated = await post('gemini-personal', { action: 'save-test', apiKey: '', useLegacyKey: true, model: personal.model });
        assert.equal(migrated.status, 200);
        assert.doesNotMatch(await migrated.text(), /legacy-personal-key/);
        assert.equal((await post('tuinassistent', { ...garden, ai: personal })).status, 200);
        assert.ok(calls.at(-1).key === 'legacy-personal-key');
        assert.equal(fs.readFileSync(legacyFile, 'utf8'), JSON.stringify({ apiKey: 'legacy-personal-key' }));
        assert.equal((await post('gemini-personal', { action: 'save-test', apiKey: '', useLegacyKey: false, model: personal.model })).status, 200);
        assert.ok(calls.at(-1).key === 'existing-personal-key');
        assert.equal((await originalFetch(base + '/.kweek-gemini.json')).status, 404);
    } finally {
        global.fetch = originalFetch;
        if (app.listening) await new Promise(resolve => app.close(resolve));
        await fixture.stop();
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('The quota SQL permits exactly 20 requests per account and UTC day with no direct counter access', async () => {
    const db = new PGlite();
    const a = '11111111-1111-4111-8111-111111111111';
    const b = '22222222-2222-4222-8222-222222222222';
    try {
        await db.exec(`create role anon; create role authenticated; create schema auth;
            create table auth.users(id uuid primary key);
            insert into auth.users values ('${a}'), ('${b}');
            create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
            create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;`);
        const dir = path.resolve(__dirname, '../supabase/migrations');
        const file = fs.readdirSync(dir).find(name => name.endsWith('_gemini_free_daily_quota.sql'));
        await db.exec(fs.readFileSync(path.join(dir, file), 'utf8'));
        await db.exec('set role anon;');
        const reserve = async () => (await db.query('select public.reserve_gemini_free_request() as ok')).rows[0].ok;
        await assert.rejects(reserve, /permission denied/);
        const asUser = id => db.exec(`reset role; set role authenticated; set request.jwt.claim.sub = '${id}';`);
        await asUser(a);
        await db.exec(`set request.jwt.claims = '{"is_anonymous":true}';`);
        await assert.rejects(reserve, /insufficient_privilege/);
        await db.exec(`set request.jwt.claims = '{}';`);
        const attempts = await Promise.all(Array.from({ length: 25 }, reserve));
        assert.equal(attempts.filter(Boolean).length, 20);
        await assert.rejects(db.query('update kweekkompas_private.gemini_free_quota set request_count = 1'), /permission denied/);
        await asUser(b);
        assert.equal(await reserve(), true);
        await db.exec('reset role;');
        await db.query('update kweekkompas_private.gemini_free_quota set utc_day = utc_day - 1 where account_id = $1', [a]);
        await asUser(a);
        assert.equal(await reserve(), true);
        await db.exec('reset role;');
        assert.deepEqual((await db.query('select request_count from kweekkompas_private.gemini_free_quota order by account_id')).rows, [{ request_count: 1 }, { request_count: 1 }]);
    } finally { await db.close(); }
});

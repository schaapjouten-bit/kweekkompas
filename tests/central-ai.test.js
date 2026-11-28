const test = require('node:test');
const assert = require('node:assert/strict');
const { startFixtures } = require('./service-fixtures.cjs');
const central = require('../netlify/functions/_shared/lib/central-ai');
const { handler: settings } = require('../netlify/functions/_shared/central-ai-config');
const { handler: garden } = require('../netlify/functions/_shared/tuinassistent');
const { handler: seed } = require('../netlify/functions/_shared/seed-info');
const { handler: gemini } = require('../netlify/functions/_shared/gemini-ai');

test('central Gemini: admin-only encrypted storage and server-enforced user routing', async () => {
    const fixture = await startFixtures();
    const previous = global.fetch;
    Object.assign(process.env, { KWEEK_LOCAL_DEV: 'false', SUPABASE_URL: fixture.base, SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture', SUPABASE_SECRET_KEY: 'sb_secret_fixture', KWEEK_CENTRAL_AI_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64') });
    let role = 'admin', encrypted = null, failGemini = false, limitReached = false, calls = [], reservations = new Map(), settlements = [];
    global.fetch = async (input, options = {}) => {
        const url = String(input), path = new URL(url).pathname;
        if (path === '/auth/v1/user') return Response.json({ id: fixture.ids.a, email: 'fixture@example.test', app_metadata: { kweek_role: role }, user_metadata: { kweek_role: 'admin' } });
        if (path === '/rest/v1/rpc/kweek_ai_budget') {
            const body = JSON.parse(options.body);
            if (body.p_action === 'reserve') {
                if (reservations.has(body.p_request)) return Response.json({ result: 'duplicate' });
                if (limitReached) return Response.json({ result: 'limit' });
                reservations.set(body.p_request, 'reserved'); return Response.json({ result: 'reserved' });
            }
            settlements.push(body);
            reservations.set(body.p_request, body.p_action); return Response.json({ ok: true });
        }
        if (path === '/storage/v1/object/kweekkompas-ai-config/central-gemini.json') {
            if ((options.method || 'GET') === 'GET') return encrypted === null ? Response.json({ statusCode: '404', error: 'not_found', message: 'Not found' }, { status: 404 }) : new Response(encrypted, { headers: { 'content-type': 'application/json' } });
            encrypted = Buffer.from(options.body).toString('utf8'); return Response.json({ Key: path });
        }
        if (url.startsWith('https://generativelanguage.googleapis.com/')) {
            calls.push({ url, key: options.headers['x-goog-api-key'], body: JSON.parse(options.body) });
            if (failGemini) return Response.json({ error: {} }, { status: 403 });
            const system = calls.at(-1).body.systemInstruction.parts[0].text;
            const content = /zaad-invulhulp/.test(system) ? { name: 'Tomaat', type: 'Groente', standplaats: 'Zon', waterbehoefte: 'Gemiddeld', sow_months: ['maart'], plant_months: ['mei'], harvest_months: ['augustus'], notes: 'Advies', tags: ['Beginner'], confidence: 'gemiddeld', needs_review: true } : /tuinassistent/i.test(system) ? { answer: 'Testantwoord', actions: [] } : { ok: true };
            return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(content) }] } }], usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 6, thoughtsTokenCount: 2 } });
        }
        return previous(input, options);
    };
    const event = body => ({ httpMethod: 'POST', headers: { host: 'kweekkompas.test', origin: 'https://kweekkompas.test', cookie: `kk_access=${fixture.tokens.a}` }, body: JSON.stringify({ requestId: require('node:crypto').randomUUID(), ...body }) });
    try {
        let response = await settings(event({ action: 'save-test', apiKey: 'fixture-first-secret' }));
        assert.equal(response.statusCode, 200); assert.doesNotMatch(response.body, /fixture-first-secret/);
        assert.ok(encrypted && !encrypted.includes('fixture-first-secret'));
        const firstCiphertext = encrypted;
        assert.equal(await central.readKey(), 'fixture-first-secret');
        assert.deepEqual(JSON.parse((await settings(event({ action: 'status' }))).body), { configured: true, model: central.MODEL });
        assert.equal((await settings(event({ action: 'test' }))).statusCode, 200);
        failGemini = true;
        assert.equal((await settings(event({ action: 'save-test', apiKey: 'bad-replacement' }))).statusCode, 400);
        assert.equal(encrypted, firstCiphertext);
        failGemini = false;
        assert.equal((await settings(event({ action: 'save-test', apiKey: 'fixture-second-secret' }))).statusCode, 200);
        assert.equal(await central.readKey(), 'fixture-second-secret');
        assert.notEqual(encrypted, firstCiphertext);
        role = 'user';
        assert.equal((await settings(event({ action: 'status' }))).statusCode, 403);
        assert.equal((await settings(event({ action: 'save-test', apiKey: 'attacker' }))).statusCode, 403);
        for (const provider of ['gemini', 'ollama', 'openai', 'chatgpt', 'openai-compatible', 'gemini-free', 'central']) {
            const result = await garden(event({ question: 'Hoe verzorg ik tomaat?', ai: { provider, model: 'attacker-model', legacyKey: 'attacker-key' } }));
            assert.equal(result.statusCode, 200, `${provider}: ${result.body}`);
            assert.match(calls.at(-1).url, /models\/gemini-3\.5-flash-lite:generateContent$/);
            assert.equal(calls.at(-1).key, 'fixture-second-secret');
        }
        assert.equal(settlements.at(-1).p_input, 12); assert.equal(settlements.at(-1).p_output, 8);
        const requestId = require('node:crypto').randomUUID();
        const single = event({ question: 'Test', requestId });
        assert.equal((await garden(single)).statusCode, 200);
        const previousCalls = calls.length;
        assert.equal((await garden(single)).statusCode, 409); assert.equal(calls.length, previousCalls);
        limitReached = true;
        const limited = await garden(event({ question: 'Test' }));
        assert.equal(limited.statusCode, 429); assert.match(limited.body, /maandbudget/); assert.equal(calls.length, previousCalls);
        limitReached = false; failGemini = true;
        assert.equal((await garden(event({ question: 'Test' }))).statusCode, 502);
        assert.equal(settlements.at(-1).p_action, 'reject');
        failGemini = false;
        for (const [handler, body] of [[seed, { name: 'Tomaat', existingFields: {} }], [gemini, { mode: 'garden_assistant', input: 'Testvraag' }], [gemini, { mode: 'fill_seed_info', input: 'Tomaat' }]]) {
            const result = await handler(event({ ...body, ai: { provider: 'gemini', model: 'attacker-model', legacyKey: 'attacker-key' } }));
            assert.equal(result.statusCode, 200, result.body);
            assert.match(calls.at(-1).url, /models\/gemini-3\.5-flash-lite:generateContent$/);
            assert.equal(calls.at(-1).key, 'fixture-second-secret');
        }
        const unauthed = event({ action: 'status' }); unauthed.headers.cookie = '';
        assert.equal((await settings(unauthed)).statusCode, 401);
        const encoded = central.encrypt('fixture-secret', Buffer.alloc(32, 7));
        assert.notEqual(encoded, central.encrypt('fixture-secret', Buffer.alloc(32, 7)));
        assert.equal(central.decrypt(encoded, Buffer.alloc(32, 7)), 'fixture-secret');
        assert.throws(() => central.decrypt(encoded, Buffer.alloc(32, 8)));
    } finally { global.fetch = previous; delete process.env.SUPABASE_SECRET_KEY; delete process.env.KWEEK_CENTRAL_AI_ENCRYPTION_KEY; await fixture.stop(); }
});

test('local personal settings reject an authenticated regular user', async () => {
    const { createServer } = require('../scripts/dev-server.cjs');
    const { configureFixtures } = require('./service-fixtures.cjs');
    const fixture = await startFixtures(); configureFixtures(fixture);
    const app = createServer(); await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${app.address().port}`;
    try {
        for (const route of ['gemini-personal', 'openai-personal', 'local-api', 'chatgpt']) {
            const response = await fetch(`${base}/api/${route}`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json', Cookie: `kk_access=${fixture.tokens.a}` }, body: JSON.stringify({ action: 'get' }) });
            assert.equal(response.status, 403, route);
        }
    } finally { await new Promise(resolve => app.close(resolve)); await fixture.stop(); }
});

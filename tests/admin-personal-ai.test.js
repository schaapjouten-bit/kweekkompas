const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { startFixtures, configureFixtures } = require('./service-fixtures.cjs');
const { handler } = require('../netlify/functions/_shared/admin-personal-ai');
const { handler: centralHandler } = require('../netlify/functions/_shared/central-ai-config');
const { callAI } = require('../netlify/functions/_shared/lib/ai');

test('hosted admin personal AI keys stay separate from central AI and reject regular users', async () => {
    const fixture = await startFixtures({ admins: ['a'] });
    configureFixtures(fixture);
    const oldFetch = global.fetch;
    const objects = new Map();
    const calls = [];
    process.env.KWEEK_LOCAL_DEV = 'false';
    process.env.SUPABASE_SECRET_KEY = 'sb_secret_fixture';
    process.env.KWEEK_CENTRAL_AI_ENCRYPTION_KEY = randomBytes(32).toString('base64');

    global.fetch = async (url, options = {}) => {
        const u = new URL(url);
        const path = u.pathname;
        if (path.startsWith('/storage/v1/object/kweekkompas-ai-config/')) {
            const key = path.split('/').pop();
            if ((options.method || 'GET') === 'POST') {
                objects.set(key, Buffer.from(options.body).toString('utf8'));
                return Response.json({ Key: key });
            }
            if (!objects.has(key)) return Response.json({ error: 'Not found', statusCode: '404' }, { status: 404 });
            return new Response(objects.get(key), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (u.hostname === 'generativelanguage.googleapis.com') {
            calls.push({ provider: 'gemini', key: options.headers['x-goog-api-key'] });
            const body = JSON.parse(options.body);
            const prompt = body.contents?.[0]?.parts?.[0]?.text || '';
            return Response.json({ candidates: [{ content: { parts: [{ text: prompt.includes('{"ok":true}') ? '{"ok":true}' : '{"answer":"Admin Gemini","actions":[]}' }] } }] });
        }
        if (u.hostname === 'api.openai.com') {
            calls.push({ provider: 'openai', key: options.headers.Authorization });
            const body = JSON.parse(options.body);
            return Response.json({ status: 'completed', output: [{ content: [{ type: 'output_text', text: body.input.includes('{"ok":true}') ? '{"ok":true}' : '{"answer":"Admin OpenAI","actions":[]}' }] }] });
        }
        return oldFetch(url, options);
    };

    const event = (body, token = fixture.tokens.a) => ({
        httpMethod: 'POST',
        headers: { host: 'kweekkompas.netlify.app', origin: 'https://kweekkompas.netlify.app', cookie: `kk_access=${token}` },
        body: JSON.stringify(body)
    });

    try {
        // Regular user is denied
        assert.equal((await handler(event({ action: 'get' }, fixture.tokens.b))).statusCode, 403);

        // Save central user Gemini key separately
        assert.equal((await centralHandler(event({ action: 'save-test', apiKey: 'central-user-key' }))).statusCode, 200);

        // Save admin personal Gemini + OpenAI keys
        const saveGem = await handler(event({ action: 'save-test', provider: 'gemini', model: 'gemini-3.8-flash', apiKey: 'admin-gemini-key' }));
        assert.equal(saveGem.statusCode, 200);
        assert.doesNotMatch(saveGem.body, /admin-gemini-key/);

        const saveOAI = await handler(event({ action: 'save-test', provider: 'openai', model: 'gpt-5-mini', apiKey: 'admin-openai-key' }));
        assert.equal(saveOAI.statusCode, 200);
        assert.doesNotMatch(saveOAI.body, /admin-openai-key/);

        const status = JSON.parse((await handler(event({ action: 'get' }))).body);
        assert.deepEqual(status, { geminiConfigured: true, openaiConfigured: true });
        assert.ok(objects.has('admin-personal-ai.json'));
        assert.ok(objects.has('central-gemini.json'));
        assert.doesNotMatch(objects.get('admin-personal-ai.json'), /admin-gemini-key|admin-openai-key/);

        // Admin calls use personal keys, not central-user-key
        const adminSession = { user: { id: fixture.ids.a, app_metadata: { kweek_role: 'admin' } } };
        const gemRes = await callAI({ ai: { provider: 'gemini', model: 'gemini-3.8-flash' } }, 'sys', 'prompt', adminSession);
        assert.equal(gemRes.answer, 'Admin Gemini');
        assert.equal(calls.at(-1).key, 'admin-gemini-key');

        const oaiRes = await callAI({ ai: { provider: 'openai', model: 'gpt-5-mini' } }, 'sys', 'prompt', adminSession);
        assert.equal(oaiRes.answer, 'Admin OpenAI');
        assert.equal(calls.at(-1).key, 'Bearer admin-openai-key');
    } finally {
        global.fetch = oldFetch;
        delete process.env.SUPABASE_SECRET_KEY;
        delete process.env.KWEEK_CENTRAL_AI_ENCRYPTION_KEY;
        await fixture.stop();
    }
});

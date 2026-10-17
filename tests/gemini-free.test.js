const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('Gemini Free tier: lokale sleutel, expliciete test, vaste modelkeuze en beide AI-hulpen', async () => {
    const originalEnv = { ...process.env };
    const originalFetch = global.fetch;
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kweek-gemini-free-'));
    const file = path.join(directory, '.kweek-gemini-free.json');
    const calls = [];
    let app, failure = 0, invalidAnswer = false;
    try {
        const { createServer } = require('../scripts/dev-server.cjs');
        app = createServer({ geminiFreeFile: file, chatGPTFile: path.join(directory, 'chatgpt.json') });
        // Even with cloud configured, this personal connection needs no cloud login.
        process.env.SUPABASE_URL = 'https://unused.example';
        process.env.SUPABASE_PUBLISHABLE_KEY = 'unused';
        process.env.GEMINI_API_KEY = 'existing-backend-secret';
        global.fetch = async (url, options) => {
            if (!String(url).startsWith('https://generativelanguage.googleapis.com/')) return originalFetch(url, options);
            calls.push({ url: String(url), key: options.headers['x-goog-api-key'], body: JSON.parse(options.body) });
            if (failure) return Response.json({ error: { message: 'sensitive-google-error' } }, { status: failure });
            return Response.json({ candidates: [{ content: { parts: [{ thought: true, text: 'Internal thought' }, { text: invalidAnswer ? 'not-json' : JSON.stringify({ ok: true, answer: 'Mockadvies', actions: [], notes: 'Mockinformatie', sow_months: [], harvest_months: [] }) }] } }] });
        };
        await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
        const base = `http://127.0.0.1:${app.address().port}`;
        const post = (route, body, origin = base) => originalFetch(`${base}/api/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body) });
        assert.equal((await post('gemini-free', { action: 'get' }, 'https://foreign.example')).status, 403);
        assert.equal((await post('gemini-free', { action: 'get' }, '')).status, 403);
        assert.equal((await originalFetch(base + '/api/gemini-free', { headers: { Origin: base } })).status, 405);
        assert.deepEqual(await (await post('gemini-free', { action: 'get' })).json(), { model: 'gemini-3.5-flash-lite', keyConfigured: false });
        assert.equal(calls.length, 0, 'Opening settings never probes Google');
        assert.equal((await post('gemini-free', { action: 'save-test', apiKey: '' })).status, 400);
        assert.equal((await post('gemini-free', { action: 'save-test', apiKey: 'bad\nkey' })).status, 400);
        assert.equal((await post('gemini-free', null)).status, 400);
        assert.equal((await post('tuinassistent', { question: 'Mockvraag', ai: { provider: 'gemini-free' } })).status, 400);
        assert.equal(calls.length, 0, 'No fallback to the existing GEMINI_API_KEY');

        failure = 403;
        const rejected = await post('gemini-free', { action: 'save-test', apiKey: 'new-mock-secret' });
        assert.equal(rejected.status, 502);
        assert.doesNotMatch(await rejected.text(), /new-mock-secret|sensitive-google-error/);
        assert.equal(fs.existsSync(file), false);
        failure = 0;
        const saved = await post('gemini-free', { action: 'save-test', apiKey: 'personal-mock-secret' });
        assert.equal(saved.status, 200);
        const safe = await saved.json();
        assert.equal(safe.keyConfigured, true);
        assert.equal(safe.model, 'gemini-3.5-flash-lite');
        assert.doesNotMatch(JSON.stringify(safe), /personal-mock-secret/);
        assert.equal(calls.length, 2, 'Each explicit test sends exactly one request');
        assert.equal(calls.at(-1).body.generationConfig.maxOutputTokens, 1024);
        assert.equal(require('../scripts/gemini-free.cjs').createGeminiFree(file).metadata().keyConfigured, true, 'Key survives a server restart');

        for (const [route, body] of [
            ['tuinassistent', { question: 'Mockvraag', context: {} }],
            ['seed-info', { name: 'Basilicum', existingFields: {} }],
            ['gemini-ai', { mode: 'garden_assistant', input: 'Mockvraag', month: 10 }]
        ]) {
            const result = await post(route, { ...body, ai: { provider: 'gemini-free', model: 'gemini-unwanted-paid-model', apiKey: 'browser-injection' } });
            assert.equal(result.status, 200, await result.text());
            assert.equal(calls.at(-1).url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
            assert.equal(calls.at(-1).key, 'personal-mock-secret');
        }
        const { providerConfig, callAI } = require('../netlify/functions/_shared/lib/ai');
        assert.equal(providerConfig()['gemini-free'].configured, true);
        assert.equal(process.env.GEMINI_API_KEY, 'existing-backend-secret');
        assert.doesNotMatch(JSON.stringify(providerConfig()), /personal-mock-secret|existing-backend-secret/);
        const beforeRead = calls.length;
        await post('gemini-free', { action: 'get' });
        assert.equal(calls.length, beforeRead);
        assert.equal((await originalFetch(base + '/.kweek-gemini-free.json')).status, 404);
        assert.equal((await originalFetch(base + '/scripts/gemini-free.cjs')).status, 404);

        for (const status of [400, 403, 404, 429, 500]) {
            failure = status;
            const result = await post('gemini-free', { action: 'save-test', apiKey: 'rejected-replacement' });
            assert.equal(result.status, status === 429 ? 429 : 502);
            assert.doesNotMatch(await result.text(), /sensitive-google-error|rejected-replacement/);
            assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).apiKey, 'personal-mock-secret', 'Failed replacement preserves the working key');
        }
        failure = 0;
        invalidAnswer = true;
        assert.equal((await post('gemini-free', { action: 'save-test', apiKey: 'rejected-replacement' })).status, 502);
        assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).apiKey, 'personal-mock-secret');
        invalidAnswer = false;
        await post('gemini-free', { action: 'save-test', apiKey: '' });
        assert.equal(calls.at(-1).key, 'personal-mock-secret', 'Empty field reuses the saved key');
        const count = calls.length;
        process.env.KWEEK_LOCAL_DEV = 'false';
        assert.equal(providerConfig()['gemini-free'], undefined);
        await assert.rejects(callAI({ ai: { provider: 'gemini-free' } }, 'test', 'test'), { status: 503 });
        assert.equal(calls.length, count, 'No free-tier connection on production');
        process.env.KWEEK_LOCAL_DEV = 'true';
        assert.equal((await (await post('gemini-free', { action: 'delete-key' })).json()).keyConfigured, false);
        assert.equal(fs.existsSync(file), false);
        assert.equal((await post('seed-info', { name: 'Basilicum', ai: { provider: 'gemini-free' } })).status, 400);
        assert.equal(calls.length, count);
    } finally {
        if (app?.listening) await new Promise(resolve => app.close(resolve));
        global.fetch = originalFetch;
        fs.rmSync(directory, { recursive: true, force: true });
        for (const name of Object.keys(process.env)) if (!(name in originalEnv)) delete process.env[name];
        Object.assign(process.env, originalEnv);
    }
});

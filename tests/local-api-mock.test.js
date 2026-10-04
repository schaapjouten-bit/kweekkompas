const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('lokale Eigen API: veilig opslaan, beide hulpen en één expliciete mocktest', async () => {
    const originalEnv = { ...process.env };
    const originalLocal = globalThis.KweekLocalAPI;
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kweek-api-mock-'));
    const file = path.join(directory, '.kweek-local-api.json');
    let app, mock;
    const calls = [];
    try {
        const { createServer } = require('../scripts/dev-server.cjs');
        // No cloud credentials or real providers are used by this isolated check.
        for (const name of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEY', 'OPENAI_COMPATIBLE_BASE_URL', 'OPENAI_COMPATIBLE_MODEL', 'OPENAI_COMPATIBLE_API_KEY']) delete process.env[name];
        mock = http.createServer(async (req, res) => {
            let raw = ''; for await (const chunk of req) raw += chunk;
            calls.push({ path: req.url, authorization: req.headers.authorization, body: JSON.parse(raw) });
            res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answer: 'Mockadvies', actions: [], notes: 'Mockinformatie', sow_months: [], harvest_months: [] }) } }] }));
        });
        await new Promise(resolve => mock.listen(0, '127.0.0.1', resolve));
        const address = `http://127.0.0.1:${mock.address().port}/v1`;
        app = createServer({ localAPIFile: file });
        await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
        const base = `http://127.0.0.1:${app.address().port}`;
        async function post(route, body, origin = base) {
            return fetch(base + '/api/' + route, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body) });
        }
        assert.equal((await post('local-api', { action: 'get' }, 'https://foreign.example')).status, 403);
        assert.equal((await post('local-api', { action: 'get' }, '')).status, 403);
        assert.equal((await fetch(base + '/api/local-api', { headers: { Origin: base } })).status, 405);
        assert.equal((await post('local-api', { action: 'save', address: 'http://external.example/v1', model: 'mock-model', apiKey: '' })).status, 400);
        const saved = await post('local-api', { action: 'save', address, model: 'mock-model', apiKey: 'neutral-mock-secret' });
        assert.equal(saved.status, 200);
        const safe = await saved.json();
        assert.deepEqual(safe, { address, model: 'mock-model', keyConfigured: true });
        assert.equal(calls.length, 0, 'opslaan verstuurt geen AI-aanvraag');
        const reopened = require('../scripts/local-api.cjs').createLocalAPI(file).get();
        assert.equal(reopened.apiKey, 'neutral-mock-secret');
        const preserved = await post('local-api', { action: 'save', address, model: 'mock-model', apiKey: '' });
        assert.equal((await preserved.json()).keyConfigured, true);
        for (const [route, body] of [['tuinassistent', { question: 'Mockvraag', context: {} }], ['seed-info', { name: 'Mockplant', existingFields: {} }]]) {
            const result = await post(route, { ...body, ai: { provider: 'openai-compatible', model: 'oud-browser-model' } });
            assert.equal(result.status, 200);
            assert.ok(await result.json());
        }
        assert.equal(calls.length, 2);
        for (const call of calls) {
            assert.equal(call.path, '/v1/chat/completions');
            assert.equal(call.authorization, 'Bearer neutral-mock-secret');
            assert.equal(call.body.model, 'mock-model');
        }
        const connection = await post('local-api', { action: 'test' });
        assert.equal(connection.status, 200);
        assert.equal(calls.length, 3);
        assert.equal(calls[2].body.max_tokens, 1);
        assert.equal(calls[2].body.messages.length, 1);
        assert.equal((await post('local-api', { action: 'get' })).status, 200);
        assert.equal(calls.length, 3, 'lezen test niet automatisch');
        assert.equal((await fetch(base + '/.kweek-local-api.json')).status, 404);
        const removed = await post('local-api', { action: 'delete-key' });
        assert.equal((await removed.json()).keyConfigured, false);
        assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).apiKey, '');
        await post('local-api', { action: 'save', address, model: 'mock-model', apiKey: 'neutral-mock-secret' });
        const edited = await post('local-api', { action: 'save', address: address + '/other', model: 'mock-model', apiKey: '' });
        assert.equal((await edited.json()).keyConfigured, false, 'sleutel volgt geen ander adres');
        process.env.KWEEK_LOCAL_DEV = 'false';
        const { providerConfig, callAI } = require('../netlify/functions/_shared/lib/ai');
        assert.equal(providerConfig()['openai-compatible'].localAvailable, false);
        await assert.rejects(callAI({ ai: { provider: 'openai-compatible', model: 'mock-model' } }, 'mock', 'mock'), { status: 503 });
        assert.equal(calls.length, 3);
        assert.equal(fs.existsSync(path.join(__dirname, '../netlify/functions/local-api.mjs')), false);
    } finally {
        if (app?.listening) await new Promise(resolve => app.close(resolve));
        if (mock?.listening) await new Promise(resolve => mock.close(resolve));
        fs.rmSync(directory, { recursive: true, force: true });
        for (const name of Object.keys(process.env)) if (!(name in originalEnv)) delete process.env[name];
        Object.assign(process.env, originalEnv); globalThis.KweekLocalAPI = originalLocal;
    }
});

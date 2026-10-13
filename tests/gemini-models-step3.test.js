// Models-list/probe fixtures only. No .env loading or live API calls.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const modelPath = require.resolve('../netlify/functions/_shared/lib/gemini-models');
const endpointPath = require.resolve('../netlify/functions/_shared/ai-models');
const model = (id, methods = ['generateContent']) => ({ name: 'models/' + id, displayName: id.replace('gemini-', 'Gemini '), supportedGenerationMethods: methods });
async function isolated(fn) {
    const oldFetch = global.fetch;
    const names = ['GEMINI_API_KEY', 'GEMINI_MODEL', 'GEMINI_MODELS', 'OLLAMA_BASE_URL', 'OLLAMA_MODEL', 'OLLAMA_MODELS', 'OPENAI_COMPATIBLE_BASE_URL', 'OPENAI_COMPATIBLE_MODEL', 'OPENAI_COMPATIBLE_MODELS', 'KWEEK_LOCAL_DEV'];
    const oldLocalAPI = globalThis.KweekLocalAPI;
    const before = names.map(name => [name, process.env[name]]);
    process.env.GEMINI_API_KEY = 'dummy-model-list-secret';
    delete require.cache[modelPath]; delete require.cache[endpointPath];
    try { await fn(require(modelPath), require(endpointPath).handler); }
    finally {
        global.fetch = oldFetch;
        globalThis.KweekLocalAPI = oldLocalAPI;
        for (const [name, value] of before) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
    }
}
test('models.list: pagination, stable text filtering, three families and one probe per candidate', () => isolated(async (lib, handler) => {
    const calls = [];
    const probes = [];
    global.fetch = async (url, options) => {
        url = new URL(url);
        assert.equal(url.origin, 'https://generativelanguage.googleapis.com');
        assert.equal(options.headers['x-goog-api-key'], 'dummy-model-list-secret');
        assert.equal(url.searchParams.has('key'), false);
        if (options.method === 'POST') {
            probes.push(url.pathname);
            assert.equal(JSON.parse(options.body).generationConfig.maxOutputTokens, 256);
            return Response.json({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] });
        }
        calls.push(url);
        assert.equal(url.pathname, '/v1beta/models');
        return Response.json(calls.length === 1 ? { models: [model('gemini-3.8-flash'), model('gemini-3.5-flash-lite'), model('gemini-3.8-flash-tts'), model('gemini-3.1-flash-image'), model('gemini-3.5-flash', ['embedContent'])], nextPageToken: 'page2' }
            : { models: [model('gemini-3.5-flash-lite'), model('gemini-3.1-pro-preview'), model('gemini-3.1-flash-lite'), model('gemini-2.5-pro'), model('gemini-3.9-flash-exp'), model('gemini-flash-latest')] });
    };
    const responses = await Promise.all([handler({ httpMethod: 'GET' }), handler({ httpMethod: 'GET' })]);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].searchParams.get('pageToken'), 'page2');
    const data = JSON.parse(responses[0].body);
    assert.equal(data.defaultModel, 'gemini-3.8-flash');
    assert.deepEqual(data.models, [{ id: 'gemini-3.8-flash', label: '3.8 Flash' }, { id: 'gemini-3.5-flash-lite', label: '3.5 Flash-Lite' }, { id: 'gemini-2.5-pro', label: '2.5 Pro' }]);
    assert.deepEqual(data.rejected, []);
    assert.deepEqual(probes, data.models.map(m => `/v1beta/models/${m.id}:generateContent`));
    assert.doesNotMatch(responses[0].body, /dummy-model-list-secret|API_KEY|inputTokenLimit/);
    assert.equal((await handler({ httpMethod: 'GET' })).statusCode, 200);
    assert.equal(calls.length, 2);
    assert.equal(probes.length, 3, 'Concurrent callers and reopening use cached probes');
    assert.equal(lib.chooseDefault([]), '');
}));
test('empty list remains empty; no invented fallback models', () => isolated(async (_, handler) => {
    global.fetch = async () => Response.json({ models: [] });
    assert.deepEqual(JSON.parse((await handler({ httpMethod: 'GET' })).body), { models: [], defaultModel: '', rejected: [] });
}));

test('failed candidates are omitted without retries or replacement probes', () => isolated(async (_, handler) => {
    const probes = [];
    global.fetch = async (url, options) => {
        if (options.method !== 'POST') return Response.json({ models: [model('gemini-3.8-flash'), model('gemini-3.7-flash'), model('gemini-3.5-flash-lite'), model('gemini-2.5-pro')] });
        probes.push(String(url));
        if (String(url).includes('flash-lite')) return Response.json({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] });
        return Response.json({ error: { message: 'dummy-model-list-secret' } }, { status: 404 });
    };
    const reply = await handler({ httpMethod: 'GET' });
    const data = JSON.parse(reply.body);
    assert.deepEqual(data.models, [{ id: 'gemini-3.5-flash-lite', label: '3.5 Flash-Lite' }]);
    assert.equal(data.defaultModel, 'gemini-3.5-flash-lite');
    assert.deepEqual(data.rejected, [{ id: 'gemini-3.8-flash', status: 404 }, { id: 'gemini-2.5-pro', status: 404 }]);
    await handler({ httpMethod: 'GET' });
    assert.equal(probes.length, 3);
    assert.doesNotMatch(reply.body, /dummy-model-list-secret/);
}));

test('empty, malformed or thought-only success responses are not working text models', () => isolated(async (_, handler) => {
    let probes = 0;
    global.fetch = async (_, options) => {
        if (options.method !== 'POST') return Response.json({ models: [model('gemini-3.8-flash'), model('gemini-3.5-flash-lite'), model('gemini-2.5-pro')] });
        probes++;
        return Response.json({ candidates: [{ content: { parts: [{ thought: true, text: '{"ok":true}' }] } }] });
    };
    const data = JSON.parse((await handler({ httpMethod: 'GET' })).body);
    assert.deepEqual(data.models, []);
    assert.equal(data.defaultModel, '');
    assert.equal(data.rejected.length, 3);
    assert.equal(probes, 3);
}));
test('invalid credential: one attempt, safe error, no retry after five minutes', () => isolated(async (_, handler) => {
    let attempts = 0;
    const oldNow = Date.now;
    global.fetch = async () => { attempts++; return Response.json({ error: { message: 'dummy-model-list-secret', details: [{ reason: 'API_KEY_INVALID' }] } }, { status: 400 }); };
    try {
        const result = await handler({ httpMethod: 'GET' });
        assert.equal(result.statusCode, 502);
        assert.match(JSON.parse(result.body).error, /bestaande keuze blijft behouden/);
        assert.doesNotMatch(result.body, /dummy-model-list-secret|API_KEY_INVALID/);
        Date.now = () => oldNow() + 3600_000;
        await handler({ httpMethod: 'GET' }); await handler({ httpMethod: 'GET' });
        assert.equal(attempts, 1);
    } finally { Date.now = oldNow; }
}));
test('network and malformed replies give one cached, clear error; missing key makes no request', () => isolated(async (_, handler) => {
    let attempts = 0;
    global.fetch = async () => { attempts++; throw new Error('private external detail'); };
    const result = await handler({ httpMethod: 'GET' });
    assert.equal(result.statusCode, 502); assert.doesNotMatch(result.body, /private external detail/);
    await handler({ httpMethod: 'GET' }); assert.equal(attempts, 1);
    delete process.env.GEMINI_API_KEY;
    assert.equal((await handler({ httpMethod: 'GET' })).statusCode, 503);
    assert.equal(attempts, 1);
    process.env.GEMINI_API_KEY = 'different-dummy-secret';
    global.fetch = async () => Response.json({ models: {} });
    assert.equal((await handler({ httpMethod: 'GET' })).statusCode, 502);
    assert.equal((await handler({ httpMethod: 'POST', headers: { host: 'localhost', origin: 'https://localhost' } })).statusCode, 405);
}));
test('provider configuration retains Ollama and custom API; no implicit Gemini 2.5 Flash default', () => isolated(async () => {
    const { providerConfig } = require('../netlify/functions/_shared/lib/ai');
    delete process.env.GEMINI_MODEL;
    process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:11434'; process.env.OLLAMA_MODEL = 'llama3:latest'; process.env.OLLAMA_MODELS = 'llama3:latest,qwen3:8b';
    process.env.OPENAI_COMPATIBLE_BASE_URL = 'https://api.example.test/v1'; process.env.OPENAI_COMPATIBLE_MODEL = 'my-model';
    process.env.KWEEK_LOCAL_DEV = 'true';
    globalThis.KweekLocalAPI = { get: () => ({ address: process.env.OPENAI_COMPATIBLE_BASE_URL, model: process.env.OPENAI_COMPATIBLE_MODEL }) };
    const config = providerConfig();
    assert.equal(config.gemini.model, '');
    assert.equal(config.ollama.model, 'llama3:latest'); assert.deepEqual(config.ollama.models, ['llama3:latest', 'qwen3:8b']);
    assert.equal(config['openai-compatible'].model, 'my-model');
    // Both helpers still delegate through the shared, freshly read preference.
    // Actual preference routing is exercised by the isolated browser checks.
    const app = fs.readFileSync('app-v132.js', 'utf8');
    assert.match(app, /KweekServices\.requestAI\('seed-info'/);
    assert.match(app, /KweekServices\.requestAI\('gemini-ai'/);
    assert.match(app, /KweekServices\.requestAI\('tuinassistent'/);
}));

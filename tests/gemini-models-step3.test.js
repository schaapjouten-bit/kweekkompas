// Models-list tests only. No .env loading and no generation or live API calls.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const modelPath = require.resolve('../netlify/functions/_shared/lib/gemini-models');
const endpointPath = require.resolve('../netlify/functions/_shared/ai-models');
const model = (id, methods = ['generateContent']) => ({ name: 'models/' + id, displayName: id.replace('gemini-', 'Gemini '), supportedGenerationMethods: methods });
async function isolated(fn) {
    const oldFetch = global.fetch;
    const names = ['GEMINI_API_KEY', 'GEMINI_MODEL', 'GEMINI_MODELS', 'OLLAMA_BASE_URL', 'OLLAMA_MODEL', 'OLLAMA_MODELS', 'OPENAI_COMPATIBLE_BASE_URL', 'OPENAI_COMPATIBLE_MODEL', 'OPENAI_COMPATIBLE_MODELS'];
    const before = names.map(name => [name, process.env[name]]);
    process.env.GEMINI_API_KEY = 'dummy-model-list-secret';
    delete require.cache[modelPath]; delete require.cache[endpointPath];
    try { await fn(require(modelPath), require(endpointPath).handler); }
    finally {
        global.fetch = oldFetch;
        for (const [name, value] of before) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
    }
}
test('models.list: pagination, generateContent + text filtering, deduplication and economical default', () => isolated(async (lib, handler) => {
    const calls = [];
    global.fetch = async (url, options) => {
        url = new URL(url); calls.push(url);
        assert.equal(url.origin, 'https://generativelanguage.googleapis.com');
        assert.equal(url.pathname, '/v1beta/models');
        assert.equal(options.method || 'GET', 'GET');
        assert.equal(options.headers['x-goog-api-key'], 'dummy-model-list-secret');
        assert.equal(url.searchParams.has('key'), false);
        return Response.json(calls.length === 1 ? { models: [model('gemini-3.8-flash'), model('gemini-3.5-flash-lite'), model('gemini-3.8-flash-tts'), model('gemini-3.1-flash-image'), model('gemini-3.5-flash', ['embedContent'])], nextPageToken: 'page2' }
            : { models: [model('gemini-3.5-flash-lite'), model('gemini-3.1-pro-preview'), model('gemini-3.1-flash-lite')] });
    };
    const responses = await Promise.all([handler({ httpMethod: 'GET' }), handler({ httpMethod: 'GET' })]);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].searchParams.get('pageToken'), 'page2');
    const data = JSON.parse(responses[0].body);
    assert.equal(data.defaultModel, 'gemini-3.5-flash-lite');
    assert.equal(data.models.length, 4);
    assert.equal(data.models.find(item => item.id === data.defaultModel).hint, 'snel en zuinig');
    assert.doesNotMatch(responses[0].body, /dummy-model-list-secret|API_KEY|inputTokenLimit/);
    assert.equal((await handler({ httpMethod: 'GET' })).statusCode, 200);
    assert.equal(calls.length, 2);
    assert.equal(lib.chooseDefault([model('gemini-2.5-flash')].map(item => ({ id: item.name.slice(7) }))), '');
}));
test('empty list remains empty; no invented fallback models', () => isolated(async (_, handler) => {
    global.fetch = async () => Response.json({ models: [] });
    assert.deepEqual(JSON.parse((await handler({ httpMethod: 'GET' })).body), { models: [], defaultModel: '' });
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
    const config = providerConfig();
    assert.equal(config.gemini.model, '');
    assert.equal(config.ollama.model, 'llama3:latest'); assert.deepEqual(config.ollama.models, ['llama3:latest', 'qwen3:8b']);
    assert.equal(config['openai-compatible'].model, 'my-model');
    // Both helpers still delegate through the shared, freshly read preference.
    const services = fs.readFileSync('services.js', 'utf8');
    assert.match(services, /requestAI: \(route, body\) => request\(route, \{ \.\.\.body, ai: readPreferences\(\) \}\)/);
    const app = fs.readFileSync('app-v132.js', 'utf8');
    assert.match(app, /KweekServices\.requestAI\('seed-info'/);
    assert.match(app, /KweekServices\.requestAI\('gemini-ai'/);
    assert.match(app, /KweekServices\.requestAI\('tuinassistent'/);
}));

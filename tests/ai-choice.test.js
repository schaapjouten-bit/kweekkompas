const test = require('node:test');
const assert = require('node:assert/strict');
const { callAI } = require('../netlify/functions/_shared/lib/ai');

test('no saved choice uses Ollama; explicit Gemini model skips models.list', async () => {
    const names = ['AI_PROVIDER', 'KWEEK_LOCAL_DEV', 'OLLAMA_BASE_URL', 'GEMINI_API_KEY'];
    const before = names.map(name => [name, process.env[name]]);
    const original = global.fetch;
    const calls = [];
    Object.assign(process.env, { AI_PROVIDER: 'gemini', KWEEK_LOCAL_DEV: 'true', OLLAMA_BASE_URL: 'http://127.0.0.1:11434', GEMINI_API_KEY: 'test-secret' });
    global.fetch = async (url, options) => {
        const body = JSON.parse(options.body);
        calls.push({ url: String(url), body });
        return Response.json(String(url).includes('googleapis')
            ? { candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] }
            : { response: '{"ok":true}' });
    };
    try {
        await callAI({}, 'test', 'test');
        assert.equal(calls[0].url, 'http://127.0.0.1:11434/api/generate');
        assert.equal(calls[0].body.model, 'llama3:latest');
        for (const model of ['gemini-3-flash', 'gemini-3.8-flash', 'gemini-retained-choice']) {
            await callAI({ ai: { provider: 'gemini', model } }, 'test', 'test');
            assert.equal(calls.at(-1).url, `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`);
        }
        assert.equal(calls.length, 4, 'No models.list request can block generation');
    } finally {
        global.fetch = original;
        for (const [name, value] of before) {
            if (value === undefined) delete process.env[name]; else process.env[name] = value;
        }
    }
});

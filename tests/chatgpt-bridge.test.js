const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('../scripts/dev-server.cjs');
const { fixture, signIn } = require('./chatgpt-fixture.cjs');

test('production bridge allows only the exact site and ChatGPT requests without exposing credentials', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kweek-bridge-'));
    const mock = fixture();
    const server = createServer({ localAPIFile: path.join(dir, 'custom.json'), chatGPTFile: path.join(dir, 'chatgpt.json'), chatGPTOptions: { fetch: mock.fetch } });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.address().port}/api/chatgpt-bridge`;
    const origin = 'https://kweekkompas.netlify.app';
    const send = (body, from = origin) => fetch(url, { method: 'POST', headers: { Origin: from, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    try {
        await signIn(globalThis.KweekChatGPT, mock);
        const preflight = await fetch(url, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type', 'Access-Control-Request-Private-Network': 'true' } });
        assert.equal(preflight.status, 204);
        assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
        assert.equal(preflight.headers.get('access-control-allow-private-network'), 'true');
        for (const from of ['https://evil.test', 'https://kweekkompas.netlify.app.evil.test', 'null']) {
            const denied = await send({ route: 'chatgpt', body: { action: 'status' } }, from);
            assert.equal(denied.status, 403);
            assert.equal(denied.headers.get('access-control-allow-origin'), null);
        }
        const catalog = await (await send({ route: 'chatgpt', body: { action: 'models' } })).json();
        assert.equal(catalog.connected, true);
        assert.deepEqual(catalog.models, [{ id: 'gpt-fixture', label: 'GPT Test' }]);
        assert.doesNotMatch(JSON.stringify(catalog), /test-access|test-refresh|id_token/);
        for (const route of ['local-api', 'auth', 'cloud-sync', '../.env']) assert.equal((await send({ route, body: {} })).status, 403);
        assert.equal((await send({ route: 'tuinassistent', body: { ai: { provider: 'gemini' } } })).status, 403);
        for (const [route, body] of [['tuinassistent', { question: 'Wat doe ik vandaag?' }], ['seed-info', { name: 'Tomaat', existingFields: {} }]]) {
            const response = await send({ route, body: { ...body, ai: { provider: 'chatgpt', model: 'gpt-fixture' } } });
            assert.equal(response.status, 200);
            const result = await response.json();
            assert.equal(route === 'seed-info' ? result.name : result.answer, route === 'seed-info' ? 'Tomaat' : 'Geef water.');
        }
    } finally { await new Promise(resolve => server.close(resolve)); fs.rmSync(dir, { recursive: true, force: true }); }
});

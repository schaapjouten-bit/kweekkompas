const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createChatGPT } = require('../scripts/chatgpt.cjs');
const { fixture, signIn, request } = require('./chatgpt-fixture.cjs');
function setup(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kweek-chatgpt-test-'));
    const file = path.join(dir, 'credentials.json');
    const mock = fixture(), runtime = createChatGPT(file, { fetch: mock.fetch });
    t.after(() => { runtime.close(); fs.rmSync(dir, { recursive: true, force: true }); });
    return { mock, runtime, file };
}
test('ChatGPT registers with PKCE, validates identity, persists and returns no tokens', async t => {
    const { mock, runtime, file } = setup(t);
    assert.equal((await signIn(runtime, mock)).status, 200);
    assert.equal(mock.state.auth.searchParams.get('client_id'), 'dynamic_agent_client');
    assert.equal(mock.state.auth.searchParams.get('agent_name_hint'), 'KweekKompas');
    assert.equal(runtime.status().connected, true);
    const value = await runtime.handle(request, JSON.stringify({ action: 'models' }));
    assert.deepEqual(value.models, [{ id: 'gpt-fixture', label: 'GPT Test' }]);
    assert.doesNotMatch(JSON.stringify(value), /test-access|test-refresh|id_token/);
    const saved = JSON.parse(fs.readFileSync(file));
    assert.equal(saved.selected, 'oaiapp_fixture');
    assert.equal(saved.accounts.oaiapp_fixture.subject, 'test-person');
    const restart = createChatGPT(file, { fetch: mock.fetch }); t.after(() => restart.close());
    assert.equal(restart.status().connected, true);
    const reconnect = await restart.handle(request, JSON.stringify({ action: 'login' }));
    const auth = new URL(reconnect.authorizationURL);
    assert.equal(auth.searchParams.get('client_id'), 'oaiapp_fixture');
    assert.equal(auth.searchParams.has('agent_name_hint'), false);
    assert.equal(auth.searchParams.has('id_token_hint'), false);
    assert.equal(auth.searchParams.get('ext_agent_host_id'), saved.host);
});
test('Wrong state, nonce and missing permission never authorize inference', async t => {
    const { mock, runtime } = setup(t);
    const start = await runtime.handle(request, JSON.stringify({ action: 'login' }));
    const auth = new URL(start.authorizationURL), callback = new URL(auth.searchParams.get('redirect_uri'));
    callback.search = '?code=fixture&state=wrong&client_id=oaiapp_fixture';
    assert.equal((await fetch(callback)).status, 400);
    assert.equal(mock.state.calls.length, 0);
    assert.equal(runtime.status().pending, true);
    mock.state.badNonce = true;
    assert.equal((await signIn(runtime, mock)).status, 400);
    assert.equal(runtime.status().connected, false);
    await assert.rejects(runtime.generate('gpt-fixture', 'JSON', 'Vraag'), /Log eerst in/);
});
test('SSE requires completion, handles limit failures and rejects unavailable models', async t => {
    const { mock, runtime } = setup(t); await signIn(runtime, mock);
    assert.equal(JSON.parse(await runtime.generate('gpt-fixture', 'JSON', 'Vraag')).name, 'Tomaat');
    mock.state.omitContentType = true;
    assert.equal(JSON.parse(await runtime.generate('gpt-fixture', 'JSON', 'Vraag')).name, 'Tomaat', 'valid SSE also works without a Content-Type header');
    const payload = JSON.parse(mock.state.calls.find(call => call.url.endsWith('/responses')).options.body);
    assert.equal(payload.store, false); assert.equal(payload.stream, true);
    assert.equal(payload.input[0].role, 'user'); assert.equal(payload.model, 'gpt-fixture');
    await assert.rejects(runtime.generate('hidden-model', 'JSON', 'Vraag'), /beschikbaar ChatGPT-model/);
    mock.state.stream = 'truncated'; await assert.rejects(runtime.generate('gpt-fixture', 'JSON', 'Vraag'), /afronden/);
    mock.state.stream = 'failed'; await assert.rejects(runtime.generate('gpt-fixture', 'JSON', 'Vraag'), error => error.status === 429);
});
test('Concurrent refresh rotates once; logout revokes and clears local credentials', async t => {
    const { mock, runtime, file } = setup(t); mock.state.ttl = 1; await signIn(runtime, mock);
    mock.state.ttl = 3600;
    await Promise.all([runtime.handle(request, '{"action":"models"}'), runtime.handle(request, '{"action":"models"}')]);
    assert.equal(mock.state.tokenNumber, 2);
    assert.equal(JSON.parse(fs.readFileSync(file)).accounts.oaiapp_fixture.refresh_token, 'test-refresh-2');
    assert.equal((await runtime.handle(request, '{"action":"logout"}')).connected, false);
    const revoked = mock.state.calls.find(call => call.url.endsWith('/revoke'));
    assert.equal(new URLSearchParams(revoked.options.body).get('token'), 'test-refresh-2');
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /test-access|test-refresh|id_token/);
    await assert.rejects(runtime.generate('gpt-fixture', 'JSON', 'Vraag'), /Log eerst in/);
});
test('Cross-origin and non-loopback clients cannot start or inspect ChatGPT sessions', async t => {
    const { runtime } = setup(t);
    await assert.rejects(runtime.handle({ ...request, headers: { ...request.headers, origin: 'https://example.test' } }, '{"action":"login"}'), error => error.status === 403);
    await assert.rejects(runtime.handle({ ...request, socket: { ...request.socket, remoteAddress: '192.168.1.1' } }, '{"action":"status"}'), error => error.status === 403);
});

const crypto = require('node:crypto');
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const scope = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
const json = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
function fixture() {
    const state = { calls: [], auth: null, badNonce: false, subject: 'test-person', ttl: 3600, stream: 'success', tokenNumber: 0 };
    function jwt(client) {
        const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'fixture' })).toString('base64url');
        const payload = Buffer.from(JSON.stringify({ iss: 'https://auth.openai.com', aud: client, exp: Math.floor(Date.now() / 1000) + 3600, sub: state.subject, email: 'tuin@example.test', nonce: state.badNonce ? 'wrong' : state.auth.searchParams.get('nonce') })).toString('base64url');
        return header + '.' + payload + '.' + crypto.sign('RSA-SHA256', Buffer.from(header + '.' + payload), privateKey).toString('base64url');
    }
    const fetch = async (url, options = {}) => {
        state.calls.push({ url, options });
        if (url.endsWith('/.well-known/openid-configuration')) return json({ issuer: 'https://auth.openai.com', jwks_uri: 'https://auth.openai.com/jwks', revocation_endpoint: 'https://auth.openai.com/revoke' });
        if (url.endsWith('/jwks')) return json({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'fixture', use: 'sig', alg: 'RS256' }] });
        if (url.endsWith('/oauth/token')) {
            const form = new URLSearchParams(options.body);
            if (form.get('resource') !== 'https://api.openai.com/v1') throw Error('Wrong resource');
            if (form.get('grant_type') === 'authorization_code') {
                if (form.get('redirect_uri') !== state.auth.searchParams.get('redirect_uri')) throw Error('Wrong redirect');
                if (crypto.createHash('sha256').update(form.get('code_verifier')).digest('base64url') !== state.auth.searchParams.get('code_challenge')) throw Error('Wrong PKCE');
            }
            ++state.tokenNumber;
            return json({ token_type: 'Bearer', expires_in: state.ttl, access_token: 'test-access-' + state.tokenNumber, refresh_token: 'test-refresh-' + state.tokenNumber, id_token: jwt(form.get('client_id')), scope });
        }
        if (url.endsWith('/revoke')) return new Response(null, { status: 200 });
        if (url.endsWith('/models')) return json({ models: [{ slug: 'gpt-fixture', display_name: 'GPT Test', visibility: 'list' }, { slug: 'hidden-model', display_name: 'Hidden', visibility: 'hide' }] });
        if (url.endsWith('/responses')) {
            const payload = JSON.parse(options.body);
            const text = JSON.stringify(payload.instructions.includes('plantName') ? { answer: 'Geef water.', actions: [] } : { name: 'Tomaat', type: 'Groente', standplaats: 'Zon', waterbehoefte: 'Gemiddeld', sow_months: ['maart'], plant_months: ['mei'], harvest_months: ['augustus'], notes: 'Voorzaaien in maart.', tags: ['Beginner'], confidence: 'gemiddeld', needs_review: true });
            const events = [{ type: 'response.output_text.delta', delta: text }];
            if (state.stream === 'success') events.push({ type: 'response.completed', response: { status: 'completed' } });
            if (state.stream === 'failed') events.push({ type: 'response.failed', response: { error: { code: 'subscription_sharing_usage_limit_exceeded' } } });
            const raw = events.map(value => 'data: ' + JSON.stringify(value) + '\r\n\r\n').join('');
            // Exercise UTF-8 and SSE boundaries across arbitrary network chunks.
            const bytes = new TextEncoder().encode(raw);
            return new Response(new ReadableStream({ start(controller) { for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7)); controller.close(); } }), { headers: state.omitContentType ? {} : { 'Content-Type': 'text/event-stream' } });
        }
        throw Error('Unexpected fixture endpoint: ' + url);
    };
    return { state, fetch };
}
const request = { method: 'POST', socket: { remoteAddress: '127.0.0.1', localPort: 4173 }, headers: { host: '127.0.0.1:4173', origin: 'http://127.0.0.1:4173', 'content-type': 'application/json' } };
async function signIn(runtime, mock, newAccount = false) {
    const start = await runtime.handle(request, JSON.stringify({ action: 'login', newAccount }));
    mock.state.auth = new URL(start.authorizationURL);
    const callback = new URL(mock.state.auth.searchParams.get('redirect_uri'));
    callback.search = new URLSearchParams({ state: mock.state.auth.searchParams.get('state'), client_id: newAccount ? 'oaiapp_second' : 'oaiapp_fixture', code: 'fixture-code' }).toString();
    return fetch(callback);
}
module.exports = { fixture, signIn, request };

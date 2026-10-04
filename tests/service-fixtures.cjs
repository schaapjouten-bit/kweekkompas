const http = require('node:http');
const ids = { a: '11111111-1111-4111-8111-111111111111', b: '22222222-2222-4222-8222-222222222222' };
const jwt = name => [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify({ sub: ids[name], exp: Math.floor(Date.now() / 1000) + 3600, aud: 'authenticated', role: 'authenticated' })).toString('base64url'), 'test-signature'].join('.');
const tokens = { a: jwt('a'), b: jwt('b') };
async function startFixtures() {
    const snapshots = new Map();
    const objects = new Map(), capabilities = new Map();
    const storage = { uploads: 0, failUpload: false, expireDownloadOnce: false };
    const calls = [];
    const seed = { name: 'Tomaat', type: 'Groente', standplaats: 'Zon', waterbehoefte: 'Gemiddeld', sow_months: ['maart'], plant_months: ['mei'], harvest_months: ['augustus'], notes: 'Eigen teeltadvies\nVoorzaaien in maart.', tags: ['Beginner'], confidence: 'gemiddeld', needs_review: true };
    const garden = { answer: 'Controleer vandaag de bodemvochtigheid.', actions: [{ label: 'Tomaat verzorgen', type: 'care', plantName: 'Tomaat' }] };
    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://fixture');
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        const raw = Buffer.concat(chunks);
        const body = raw.length && req.method !== 'PUT' ? JSON.parse(raw.toString()) : {};
        const bearer = req.headers.authorization?.replace('Bearer ', '');
        const name = Object.keys(tokens).find(key => tokens[key] === bearer);
        const send = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
        if (url.pathname.startsWith('/storage/v1/')) {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'content-type');
            if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
            const match = /^\/storage\/v1\/object\/(info|upload\/sign|sign)\/kweekkompas-photos\/(.+)$/.exec(url.pathname);
            if (!match) return send(404, { message: 'Not found' });
            const [, action, path] = match;
            if (req.method === 'POST' || action === 'info') {
                if (!name || !path.startsWith(ids[name] + '/')) return send(403, { message: 'Unauthorized', statusCode: '403' });
                if (action === 'info') return objects.has(path) ? send(200, { size: objects.get(path).bytes.length, content_type: objects.get(path).mime }) : send(404, { message: 'Object not found', statusCode: '404' });
                if (action === 'sign' && !objects.has(path)) return send(404, { message: 'Object not found', statusCode: '404' });
                const token = 'cap-' + capabilities.size;
                capabilities.set(token, { path, action });
                const signed = `/object/${action}/kweekkompas-photos/${path}?token=${token}`;
                return send(200, action === 'sign' ? { signedURL: signed } : { url: signed });
            }
            const cap = capabilities.get(url.searchParams.get('token'));
            if (!cap || cap.path !== path || cap.action !== action) return send(403, { message: 'Invalid capability' });
            if (action === 'upload/sign' && req.method === 'PUT') {
                if (storage.failUpload) return send(503, { message: 'Storage unavailable' });
                if (objects.has(path)) return send(409, { message: 'Already exists' });
                objects.set(path, { bytes: raw, mime: req.headers['content-type'] }); storage.uploads++;
                return send(200, { Key: path });
            }
            if (action === 'sign' && req.method === 'GET') {
                if (storage.expireDownloadOnce) { storage.expireDownloadOnce = false; return send(403, { message: 'Expired' }); }
                const obj = objects.get(path); if (!obj) return send(404, { message: 'Missing' });
                res.writeHead(200, { 'Content-Type': obj.mime }); return res.end(obj.bytes);
            }
            return send(405, { message: 'Method not allowed' });
        }
        if (url.pathname === '/auth/v1/token') {
            const who = url.searchParams.get('grant_type') === 'refresh_token' ? body.refresh_token?.replace('refresh-', '') : body.email?.split('@')[0];
            if (!ids[who] || (body.password !== 'test-password' && body.refresh_token !== `refresh-${who}`)) return send(400, { msg: 'Invalid login credentials', error_code: 'invalid_credentials' });
            return send(200, { access_token: tokens[who], refresh_token: `refresh-${who}`, expires_in: 3600, token_type: 'bearer', user: { id: ids[who], email: `${who}@example.test`, is_anonymous: false } });
        }
        if (url.pathname === '/auth/v1/user') return name ? send(200, { id: ids[name], email: `${name}@example.test`, is_anonymous: false }) : send(401, { msg: 'Invalid token' });
        if (url.pathname === '/auth/v1/logout') return send(204, null);
        if (url.pathname === '/rest/v1/kweekkompas_snapshots') {
            if (!name) return send(401, { message: 'Unauthorized' });
            const id = ids[name];
            if (req.method === 'GET') return send(200, snapshots.has(id) ? [snapshots.get(id)] : []);
            if (body.user_id !== id) return send(403, { code: '42501' });
            if (req.method === 'POST' && snapshots.has(id)) return send(409, { code: '23505' });
            if (req.method === 'PATCH' && (!snapshots.has(id) || `eq.${snapshots.get(id).revision}` !== url.searchParams.get('revision'))) return send(200, []);
            snapshots.set(id, body); return send(200, [body]);
        }
        if (url.pathname === '/api/generate' || url.pathname === '/v1/chat/completions' || url.pathname === '/gemini') {
            calls.push({ path: url.pathname, body, authorization: req.headers.authorization });
            if (body.model === 'fail') return send(500, { error: 'secret-provider-value must never be echoed' });
            const prompt = body.system || body.messages?.[0]?.content || body.systemInstruction?.parts?.[0]?.text || '';
            const result = /zaad-invulhulp/.test(prompt) ? seed : garden;
            if (body.model === 'invalid-json') return send(200, { response: 'no JSON' });
            return send(200, url.pathname === '/gemini' ? { candidates: [{ content: { parts: [{ text: JSON.stringify(result) }] } }] } : url.pathname === '/api/generate' ? { response: JSON.stringify(result) } : { choices: [{ message: { content: '```json\n' + JSON.stringify(result) + '\n```' } }] });
        }
        send(404, { error: 'Not found' });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    return { base, calls, snapshots, ids, tokens, objects, storage, stop: () => new Promise(resolve => server.close(resolve)) };
}
function configureFixtures(fixture) {
    Object.assign(process.env, { SUPABASE_URL: fixture.base, SUPABASE_PUBLISHABLE_KEY: 'test-publishable', OLLAMA_BASE_URL: fixture.base, OPENAI_COMPATIBLE_BASE_URL: fixture.base + '/v1', OPENAI_COMPATIBLE_API_KEY: 'test-backend-secret', OPENAI_COMPATIBLE_MODEL: 'test-custom', KWEEK_LOCAL_DEV: 'true' });
}
module.exports = { startFixtures, configureFixtures };

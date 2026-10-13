// Personal ChatGPT plan connection, loaded exclusively by the local server.
const fs = require('node:fs');
const http = require('node:http');
const crypto = require('node:crypto');
const ISSUER = 'https://auth.openai.com';
const RESOURCE = 'https://api.openai.com/v1';
const SCOPE = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
function createChatGPT(file, { fetch: fetcher = fetch } = {}) {
    let data = { accounts: {} }, pending, refresh, discovery, message = '', epoch = 0;
    if (fs.existsSync(file)) {
        if (fs.lstatSync(file).isSymbolicLink()) fail(503, 'ChatGPT-instellingen zijn niet beschikbaar.');
        try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { fail(503, 'ChatGPT-instellingen kunnen niet worden gelezen.'); }
    }
    function save() {
        if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) fail(503, 'ChatGPT-instellingen zijn niet beschikbaar.');
        const temp = file + '.' + crypto.randomUUID() + '.tmp';
        try { fs.writeFileSync(temp, JSON.stringify(data), { flag: 'wx', mode: 0o600 }); fs.renameSync(temp, file); }
        finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
    }
    const active = () => data.accounts?.[data.selected];
    const connected = () => Boolean(active()?.access_token && active()?.scopes?.includes('chatgpt.tokens.use.direct'));
    const status = () => ({ connected: connected(), email: active()?.email || '', selected: data.selected || '', accounts: Object.values(data.accounts || {}).map((account, index) => ({ id: account.client_id, label: `${account.email || 'ChatGPT'} · ${index + 1}` })), pending: Boolean(pending), welcome: Boolean(connected() && active()?.welcome), message });
    async function call(url, options = {}) {
        try { return await fetcher(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(90_000) }); }
        catch { fail(502, 'ChatGPT is niet bereikbaar of reageert te langzaam.'); }
    }
    async function oidc() {
        if (!discovery) {
            const response = await call(ISSUER + '/.well-known/openid-configuration');
            if (!response.ok) fail(502, 'ChatGPT-login is niet bereikbaar.');
            const value = await response.json();
            if (value.issuer !== ISSUER) fail(502, 'ChatGPT-login kon niet worden gecontroleerd.');
            for (const key of ['jwks_uri', 'revocation_endpoint']) {
                if (new URL(value[key]).origin !== ISSUER) fail(502, 'ChatGPT-login kon niet worden gecontroleerd.');
            }
            discovery = value;
        }
        return discovery;
    }
    async function identity(token, client, nonce) {
        try {
            const parts = token.split('.');
            if (parts.length !== 3) throw new Error();
            const header = JSON.parse(Buffer.from(parts[0], 'base64url'));
            const claims = JSON.parse(Buffer.from(parts[1], 'base64url'));
            if (header.alg !== 'RS256' || !header.kid) throw new Error();
            const metadata = await oidc();
            const response = await call(metadata.jwks_uri);
            if (!response.ok) throw new Error();
            const keys = await response.json();
            const jwk = keys.keys.find(key => key.kid === header.kid && key.kty === 'RSA' && (!key.use || key.use === 'sig') && (!key.alg || key.alg === 'RS256'));
            if (!jwk || !crypto.verify('RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1]), crypto.createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(parts[2], 'base64url'))) throw new Error();
            const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
            if (claims.iss !== ISSUER || !audiences.includes(client) || (audiences.length > 1 && claims.azp !== client) || typeof claims.exp !== 'number' || claims.exp <= Date.now() / 1000 || (claims.nbf && claims.nbf > Date.now() / 1000 + 30) || claims.nonce !== nonce || typeof claims.sub !== 'string' || !claims.sub) throw new Error();
            return claims;
        } catch { fail(502, 'ChatGPT-login kon niet worden gecontroleerd. Probeer opnieuw.'); }
    }
    async function tokens(values) {
        const response = await call(ISSUER + '/api/accounts/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...values, resource: RESOURCE }).toString() });
        if (!response.ok) fail(response.status === 400 || response.status === 401 ? 401 : 502, 'Log opnieuw in met ChatGPT.');
        const result = await response.json();
        if (typeof result.access_token !== 'string' || !result.access_token || result.token_type?.toLowerCase() !== 'bearer' || !Number.isFinite(result.expires_in) || result.expires_in <= 0) fail(502, 'ChatGPT-login is niet voltooid.');
        return { ...result, expires_at: Date.now() + result.expires_in * 1000, scopes: typeof result.scope === 'string' ? result.scope.split(/\s+/) : [] };
    }
    function cancel() {
        if (pending) { clearTimeout(pending.timer); pending.server.close(); pending = undefined; }
    }
    async function login(fresh = false, accountId) {
        cancel(); message = '';
        if (!data.host) { data.host = 'urn:uuid:' + crypto.randomUUID(); save(); }
        const prior = fresh ? undefined : accountId ? data.accounts?.[accountId] : active();
        if (accountId && !fresh && !prior) fail(400, 'Kies een opgeslagen ChatGPT-account.');
        const attempt = { state: crypto.randomBytes(32).toString('base64url'), nonce: crypto.randomBytes(32).toString('base64url'), verifier: crypto.randomBytes(48).toString('base64url'), prior, epoch };
        attempt.server = http.createServer(async (req, res) => {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('Cache-Control', 'no-store');
            res.setHeader('Referrer-Policy', 'no-referrer');
            res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
            const callback = new URL(req.url, attempt.redirect);
            if (req.method !== 'GET' || req.headers.host !== new URL(attempt.redirect).host || callback.pathname !== '/auth/callback' || callback.searchParams.getAll('state').length !== 1 || callback.searchParams.get('state') !== attempt.state || pending !== attempt || attempt.busy) { res.writeHead(400).end('Ongeldige ChatGPT-login.'); return; }
            attempt.busy = true;
            try {
                if (callback.searchParams.has('error')) fail(400, 'ChatGPT-login geannuleerd.');
                const client = callback.searchParams.get('client_id') || prior?.client_id;
                const code = callback.searchParams.get('code');
                if (!client || client === 'dynamic_agent_client' || !code || (prior && client !== prior.client_id)) fail(400, 'ChatGPT-login is niet voltooid.');
                const value = await tokens({ grant_type: 'authorization_code', client_id: client, code, code_verifier: attempt.verifier, redirect_uri: attempt.redirect });
                const claims = await identity(value.id_token, client, attempt.nonce);
                if (prior && claims.sub !== prior.subject) fail(400, 'Dit is een ander ChatGPT-account. Kies Ander account.');
                if (!value.scopes.includes('chatgpt.tokens.use.direct')) fail(403, 'Geef ChatGPT toestemming om je abonnement te gebruiken.');
                if (pending !== attempt || epoch !== attempt.epoch) fail(400, 'ChatGPT-login geannuleerd.');
                data.accounts ||= {};
                data.accounts[client] = { ...value, client_id: client, subject: claims.sub, email: typeof claims.email === 'string' ? claims.email : '', issuer: claims.iss, welcome: prior ? prior.welcome : true };
                data.selected = client; ++epoch; save(); message = 'Verbonden met ChatGPT.';
                res.end('<!doctype html><html lang="nl"><title>KweekKompas</title><p>ChatGPT is verbonden. Je kunt dit venster sluiten en teruggaan naar KweekKompas.</p></html>');
            } catch (error) { if (pending === attempt) message = error.status ? error.message : 'ChatGPT-login is niet voltooid. Probeer opnieuw.'; res.writeHead(400).end('<!doctype html><html lang="nl"><title>KweekKompas</title><p>ChatGPT-login is niet voltooid. Ga terug naar KweekKompas.</p></html>'); }
            finally { if (pending === attempt) cancel(); }
        });
        await new Promise((resolve, reject) => { attempt.server.once('error', reject); attempt.server.listen(0, '127.0.0.1', resolve); });
        attempt.redirect = `http://127.0.0.1:${attempt.server.address().port}/auth/callback`;
        pending = attempt;
        attempt.timer = setTimeout(() => { if (pending === attempt) { cancel(); message = 'ChatGPT-login verlopen. Probeer opnieuw.'; } }, 300_000); attempt.timer.unref();
        const url = new URL(ISSUER + '/api/accounts/authorize');
        // Omit the optional ID-token hint: no credentials are sent to our UI.
        url.search = new URLSearchParams({ client_id: prior?.client_id || 'dynamic_agent_client', ext_agent_host_id: data.host, ...(prior ? {} : { agent_name_hint: 'KweekKompas' }), response_type: 'code', redirect_uri: attempt.redirect, scope: SCOPE, resource: RESOURCE, state: attempt.state, nonce: attempt.nonce, code_challenge_method: 'S256', code_challenge: crypto.createHash('sha256').update(attempt.verifier).digest('base64url') }).toString();
        return { ...status(), authorizationURL: url.href };
    }
    async function access() {
        if (!connected()) fail(401, 'Log eerst in met ChatGPT bij Instellingen → AI.');
        const account = active();
        if (account.expires_at > Date.now() + 60_000) return account.access_token;
        const earliest = typeof account.earliest_refresh_at === 'number' ? account.earliest_refresh_at * 1000 : Date.parse(account.earliest_refresh_at || '');
        if (earliest > Date.now()) {
            if (account.expires_at > Date.now()) return account.access_token;
            fail(401, 'Log opnieuw in met ChatGPT.');
        }
        if (!refresh) {
            const version = epoch;
            refresh = (async () => {
                if (!account.refresh_token) fail(401, 'Log opnieuw in met ChatGPT.');
                const next = await tokens({ grant_type: 'refresh_token', client_id: account.client_id, refresh_token: account.refresh_token });
                if (version !== epoch || account !== active()) fail(401, 'De ChatGPT-verbinding is gewijzigd.');
                if (!next.scopes.includes('chatgpt.tokens.use.direct')) fail(403, 'Geef ChatGPT toestemming om je abonnement te gebruiken.');
                Object.assign(account, next, { refresh_token: next.refresh_token || account.refresh_token, id_token: next.id_token || account.id_token }); save();
                return account.access_token;
            })().finally(() => { refresh = undefined; });
        }
        return refresh;
    }
    async function authenticated(url, options = {}) {
        const version = epoch;
        const token = await access();
        if (version !== epoch) fail(401, 'De ChatGPT-verbinding is gewijzigd.');
        const response = await call(url, { ...options, headers: { ...options.headers, Authorization: 'Bearer ' + token } });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            const code = error.error?.code;
            if (code === 'subscription_sharing_usage_limit_exceeded' || response.status === 429) fail(429, 'Je ChatGPT-gebruikslimiet is bereikt. Probeer later opnieuw.');
            if (code === 'subscription_sharing_usage_unavailable') fail(403, 'Je ChatGPT-abonnement is hiervoor momenteel niet beschikbaar.');
            if ([401, 403].includes(response.status)) fail(401, 'Log opnieuw in met ChatGPT.');
            fail(502, 'ChatGPT kon deze aanvraag niet uitvoeren.');
        }
        return response;
    }
    async function models() {
        const result = await (await authenticated(RESOURCE + '/models')).json();
        return (result.models || []).filter(model => model.visibility === 'list' && typeof model.slug === 'string').map(model => ({ id: model.slug, label: model.display_name || model.slug }));
    }
    async function generate(model, instructions, input) {
        if (!(await models()).some(item => item.id === model)) fail(400, 'Kies een beschikbaar ChatGPT-model bij Instellingen → AI.');
        const response = await authenticated(RESOURCE + '/responses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, instructions: instructions + '\nGeef uitsluitend geldig JSON, zonder markdown.', input: [{ role: 'user', content: input }], store: false, stream: true }) });
        // The ChatGPT plan endpoint can omit Content-Type on a valid SSE stream.
        // Validate its events and terminal completion below instead.
        const contentType = response.headers.get('content-type');
        if (!response.body || (contentType && !contentType.includes('text/event-stream'))) fail(502, 'ChatGPT gaf geen geldig antwoord.');
        let buffer = '', text = '', completed = false, size = 0;
        const decoder = new TextDecoder();
        function event(block) {
            const payload = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
            if (!payload || payload === '[DONE]') return;
            let value;
            try { value = JSON.parse(payload); } catch { fail(502, 'ChatGPT gaf geen geldig antwoord.'); }
            if (value.type === 'response.output_text.delta') text += value.delta || '';
            if (value.type === 'response.completed' && value.response?.status === 'completed') { completed = true; if (!text) text = (value.response?.output || []).flatMap(item => item.content || []).filter(item => item.type === 'output_text').map(item => item.text).join(''); }
            if (['response.failed', 'response.incomplete', 'error'].includes(value.type)) {
                const code = value.response?.error?.code || value.error?.code || value.code;
                fail(code === 'subscription_sharing_usage_limit_exceeded' ? 429 : 502, code === 'subscription_sharing_usage_limit_exceeded' ? 'Je ChatGPT-gebruikslimiet is bereikt. Probeer later opnieuw.' : 'ChatGPT kon het antwoord niet afronden. Probeer opnieuw.');
            }
        }
        for await (const chunk of response.body) {
            size += chunk.length;
            if (size > 4_000_000) fail(502, 'Het ChatGPT-antwoord is te groot.');
            buffer += decoder.decode(chunk, { stream: true });
            buffer = buffer.replace(/\r\n/g, '\n');
            let end;
            while ((end = buffer.indexOf('\n\n')) !== -1) { event(buffer.slice(0, end)); buffer = buffer.slice(end + 2); }
        }
        buffer += decoder.decode(); if (buffer.trim()) event(buffer);
        if (!completed || !text) fail(502, 'ChatGPT kon het antwoord niet afronden. Probeer opnieuw.');
        return text;
    }
    async function logout() {
        ++epoch; cancel(); const account = active();
        const token = account?.refresh_token || account?.access_token;
        const tokenType = account?.refresh_token ? 'refresh_token' : 'access_token';
        if (account) { delete account.access_token; delete account.refresh_token; delete account.id_token; account.scopes = []; save(); }
        message = 'Uitgelogd bij ChatGPT.';
        if (token) {
            try { const metadata = await oidc(); const response = await call(metadata.revocation_endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token, token_type_hint: tokenType, client_id: account.client_id }).toString() }); if (!response.ok) throw new Error(); }
            catch { message = 'Lokaal uitgelogd. Intrekken bij ChatGPT is niet bevestigd.'; }
        }
        return status();
    }
    async function handle(req, body) {
        let origin; try { origin = new URL('http://' + req.headers.host); } catch { fail(403, 'Alleen beschikbaar in de lokale app.'); }
        if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) || !['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname) || origin.port !== String(req.socket.localPort) || req.headers.origin !== origin.origin || req.headers['sec-fetch-site'] === 'cross-site') fail(403, 'Alleen beschikbaar vanuit de lokale app.');
        if (req.method !== 'POST' || !/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) fail(405, 'Gebruik een lokale JSON-aanvraag.');
        let input; try { input = JSON.parse(body); } catch { fail(400, 'Ongeldige aanvraag.'); }
        if (input.action === 'status') return status();
        if (input.action === 'login') return login(input.newAccount === true, input.accountId);
        if (input.action === 'logout') return logout();
        if (input.action === 'cancel') { cancel(); message = 'ChatGPT-login geannuleerd.'; return status(); }
        if (input.action === 'acknowledge') { if (active()) { active().welcome = false; save(); } return status(); }
        if (input.action === 'models') return { ...status(), models: await models() };
        fail(400, 'Onbekende ChatGPT-actie.');
    }
    return { status, handle, generate, close: cancel };
}
module.exports = { createChatGPT };

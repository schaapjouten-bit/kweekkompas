// Loaded only by the loopback development server; never a Netlify route.
const fs = require('node:fs');
const path = require('node:path');
function createLocalAPI(file) {
    const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
    const checkFile = () => {
        if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) fail(503, 'Lokale configuratie is niet beschikbaar.');
    };
    function validateAddress(value) {
        if (typeof value !== 'string' || value.length > 2048) fail(400, 'Vul een geldig API-adres in.');
        let url;
        try { url = new URL(value); } catch { fail(400, 'Vul een geldig API-adres in.'); }
        const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
        if ((!local && url.protocol !== 'https:') || !['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) fail(400, 'Gebruik HTTPS, of HTTP op localhost, zonder inloggegevens of queryparameters.');
        return url.href.replace(/\/$/, '');
    }
    function get() {
        checkFile();
        if (fs.existsSync(file)) {
            try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
            catch { fail(503, 'Lokale configuratie kan niet worden gelezen.'); }
        }
        return { address: process.env.OPENAI_COMPATIBLE_BASE_URL || '', model: process.env.OPENAI_COMPATIBLE_MODEL || '', apiKey: process.env.OPENAI_COMPATIBLE_API_KEY || '' };
    }
    const metadata = value => ({ address: value.address ? validateAddress(value.address) : '', model: value.model || '', keyConfigured: Boolean(value.apiKey) });
    function write(value) {
        checkFile();
        const temporary = file + '.' + require('node:crypto').randomUUID() + '.tmp';
        try {
            fs.writeFileSync(temporary, JSON.stringify(value), { flag: 'wx', mode: 0o600 });
            fs.renameSync(temporary, file);
        } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
    }
    async function handle(req, body) {
        const host = req.headers.host;
        let url;
        try { url = new URL('http://' + host); } catch { fail(403, 'Alleen beschikbaar in de lokale app.'); }
        if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.port !== String(req.socket.localPort) || req.headers.origin !== url.origin || req.headers['sec-fetch-site'] === 'cross-site') fail(403, 'Alleen beschikbaar vanuit de lokale app.');
        if (req.method !== 'POST' || !/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) fail(405, 'Gebruik een lokale JSON-aanvraag.');
        let input;
        try { input = JSON.parse(body); } catch { fail(400, 'Ongeldige instellingen.'); }
        const current = get();
        if (input.action === 'get') return metadata(current);
        if (input.action === 'save') {
            const address = validateAddress(input.address);
            const model = typeof input.model === 'string' ? input.model.trim() : '';
            if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:/-]{0,159}$/.test(model)) fail(400, 'Vul een geldige modelnaam in.');
            if (typeof input.apiKey !== 'string' || input.apiKey.length > 8192 || /[\x00-\x1f\x7f]/.test(input.apiKey)) fail(400, 'De sleutel is ongeldig.');
            // A stored secret must never follow an edited service address.
            const apiKey = input.apiKey || (address === (current.address || '').replace(/\/$/, '') ? current.apiKey : '');
            const next = { address, model, apiKey };
            write(next); return metadata(next);
        }
        if (input.action === 'delete-key') { write({ ...current, apiKey: '' }); return metadata({ ...current, apiKey: '' }); }
        if (input.action === 'test') {
            const address = validateAddress(current.address);
            if (!current.model) fail(400, 'Sla eerst adres en model op.');
            let response;
            try {
                response = await fetch(address + '/chat/completions', {
                    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
                    headers: { 'Content-Type': 'application/json', ...(current.apiKey ? { Authorization: `Bearer ${current.apiKey}` } : {}) },
                    body: JSON.stringify({ model: current.model, messages: [{ role: 'user', content: 'Antwoord met OK.' }], max_tokens: 1 })
                });
            } catch { fail(502, 'De ingestelde API is niet bereikbaar of reageert te langzaam.'); }
            if (!response.ok) fail(502, response.status === 401 || response.status === 403 ? 'De API weigert de sleutel of toegang.' : 'De API weigert de test. Controleer adres en model.');
            const result = await response.json().catch(() => null);
            if (typeof result?.choices?.[0]?.message?.content !== 'string') fail(502, 'De API gaf geen compatibel antwoord.');
            return { ...metadata(current), message: 'Verbinding geslaagd. Eén minimale aanvraag verstuurd.' };
        }
        fail(400, 'Onbekende instellingenactie.');
    }
    return { get, handle };
}
module.exports = { createLocalAPI };

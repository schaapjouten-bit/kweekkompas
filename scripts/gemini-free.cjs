// Personal Gemini credentials belong to the loopback app, never a public route.
const fs = require('node:fs');
const MODEL = 'gemini-3.5-flash-lite';
function createGeminiFree(file) {
    const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
    function checkFile() {
        if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) fail(503, 'De lokale Gemini-instellingen zijn niet beschikbaar.');
    }
    function get() {
        checkFile();
        if (!fs.existsSync(file)) return { apiKey: '' };
        try {
            const value = JSON.parse(fs.readFileSync(file, 'utf8'));
            if (typeof value.apiKey !== 'string') throw new Error();
            return { apiKey: value.apiKey };
        } catch { fail(503, 'De lokale Gemini-instellingen kunnen niet worden gelezen.'); }
    }
    const metadata = () => ({ model: MODEL, keyConfigured: Boolean(get().apiKey) });
    function save(apiKey) {
        checkFile();
        const temporary = file + '.' + require('node:crypto').randomUUID() + '.tmp';
        try {
            fs.writeFileSync(temporary, JSON.stringify({ apiKey }), { flag: 'wx', mode: 0o600 });
            fs.renameSync(temporary, file);
        } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
    }
    async function generateWithKey(apiKey, system, prompt, testing = false) {
        if (!apiKey) fail(400, 'Vul eerst je Gemini API-sleutel in bij Instellingen → AI.');
        let response;
        try {
            response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
                method: 'POST', redirect: 'error', signal: AbortSignal.timeout(testing ? 20000 : 45000),
                headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
                body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { responseMimeType: 'application/json', ...(testing ? { maxOutputTokens: 1024 } : {}) } })
            });
        } catch { fail(502, 'Gemini is niet bereikbaar of reageert te langzaam. Probeer opnieuw.'); }
        if (!response.ok) {
            if ([400, 401, 403].includes(response.status)) fail(502, 'Gemini weigert de API-sleutel of toegang. Controleer je sleutel in Google AI Studio.');
            if (response.status === 429) fail(429, 'De Gemini-limiet is bereikt. Wacht even of controleer je quotum in Google AI Studio.');
            if (response.status === 404) fail(502, 'Gemini 3.5 Flash-Lite is niet beschikbaar voor deze API-sleutel.');
            fail(502, `Gemini gaf een fout (${response.status}). Probeer later opnieuw.`);
        }
        const data = await response.json().catch(() => null);
        const text = data?.candidates?.[0]?.content?.parts?.filter(part => !part.thought).map(part => part.text || '').join('');
        if (!text) fail(502, 'Gemini gaf geen bruikbaar antwoord. Probeer opnieuw.');
        return text;
    }
    async function handle(req, body) {
        let url;
        try { url = new URL('http://' + req.headers.host); } catch { fail(403, 'Alleen beschikbaar in de lokale app.'); }
        if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)
            || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.port !== String(req.socket.localPort)
            || req.headers.origin !== url.origin || req.headers['sec-fetch-site'] === 'cross-site') fail(403, 'Alleen beschikbaar vanuit de lokale app.');
        if (req.method !== 'POST' || !/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) fail(405, 'Gebruik een lokale JSON-aanvraag.');
        let input;
        try { input = JSON.parse(body); } catch { fail(400, 'Ongeldige instellingen.'); }
        if (input?.action === 'get') return metadata();
        if (input?.action === 'delete-key') {
            checkFile();
            if (fs.existsSync(file)) fs.unlinkSync(file);
            return metadata();
        }
        if (input?.action !== 'save-test') fail(400, 'Onbekende instellingenactie.');
        if (typeof input.apiKey !== 'string' || input.apiKey.length > 8192) fail(400, 'Vul een geldige Gemini API-sleutel in.');
        const apiKey = input.apiKey.trim() || get().apiKey;
        if (!apiKey || /[\x00-\x20\x7f]/.test(apiKey)) fail(400, 'Vul een geldige Gemini API-sleutel in.');
        const answer = await generateWithKey(apiKey, 'Geef alleen het gevraagde JSON-object terug.', 'Antwoord met {"ok":true}.', true);
        let valid = false;
        try { valid = JSON.parse(answer)?.ok === true; } catch { /* No successful connection without a valid answer. */ }
        if (!valid) fail(502, 'Gemini gaf geen geldig testantwoord. Probeer opnieuw.');
        // A failed replacement never overwrites the previously working key.
        save(apiKey);
        return { ...metadata(), message: 'Verbinding geslaagd met Gemini 3.5 Flash-Lite. Lokaal opgeslagen voor de tuinassistent en de zadenhulp.' };
    }
    return { metadata, handle, generate: (system, prompt) => generateWithKey(get().apiKey, system, prompt) };
}
module.exports = { createGeminiFree };

const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const { HttpError } = require('../netlify/functions/_shared/lib/http');
const { geminiModelId, generateGemini } = require('../netlify/functions/_shared/lib/gemini');
const { readLegacyGeminiKey } = require('./gemini-free.cjs');

function createGeminiPersonal(file, legacyFile) {
    const legacyKey = () => readLegacyGeminiKey(legacyFile);
    function checkFile() {
        if (fs.lstatSync(file, { throwIfNoEntry: false })?.isSymbolicLink()) {
            throw new HttpError(503, 'De lokale Gemini-instellingen zijn niet beschikbaar.');
        }
    }

    function getSettings() {
        checkFile();
        if (!fs.existsSync(file)) return { apiKey: '', useLegacyKey: false };
        try {
            const { apiKey, useLegacyKey } = JSON.parse(fs.readFileSync(file, 'utf8'));
            if (typeof apiKey === 'string') return { apiKey, useLegacyKey: useLegacyKey === true };
        } catch { /* Report storage errors without including file contents. */ }
        throw new HttpError(503, 'De lokale Gemini-instellingen kunnen niet worden gelezen.');
    }

    const ownKey = settings => settings.apiKey || process.env.GEMINI_API_KEY || '';
    const getKey = (settings = getSettings()) => settings.useLegacyKey ? legacyKey() : ownKey(settings) || legacyKey();

    function saveSettings(settings) {
        checkFile();
        const temporary = `${file}.${randomUUID()}.tmp`;
        try {
            fs.writeFileSync(temporary, JSON.stringify(settings), { flag: 'wx', mode: 0o600 });
            fs.renameSync(temporary, file);
        } finally {
            if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
        }
    }

    function checkRequest(req) {
        let url;
        try { url = new URL('http://' + req.headers.host); } catch { throw new HttpError(403, 'Alleen beschikbaar in de lokale app.'); }
        if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)
            || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.port !== String(req.socket.localPort)
            || req.headers.origin !== url.origin || req.headers['sec-fetch-site'] === 'cross-site') {
            throw new HttpError(403, 'Alleen beschikbaar vanuit de lokale app.');
        }
        if (req.method !== 'POST' || !/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) {
            throw new HttpError(405, 'Gebruik een lokale JSON-aanvraag.');
        }
    }

    function metadata() {
        const settings = getSettings();
        const legacy = legacyKey();
        const own = ownKey(settings);
        return {
            keyConfigured: Boolean(getKey(settings)),
            legacyKeyAvailable: Boolean(legacy && own && legacy !== own),
            usingLegacyKey: settings.useLegacyKey
        };
    }

    async function handle(req, body) {
        checkRequest(req);
        let input;
        try { input = JSON.parse(body); } catch { throw new HttpError(400, 'Ongeldige instellingen.'); }
        if (input?.action === 'get') return metadata();
        if (input?.action !== 'save-test') throw new HttpError(400, 'Onbekende instellingenactie.');
        const model = geminiModelId(input.model);
        if (typeof input.apiKey !== 'string' || input.apiKey.length > 8192) throw new HttpError(400, 'Vul een geldige Gemini API-sleutel in.');
        const enteredKey = input.apiKey.trim();
        const settings = getSettings();
        const useLegacyKey = !enteredKey && (typeof input.useLegacyKey === 'boolean' ? input.useLegacyKey : settings.useLegacyKey);
        const apiKey = enteredKey || getKey({ ...settings, useLegacyKey });
        if (!apiKey || /[^\x21-\x7e]/.test(apiKey)) throw new HttpError(400, 'Vul een geldige Gemini API-sleutel in.');
        const answer = await generateGemini({ apiKey, model, testing: true,
            system: 'Geef alleen het gevraagde JSON-object terug.', prompt: 'Antwoord met {"ok":true}.' });
        let valid = false;
        try { valid = JSON.parse(answer)?.ok === true; } catch { /* Require the expected JSON result. */ }
        if (!valid) throw new HttpError(502, 'Gemini gaf geen geldig testantwoord. Probeer opnieuw.');
        if (enteredKey || useLegacyKey !== settings.useLegacyKey) saveSettings({ apiKey: enteredKey || settings.apiKey, useLegacyKey });
        return { ...metadata(), message: `Verbinding geslaagd met ${model}.` };
    }

    return { getKey, checkRequest, handle };
}

module.exports = { createGeminiPersonal };

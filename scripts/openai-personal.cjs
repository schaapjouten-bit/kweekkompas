const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const { HttpError } = require('../netlify/functions/_shared/lib/http');
const { generateOpenAI } = require('../netlify/functions/_shared/lib/openai');

function createOpenAIPersonal(file, checkRequest) {
    function getKey() {
        if (fs.lstatSync(file, { throwIfNoEntry: false })?.isSymbolicLink()) throw new HttpError(503, 'De lokale GPT-instellingen zijn niet beschikbaar.');
        if (!fs.existsSync(file)) return '';
        try { const data = JSON.parse(fs.readFileSync(file, 'utf8')); return typeof data.apiKey === 'string' ? data.apiKey : ''; }
        catch { throw new HttpError(503, 'De lokale GPT-instellingen kunnen niet worden gelezen.'); }
    }
    async function handle(req, body) {
        checkRequest(req);
        let input;
        try { input = JSON.parse(body); } catch { throw new HttpError(400, 'Ongeldige instellingen.'); }
        if (input.action === 'get') return { keyConfigured: Boolean(getKey()) };
        if (input.action !== 'save-test') throw new HttpError(400, 'Onbekende instellingenactie.');
        if (typeof input.apiKey !== 'string' || input.apiKey.length > 8192) throw new HttpError(400, 'Vul een geldige OpenAI API-sleutel in.');
        const entered = input.apiKey.trim();
        const key = entered || getKey();
        if (!key || /[^\x21-\x7e]/.test(key)) throw new HttpError(400, 'Vul een geldige OpenAI API-sleutel in.');
        if (!key.startsWith('sk-')) throw new HttpError(400, 'Dit is geen OpenAI API-sleutel. Een OpenAI-sleutel begint met sk-.');
        const answer = await generateOpenAI({ apiKey: key, model: input.model, system: 'Antwoord met een JSON-object.', prompt: 'Antwoord met {"ok":true}.', timeoutMs: 30_000 });
        try { if (JSON.parse(answer).ok !== true) throw new Error(); }
        catch { throw new HttpError(502, 'OpenAI gaf geen geldig testantwoord. Probeer opnieuw.'); }
        if (entered) {
            getKey();
            const temporary = `${file}.${randomUUID()}.tmp`;
            try { fs.writeFileSync(temporary, JSON.stringify({ apiKey: entered }), { flag: 'wx', mode: 0o600 }); fs.renameSync(temporary, file); }
            finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
        }
        return { keyConfigured: true, message: `Verbinding geslaagd met ${input.model}.` };
    }
    return { getKey, checkRequest, handle };
}
module.exports = { createOpenAIPersonal };

const { endpoint, readBody, reply, HttpError, env } = require('./lib/http');
const { authenticate } = require('./lib/supabase');
const { generateGemini } = require('./lib/gemini');
const { generateOpenAI } = require('./lib/openai');
const adminPersonal = require('./lib/admin-personal-ai');

exports.handler = endpoint(async event => {
    if (event.httpMethod !== 'POST') throw new HttpError(405, 'Gebruik POST.');
    const session = await authenticate(event);
    if (session.user.app_metadata?.kweek_role !== 'admin') throw new HttpError(403, 'Alleen de beheerder kan deze instellingen gebruiken.');

    const { action, provider, model, apiKey } = readBody(event);
    if (action === 'get') {
        const saved = await adminPersonal.readKeys().catch(() => ({}));
        return reply(200, {
            geminiConfigured: Boolean(saved.gemini || env('GEMINI_API_KEY')?.trim()),
            openaiConfigured: Boolean(saved.openai || env('OPENAI_API_KEY')?.trim())
        }, session.cookies);
    }

    if (action !== 'save-test') throw new HttpError(400, 'Onbekende instellingenactie.');
    if (!['gemini', 'openai'].includes(provider)) throw new HttpError(400, 'Kies Gemini of OpenAI.');
    if (typeof model !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.:/-]{0,159}$/.test(model)) throw new HttpError(400, 'Kies een geldig model.');
    if (apiKey !== undefined && (typeof apiKey !== 'string' || apiKey.length > 8192 || (apiKey && !/^[\x21-\x7e]+$/.test(apiKey)))) {
        throw new HttpError(400, 'Vul een geldige API-sleutel in.');
    }

    const entered = (apiKey || '').trim();
    const saved = entered ? null : await adminPersonal.readKey(provider).catch(() => null);
    const fallbackEnv = provider === 'gemini' ? env('GEMINI_API_KEY')?.trim() : env('OPENAI_API_KEY')?.trim();
    const key = entered || saved || fallbackEnv;
    if (!key) throw new HttpError(400, 'Vul eerst een API-sleutel in.');

    const system = 'Geef alleen het gevraagde JSON-object terug.';
    const prompt = 'Antwoord met {"ok":true}.';
    const answer = provider === 'gemini'
        ? await generateGemini({ apiKey: key, model, testing: true, system, prompt })
        : await generateOpenAI({ apiKey: key, model, system, prompt });

    let parsed;
    try { parsed = JSON.parse(answer); } catch { parsed = null; }
    if (parsed?.ok !== true) throw new HttpError(502, 'De verbinding gaf geen geldig testantwoord.');

    if (entered) await adminPersonal.writeKey(provider, entered);
    return reply(200, { ok: true, keyConfigured: true, message: 'Verbinding werkt en opgeslagen.' }, session.cookies);
});

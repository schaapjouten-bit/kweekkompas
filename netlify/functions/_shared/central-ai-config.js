const { endpoint, readBody, reply, HttpError } = require('./lib/http');
const { authenticate } = require('./lib/supabase');
const central = require('./lib/central-ai');
exports.handler = endpoint(async event => {
    if (event.httpMethod !== 'POST') throw new HttpError(405, 'Gebruik POST.');
    const session = await authenticate(event);
    if (session.user.app_metadata?.kweek_role !== 'admin') throw new HttpError(403, 'Alleen de beheerder kan deze instellingen gebruiken.');
    const { action, apiKey } = readBody(event);
    if (action === 'status') return reply(200, { configured: Boolean(await central.readKey()), model: central.MODEL }, session.cookies);
    if (action !== 'test' && action !== 'save-test') throw new HttpError(400, 'Onbekende instellingenactie.');
    if (apiKey !== undefined && (typeof apiKey !== 'string' || apiKey.length > 8192 || (apiKey && !/^[\x21-\x7e]+$/.test(apiKey)))) throw new HttpError(400, 'Vul een geldige Gemini API-sleutel in.');
    const entered = apiKey || '';
    if (action === 'save-test' && !entered) throw new HttpError(400, 'Vul de nieuwe sleutel in om deze op te slaan.');
    const key = entered || await central.readKey();
    if (!key) throw new HttpError(400, 'Vul eerst een Gemini API-sleutel in.');
    try { await central.testKey(key); }
    catch (error) {
        if ([401, 403, 404].includes(error.status)) throw new HttpError(400, 'De sleutel of modeltoegang is niet geldig.');
        if (error.status === 429) throw new HttpError(429, 'Gemini is tijdelijk beperkt. Probeer later opnieuw.');
        throw new HttpError(502, 'De verbinding met Gemini kon niet worden gecontroleerd.');
    }
    if (action === 'save-test') {
        await central.writeKey(key);
    }
    return reply(200, { configured: true, model: central.MODEL, tested: true }, session.cookies);
});

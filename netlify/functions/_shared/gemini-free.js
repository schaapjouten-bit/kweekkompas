const { endpoint, readBody, reply, HttpError } = require('./lib/http');
const { MODEL, generate } = require('./lib/gemini-free');
exports.handler = endpoint(async event => {
    if (event.httpMethod !== 'POST') throw new HttpError(405, 'Gebruik POST.');
    const body = readBody(event);
    if (body?.action !== 'save-test') throw new HttpError(400, 'Onbekende instellingenactie.');
    const answer = await generate(body.apiKey, 'Geef alleen het gevraagde JSON-object terug.', 'Antwoord met {"ok":true}.', true);
    let valid = false;
    try { valid = JSON.parse(answer)?.ok === true; } catch { /* Test must produce valid JSON. */ }
    if (!valid) throw new HttpError(502, 'Gemini gaf geen geldig testantwoord. Probeer opnieuw.');
    return reply(200, { model: MODEL, keyConfigured: true, message: 'Verbinding geslaagd met Gemini 3.5 Flash-Lite. Opgeslagen voor de tuinassistent en de zadenhulp.' });
});

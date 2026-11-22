const { endpoint, readBody, reply, HttpError } = require('./lib/http');
const { MODEL, authorize } = require('./lib/gemini-free');
exports.handler = endpoint(async event => {
    if (event.httpMethod !== 'POST') throw new HttpError(405, 'Gebruik POST.');
    const session = await authorize(event);
    if (readBody(event)?.action !== 'status') throw new HttpError(400, 'Onbekende instellingenactie.');
    return reply(200, { model: MODEL }, session.cookies);
});

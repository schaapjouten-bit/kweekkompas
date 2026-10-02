const { endpoint, reply, HttpError } = require('./lib/http');
const { getGeminiModels } = require('./lib/gemini-models');
exports.handler = endpoint(async event => {
    if (event.httpMethod !== 'GET') throw new HttpError(405, 'Gebruik GET.');
    return reply(200, await getGeminiModels());
});

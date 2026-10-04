const { endpoint, reply, HttpError, env } = require('./lib/http');
const { providerConfig } = require('./lib/ai');
const { inspectOllama } = require('./lib/ollama');
exports.handler = endpoint(async event => {
    if (event.httpMethod !== 'GET') throw new HttpError(405, 'Gebruik GET.');
    const providers = providerConfig();
    providers.ollama.connection = await inspectOllama(providers.ollama.configured);
    providers.ollama.available = providers.ollama.connection.state === 'reachable';
    providers.ollama.models = [...new Set([...(providers.ollama.models || []), ...providers.ollama.connection.installedModels])];
    return reply(200, { providers, defaultProvider: env('KWEEK_LOCAL_DEV') === 'true' ? 'ollama' : 'gemini' });
});

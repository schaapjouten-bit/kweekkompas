const { endpoint, reply, HttpError, env } = require('./lib/http');
const { providerConfig } = require('./lib/ai');
exports.handler = endpoint(async event => {
    if (event.httpMethod !== 'GET') throw new HttpError(405, 'Gebruik GET.');
    const providers = providerConfig();
    if (providers.ollama.configured) {
        try {
            const base = new URL(env('OLLAMA_BASE_URL') || 'http://127.0.0.1:11434');
            if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash || (base.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname))) throw new Error();
            const response = await fetch(base.href.replace(/\/$/, '') + '/api/tags', { signal: AbortSignal.timeout(2000), redirect: 'error' });
            if (!response.ok) throw new Error();
            const data = await response.json();
            providers.ollama.models = [...new Set([...(providers.ollama.models || []), ...(data.models || []).map(item => item.name).filter(name => typeof name === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:/-]{0,159}$/.test(name))])];
            providers.ollama.available = true;
        } catch { providers.ollama.available = false; }
    }
    return reply(200, { providers, defaultProvider: env('AI_PROVIDER') || 'gemini' });
});

const { env, HttpError } = require('./http');
function ollamaBase() {
    const invalid = () => Object.assign(new HttpError(503, 'Het Ollama-adres in de backend is ongeldig.'), { code: 'OLLAMA_INVALID_CONFIG' });
    let base;
    try { base = new URL(env('OLLAMA_BASE_URL') || 'http://127.0.0.1:11434'); } catch { throw invalid(); }
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash || (base.protocol === 'http:' && !local)) throw invalid();
    return base.href.replace(/\/$/, '');
}
async function inspectOllama(configured) {
    const connection = { runtime: env('KWEEK_LOCAL_DEV') === 'true' ? 'local' : 'hosted', state: 'unconfigured', installedModels: [] };
    if (!configured) return connection;
    let base;
    try { base = ollamaBase(); } catch { connection.state = 'invalid-config'; return connection; }
    try {
        const response = await fetch(base + '/api/tags', { signal: AbortSignal.timeout(3000), redirect: 'error' });
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (!Array.isArray(data.models)) throw new Error();
        connection.installedModels = [...new Set(data.models.map(item => item?.name).filter(name => typeof name === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:/-]{0,159}$/.test(name)))];
        connection.state = 'reachable';
    } catch { connection.state = 'unreachable'; }
    return connection;
}
module.exports = { ollamaBase, inspectOllama };

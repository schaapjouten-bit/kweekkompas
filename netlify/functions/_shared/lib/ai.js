const { env, HttpError } = require('./http');
const { configured, authenticate } = require('./supabase');
const { getGeminiModels } = require('./gemini-models');
const providers = ['gemini', 'ollama', 'openai-compatible'];
function providerConfig() {
    return {
        gemini: { label: 'Gemini', configured: Boolean(env('GEMINI_API_KEY')), model: env('GEMINI_MODEL') || '', models: [] },
        ollama: { label: 'Ollama', configured: Boolean(env('OLLAMA_BASE_URL') || env('KWEEK_LOCAL_DEV') === 'true'), model: env('OLLAMA_MODEL') || 'llama3:latest', models: (env('OLLAMA_MODELS') || '').split(',').filter(Boolean) },
        'openai-compatible': { label: 'Eigen OpenAI-compatibele API', configured: Boolean(env('OPENAI_COMPATIBLE_BASE_URL')), model: env('OPENAI_COMPATIBLE_MODEL') || '', models: (env('OPENAI_COMPATIBLE_MODELS') || '').split(',').filter(Boolean) }
    };
}
async function authorizeAI(event) {
    if (configured()) return (await authenticate(event)).cookies;
    if (env('KWEEK_LOCAL_DEV') !== 'true') throw new HttpError(503, 'Configureer Supabase om AI veilig beschikbaar te maken.');
    return [];
}
async function callAI(body, system, prompt) {
    const provider = body.ai?.provider || env('AI_PROVIDER') || 'gemini';
    if (!providers.includes(provider)) throw new HttpError(400, 'Kies een geldige AI-provider.');
    const config = providerConfig()[provider];
    let model = body.ai?.model || config.model;
    if (provider === 'gemini' && !body.ai?.model) {
        const catalog = await getGeminiModels();
        model = config.model !== 'gemini-2.5-flash' && catalog.models.some(item => item.id === config.model) ? config.model : catalog.defaultModel;
    }
    if (provider === 'gemini' && typeof model === 'string') model = model.replace(/^models\//, '');
    if (typeof model !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.:/-]{0,159}$/.test(model)) throw new HttpError(400, 'Vul een geldige modelnaam in bij Instellingen → AI.');
    if (!config.configured) throw new HttpError(503, `${config.label} is nog niet geconfigureerd in de backend.`);
    let url, payload;
    const headers = { 'Content-Type': 'application/json' };
    if (provider === 'gemini') {
        url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
        headers['x-goog-api-key'] = env('GEMINI_API_KEY');
        payload = { systemInstruction: { parts: [{ text: system }] }, contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json' } };
    } else {
        const base = new URL(provider === 'ollama' ? env('OLLAMA_BASE_URL') || 'http://127.0.0.1:11434' : env('OPENAI_COMPATIBLE_BASE_URL'));
        if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new HttpError(503, 'Het API-adres in de backend is ongeldig.');
        const local = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
        if (base.protocol !== 'https:' && !local) throw new HttpError(503, 'Gebruik HTTPS voor een externe AI-provider.');
        url = base.href.replace(/\/$/, '') + (provider === 'ollama' ? '/api/generate' : '/chat/completions');
        if (provider === 'ollama') payload = { model, system, prompt, format: 'json', stream: false };
        else {
            if (env('OPENAI_COMPATIBLE_API_KEY')) headers.Authorization = `Bearer ${env('OPENAI_COMPATIBLE_API_KEY')}`;
            payload = { model, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] };
        }
    }
    let response;
    try { response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(45_000), redirect: 'error' }); }
    catch { throw new HttpError(502, `${config.label} is niet bereikbaar of reageert te langzaam.`); }
    if (!response.ok) {
        if (provider === 'gemini') {
            const failure = await response.json().catch(() => ({}));
            const invalidKey = failure?.error?.details?.some?.(detail => detail?.reason === 'API_KEY_INVALID');
            if (invalidKey) throw new HttpError(502, 'Gemini: Google weigert de GEMINI_API_KEY (API_KEY_INVALID). Stel een geldige sleutel in de backend in en herstart de lokale server.');
        }
        throw new HttpError(502, `${config.label} gaf een fout (${response.status}). Controleer model, sleutel en backendconfiguratie.`);
    }
    let data;
    try { data = await response.json(); } catch { throw new HttpError(502, 'De AI-provider gaf geen geldig antwoord.'); }
    const text = provider === 'gemini' ? data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') : provider === 'ollama' ? data.response : data.choices?.[0]?.message?.content;
    try {
        const clean = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
        const parsed = JSON.parse(clean);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
        return parsed;
    } catch { throw new HttpError(502, 'De AI-provider gaf geen geldig JSON-antwoord. Probeer opnieuw.'); }
}
module.exports = { providerConfig, authorizeAI, callAI };

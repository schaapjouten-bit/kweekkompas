const { env, HttpError, readBody } = require('./http');
const { configured, authenticate } = require('./supabase');
const { getGeminiModels } = require('./gemini-models');
const { generateGemini } = require('./gemini');
const { generateOpenAI } = require('./openai');
const { ollamaBase } = require('./ollama');
const geminiFreeAPI = require('./gemini-free');
const contract = require('../../../../ai-contract');
const providers = ['gemini', 'gemini-free', 'ollama', 'openai-compatible', 'chatgpt', 'openai'];
function safeRead(fn, fallback) {
    try { return fn(); }
    catch { return fallback; }
}
function providerConfig() {
    const isLocal = env('KWEEK_LOCAL_DEV') === 'true';
    const localAPI = isLocal && globalThis.KweekLocalAPI;
    const custom = localAPI ? safeRead(() => localAPI.get(), {}) : {};
    const openaiKey = isLocal && globalThis.KweekOpenAIPersonal ? safeRead(() => globalThis.KweekOpenAIPersonal.getKey(), '') : '';
    return {
        gemini: { label: 'Gemini', configured: Boolean(env('GEMINI_API_KEY')), model: env('GEMINI_MODEL') || '', models: [] },
        openai: { label: 'GPT – eigen sleutel', configured: Boolean(openaiKey), model: 'gpt-5-mini', models: ['gpt-5-mini'] },
        'gemini-free': { label: 'Gemini – Free tier', available: true, configured: geminiFreeAPI.configured(), model: geminiFreeAPI.MODEL, models: [] },
        chatgpt: { label: 'ChatGPT', localAvailable: Boolean(isLocal && globalThis.KweekChatGPT), configured: Boolean(isLocal && safeRead(() => globalThis.KweekChatGPT?.status().connected, false)), model: '', models: [] },
        ollama: { label: 'Lokale AI (Ollama)', configured: Boolean(env('OLLAMA_BASE_URL') || isLocal), model: env('OLLAMA_MODEL') || 'llama3:latest', models: (env('OLLAMA_MODELS') || '').split(',').filter(Boolean) },
        'openai-compatible': { label: 'Eigen API', localAvailable: Boolean(localAPI), configured: Boolean(custom.address), model: custom.model || '', models: [] }
    };
}
async function authorizeAI(event) {
    const provider = readBody(event).ai?.provider;
    if (provider === 'gemini-free') return geminiFreeAPI.authorize(event);
    if (env('KWEEK_LOCAL_DEV') === 'true' && globalThis.KweekGeminiPersonal && provider === 'gemini') return { cookies: [] };
    if (env('KWEEK_LOCAL_DEV') === 'true' && globalThis.KweekOpenAIPersonal && provider === 'openai') return { cookies: [] };
    // A personal ChatGPT login is independent of the garden's cloud account.
    if (env('KWEEK_LOCAL_DEV') === 'true' && globalThis.KweekChatGPT && readBody(event).ai?.provider === 'chatgpt') {
        if (!globalThis.KweekChatGPT.status().connected) throw new HttpError(401, 'Log eerst in met ChatGPT bij Instellingen → AI.');
        return { cookies: [] };
    }
    if (configured()) return authenticate(event);
    if (env('KWEEK_LOCAL_DEV') !== 'true') throw new HttpError(503, 'Configureer Supabase om AI veilig beschikbaar te maken.');
    return { cookies: [] };
}
async function callAI(body, system, prompt, session, { timeoutMs = 45_000 } = {}) {
    const provider = body.ai?.provider || (env('KWEEK_LOCAL_DEV') === 'true' ? 'ollama' : 'gemini');
    if (!providers.includes(provider)) throw new HttpError(400, 'Kies een geldige AI-provider.');
    const config = providerConfig()[provider];
    if (provider === 'openai') {
        const personal = env('KWEEK_LOCAL_DEV') === 'true' && globalThis.KweekOpenAIPersonal;
        const apiKey = personal && personal.getKey();
        if (!apiKey) throw new HttpError(503, 'Vul je OpenAI API-sleutel in bij Instellingen → AI.');
        return contract.parse(await generateOpenAI({ apiKey, model: body.ai?.model || 'gpt-5-mini', system, prompt, timeoutMs }));
    }
    if (provider === 'gemini-free') {
        return contract.parse(await geminiFreeAPI.generate(session, system, prompt, { timeoutMs }));
    }
    if (provider === 'chatgpt') {
        if (!config.localAvailable) throw new HttpError(503, 'ChatGPT is voorlopig alleen beschikbaar in de lokale app.');
        try { return contract.parse(await globalThis.KweekChatGPT.generate(body.ai?.model, system, prompt)); }
        catch (error) { if (error.status) throw new HttpError(error.status, error.message); throw new HttpError(502, 'ChatGPT kon het antwoord niet afronden. Probeer opnieuw.'); }
    }
    const custom = provider === 'openai-compatible' && globalThis.KweekLocalAPI && env('KWEEK_LOCAL_DEV') === 'true' ? globalThis.KweekLocalAPI.get() : null;
    let model = custom ? custom.model : body.ai?.model || config.model;
    if (provider === 'gemini') {
        const personal = env('KWEEK_LOCAL_DEV') === 'true' && globalThis.KweekGeminiPersonal;
        const migratedKey = body.ai?.legacyKey;
        if (!personal && migratedKey !== undefined && (!session?.user || typeof migratedKey !== 'string' || !/^[\x21-\x7e]{1,8192}$/.test(migratedKey))) {
            throw new HttpError(400, 'De eerdere eigen Gemini-sleutel kan niet worden gebruikt.');
        }
        const apiKey = personal ? personal.getKey() : migratedKey ?? env('GEMINI_API_KEY');
        if (!apiKey) throw new HttpError(503, 'Vul je Gemini API-sleutel in bij Instellingen → AI.');
        if (!model) model = (await getGeminiModels()).defaultModel;
        return contract.parse(await generateGemini({ apiKey, model, system, prompt, timeoutMs }));
    }
    if (typeof model !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.:/-]{0,159}$/.test(model)) throw new HttpError(400, 'Vul een geldige modelnaam in bij Instellingen → AI.');
    if (!config.configured) throw Object.assign(new HttpError(503, `${config.label} is nog niet geconfigureerd in de backend.`), provider === 'ollama' ? { code: 'OLLAMA_UNCONFIGURED' } : {});
    let payload;
    const headers = { 'Content-Type': 'application/json' };
    const base = new URL(provider === 'ollama' ? ollamaBase() : custom.address);
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new HttpError(503, 'Het API-adres in de backend is ongeldig.');
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
    if (base.protocol !== 'https:' && !local) throw new HttpError(503, 'Gebruik HTTPS voor een externe AI-provider.');
    const url = base.href.replace(/\/$/, '') + (provider === 'ollama' ? '/api/generate' : '/chat/completions');
    if (provider === 'ollama') payload = { model, system, prompt, format: 'json', stream: false };
    else {
        if (custom.apiKey) headers.Authorization = `Bearer ${custom.apiKey}`;
        payload = { model, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] };
    }
    let response;
    try { response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(timeoutMs), redirect: 'error' }); }
    catch (error) {
        if (error.name === 'TimeoutError') throw new HttpError(504, 'De AI-provider deed te lang over het antwoord. Je invoer is behouden. Probeer opnieuw.');
        throw Object.assign(new HttpError(502, `${config.label} is niet bereikbaar.`), provider === 'ollama' ? { code: 'OLLAMA_UNREACHABLE' } : {});
    }
    if (!response.ok) {
        if (provider === 'ollama' && response.status === 404) {
            const failure = await response.json().catch(() => ({}));
            if (typeof failure.error === 'string' && /model.*not found/i.test(failure.error)) throw Object.assign(new HttpError(502, 'Het geselecteerde Ollama-model is niet gedownload.'), { code: 'OLLAMA_MODEL_MISSING' });
        }
        throw new HttpError(502, `${config.label} gaf een fout (${response.status}). Controleer model, sleutel en backendconfiguratie.`);
    }
    let data;
    try { data = await response.json(); } catch { throw new HttpError(502, 'De AI-provider gaf geen geldig antwoord.'); }
    const text = provider === 'ollama' ? data.response : data.choices?.[0]?.message?.content;
    return contract.parse(text);
}
module.exports = { providerConfig, authorizeAI, callAI };

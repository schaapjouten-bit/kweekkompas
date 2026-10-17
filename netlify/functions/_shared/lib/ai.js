const { env, HttpError, readBody } = require('./http');
const { configured, authenticate } = require('./supabase');
const { getGeminiModels } = require('./gemini-models');
const { ollamaBase } = require('./ollama');
const contract = require('../../../../ai-contract');
const providers = ['gemini', 'gemini-free', 'ollama', 'openai-compatible', 'chatgpt'];
function providerConfig() {
    const localAPI = env('KWEEK_LOCAL_DEV') === 'true' && globalThis.KweekLocalAPI;
    const custom = localAPI ? localAPI.get() : {};
    const geminiFree = env('KWEEK_LOCAL_DEV') === 'true' && globalThis.KweekGeminiFree;
    const freeMetadata = geminiFree ? geminiFree.metadata() : null;
    return {
        gemini: { label: 'Gemini', configured: Boolean(env('GEMINI_API_KEY')), model: env('GEMINI_MODEL') || '', models: [] },
        ...(freeMetadata ? { 'gemini-free': { label: 'Gemini – Free tier', localAvailable: true, configured: freeMetadata.keyConfigured, model: freeMetadata.model, models: [] } } : {}),
        chatgpt: { label: 'ChatGPT', localAvailable: Boolean(env('KWEEK_LOCAL_DEV') === 'true' && globalThis.KweekChatGPT), configured: Boolean(env('KWEEK_LOCAL_DEV') === 'true' && globalThis.KweekChatGPT?.status().connected), model: '', models: [] },
        ollama: { label: 'Lokale AI (Ollama)', configured: Boolean(env('OLLAMA_BASE_URL') || env('KWEEK_LOCAL_DEV') === 'true'), model: env('OLLAMA_MODEL') || 'llama3:latest', models: (env('OLLAMA_MODELS') || '').split(',').filter(Boolean) },
        'openai-compatible': { label: 'Eigen API', localAvailable: Boolean(localAPI), configured: Boolean(custom.address), model: custom.model || '', models: [] }
    };
}
async function authorizeAI(event) {
    if (env('KWEEK_LOCAL_DEV') === 'true' && globalThis.KweekGeminiFree && readBody(event).ai?.provider === 'gemini-free') {
        if (!globalThis.KweekGeminiFree.metadata().keyConfigured) throw new HttpError(400, 'Vul eerst je Gemini API-sleutel in bij Instellingen → AI.');
        return [];
    }
    // A personal ChatGPT login is independent of the garden's cloud account.
    if (env('KWEEK_LOCAL_DEV') === 'true' && globalThis.KweekChatGPT && readBody(event).ai?.provider === 'chatgpt') {
        if (!globalThis.KweekChatGPT.status().connected) throw new HttpError(401, 'Log eerst in met ChatGPT bij Instellingen → AI.');
        return [];
    }
    if (configured()) return (await authenticate(event)).cookies;
    if (env('KWEEK_LOCAL_DEV') !== 'true') throw new HttpError(503, 'Configureer Supabase om AI veilig beschikbaar te maken.');
    return [];
}
async function callAI(body, system, prompt) {
    const provider = body.ai?.provider || (env('KWEEK_LOCAL_DEV') === 'true' ? 'ollama' : 'gemini');
    if (!providers.includes(provider)) throw new HttpError(400, 'Kies een geldige AI-provider.');
    const config = providerConfig()[provider];
    if (provider === 'gemini-free') {
        if (!config?.localAvailable) throw new HttpError(503, 'Gemini – Free tier is voorlopig alleen beschikbaar in de lokale app.');
        try { return contract.parse(await globalThis.KweekGeminiFree.generate(system, prompt)); }
        catch (error) { throw new HttpError(error.status || 502, error.status ? error.message : 'Gemini gaf geen geldig antwoord. Probeer opnieuw.'); }
    }
    if (provider === 'chatgpt') {
        if (!config.localAvailable) throw new HttpError(503, 'ChatGPT is voorlopig alleen beschikbaar in de lokale app.');
        try { return contract.parse(await globalThis.KweekChatGPT.generate(body.ai?.model, system, prompt)); }
        catch (error) { if (error.status) throw new HttpError(error.status, error.message); throw new HttpError(502, 'ChatGPT kon het antwoord niet afronden. Probeer opnieuw.'); }
    }
    const custom = provider === 'openai-compatible' && globalThis.KweekLocalAPI && env('KWEEK_LOCAL_DEV') === 'true' ? globalThis.KweekLocalAPI.get() : null;
    let model = custom ? custom.model : body.ai?.model || config.model;
    if (provider === 'gemini' && !model) {
        const catalog = await getGeminiModels();
        model = catalog.defaultModel;
    }
    if (provider === 'gemini' && typeof model === 'string') model = model.replace(/^models\//, '');
    if (typeof model !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.:/-]{0,159}$/.test(model)) throw new HttpError(400, 'Vul een geldige modelnaam in bij Instellingen → AI.');
    if (!config.configured) throw Object.assign(new HttpError(503, `${config.label} is nog niet geconfigureerd in de backend.`), provider === 'ollama' ? { code: 'OLLAMA_UNCONFIGURED' } : {});
    let url, payload;
    const headers = { 'Content-Type': 'application/json' };
    if (provider === 'gemini') {
        url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
        headers['x-goog-api-key'] = env('GEMINI_API_KEY');
        payload = { systemInstruction: { parts: [{ text: system }] }, contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json' } };
    } else {
        const base = new URL(provider === 'ollama' ? ollamaBase() : custom.address);
        if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new HttpError(503, 'Het API-adres in de backend is ongeldig.');
        const local = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
        if (base.protocol !== 'https:' && !local) throw new HttpError(503, 'Gebruik HTTPS voor een externe AI-provider.');
        url = base.href.replace(/\/$/, '') + (provider === 'ollama' ? '/api/generate' : '/chat/completions');
        if (provider === 'ollama') payload = { model, system, prompt, format: 'json', stream: false };
        else {
            if (custom.apiKey) headers.Authorization = `Bearer ${custom.apiKey}`;
            payload = { model, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] };
        }
    }
    let response;
    try { response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(45_000), redirect: 'error' }); }
    catch { throw Object.assign(new HttpError(502, `${config.label} is niet bereikbaar of reageert te langzaam.`), provider === 'ollama' ? { code: 'OLLAMA_UNREACHABLE' } : {}); }
    if (!response.ok) {
        if (provider === 'ollama' && response.status === 404) {
            const failure = await response.json().catch(() => ({}));
            if (typeof failure.error === 'string' && /model.*not found/i.test(failure.error)) throw Object.assign(new HttpError(502, 'Het geselecteerde Ollama-model is niet gedownload.'), { code: 'OLLAMA_MODEL_MISSING' });
        }
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
    return contract.parse(text);
}
module.exports = { providerConfig, authorizeAI, callAI };

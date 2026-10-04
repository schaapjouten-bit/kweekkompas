const { env, HttpError } = require('./http');

// Only explicit stable text model IDs. "latest" aliases can resolve to a
// preview, so prefer the versioned IDs returned by Google's own models.list.
const textModel = /^gemini-(\d+(?:\.\d+)?)-(flash-lite|flash|pro)(?:-\d{3})?$/;
let cached = null;

function normalizeModels(items) {
    const models = new Map();
    for (const item of items) {
        const id = typeof item?.name === 'string' ? item.name.replace(/^models\//, '') : '';
        // Audio/image/live models cannot serve the app's text + JSON requests.
        if (!textModel.test(id) || !item.supportedGenerationMethods?.includes('generateContent')) continue;
        const [, version, family] = id.match(textModel);
        if (/preview|experimental|\bexp\b/i.test(item.displayName || '')) continue;
        const name = { flash: 'Flash', 'flash-lite': 'Flash-Lite', pro: 'Pro' }[family];
        models.set(id, { id, label: `${version} ${name}` });
    }
    return [...models.values()].sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true })).reverse();
}
function chooseDefault(models) {
    return models.find(model => textModel.exec(model.id)?.[2] === 'flash')?.id || models[0]?.id || '';
}
function selectCandidates(models) {
    // One candidate per family, highest stable version first; no probing a
    // succession of alternatives if a candidate fails.
    const sorted = [...models].sort((a, b) => b.id.localeCompare(a.id, 'en', { numeric: true }));
    return ['flash', 'flash-lite', 'pro'].map(family => sorted.find(model => textModel.exec(model.id)?.[2] === family)).filter(Boolean);
}
async function checkModel(key, model) {
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model.id)}:generateContent`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
            body: JSON.stringify({ contents: [{ parts: [{ text: 'Return only {"ok":true}.' }] }],
                generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 256 } }),
            signal: AbortSignal.timeout(20_000), redirect: 'error'
        });
        if (!response.ok) return { id: model.id, status: response.status };
        const data = await response.json();
        const answer = data.candidates?.[0]?.content?.parts?.filter(part => !part.thought).map(part => part.text || '').join('');
        if (JSON.parse(answer)?.ok !== true) return { id: model.id, status: 200, reason: 'invalid-answer' };
        return null;
    } catch (error) {
        return { id: model.id, reason: error.name === 'TimeoutError' ? 'timeout' : 'invalid-or-unavailable-answer' };
    }
}
async function fetchModels(key, entry) {
    const items = [];
    let token = '';
    const seen = new Set();
    const signal = AbortSignal.timeout(10_000);
    do {
        const url = new URL('https://generativelanguage.googleapis.com/v1beta/models');
        url.searchParams.set('pageSize', '1000');
        if (token) url.searchParams.set('pageToken', token);
        const response = await fetch(url, { headers: { 'x-goog-api-key': key }, signal, redirect: 'error' });
        if (!response.ok) {
            const failure = await response.json().catch(() => ({}));
            // Rejected credentials stay cached until backend configuration changes
            // or the process restarts. Never echo Google's raw error (or a key).
            if ([400, 401, 403].includes(response.status) || failure?.error?.details?.some?.(detail => detail?.reason === 'API_KEY_INVALID')) entry.expires = Infinity;
            throw new HttpError(502, 'Gemini-modellenlijst niet beschikbaar. Je bestaande keuze blijft behouden.');
        }
        const page = await response.json();
        if (page.models !== undefined && !Array.isArray(page.models)) throw new Error();
        items.push(...(page.models || []));
        token = typeof page.nextPageToken === 'string' ? page.nextPageToken : '';
        if (token && (seen.has(token) || seen.size >= 10)) throw new Error();
        if (token) seen.add(token);
    } while (token);
    const candidates = selectCandidates(normalizeModels(items));
    const models = [], rejected = [];
    for (const candidate of candidates) {
        const failure = await checkModel(key, candidate);
        if (failure) rejected.push(failure); else models.push(candidate);
    }
    return { models, defaultModel: chooseDefault(models), rejected };
}
function getGeminiModels() {
    // An explicit deployment catalog needs no paid probes when settings open.
    const configuredModels = [...new Set((env('GEMINI_MODELS') || '').split(',').map(value => value.trim()).filter(value => textModel.test(value)))];
    if (configuredModels.length) {
        const models = normalizeModels(configuredModels.map(id => ({ name: id, supportedGenerationMethods: ['generateContent'] })));
        const selected = env('GEMINI_MODEL');
        return Promise.resolve({ models, defaultModel: configuredModels.includes(selected) ? selected : chooseDefault(models), rejected: [], state: 'configured' });
    }
    const key = env('GEMINI_API_KEY');
    if (!key) return Promise.reject(new HttpError(503, 'Gemini-modellenlijst niet beschikbaar. Je bestaande keuze blijft behouden.'));
    if (!cached || cached.key !== key || cached.expires <= Date.now()) {
        const entry = { key, expires: Date.now() + 5 * 60_000 };
        entry.promise = fetchModels(key, entry).catch(error => {
            throw error instanceof HttpError ? error : new HttpError(502, 'Gemini-modellenlijst niet beschikbaar. Je bestaande keuze blijft behouden.');
        });
        cached = entry;
    }
    return cached.promise;
}
module.exports = { getGeminiModels, normalizeModels, chooseDefault, selectCandidates };

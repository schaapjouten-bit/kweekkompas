const { env, HttpError } = require('./http');

// Official model metadata, checked 2026-10-02. Never offer these unless
// models.list actually returns them with generateContent support.
// https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite
// https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite
const economicalModels = new Set(['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite']);
const textModel = /^gemini-(?:\d+(?:\.\d+)?-(?:flash-lite|flash|pro)(?:-preview(?:-\d+(?:-\d+)*)?|-\d{3})?|(?:flash-lite|flash|pro)-latest)$/;
let cached = null;

function normalizeModels(items) {
    const models = new Map();
    for (const item of items) {
        const id = typeof item?.name === 'string' ? item.name.replace(/^models\//, '') : '';
        // Audio/image/live models cannot serve the app's text + JSON requests.
        if (!textModel.test(id) || !item.supportedGenerationMethods?.includes('generateContent')) continue;
        models.set(id, { id, label: typeof item.displayName === 'string' ? item.displayName.slice(0, 128) : id,
            hint: economicalModels.has(id) ? 'snel en zuinig' : id.includes('-preview') ? 'preview' : 'tekstmodel' });
    }
    return [...models.values()].sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true })).reverse();
}
function chooseDefault(models) {
    return models.find(model => economicalModels.has(model.id))?.id
        || models.find(model => model.id.includes('-flash-lite') && !model.id.includes('-preview'))?.id
        || models.find(model => model.id.includes('-flash') && !model.id.includes('-preview') && model.id !== 'gemini-2.5-flash')?.id
        || models.find(model => !model.id.includes('-preview') && model.id !== 'gemini-2.5-flash')?.id
        || models.find(model => model.id !== 'gemini-2.5-flash')?.id || '';
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
    const models = normalizeModels(items);
    return { models, defaultModel: chooseDefault(models) };
}
function getGeminiModels() {
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
module.exports = { getGeminiModels, normalizeModels, chooseDefault };

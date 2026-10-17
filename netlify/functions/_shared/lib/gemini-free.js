const { HttpError } = require('./http');
const MODEL = 'gemini-3.5-flash-lite';
function validateKey(value) {
    if (typeof value !== 'string' || !value.trim() || value.length > 8192 || /[\x00-\x20\x7f]/.test(value.trim())) throw new HttpError(400, 'Vul je Gemini API-sleutel in bij Instellingen → AI → Gemini – Free tier.');
    return value.trim();
}
async function generate(apiKey, system, prompt, testing = false) {
    const key = validateKey(apiKey);
    let response;
    try {
        response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
            method: 'POST', redirect: 'error', signal: AbortSignal.timeout(testing ? 20000 : 45000),
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
            body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: 'application/json', ...(testing ? { maxOutputTokens: 1024 } : {}) } })
        });
    } catch { throw new HttpError(502, 'Gemini is niet bereikbaar of reageert te langzaam. Probeer opnieuw.'); }
    if (!response.ok) {
        if ([400, 401, 403].includes(response.status)) throw new HttpError(502, 'Gemini weigert de API-sleutel of toegang. Controleer je sleutel in Google AI Studio.');
        if (response.status === 429) throw new HttpError(429, 'De Gemini-limiet is bereikt. Wacht even of controleer je quotum in Google AI Studio.');
        if (response.status === 404) throw new HttpError(502, 'Gemini 3.5 Flash-Lite is niet beschikbaar voor deze API-sleutel.');
        throw new HttpError(502, `Gemini gaf een fout (${response.status}). Probeer later opnieuw.`);
    }
    const data = await response.json().catch(() => null);
    const text = data?.candidates?.[0]?.content?.parts?.filter(part => !part.thought).map(part => part.text || '').join('');
    if (!text) throw new HttpError(502, 'Gemini gaf geen bruikbaar antwoord. Probeer opnieuw.');
    return text;
}
module.exports = { MODEL, validateKey, generate };

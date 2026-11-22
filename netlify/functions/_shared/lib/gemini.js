const { HttpError } = require('./http');

function geminiModelId(value) {
    const model = typeof value === 'string' ? value.replace(/^models\//, '') : '';
    if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]{0,159}$/.test(model)) throw new HttpError(400, 'Kies een geldig Gemini-model.');
    return model;
}

async function generateGemini({ apiKey, model, system, prompt, testing = false, timeoutMs = 45_000 }) {
    const id = geminiModelId(model);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${id}:generateContent`;
    const generationConfig = { responseMimeType: 'application/json' };
    if (testing) {
        generationConfig.maxOutputTokens = 1024;
        if (id === 'gemini-4-neon') generationConfig.thinkingConfig = { thinkingLevel: 'LOW' };
    }
    let response;
    try {
        response = await fetch(url, {
            method: 'POST', redirect: 'error', signal: AbortSignal.timeout(testing ? 30_000 : timeoutMs),
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: system }] },
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig
            })
        });
    } catch (error) {
        if (error.name === 'TimeoutError') throw new HttpError(504, 'De AI-provider deed te lang over het antwoord. Je invoer is behouden. Probeer opnieuw.');
        throw new HttpError(502, 'Gemini is niet bereikbaar of reageert te langzaam.');
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
        const details = data?.error?.details;
        const invalidKey = Array.isArray(details) && details.some(detail => ['API_KEY_INVALID', 'API_KEY_EXPIRED'].includes(detail?.reason));
        if (invalidKey || response.status === 401) throw new HttpError(401, 'Ongeldige of verlopen Gemini API-sleutel (API_KEY_INVALID). Controleer je sleutel in Instellingen → AI of in de backend.');
        if (response.status === 403 || response.status === 404) throw new HttpError(response.status, 'Je Google-project heeft geen toegang tot het gekozen Gemini-model. Controleer modeltoegang en facturering in Google AI Studio.');
        if (response.status === 429) throw new HttpError(429, 'Het quotum voor dit Gemini-model is bereikt. Controleer je limieten in Google AI Studio of probeer het later opnieuw.');
        throw new HttpError(502, `Gemini weigerde de aanvraag (${response.status}). Controleer of het gekozen model JSON-antwoorden ondersteunt.`);
    }
    const parts = data?.candidates?.[0]?.content?.parts;
    const text = Array.isArray(parts) && parts.filter(part => !part?.thought).map(part => part?.text || '').join('');
    if (!text) throw new HttpError(502, 'Gemini gaf geen bruikbaar antwoord. Probeer opnieuw.');
    return text;
}

module.exports = { geminiModelId, generateGemini };

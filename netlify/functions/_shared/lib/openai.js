const { HttpError } = require('./http');

async function generateOpenAI({ apiKey, model, system, prompt, timeoutMs = 45_000 }) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,159}$/.test(model || '')) throw new HttpError(400, 'Kies een geldig GPT-model.');
    let response;
    try {
        response = await fetch('https://api.openai.com/v1/responses', {
            method: 'POST', redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({ model, instructions: system, input: prompt, text: { format: { type: 'json_object' } }, store: false })
        });
    } catch (error) {
        if (error.name === 'TimeoutError') throw new HttpError(504, 'OpenAI deed te lang over het antwoord. Probeer opnieuw.');
        throw new HttpError(502, 'OpenAI is niet bereikbaar. Probeer opnieuw.');
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
        if (response.status === 401) throw new HttpError(401, 'De OpenAI API-sleutel is ongeldig of verlopen.');
        if (response.status === 403 || response.status === 404 || data?.error?.code === 'model_not_found') throw new HttpError(403, 'Je OpenAI-project heeft geen toegang tot dit model.');
        if (response.status === 429) throw new HttpError(429, 'Het OpenAI-quotum of de snelheidslimiet is bereikt. Controleer je gebruik en probeer later opnieuw.');
        if (response.status === 400) {
            const code = data?.error?.code;
            const param = data?.error?.param;
            const message = typeof data?.error?.message === 'string' ? data.error.message : '';
            if (/organization.{0,40}verif|verif.{0,40}organization/i.test(message)) throw new HttpError(403, 'OpenAI vraagt om verificatie van de organisatie voor dit model.');
            if (/model.{0,80}(not supported|not available|does not exist|do not have access|not have access)/i.test(message)) throw new HttpError(403, 'Dit OpenAI-project heeft geen toegang tot het gekozen model.');
            if (/insufficient.quota|billing|credit balance/i.test(message)) throw new HttpError(429, 'Controleer de tegoeden en facturering van je OpenAI API-project.');
            if (/json_object.{0,80}(not supported|unsupported)|json.mode.{0,80}(not supported|unsupported)/i.test(message)) throw new HttpError(400, 'Het gekozen model accepteert deze JSON-instelling niet.');
            if (code === 'unsupported_value' || code === 'unsupported_parameter' || code === 'unknown_parameter' || code === 'invalid_value' || code === 'missing_required_parameter') {
                const parameters = ['model', 'input', 'instructions', 'text.format', 'text.format.type', 'store'];
                const field = parameters.includes(param) ? ` bij ${param}` : '';
                throw new HttpError(400, `OpenAI heeft een onderdeel van de aanvraag afgewezen${field} (${code}).`);
            }
            if (code === 'model_not_found' || code === 'model_not_supported') throw new HttpError(403, 'Je OpenAI-project heeft geen toegang tot dit model.');
            if (code === 'insufficient_quota' || code === 'billing_hard_limit_reached') throw new HttpError(429, 'Het OpenAI-quotum is bereikt. Controleer je gebruik en facturering.');
            throw new HttpError(400, 'OpenAI heeft de aanvraag afgewezen (HTTP 400). De exacte oorzaak is niet beschikbaar in de foutcode.');
        }
        throw new HttpError(502, `OpenAI kon de aanvraag niet verwerken (HTTP ${response.status}). Probeer opnieuw.`);
    }
    const text = (data?.output || []).flatMap(item => item.content || []).filter(item => item.type === 'output_text').map(item => item.text || '').join('');
    if (!text || data.status === 'incomplete') throw new HttpError(502, 'OpenAI gaf geen volledig antwoord. Probeer opnieuw.');
    return text;
}
module.exports = { generateOpenAI };

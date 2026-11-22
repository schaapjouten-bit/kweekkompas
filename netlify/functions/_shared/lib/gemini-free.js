const { env, HttpError } = require('./http');
const { authenticate, readCookies } = require('./supabase');
const { generateGemini } = require('./gemini');

const MODEL = 'gemini-3.5-flash-lite';
const configured = () => Boolean(env('GEMINI_FREE_API_KEY')?.trim());
const loginRequired = 'Log in bij KweekKompas om Gemini – Free tier te gebruiken.';

async function authorize(event) {
    const cookies = readCookies(event);
    if (!cookies.kk_access && !cookies.kk_refresh) throw new HttpError(401, loginRequired);
    let session;
    try { session = await authenticate(event); }
    catch (error) {
        if (error.status === 401) throw new HttpError(401, loginRequired);
        throw error;
    }
    if (!configured()) throw new HttpError(503, 'Gemini – Free tier is nog niet ingesteld. De gedeelde sleutel ontbreekt.');
    return session;
}

async function generate(session, system, prompt, { timeoutMs } = {}) {
    if (!session) throw new HttpError(401, loginRequired);
    const apiKey = env('GEMINI_FREE_API_KEY')?.trim();
    if (!apiKey) throw new HttpError(503, 'Gemini – Free tier is nog niet ingesteld. De gedeelde sleutel ontbreekt.');
    let quota;
    try { quota = await session.db.rpc('reserve_gemini_free_request'); }
    catch { throw new HttpError(503, 'De gebruikslimiet van Gemini – Free tier kan nu niet worden gecontroleerd.'); }
    if (quota.error || typeof quota.data !== 'boolean') throw new HttpError(503, 'De gebruikslimiet van Gemini – Free tier kan nu niet worden gecontroleerd.');
    if (!quota.data) throw new HttpError(429, 'Je daglimiet voor Gemini – Free tier is bereikt. Probeer het morgen opnieuw.');
    try { return await generateGemini({ apiKey, model: MODEL, system, prompt, timeoutMs }); }
    catch (error) {
        if (error.status === 429) throw new HttpError(429, 'Het gedeelde Gemini-quotum is bereikt. Probeer het later opnieuw.');
        if (error.status === 504) throw error;
        throw new HttpError(502, 'Gemini – Free tier kan nu geen antwoord geven. Probeer het later opnieuw.');
    }
}

module.exports = { MODEL, configured, authorize, generate };

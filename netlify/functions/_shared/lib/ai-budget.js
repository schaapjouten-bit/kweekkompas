const { createClient } = require('./supabase-client.mjs');
const { env, HttpError } = require('./http');
async function action(name, params = {}) {
    const secret = env('SUPABASE_SECRET_KEY')?.trim(), url = env('SUPABASE_URL')?.trim();
    if (!secret || !url) throw new HttpError(503, 'AI-gebruik kan momenteel niet worden gecontroleerd.');
    const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    let result;
    try { result = await db.rpc('kweek_ai_budget', { p_action: name, ...params }); }
    catch { throw new HttpError(503, 'AI-gebruik kan momenteel niet worden gecontroleerd.'); }
    if (result.error || !result.data || typeof result.data !== 'object') throw new HttpError(503, 'AI-gebruik kan momenteel niet worden gecontroleerd.');
    return result.data;
}
module.exports = { action };

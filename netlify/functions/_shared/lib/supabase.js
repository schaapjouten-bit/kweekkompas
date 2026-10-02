const { createClient } = require('@supabase/supabase-js');
const { env, HttpError, headersOf } = require('./http');
const publicKey = () => env('SUPABASE_PUBLISHABLE_KEY')?.trim() || env('SUPABASE_ANON_KEY')?.trim();
function configured() { return Boolean(env('SUPABASE_URL')?.trim() && publicKey()); }
const authUnavailable = error => error && (!Number.isFinite(error.status) || error.status === 0 || error.status >= 500);
function client(token) {
    if (!configured()) throw new HttpError(503, 'Supabase is nog niet geconfigureerd in de backend. Lokale gegevens blijven beschikbaar.');
    const key = publicKey();
    let role;
    try { role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role; } catch { /* publishable keys are opaque */ }
    if (key.startsWith('sb_secret_') || role === 'service_role') throw new HttpError(503, 'Gebruik een Supabase publishable/anon-sleutel in de backend, geen bevoorrechte sleutel.');
    return createClient(env('SUPABASE_URL').trim(), key, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        ...(token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : {})
    });
}
function cookies(session) {
    const secure = env('KWEEK_LOCAL_DEV') === 'true' ? '' : '; Secure';
    const make = (name, value, age) => `${name}=${encodeURIComponent(value || '')}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure}`;
    return [make('kk_access', session?.access_token, session ? session.expires_in || 3600 : 0),
        make('kk_refresh', session?.refresh_token, session ? 30 * 24 * 3600 : 0)];
}
function readCookies(event) {
    const result = {};
    for (const item of (headersOf(event).cookie || '').split(';')) {
        const i = item.indexOf('=');
        if (i < 0) continue;
        try { result[item.slice(0, i).trim()] = decodeURIComponent(item.slice(i + 1)); } catch { /* ignore malformed cookie */ }
    }
    return result;
}
async function authenticate(event) {
    const stored = readCookies(event);
    let token = stored.kk_access;
    let updatedCookies = [];
    const authClient = client();
    let user;
    if (token) {
        const result = await authClient.auth.getUser(token);
        if (!result.error) user = result.data.user;
        else if (authUnavailable(result.error)) throw new HttpError(503, 'Inloggen kan nu niet worden gecontroleerd. Probeer later opnieuw.');
    }
    if (!user && stored.kk_refresh) {
        const result = await authClient.auth.refreshSession({ refresh_token: stored.kk_refresh });
        if (authUnavailable(result.error)) throw new HttpError(503, 'Sessie vernieuwen is tijdelijk niet mogelijk.');
        if (!result.error && result.data.session) {
            token = result.data.session.access_token;
            // Verify against Auth, rather than trusting decoded JWT claims.
            const verified = await authClient.auth.getUser(token);
            if (authUnavailable(verified.error)) throw new HttpError(503, 'Inloggen kan nu niet worden gecontroleerd. Probeer later opnieuw.');
            if (!verified.error) { user = verified.data.user; updatedCookies = cookies(result.data.session); }
        }
    }
    if (!user || user.is_anonymous) throw new HttpError(401, 'Log in om deze functie te gebruiken.');
    event.responseCookies = updatedCookies;
    return { user, db: client(token), cookies: updatedCookies, token };
}
module.exports = { configured, client, cookies, readCookies, authenticate, authUnavailable };

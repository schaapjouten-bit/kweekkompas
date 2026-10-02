const { endpoint, readBody, reply, HttpError } = require('./lib/http');
const { configured, client, cookies, readCookies, authenticate, authUnavailable } = require('./lib/supabase');
exports.handler = endpoint(async event => {
    if (event.httpMethod === 'GET') {
        if (!configured()) return reply(200, { configured: false, user: null });
        try {
            const session = await authenticate(event);
            return reply(200, { configured: true, user: { id: session.user.id, email: session.user.email } }, session.cookies);
        } catch (error) {
            if (error.status !== 401) throw error;
            return reply(200, { configured: true, user: null }, cookies(null));
        }
    }
    if (event.httpMethod !== 'POST') throw new HttpError(405, 'Gebruik GET of POST.');
    const body = readBody(event);
    if (body.action === 'logout') {
        const stored = readCookies(event);
        let token;
        if (configured() && (stored.kk_access || stored.kk_refresh)) {
            try { token = (await authenticate(event)).token; }
            catch (error) { if (error.status !== 401) throw error; }
        }
        if (token) {
            const result = await client().auth.admin.signOut(token, 'local');
            if (result.error && result.error.status !== 401 && result.error.status !== 403) throw new HttpError(503, 'Uitloggen bij Supabase is tijdelijk niet mogelijk.');
        }
        return reply(200, { user: null }, cookies(null));
    }
    if (body.action !== 'login' || typeof body.email !== 'string' || typeof body.password !== 'string' || body.email.length > 320 || body.password.length > 1024) throw new HttpError(400, 'Vul je e-mailadres en wachtwoord in.');
    const result = await client().auth.signInWithPassword({ email: body.email, password: body.password });
    if (authUnavailable(result.error)) throw new HttpError(503, 'Supabase is tijdelijk niet bereikbaar. Je lokale gegevens blijven beschikbaar.');
    if (result.error || !result.data.session) throw new HttpError(result.error?.status === 429 ? 429 : 401, 'Inloggen mislukt. Controleer je gegevens en of je e-mailadres bevestigd is.');
    return reply(200, { configured: true, user: { id: result.data.user.id, email: result.data.user.email } }, cookies(result.data.session));
});

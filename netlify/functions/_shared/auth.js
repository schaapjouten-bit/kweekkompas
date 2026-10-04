const { endpoint, readBody, reply, HttpError, headersOf, env } = require('./lib/http');
const { configured, client, cookies, readCookies, authenticate, authUnavailable } = require('./lib/supabase');
function redirectURL(event) {
    const origin = headersOf(event).origin;
    if (env('KWEEK_LOCAL_DEV') === 'true' && /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) return origin + '/';
    return 'https://kweekkompas.netlify.app/';
}
function checkAuth(error) {
    if (!error) return;
    if (authUnavailable(error)) throw new HttpError(503, 'De accountdienst is tijdelijk niet bereikbaar. Je lokale tuin blijft beschikbaar.');
    const messages = {
        email_not_confirmed: 'Bevestig eerst je e-mailadres via de bevestigingsmail. Kijk ook in je spammap.',
        invalid_credentials: 'Inloggen mislukt. Je e-mailadres of wachtwoord klopt niet. Gebruik zo nodig Wachtwoord vergeten.',
        signup_disabled: 'Account aanmaken staat nog uit in de accountdienst. De beheerder moet Allow new users to sign up inschakelen.',
        email_provider_disabled: 'Inloggen met e-mail staat nog uit in de accountdienst.',
        weak_password: 'Kies een sterker wachtwoord van minimaal 8 tekens.',
        same_password: 'Kies een ander wachtwoord dan je huidige wachtwoord.',
        user_already_exists: 'Er is al een account met dit e-mailadres. Log in of kies Wachtwoord vergeten.',
        otp_expired: 'Deze link is verlopen of al gebruikt. Vraag een nieuwe bevestigings- of herstelmail aan.',
        over_email_send_rate_limit: 'Er zijn te snel achter elkaar mails aangevraagd. Wacht even en probeer opnieuw.'
    };
    throw new HttpError(error.status === 429 ? 429 : 400, messages[error.code] || (error.status === 429 ? 'Te veel pogingen. Wacht even en probeer opnieuw.' : 'De accountaanvraag is mislukt. Controleer je gegevens of vraag een nieuwe link aan.'));
}
const recoveryCookie = value => `kk_recovery=${value || ''}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${value ? 900 : 0}${env('KWEEK_LOCAL_DEV') === 'true' ? '' : '; Secure'}`;
const account = data => ({ configured: true, user: { id: data.user.id, email: data.user.email } });
exports.handler = endpoint(async event => {
    if (event.httpMethod === 'GET') {
        if (!configured()) return reply(200, { configured: false, user: null });
        try {
            const session = await authenticate(event);
            return reply(200, { configured: true, user: { id: session.user.id, email: session.user.email }, recovery: readCookies(event).kk_recovery === session.user.id }, session.cookies);
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
        return reply(200, { user: null }, [...cookies(null), recoveryCookie(null)]);
    }
    if (body.action === 'callback') {
        if (!['signup', 'email', 'recovery'].includes(body.type)) throw new HttpError(400, 'Ongeldige accountlink. Vraag een nieuwe mail aan.');
        const auth = client();
        let result;
        if (typeof body.token_hash === 'string' && body.token_hash.length <= 2048) result = await auth.auth.verifyOtp({ token_hash: body.token_hash, type: body.type });
        else if (typeof body.access_token === 'string' && typeof body.refresh_token === 'string' && body.access_token.length <= 16000 && body.refresh_token.length <= 4096) result = await auth.auth.setSession({ access_token: body.access_token, refresh_token: body.refresh_token });
        else throw new HttpError(400, 'De accountlink is onvolledig. Vraag een nieuwe mail aan.');
        checkAuth(result.error);
        if (!result.data.session || !result.data.user || result.data.user.is_anonymous) throw new HttpError(401, 'De accountlink is niet geldig.');
        const recovery = body.type === 'recovery';
        return reply(200, { ...account(result.data), recovery }, [...cookies(result.data.session), recoveryCookie(recovery ? result.data.user.id : null)]);
    }
    if (body.action === 'password') {
        if (typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 1024) throw new HttpError(400, 'Gebruik een wachtwoord van 8 tot 1024 tekens.');
        const session = await authenticate(event);
        if (readCookies(event).kk_recovery !== session.user.id) throw new HttpError(401, 'Open eerst een geldige herstel-link uit je mail.');
        const auth = client();
        const stored = readCookies(event);
        const refreshed = readCookies({ headers: { cookie: session.cookies.map(value => value.split(';')[0]).join('; ') } });
        const restored = await auth.auth.setSession({ access_token: session.token, refresh_token: refreshed.kk_refresh || stored.kk_refresh });
        checkAuth(restored.error);
        const result = await auth.auth.updateUser({ password: body.password });
        checkAuth(result.error);
        const current = await auth.auth.getSession();
        return reply(200, { ...account(result.data), recovery: false }, [...cookies(current.data.session), recoveryCookie(null)]);
    }
    if (!['login', 'signup', 'reset', 'resend'].includes(body.action) || typeof body.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) || body.email.length > 320) throw new HttpError(400, 'Vul een geldig e-mailadres in.');
    if (body.action === 'reset' || body.action === 'resend') {
        const auth = client();
        const result = body.action === 'reset' ? await auth.auth.resetPasswordForEmail(body.email, { redirectTo: redirectURL(event) }) : await auth.auth.resend({ type: 'signup', email: body.email, options: { emailRedirectTo: redirectURL(event) } });
        checkAuth(result.error);
        return reply(200, { message: body.action === 'reset' ? 'Als er een KweekKompas-account bestaat voor dit adres, ontvang je een herstelmail. Open de link om een nieuw wachtwoord in te stellen. Kijk ook in je spammap.' : 'Als je account nog bevestigd moet worden, ontvang je een bevestigingsmail. Open de link en keer terug naar KweekKompas. Kijk ook in je spammap.' });
    }
    if (typeof body.password !== 'string' || !body.password || body.password.length > 1024 || (body.action === 'signup' && body.password.length < 8)) throw new HttpError(400, 'Vul een wachtwoord in (bij een nieuw account minimaal 8 tekens).');
    if (body.action === 'signup') {
        const result = await client().auth.signUp({ email: body.email, password: body.password, options: { emailRedirectTo: redirectURL(event) } });
        checkAuth(result.error);
        return reply(200, { message: 'Controleer je mailbox en spammap. Als dit adres kan worden geregistreerd, ontvang je een bevestigingsmail. Open de link om je KweekKompas-account te bevestigen. Heb je al een account? Log in of kies Wachtwoord vergeten.' });
    }
    const result = await client().auth.signInWithPassword({ email: body.email, password: body.password });
    try { checkAuth(result.error); } catch (error) { if (result.error?.code === 'invalid_credentials') error.status = 401; throw error; }
    if (!result.data.session) throw new HttpError(401, 'Inloggen mislukt.');
    return reply(200, account(result.data), [...cookies(result.data.session), recoveryCookie(null)]);
});

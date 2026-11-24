const crypto = require('node:crypto');
const { endpoint, readBody, reply, HttpError, headersOf, env } = require('./lib/http');
const { configured, client, cookies, readCookies, authenticate, authUnavailable } = require('./lib/supabase');
const RECOVERY_TTL_SECONDS = 900;
function sessionBinding(token) {
    if (typeof token !== 'string' || !token) return '';
    const parts = token.split('.');
    if (parts.length === 3) {
        try {
            const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
            if (typeof claims?.session_id === 'string' && claims.session_id) return `sid:${claims.session_id}`;
        } catch { /* Opaque test tokens fall back to a SHA-256 token digest. */ }
    }
    return `tok:${crypto.createHash('sha256').update(token).digest('base64url')}`;
}
let localDevRecoveryKey = null;
function recoveryKey() {
    const secret = env('RECOVERY_COOKIE_SECRET')?.trim() || '';
    if (secret.length >= 16) {
        return crypto.createHash('sha256').update(`kweekkompas:kk_recovery:v1:${env('SUPABASE_URL')?.trim() || ''}:${secret}`).digest();
    }
    if (env('KWEEK_LOCAL_DEV') === 'true') {
        localDevRecoveryKey ||= crypto.randomBytes(32);
        return localDevRecoveryKey;
    }
    return null;
}
function signRecovery(userId, token, exp) {
    const key = recoveryKey();
    const binding = sessionBinding(token);
    if (!key || !userId || !binding || !Number.isSafeInteger(exp)) return null;
    const mac = crypto.createHmac('sha256', key).update(`v1:${userId}:${binding}:${exp}`).digest('base64url');
    return `${exp}.${mac}`;
}
function issueRecoveryCookie(userId, token, nowMs = Date.now()) {
    const exp = Math.floor(nowMs / 1000) + RECOVERY_TTL_SECONDS;
    const signed = signRecovery(userId, token, exp);
    if (!signed) throw new HttpError(503, 'Wachtwoordherstel is nog niet volledig geconfigureerd op de server.');
    return recoveryCookie(signed);
}
function validRecoveryCookie(rawValue, userId, token, nowMs = Date.now()) {
    if (typeof rawValue !== 'string' || !rawValue || !userId || !token) return false;
    const dot = rawValue.indexOf('.');
    if (dot <= 0 || rawValue.indexOf('.', dot + 1) !== -1) return false;
    const expText = rawValue.slice(0, dot);
    const macText = rawValue.slice(dot + 1);
    if (!/^\d{1,12}$/.test(expText) || !/^[A-Za-z0-9_-]{32,64}$/.test(macText)) return false;
    const exp = Number(expText);
    const nowSec = Math.floor(nowMs / 1000);
    if (!Number.isSafeInteger(exp) || exp <= nowSec || exp > nowSec + RECOVERY_TTL_SECONDS + 5) return false;
    const expected = signRecovery(userId, token, exp);
    if (!expected) return false;
    const a = Buffer.from(rawValue);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}
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
const recoveryCookie = value => `kk_recovery=${value || ''}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${value ? RECOVERY_TTL_SECONDS : 0}${env('KWEEK_LOCAL_DEV') === 'true' ? '' : '; Secure'}`;
const account = data => ({ configured: true, user: { id: data.user.id, email: data.user.email } });
exports.handler = endpoint(async event => {
    if (event.httpMethod === 'GET') {
        if (!configured()) return reply(200, { configured: false, user: null });
        const stored = readCookies(event);
        if (!stored.kk_access && !stored.kk_refresh) return reply(200, { configured: true, user: null });
        try {
            const session = await authenticate(event);
            return reply(200, { configured: true, user: { id: session.user.id, email: session.user.email }, recovery: validRecoveryCookie(stored.kk_recovery, session.user.id, session.token) }, session.cookies);
        } catch (error) {
            if (error.status !== 401) throw error;
            // A session read can arrive after a successful login. Only logout clears cookies.
            return reply(200, { configured: true, user: null });
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
        let verifiedRecovery = false;
        if (body.type === 'recovery') {
            if (typeof body.token_hash !== 'string' || !body.token_hash || body.token_hash.length > 2048) throw new HttpError(400, 'Deze herstel-link is niet geldig of verouderd. Vraag een nieuwe herstelmail aan.');
            result = await auth.auth.verifyOtp({ token_hash: body.token_hash, type: 'recovery' });
            verifiedRecovery = true;
        } else if (typeof body.token_hash === 'string' && body.token_hash.length <= 2048) result = await auth.auth.verifyOtp({ token_hash: body.token_hash, type: body.type });
        else if (typeof body.access_token === 'string' && typeof body.refresh_token === 'string' && body.access_token.length <= 16000 && body.refresh_token.length <= 4096) result = await auth.auth.setSession({ access_token: body.access_token, refresh_token: body.refresh_token });
        else throw new HttpError(400, 'De accountlink is onvolledig. Vraag een nieuwe mail aan.');
        checkAuth(result.error);
        if (!result.data.session || !result.data.user || result.data.user.is_anonymous) throw new HttpError(401, 'De accountlink is niet geldig.');
        const recovery = verifiedRecovery;
        return reply(200, { ...account(result.data), recovery }, [...cookies(result.data.session), recovery ? issueRecoveryCookie(result.data.user.id, result.data.session.access_token) : recoveryCookie(null)]);
    }
    if (body.action === 'password') {
        if (typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 1024) throw new HttpError(400, 'Gebruik een wachtwoord van 8 tot 1024 tekens.');
        const session = await authenticate(event);
        const stored = readCookies(event);
        if (!validRecoveryCookie(stored.kk_recovery, session.user.id, session.token)) throw new HttpError(401, 'Open eerst een geldige herstel-link uit je mail.');
        const auth = client();
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

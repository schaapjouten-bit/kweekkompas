const { createClient } = require('./lib/supabase-client.mjs');
const { endpoint, readBody, reply, HttpError, env } = require('./lib/http');
const { authenticate } = require('./lib/supabase');
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const validPassword = value => typeof value === 'string' && value.length >= 8 && value.length <= 1024;
exports.handler = endpoint(async event => {
    if (event.httpMethod !== 'POST') throw new HttpError(405, 'Gebruik POST.');
    const session = await authenticate(event);
    if (session.user.app_metadata?.kweek_role !== 'admin') throw new HttpError(403, 'Alleen de beheerder kan gebruikers beheren.');
    const secret = env('SUPABASE_SECRET_KEY')?.trim(), url = env('SUPABASE_URL')?.trim();
    if (!secret || !url) throw new HttpError(503, 'Gebruikersbeheer is nog niet ingesteld.');
    const service = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const admin = service.auth.admin;
    const body = readBody(event);
    if (body.action === 'create') {
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        const email = typeof body.email === 'string' ? body.email.trim() : '';
        if (!name || name.length > 120 || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !validPassword(body.password)) throw new HttpError(400, 'Vul een naam, geldig e-mailadres en wachtwoord van minimaal 8 tekens in.');
        const { error } = await admin.createUser({ email, password: body.password, email_confirm: true, user_metadata: { name }, app_metadata: { kweek_role: 'user' } });
        if (error) throw new HttpError(error.status === 422 || error.status === 400 ? 400 : 503, 'Het account kon niet worden aangemaakt. Controleer de gegevens en of het e-mailadres al bestaat.');
        return reply(200, { ok: true }, session.cookies);
    }
    if (!['set-active', 'reset-password'].includes(body.action) || !uuid(body.userId) || body.userId === session.user.id) throw new HttpError(400, 'Ongeldige gebruikersactie.');
    if (body.action === 'set-active' && typeof body.active !== 'boolean') throw new HttpError(400, 'Ongeldige accountstatus.');
    if (body.action === 'reset-password' && !validPassword(body.password)) throw new HttpError(400, 'Gebruik een wachtwoord van minimaal 8 tekens.');
    const target = await admin.getUserById(body.userId);
    if (target.error || !target.data?.user) throw new HttpError(404, 'Gebruiker niet gevonden.');
    if (target.data.user.app_metadata?.kweek_role === 'admin') throw new HttpError(403, 'Een administratoraccount kan hier niet worden gewijzigd.');
    const revokedAt = Math.floor(Date.now() / 1000);
    const nextMeta = { ...(target.data.user.app_metadata || {}), kweek_session_not_before: revokedAt };
    const attrs = body.action === 'set-active'
        ? { ban_duration: body.active ? 'none' : '876000h', ...(body.active ? {} : { app_metadata: nextMeta }) }
        : { password: body.password, app_metadata: nextMeta };
    const result = await admin.updateUserById(body.userId, attrs);
    if (result.error) throw new HttpError(503, 'De gebruikersactie kon niet worden uitgevoerd.');
    if (body.action === 'reset-password' || (body.action === 'set-active' && !body.active)) {
        const revoked = await service.rpc('kweek_revoke_user_sessions', { p_user: body.userId });
        if (revoked.error) throw new HttpError(503, 'De gebruikersactie is uitgevoerd, maar bestaande sessies konden niet worden ingetrokken.');
    }
    return reply(200, { ok: true }, session.cookies);
});

const { endpoint, readBody, reply, HttpError } = require('./lib/http');
const { authenticate } = require('./lib/supabase');
const budget = require('./lib/ai-budget');
exports.handler = endpoint(async event => {
    if (event.httpMethod !== 'POST') throw new HttpError(405, 'Gebruik POST.');
    const session = await authenticate(event);
    const admin = session.user.app_metadata?.kweek_role === 'admin';
    const { action, userId, limit } = readBody(event);
    if (action === 'status' && !admin) {
        const data = await budget.action('status', { p_user: session.user.id });
        return reply(200, { remaining: data.remaining, limit: data.limit, month: data.month }, session.cookies);
    }
    if (!admin) throw new HttpError(403, 'Alleen de beheerder kan gebruikslimieten beheren.');
    if (action === 'list') return reply(200, await budget.action('admin-list'), session.cookies);
    if (!['set-default','set-limit','clear-limit'].includes(action)) throw new HttpError(400, 'Onbekende actie.');
    if (action !== 'set-default' && (typeof userId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId))) throw new HttpError(400, 'Ongeldige gebruiker.');
    if (action !== 'clear-limit' && (!Number.isSafeInteger(limit) || limit < 0 || limit > 1000000)) throw new HttpError(400, 'Gebruik een limiet tussen 0 en 1.000.000.');
    await budget.action(action, { ...(action === 'set-default' ? {} : { p_user: userId }), ...(action === 'clear-limit' ? {} : { p_limit: limit }) });
    return reply(200, { ok: true }, session.cookies);
});

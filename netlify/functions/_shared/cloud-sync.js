const { endpoint, readBody, reply, HttpError } = require('./lib/http');
const { authenticate } = require('./lib/supabase');
function checkStorage(error, message) {
    if (!error) return;
    if (['PGRST205', '42P01'].includes(error.code)) throw new HttpError(503, 'Cloudopslag moet nog worden ingericht op het Supabase-project. Je lokale tuin blijft behouden.');
    throw new HttpError(503, message);
}
exports.handler = endpoint(async event => {
    if (!['GET', 'POST'].includes(event.httpMethod)) throw new HttpError(405, 'Gebruik GET of POST.');
    const session = await authenticate(event);
    if (event.httpMethod === 'GET') {
        const { data, error } = await session.db.from('kweekkompas_snapshots').select('payload, revision, updated_at').eq('user_id', session.user.id).maybeSingle();
        checkStorage(error, 'Cloudopslag is niet beschikbaar. Controleer de Supabase-tabel en toegangsregels.');
        return reply(200, { snapshot: data, userId: session.user.id }, session.cookies);
    }
    const { payload, revision, expectedUserId } = readBody(event);
    if (expectedUserId !== session.user.id) throw new HttpError(409, 'Het ingelogde account is gewijzigd. Open Instellingen opnieuw.');
    if (!payload || payload.backupVersion !== 1 || !Array.isArray(payload.seeds) || !Number.isSafeInteger(revision) || revision < 0) throw new HttpError(400, 'Ongeldige back-up of cloudversie.');
    const next = { user_id: session.user.id, payload, revision: revision + 1, updated_at: new Date().toISOString() };
    // Compare-and-swap: stale devices cannot silently overwrite a newer copy.
    const query = revision === 0
        ? session.db.from('kweekkompas_snapshots').insert(next)
        : session.db.from('kweekkompas_snapshots').update(next).eq('user_id', session.user.id).eq('revision', revision);
    const { data, error } = await query.select('revision, updated_at');
    if (error?.code === '23505' || (!error && !data?.length)) throw new HttpError(409, 'De cloudkopie is gewijzigd op een ander apparaat. Lees eerst de nieuwe cloudstatus.');
    checkStorage(error, 'Opslaan in de cloud mislukt. Je lokale gegevens zijn behouden.');
    return reply(200, { ...data[0], userId: session.user.id }, session.cookies);
});

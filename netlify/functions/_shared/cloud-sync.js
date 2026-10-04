const { endpoint, readBody, reply, HttpError } = require('./lib/http');
const { authenticate } = require('./lib/supabase');
const cloudData = require('../../../cloud-data');
const { validateSnapshotPhotos } = require('./photos');
function checkStorage(error, message) {
    if (!error) return;
    if (['PGRST205', '42P01'].includes(error.code)) throw new HttpError(503, 'Cloudopslag moet nog worden ingericht op het Supabase-project. Je lokale tuin blijft behouden.');
    if (error.code === '23514') throw new HttpError(413, 'Deze tuin past niet binnen de ingestelde cloudopslaglimiet of het tuinformaat. Je lokale gegevens blijven volledig behouden.');
    throw new HttpError(503, message);
}
exports.handler = endpoint(async event => {
    if (!['GET', 'POST'].includes(event.httpMethod)) throw new HttpError(405, 'Gebruik GET of POST.');
    const session = await authenticate(event);
    if (event.httpMethod === 'GET') {
        const { data, error } = await session.db.from('kweekkompas_snapshots').select('payload, revision, updated_at').eq('user_id', session.user.id).maybeSingle();
        checkStorage(error, 'Cloudopslag is niet beschikbaar. Controleer de Supabase-tabel en toegangsregels.');
        // Older snapshots may include device settings. Never return them for restore.
        return reply(200, { snapshot: data ? { ...data, payload: cloudData.select(data.payload) } : null, userId: session.user.id }, session.cookies);
    }
    if (Buffer.byteLength(event.body || '') > 4_000_000) throw new HttpError(413, 'De aanvraag met tuingegevens is te groot voor de cloudkopie. Er is niets opgeslagen; je lokale tuin blijft behouden.');
    const { payload: input, revision, expectedUserId } = readBody(event);
    if (expectedUserId !== session.user.id) throw new HttpError(409, 'Het ingelogde account is gewijzigd. Open Instellingen opnieuw.');
    if (!Number.isSafeInteger(revision) || revision < 0) throw new HttpError(400, 'Ongeldige back-up of cloudversie.');
    let payload;
    try { payload = cloudData.select(input); }
    catch (error) { throw new HttpError(400, error.message); }
    try { cloudData.assertSize(payload); }
    catch (error) { throw new HttpError(413, error.message); }
    await validateSnapshotPhotos(session, payload);
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

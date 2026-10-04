const { authenticate } = require('./lib/supabase');
const { readBody, checkOrigin, reply, HttpError } = require('./lib/http');
const photos = require('../../../photo-storage');
const missing = error => ['404', 'NoSuchKey', 'not_found'].includes(String(error?.statusCode || error?.code));
function storageError(error) {
    if (/bucket.*not found|bucket.*does not exist/i.test(error?.message || '')) throw new HttpError(503, 'Private foto-opslag is nog niet ingericht. Voer eerst de SQL voor kweekkompas-photos uit. Je lokale tuin en cloudkopie blijven behouden.');
    throw new HttpError(503, 'Foto-opslag is niet bereikbaar of niet toegestaan. Controleer Storage-ruimte en gebruikersregels. Je lokale tuin en cloudkopie blijven behouden.');
}
async function info(session, path, allowMissing = false) {
    const { data, error } = await session.db.storage.from(photos.BUCKET).info(path);
    if (error) {
        if (!/bucket/i.test(error.message || '') && missing(error)) {
            if (allowMissing) return null;
            throw new HttpError(404, 'Een cloudfoto ontbreekt. Je lokale tuin en de bestaande cloudkopie blijven behouden.');
        }
        storageError(error);
    }
    if (!data) throw new HttpError(503, 'Foto-opslag gaf geen bestandsinformatie. Probeer later opnieuw.');
    return data;
}
async function validateSnapshotPhotos(session, payload) {
    let refs;
    try { refs = photos.references(payload, session.user.id, true); }
    catch (error) { throw new HttpError(400, error.message); }
    for (let offset = 0; offset < refs.length; offset += 8) {
        await Promise.all(refs.slice(offset, offset + 8).map(async ref => {
            const file = await info(session, ref.path);
            if (file.size > photos.MAX_FILE_BYTES || !file.size || file.contentType !== ref.mime) throw new HttpError(400, 'Een cloudfoto heeft een ongeldig formaat of omvang. De cloudkopie is niet vervangen.');
        }));
    }
}
async function handlePhotoAccess(event) {
    checkOrigin(event);
    if (event.httpMethod !== 'POST') throw new HttpError(405, 'Gebruik POST.');
    if (Buffer.byteLength(event.body || '') > 16000) throw new HttpError(413, 'Deze fotoaanvraag is te groot.');
    const session = await authenticate(event);
    const body = readBody(event);
    if (body.expectedUserId !== session.user.id) throw new HttpError(409, 'Het ingelogde account is gewijzigd. Fotoactie gestopt.');
    const storage = session.db.storage.from(photos.BUCKET);
    if (body.action === 'upload') {
        if (!/^[a-f0-9]{64}$/.test(body.sha256 || '') || !Object.hasOwn(photos.types, body.extension) || body.extension === 'jpg' || !Number.isSafeInteger(body.size) || body.size < 1 || body.size > photos.MAX_FILE_BYTES) throw new HttpError(400, 'Ongeldig fotoformaat, bestandspad of omvang (maximaal 1 MB per verwerkte foto).');
        const path = `${session.user.id}/${body.sha256}.${body.extension}`;
        const existing = await info(session, path, true);
        if (existing) {
            if (existing.size !== body.size || existing.contentType !== photos.types[body.extension]) throw new HttpError(409, 'De aanwezige cloudfoto wijkt af. Er is niets overschreven.');
            return reply(200, { path, userId: session.user.id, exists: true }, session.cookies);
        }
        const { data, error } = await storage.createSignedUploadUrl(path, { upsert: false });
        if (error) storageError(error);
        return reply(200, { path, userId: session.user.id, exists: false, signedUrl: data.signedUrl }, session.cookies);
    }
    if (body.action === 'download') {
        let ref;
        try { ref = photos.parseReference(photos.PREFIX + body.path, session.user.id); }
        catch { throw new HttpError(403, 'Deze foto hoort niet bij het ingelogde account.'); }
        const file = await info(session, ref.path);
        if (file.size > photos.MAX_LEGACY_FILE_BYTES || !file.size || file.contentType !== ref.mime) throw new HttpError(400, 'De cloudfoto heeft een ongeldig formaat of omvang. Je lokale tuin is niet vervangen.');
        const { data, error } = await storage.createSignedUrl(ref.path, 60);
        if (error) storageError(error);
        return reply(200, { path: ref.path, userId: session.user.id, signedUrl: data.signedUrl, expiresAt: new Date(Date.now() + 60000).toISOString() }, session.cookies);
    }
    throw new HttpError(400, 'Onbekende fotoactie.');
}
module.exports = { handlePhotoAccess, validateSnapshotPhotos };

class HttpError extends Error {
    constructor(status, message) { super(message); this.status = status; }
}
const env = name => globalThis.Netlify?.env?.get(name) ?? process.env[name];
const headersOf = event => Object.fromEntries(Object.entries(event.headers || {}).map(([key, value]) => [key.toLowerCase(), value]));
function checkOrigin(event) {
    const headers = headersOf(event);
    if (event.httpMethod === 'GET') return;
    const host = headers['x-forwarded-host'] || headers.host;
    const protocol = headers['x-forwarded-proto'] || (env('KWEEK_LOCAL_DEV') === 'true' ? 'http' : 'https');
    if (!host || headers.origin !== `${protocol}://${host}`) throw new HttpError(403, 'Deze aanvraag komt niet van KweekKompas.');
}
function readBody(event) {
    if (Buffer.byteLength(event.body || '') > 4_000_000) throw new HttpError(413, 'Deze gegevens zijn te groot (maximaal 4 MB).');
    try { return JSON.parse(event.body || '{}'); }
    catch { throw new HttpError(400, 'Ongeldige JSON.'); }
}
function reply(statusCode, data, cookies = []) {
    return { statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
        ...(cookies.length ? { multiValueHeaders: { 'Set-Cookie': cookies } } : {}), body: JSON.stringify(data) };
}
function endpoint(handler) {
    return async event => {
        try { checkOrigin(event); return await handler(event); }
        catch (error) { return reply(error.status || 502, { error: error.status ? error.message : 'De externe dienst is niet bereikbaar. Probeer later opnieuw.' }, event.responseCookies || []); }
    };
}
module.exports = { env, HttpError, headersOf, readBody, reply, endpoint };

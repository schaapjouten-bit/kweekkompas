const crypto = require('node:crypto');
const { createClient } = require('./supabase-client.mjs');
const { env, HttpError } = require('./http');
const { generateGemini } = require('./gemini');

const MODEL = 'gemini-3.5-flash-lite';
const BUCKET = 'kweekkompas-ai-config';
const PATH = 'central-gemini.json';
const AAD = Buffer.from('kweekkompas:central-gemini:v1');
function encryptionKey() {
    const raw = env('KWEEK_CENTRAL_AI_ENCRYPTION_KEY')?.trim() || '';
    if (!raw) {
        console.warn('[KweekKompas] Centrale AI: KWEEK_CENTRAL_AI_ENCRYPTION_KEY ontbreekt.');
        throw new HttpError(503, 'Centrale AI-opslag is nog niet ingesteld.');
    }
    if (!/^[A-Za-z0-9+/]{43}=$/.test(raw)) {
        console.warn(`[KweekKompas] Centrale AI: KWEEK_CENTRAL_AI_ENCRYPTION_KEY heeft ongeldig formaat (lengte ${raw.length}).`);
        throw new HttpError(503, 'Centrale AI-opslag is nog niet ingesteld.');
    }
    const key = Buffer.from(raw, 'base64');
    if (key.length !== 32 || key.toString('base64') !== raw) {
        console.warn(`[KweekKompas] Centrale AI: KWEEK_CENTRAL_AI_ENCRYPTION_KEY heeft ongeldige sleutellengte (${key.length} bytes).`);
        throw new HttpError(503, 'Centrale AI-opslag is nog niet ingesteld.');
    }
    return key;
}
function encrypt(value, key = encryptionKey()) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(AAD);
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return JSON.stringify({ version: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') });
}
function decrypt(text, key = encryptionKey()) {
    try {
        const data = JSON.parse(text);
        if (data.version !== 1) throw Error();
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(data.iv, 'base64'));
        decipher.setAAD(AAD); decipher.setAuthTag(Buffer.from(data.tag, 'base64'));
        const value = Buffer.concat([decipher.update(Buffer.from(data.ciphertext, 'base64')), decipher.final()]).toString('utf8');
        if (!/^[\x21-\x7e]{1,8192}$/.test(value)) throw Error();
        return value;
    } catch { throw new HttpError(503, 'De centrale AI-sleutel kan niet worden gelezen.'); }
}
function storage() {
    const secret = env('SUPABASE_SECRET_KEY')?.trim();
    const url = env('SUPABASE_URL')?.trim();
    if (!url || !secret) {
        const missing = [!url && 'SUPABASE_URL', !secret && 'SUPABASE_SECRET_KEY'].filter(Boolean).join(', ');
        console.warn(`[KweekKompas] Centrale AI-opslag ontbreekt configuratie: ${missing}.`);
        throw new HttpError(503, 'Centrale AI-opslag is nog niet ingesteld.');
    }
    return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }).storage.from(BUCKET);
}
async function readKey() {
    const key = encryptionKey();
    const { data, error } = await storage().download(PATH);
    if (error) {
        if (Number(error.status || error.statusCode) === 404 || error.code === 'NoSuchKey') return null;
        console.warn('[KweekKompas] Centrale AI-opslag fout:', error.status || error.statusCode || error.code || 'onbekend');
        throw new HttpError(503, 'Centrale AI-opslag is tijdelijk niet bereikbaar.');
    }
    return decrypt(await data.text(), key);
}
async function writeKey(value) {
    const encrypted = encrypt(value);
    const { error } = await storage().upload(PATH, Buffer.from(encrypted), { upsert: true, contentType: 'application/json', cacheControl: '0' });
    if (error) {
        console.warn('[KweekKompas] Centrale AI-opslag fout:', error.status || error.statusCode || error.code || 'onbekend');
        throw new HttpError(503, 'De centrale AI-sleutel kon niet worden opgeslagen.');
    }
}
async function testKey(apiKey) {
    const answer = await generateGemini({ apiKey, model: MODEL, testing: true, system: 'Geef alleen het gevraagde JSON-object terug.', prompt: 'Antwoord met {"ok":true}.' });
    try { if (JSON.parse(answer)?.ok === true) return; } catch { /* Safe generic error below. */ }
    throw new HttpError(502, 'De verbinding gaf geen geldig testantwoord.');
}
module.exports = { MODEL, BUCKET, encrypt, decrypt, readKey, writeKey, testKey };

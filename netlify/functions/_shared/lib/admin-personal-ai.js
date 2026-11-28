const crypto = require('node:crypto');
const { createClient } = require('./supabase-client.mjs');
const { env, HttpError } = require('./http');

const BUCKET = 'kweekkompas-ai-config';
const PATH = 'admin-personal-ai.json';
const AAD = Buffer.from('kweekkompas:admin-personal-ai:v1');

function encryptionKey() {
    const raw = env('KWEEK_CENTRAL_AI_ENCRYPTION_KEY')?.trim() || '';
    if (!/^[A-Za-z0-9+/]{43}=$/.test(raw)) throw new HttpError(503, 'Persoonlijke AI-opslag is nog niet ingesteld.');
    const key = Buffer.from(raw, 'base64');
    if (key.length !== 32 || key.toString('base64') !== raw) throw new HttpError(503, 'Persoonlijke AI-opslag is nog niet ingesteld.');
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
        const parsed = JSON.parse(Buffer.concat([decipher.update(Buffer.from(data.ciphertext, 'base64')), decipher.final()]).toString('utf8'));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw Error();
        return parsed;
    } catch { throw new HttpError(503, 'De persoonlijke AI-sleutels kunnen niet worden gelezen.'); }
}

function storage() {
    const secret = env('SUPABASE_SECRET_KEY')?.trim();
    const url = env('SUPABASE_URL')?.trim();
    if (!url || !secret) throw new HttpError(503, 'Persoonlijke AI-opslag is nog niet ingesteld.');
    return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }).storage.from(BUCKET);
}

async function readKeys() {
    const key = encryptionKey();
    const { data, error } = await storage().download(PATH);
    if (error) {
        if (Number(error.status || error.statusCode) === 404 || error.code === 'NoSuchKey') return {};
        throw new HttpError(503, 'Persoonlijke AI-opslag is tijdelijk niet bereikbaar.');
    }
    return decrypt(await data.text(), key);
}

async function readKey(provider) {
    const keys = await readKeys();
    const value = keys?.[provider];
    return typeof value === 'string' && /^[\x21-\x7e]{1,8192}$/.test(value) ? value : null;
}

async function writeKey(provider, value) {
    if (!['gemini', 'openai'].includes(provider)) throw new HttpError(400, 'Onbekende AI-provider.');
    const current = await readKeys().catch(error => (error.status === 503 && error.message.includes('gelezen') ? {} : Promise.reject(error)));
    const next = { ...current, [provider]: value };
    const encrypted = encrypt(JSON.stringify(next));
    const { error } = await storage().upload(PATH, Buffer.from(encrypted), { upsert: true, contentType: 'application/json', cacheControl: '0' });
    if (error) throw new HttpError(503, 'De persoonlijke AI-sleutel kon niet worden opgeslagen.');
}

module.exports = { BUCKET, PATH, readKeys, readKey, writeKey };

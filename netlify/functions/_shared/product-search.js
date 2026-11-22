const { endpoint, readBody, reply, env, HttpError } = require('./lib/http');
const { authenticate, configured } = require('./lib/supabase');
const dns = require('node:dns/promises');
const net = require('node:net');
const https = require('node:https');

function publicAddress(address) {
    if (net.isIP(address) !== 4) return false;
    const [a, b] = address.split('.').map(Number);
    return a !== 0 && a !== 10 && a !== 127 && a < 224 && !(a === 169 && b === 254) && !(a === 172 && b >= 16 && b <= 31) && !(a === 192 && (b === 168 || b === 0)) && !(a === 100 && b >= 64 && b <= 127) && !(a === 198 && (b === 18 || b === 19));
}

async function pageText(link) {
    let url;
    try { url = new URL(link); } catch { throw new HttpError(400, 'Gebruik een geldige HTTPS-productlink.'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.port || net.isIP(url.hostname)) throw new HttpError(400, 'Gebruik een openbare HTTPS-productlink.');
    let addresses;
    try { addresses = await dns.lookup(url.hostname, { all: true, family: 4 }); } catch { throw new HttpError(502, 'De productpagina kon niet worden gevonden.'); }
    if (!addresses.length || addresses.some(item => !publicAddress(item.address))) throw new HttpError(400, 'Deze productlink kan niet worden geopend.');
    const html = await new Promise((resolve, reject) => {
        const req = https.get(url, { lookup: (_host, _options, callback) => callback(null, addresses[0].address, 4), timeout: 12000, headers: { 'User-Agent': 'KweekKompas/1.0', Accept: 'text/html' } }, response => {
            if (response.statusCode !== 200 || !String(response.headers['content-type'] || '').includes('text/html')) { response.resume(); reject(new HttpError(502, 'De productpagina kon niet als tekst worden gelezen. Gebruik etikettekst of een andere link.')); return; }
            let data = '';
            response.setEncoding('utf8');
            response.on('data', chunk => { data += chunk; if (data.length > 1_000_000) req.destroy(); });
            response.on('end', () => resolve(data));
            response.on('error', reject);
        });
        req.on('timeout', () => req.destroy());
        req.on('error', () => reject(new HttpError(502, 'De productpagina is niet bereikbaar.')));
    });
    return html.replace(/<(script|style|noscript|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/\s+/g, ' ').trim().slice(0, 40000);
}

exports.handler = endpoint(async event => {
    if (event.httpMethod !== 'POST') throw new HttpError(405, 'Gebruik POST.');
    if (configured()) await authenticate(event);
    else if (env('KWEEK_LOCAL_DEV') !== 'true') throw new HttpError(503, 'Log in om productinformatie op te zoeken.');
    const body = readBody(event);
    if (body.action === 'page') return reply(200, { text: await pageText(body.url) });
    if (body.action !== 'search' || typeof body.brand !== 'string' || typeof body.name !== 'string' || !body.brand.trim() || !body.name.trim()) throw new HttpError(400, 'Vul merk en productnaam in.');
    const key = env('BRAVE_SEARCH_API_KEY');
    if (!key) throw new HttpError(503, 'Automatisch zoeken vereist BRAVE_SEARCH_API_KEY op de server. Je kunt hieronder een productlink of etikettekst gebruiken.');
    const query = new URL('https://api.search.brave.com/res/v1/web/search');
    query.searchParams.set('q', `${body.brand.slice(0, 100)} ${body.name.slice(0, 150)} voeding fabrikant`);
    query.searchParams.set('count', '10');
    let response;
    try { response = await fetch(query, { headers: { Accept: 'application/json', 'X-Subscription-Token': key }, signal: AbortSignal.timeout(12000) }); } catch { throw new HttpError(502, 'De zoekdienst is niet bereikbaar.'); }
    if (!response.ok) throw new HttpError(502, 'De zoekdienst heeft de aanvraag geweigerd. Controleer de zoekconfiguratie.');
    const data = await response.json();
    const results = (data.web?.results || []).filter(item => typeof item.title === 'string' && typeof item.url === 'string' && item.url.startsWith('https://')).slice(0, 10).map(item => ({ title: item.title, url: item.url, description: String(item.description || '').slice(0, 300) }));
    return reply(200, { results });
});

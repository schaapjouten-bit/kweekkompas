const { endpoint, readBody, reply, HttpError, env } = require('./lib/http');
const { configured, authenticate, readCookies } = require('./lib/supabase');
const cache = new Map();
const filters = { all: '', plant: 'plant', flower: 'flower', leaf: 'leaf', fruit: 'fruit', seeds: 'seeds' };
const translations = {
    tomaat: 'tomato', tomaten: 'tomato', paprika: 'bell pepper', paprikas: 'bell pepper', peper: 'chili pepper', pepers: 'chili pepper',
    komkommer: 'cucumber', komkommers: 'cucumber', courgette: 'zucchini', courgettes: 'zucchini', sla: 'lettuce', rucola: 'arugula',
    wortel: 'carrot', wortels: 'carrot', prei: 'leek', ui: 'onion', uien: 'onion', knoflook: 'garlic', spinazie: 'spinach',
    aardappel: 'potato', aardappels: 'potato', aardappelen: 'potato', aardbei: 'strawberry', aardbeien: 'strawberry',
    framboos: 'raspberry', frambozen: 'raspberry', bes: 'berry', bessen: 'berry',
    erwt: 'pea', erwten: 'pea', peul: 'snow pea', peulen: 'snow pea', boon: 'bean', bonen: 'bean',
    pompoen: 'pumpkin', pompoenen: 'pumpkin', biet: 'beetroot', bieten: 'beetroot', radijs: 'radish', radijsjes: 'radish',
    kruiden: 'garden herbs', tijm: 'thyme', basilicum: 'basil', peterselie: 'parsley', bieslook: 'chives',
    rozemarijn: 'rosemary', munt: 'mint', salie: 'sage', dille: 'dill', koriander: 'cilantro', oregano: 'oregano', kervel: 'chervil',
    appel: 'apple', appels: 'apple', peer: 'pear', peren: 'pear', kers: 'cherry', kersen: 'cherry',
    pruim: 'plum', pruimen: 'plum', perzik: 'peach', kiwibes: 'kiwi berry',
    broccoli: 'broccoli', bloemkool: 'cauliflower', boerenkool: 'kale', paksoi: 'bok choy', pastinaak: 'parsnip',
    zonnebloem: 'sunflower', zonnebloemen: 'sunflower', tulp: 'tulip', tulpen: 'tulip', roos: 'rose', rozen: 'rose',
    lavendel: 'lavender', papaver: 'poppy', goudsbloem: 'calendula', madeliefje: 'daisy',
    esdoorn: 'maple', eik: 'oak', moestuin: 'vegetable garden', tuin: 'garden'
};
const text = value => typeof value === 'string' ? value.replace(/<[^>]*>/g, ' ').replace(/&(?:nbsp|#160);/gi, ' ').replace(/&amp;/gi, '&').replace(/&#39;|&apos;/gi, "'").replace(/&quot;/gi, '"').replace(/\s+/g, ' ').trim().slice(0, 400) : '';
const httpsURL = value => { try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; } catch { return ''; } };
const referral = url => { try { const u = new URL(url); u.searchParams.set('utm_source','kweekkompas'); u.searchParams.set('utm_medium','referral'); return u.href; } catch { return ''; } };
async function getJSON(url, headers = {}, sourceName = '') {
    const response = await fetch(url, { headers, redirect: 'error', signal: AbortSignal.timeout(12000) });
    if (!response.ok) {
        if (sourceName === 'Unsplash') console.warn(`[KweekKompas] Unsplash fout: HTTP ${response.status}`);
        throw new Error('source unavailable');
    }
    return response.json();
}
async function commons(query, page) {
    const url = new URL('https://commons.wikimedia.org/w/api.php');
    for (const [k,v] of Object.entries({ action:'query', format:'json', formatversion:'2', generator:'search', gsrnamespace:'6', gsrlimit:'12', gsroffset:String((page-1)*12), gsrsearch:query, prop:'imageinfo', iiprop:'url|mime|extmetadata', iiurlwidth:'1000' })) url.searchParams.set(k,v);
    const data = await getJSON(url, { 'User-Agent': 'KweekKompas/1.0 (https://kweekkompas.netlify.app/; plant photo search)', 'Api-User-Agent': 'KweekKompas/1.0 (https://kweekkompas.netlify.app/)' });
    const photos = (data.query?.pages || []).flatMap(page => {
        const info = page.imageinfo?.[0], meta = info?.extmetadata || {};
        const license = text(meta.LicenseShortName?.value), licenseUrl = httpsURL(meta.LicenseUrl?.value);
        const artist = text(meta.Artist?.value), title = text(page.title?.replace(/^File:/, ''));
        const image = httpsURL(info?.thumburl || info?.url), original = httpsURL(info?.descriptionurl);
        if (!info || info.mime !== 'image/jpeg' || !image || !original || !license || !artist || (!licenseUrl && !/public domain|\bpd\b/i.test(license)) || /(?:artificial intelligence|ai.generated|generative ai|stable diffusion|midjourney|illustration|diagram|painting|schilderij|artwork|drawing|engraving|watercolor|oil on canvas|van gogh|museum|herbarium|specimen)/i.test(`${title} ${text(meta.ImageDescription?.value)} ${text(meta.Categories?.value)}`)) return [];
        return [{ id:`commons:${page.pageid}`, url:image, source:'Wikimedia Commons', sourceLink:original, originalLink:original, photographer:artist, license, licenseUrl, title, description:text(meta.ImageDescription?.value) }];
    });
    return { photos, hasMore: Boolean(data.continue?.gsroffset) };
}
async function unsplash(query, page) {
    const key = env('UNSPLASH_ACCESS_KEY')?.trim();
    if (!key) {
        console.warn('[KweekKompas] Unsplash: UNSPLASH_ACCESS_KEY ontbreekt.');
        throw new Error('source unavailable');
    }
    const url = new URL('https://api.unsplash.com/search/photos');
    url.searchParams.set('query',query); url.searchParams.set('page',String(page)); url.searchParams.set('per_page','12');
    const data = await getJSON(url, { Authorization:`Client-ID ${key}`, 'Accept-Version':'v1' }, 'Unsplash');
    if (!Array.isArray(data.results)) throw new Error('source unavailable');
    const photos = data.results.flatMap(item => {
        const image = httpsURL(item.urls?.regular || item.urls?.small), original = httpsURL(item.links?.html), author = httpsURL(item.user?.links?.html);
        if (!image || !original || !author || !item.user?.name || !/^[A-Za-z0-9_-]{1,100}$/.test(item.id || '')) return [];
        return [{ id:`unsplash:${item.id}`, unsplashId:item.id, url:image, source:'Unsplash', sourceLink:referral(author), originalLink:referral(original), photographer:text(item.user.name), license:'Unsplash License', licenseUrl:'https://unsplash.com/license', title:text(item.alt_description), description:text(item.description) }];
    });
    return { photos, hasMore: page < Math.min(Number(data.total_pages) || 0, 100) };
}
exports.handler = endpoint(async event => {
    if (event.httpMethod !== 'POST') throw new HttpError(405, 'Gebruik POST.');
    const cookie = readCookies(event);
    let session = { cookies: [] };
    if (cookie.kk_access || cookie.kk_refresh || env('KWEEK_LOCAL_DEV') !== 'true') session = await authenticate(event);
    else if (!configured() && env('KWEEK_LOCAL_DEV') !== 'true') throw new HttpError(503, 'Accountdienst niet beschikbaar.');
    const body = readBody(event);
    if (body.action === 'select') {
        if (typeof body.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(body.id)) throw new HttpError(400, 'Ongeldige foto.');
        const key = env('UNSPLASH_ACCESS_KEY')?.trim(); if (!key) throw new HttpError(503, 'Unsplash is tijdelijk niet beschikbaar.');
        await getJSON(`https://api.unsplash.com/photos/${encodeURIComponent(body.id)}/download`, { Authorization:`Client-ID ${key}`, 'Accept-Version':'v1' });
        return reply(200, { ok:true }, session.cookies);
    }
    const query = typeof body.query === 'string' ? body.query.trim().replace(/\s+/g,' ') : '';
    const scientific = typeof body.scientific === 'string' ? body.scientific.trim().replace(/\s+/g,' ') : '';
    const source = body.source || 'both', filter = body.filter || 'all', page = body.page || 1;
    if (!query || query.length > 120 || scientific.length > 120 || !['both','unsplash','commons'].includes(source) || !Object.hasOwn(filters,filter) || !Number.isSafeInteger(page) || page < 1 || page > 100) throw new HttpError(400, 'Controleer de zoekopdracht.');
    const first = query.split(' ')[0]; const translated = [translations[first.toLowerCase()] || first, ...query.split(' ').slice(1)].join(' ');
    const term = [scientific || translated, filters[filter]].filter(Boolean).join(' ');
    const cacheKey = JSON.stringify([source,term,page]);
    let result = cache.get(cacheKey);
    if (!result || result.until < Date.now()) {
        const sources = source === 'both' ? ['unsplash','commons'] : [source];
        const results = await Promise.allSettled(sources.map(name => name === 'unsplash' ? unsplash(term,page) : commons(term,page)));
        const photos = [], unavailable = []; let hasMore = false;
        results.forEach((entry,i) => { if (entry.status === 'fulfilled') { photos.push(...entry.value.photos); hasMore ||= entry.value.hasMore; } else unavailable.push(sources[i] === 'unsplash' ? 'Unsplash' : 'Wikimedia Commons'); });
        if (unavailable.length === sources.length) throw new HttpError(503, 'Fotozoeken is tijdelijk niet beschikbaar. Probeer het later opnieuw.');
        result = { photos, hasMore, unavailable, until:Date.now()+600000 };
        if (!unavailable.length) { if (cache.size >= 100) cache.delete(cache.keys().next().value); cache.set(cacheKey,result); }
    }
    return reply(200, { photos:result.photos, totalPages:result.hasMore ? page+1 : page, unavailable:result.unavailable }, session.cookies);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { startFixtures } = require('./service-fixtures.cjs');
const { handler } = require('../netlify/functions/_shared/photo-search');
test('photo search combines sources, preserves credits, paginates and tracks Unsplash selection', async () => {
    const fixture = await startFixtures(), original = global.fetch;
    Object.assign(process.env, { SUPABASE_URL: fixture.base, SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture', UNSPLASH_ACCESS_KEY: 'fixture-key', KWEEK_LOCAL_DEV: 'true' });
    const calls = []; let failUnsplash = false;
    global.fetch = async (url, options = {}) => {
        const u = new URL(url); calls.push({ url: u, options });
        if (u.hostname === 'api.unsplash.com') {
            if (failUnsplash) return Response.json({}, { status: 503 });
            if (u.pathname.endsWith('/download')) return Response.json({ url:'https://images.unsplash.com/test' });
            return Response.json({ total_pages: 3, results: [{ id:'photo123', urls:{regular:'https://images.unsplash.com/test'}, links:{html:'https://unsplash.com/photos/photo123'}, user:{name:'Maker',links:{html:'https://unsplash.com/@maker'}} }] });
        }
        if (u.hostname === 'commons.wikimedia.org') return Response.json({ continue:{gsroffset:12}, query:{pages:[{ pageid:10, title:'File:Tree.jpg', imageinfo:[{ mime:'image/jpeg', thumburl:'https://upload.wikimedia.org/a.jpg', descriptionurl:'https://commons.wikimedia.org/wiki/File:Tree.jpg', extmetadata:{ Artist:{value:'<b>Fotograaf</b>'}, LicenseShortName:{value:'CC BY 4.0'}, LicenseUrl:{value:'https://creativecommons.org/licenses/by/4.0/'}, ImageDescription:{value:'Een boom'} } }] }, { pageid:11, title:'File:Van_Gogh_Sunflowers_painting.jpg', imageinfo:[{ mime:'image/jpeg', thumburl:'https://upload.wikimedia.org/b.jpg', descriptionurl:'https://commons.wikimedia.org/wiki/File:Van_Gogh_Sunflowers_painting.jpg', extmetadata:{ Artist:{value:'Museum'}, LicenseShortName:{value:'PD'}, ImageDescription:{value:'Oil on canvas painting'} } }] }] } });
        return original(url, options);
    };
    const event = (body, cookie = '') => ({ httpMethod:'POST', headers:{ host:'localhost:4173', origin:'http://localhost:4173', cookie }, body:JSON.stringify(body) });
    try {
        for (const [query, scientific] of [['tomaat','Solanum lycopersicum'],['zonnebloem','Helianthus annuus'],['basilicum','Ocimum basilicum'],['vaantjesboom','Davidia involucrata']]) {
            for (const cookie of [`kk_access=${fixture.tokens.a}`,`kk_access=${fixture.tokens.b}`]) {
                const res = await handler(event({ query, scientific, source:'both', filter:'flower', page:1 }, cookie));
                assert.equal(res.statusCode, 200); const data = JSON.parse(res.body);
                assert.equal(data.photos.length, 2); assert.ok(data.totalPages > 1);
                assert.equal(data.photos[0].source, 'Unsplash'); assert.equal(data.photos[1].license, 'CC BY 4.0');
                assert.equal(data.photos[1].photographer, 'Fotograaf'); assert.doesNotMatch(res.body,/fixture-key/);
                assert.match(data.photos[0].sourceLink,/utm_source=kweekkompas/);
            }
            const search = calls.find(c => c.url.searchParams.get('query') === `${scientific} flower`);
            assert.ok(search, scientific);
        }
        const count = calls.length;
        await handler(event({ query:'tomaat', scientific:'Solanum lycopersicum', source:'both', filter:'flower', page:1 }));
        assert.equal(calls.length, count, 'repeat search uses cache');
        const more = await handler(event({ query:'tomaat', source:'commons', page:2 }));
        assert.equal(more.statusCode,200); assert.equal(calls.at(-1).url.searchParams.get('gsroffset'),'12');
        assert.equal((await handler(event({ action:'select', id:'photo123' }))).statusCode,200);
        assert.match(calls.at(-1).url.pathname,/\/photos\/photo123\/download$/);
        assert.equal((await handler(event({ action:'select', id:'../../unsafe' }))).statusCode,400);
        failUnsplash = true;
        const partial = JSON.parse((await handler(event({ query:'oregano', source:'both' }))).body);
        assert.deepEqual(partial.unavailable,['Unsplash']); assert.equal(partial.photos.length,1);
        await handler(event({ query:'zonnebloemen', source:'commons' }));
        assert.equal(calls.at(-1).url.searchParams.get('gsrsearch'), 'sunflower');
        await handler(event({ query:'kruiden', source:'commons' }));
        assert.equal(calls.at(-1).url.searchParams.get('gsrsearch'), 'garden herbs');
    } finally { global.fetch = original; delete process.env.UNSPLASH_ACCESS_KEY; await fixture.stop(); }
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../scripts/dev-server.cjs');
test('lokale server blokkeert gewone en Windows-gecodeerde padtraversal', async () => {
    const server = createServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
        for (const route of ['/.env', '/.git/config', '/assets/..%5c.env', '/assets/%2e%2e%5c.env', '/assets/%2e%2e%5c.git%5cconfig', '/assets/%2e%2e%5cnetlify%5cfunctions%5c_shared%5clib%5cai.js']) {
            assert.equal((await fetch(base + route)).status, 404, route);
        }
        for (const route of ['/', '/services.css', '/assets/default-avatar.png']) assert.equal((await fetch(base + route)).status, 200, route);
    } finally { await new Promise(resolve => server.close(resolve)); }
});

// Local-only backend. Never serves .env, Git, functions, backups or test files.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
if (fs.existsSync(path.join(root, '.env'))) process.loadEnvFile(path.join(root, '.env'));
process.env.KWEEK_LOCAL_DEV = 'true';
const pages = new Set(['index.html', 'app-v132.js', 'services.js', 'services.css', 'styles.css', 'calendar.css', 'onboarding.css', 'planner.css', 'wishlist.css']);
const routes = new Set(['auth', 'cloud-sync', 'ai-config', 'ai-models', 'seed-info', 'tuinassistent', 'gemini-ai']);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
function createServer() {
    return http.createServer(async (req, res) => {
        try {
            const url = new URL(req.url, `http://${req.headers.host}`);
            if (url.pathname.startsWith('/api/')) {
                const route = url.pathname.slice(5);
                if (!routes.has(route)) { res.writeHead(404).end(); return; }
                let body = '';
                for await (const chunk of req) {
                    body += chunk;
                    if (Buffer.byteLength(body) > 4_000_000) { res.writeHead(413).end(); return; }
                }
                const service = await import(pathToFileURL(path.join(root, 'netlify/functions', route + '.mjs')).href);
                const request = new Request(url, { method: req.method, headers: req.headers, ...(['GET', 'HEAD'].includes(req.method) ? {} : { body }) });
                const result = await service.default(request);
                res.writeHead(result.status, { ...Object.fromEntries(result.headers), ...(result.headers.getSetCookie().length ? { 'set-cookie': result.headers.getSetCookie() } : {}) });
                res.end(await result.text()); return;
            }
            const relative = decodeURIComponent(url.pathname).replace(/^\//, '') || 'index.html';
            const full = path.resolve(root, relative);
            const isAsset = full.startsWith(path.join(root, 'assets') + path.sep);
            if (!full.startsWith(root + path.sep) || (!pages.has(relative) && !isAsset) || !fs.existsSync(full) || !fs.statSync(full).isFile()) { res.writeHead(404).end(); return; }
            res.writeHead(200, { 'Content-Type': mime[path.extname(full)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
            fs.createReadStream(full).pipe(res);
        } catch { res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Lokale backendfout.' })); }
    });
}
if (require.main === module) createServer().listen(4173, '127.0.0.1', () => console.log('KweekKompas: http://127.0.0.1:4173'));
module.exports = { createServer };

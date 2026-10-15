// Local-only backend. Never serves .env, Git, functions, backups or test files.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
if (fs.existsSync(path.join(root, '.env'))) process.loadEnvFile(path.join(root, '.env'));
process.env.KWEEK_LOCAL_DEV = 'true';
const pages = new Set(['index.html', 'app-v132.js', 'plant-lifecycle.js', 'ai-contract.js', 'browser-ollama.js', 'cloud-data.js', 'photo-storage.js', 'auto-sync.js', 'local-backup.js', 'local-drafts.js', 'services.js', 'services.css', 'styles.css', 'calendar.css', 'onboarding.css', 'planner.css', 'wishlist.css']);
const routes = new Set(['auth', 'cloud-sync', 'photo-access', 'ai-config', 'ai-models', 'seed-info', 'tuinassistent', 'gemini-ai']);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
function createServer({ localAPIFile = path.join(root, '.kweek-local-api.json'), chatGPTFile = path.join(root, '.kweek-chatgpt.json'), chatGPTOptions } = {}) {
    const localAPI = require('./local-api.cjs').createLocalAPI(localAPIFile);
    globalThis.KweekLocalAPI = localAPI;
    const chatGPT = require('./chatgpt.cjs').createChatGPT(chatGPTFile, chatGPTOptions);
    globalThis.KweekChatGPT = chatGPT;
    const server = http.createServer(async (req, res) => {
        try {
            const url = new URL(req.url, `http://${req.headers.host}`);
            // Only our production site can use the personal ChatGPT connection.
            // Credentials and account files stay on this loopback server.
            if (url.pathname === '/api/chatgpt-bridge') {
                const trusted = req.headers.origin === 'https://kweekkompas.netlify.app'
                    && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)
                    && url.hostname === '127.0.0.1' && url.port === String(req.socket.localPort);
                if (!trusted) { res.writeHead(403).end(); return; }
                res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
                res.setHeader('Vary', 'Origin');
                res.setHeader('Cache-Control', 'no-store');
                if (req.method === 'OPTIONS') {
                    if (req.headers['access-control-request-method'] !== 'POST'
                        || (req.headers['access-control-request-headers'] || '').split(',').some(name => name.trim() && name.trim().toLowerCase() !== 'content-type')) { res.writeHead(403).end(); return; }
                    res.setHeader('Access-Control-Allow-Methods', 'POST');
                    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
                    res.setHeader('Access-Control-Allow-Private-Network', 'true');
                    res.writeHead(204).end(); return;
                }
                res.setHeader('Content-Type', 'application/json');
                if (req.method !== 'POST' || !/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) { res.writeHead(405).end(JSON.stringify({ error: 'Gebruik een JSON-aanvraag.' })); return; }
                let raw = '';
                for await (const chunk of req) {
                    raw += chunk;
                    if (Buffer.byteLength(raw) > 4_000_000) { res.writeHead(413).end('{}'); return; }
                }
                let input;
                try { input = JSON.parse(raw); } catch { res.writeHead(400).end('{}'); return; }
                try {
                    if (input?.route === 'chatgpt') {
                        const localRequest = { method: 'POST', socket: req.socket, headers: { ...req.headers, origin: url.origin, 'sec-fetch-site': 'same-origin' } };
                        const result = await chatGPT.handle(localRequest, JSON.stringify(input.body));
                        res.writeHead(200).end(JSON.stringify(result)); return;
                    }
                    if (!['seed-info', 'tuinassistent', 'gemini-ai'].includes(input?.route) || input.body?.ai?.provider !== 'chatgpt') { res.writeHead(403).end('{}'); return; }
                    const extension = fs.existsSync(path.join(root, 'netlify/functions', input.route + '.mts')) ? '.mts' : '.mjs';
                    const service = await import(pathToFileURL(path.join(root, 'netlify/functions', input.route + extension)).href);
                    const result = await service.default(new Request(url.origin + '/api/' + input.route, { method: 'POST', headers: { host: url.host, origin: url.origin, 'Content-Type': 'application/json' }, body: JSON.stringify(input.body) }));
                    res.writeHead(result.status).end(await result.text());
                } catch (error) { res.writeHead(error.status || 502).end(JSON.stringify({ error: error.status ? error.message : 'De ChatGPT-verbinding kon de aanvraag niet verwerken.' })); }
                return;
            }
            if (url.pathname.startsWith('/api/')) {
                const route = url.pathname.slice(5);
                if (!['local-api', 'chatgpt'].includes(route) && !routes.has(route)) { res.writeHead(404).end(); return; }
                let body = '';
                for await (const chunk of req) {
                    body += chunk;
                    if (Buffer.byteLength(body) > 4_000_000) { res.writeHead(413).end(); return; }
                }
                if (route === 'local-api' || route === 'chatgpt') {
                    try {
                        const result = await (route === 'chatgpt' ? chatGPT : localAPI).handle(req, body);
                        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(result));
                    } catch (error) {
                        res.writeHead(error.status || 500, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify({ error: error.status ? error.message : 'Lokale instellingen konden niet worden verwerkt.' }));
                    }
                    return;
                }
                const extension = fs.existsSync(path.join(root, 'netlify/functions', route + '.mts')) ? '.mts' : '.mjs';
                const service = await import(pathToFileURL(path.join(root, 'netlify/functions', route + extension)).href);
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
    server.on('close', () => { chatGPT.close(); if (globalThis.KweekChatGPT === chatGPT) delete globalThis.KweekChatGPT; });
    return server;
}
if (require.main === module) createServer().listen(4173, '127.0.0.1', () => console.log('KweekKompas: http://127.0.0.1:4173'));
module.exports = { createServer };

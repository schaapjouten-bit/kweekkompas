// Isolated UI checks. AI responses are returned by an in-page stub; no AI HTTP request.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'scratch/assistant-actions');
const files = new Set(['index.html', 'app-v132.js', 'services.js', 'services.css', 'styles.css', 'calendar.css', 'onboarding.css', 'planner.css', 'wishlist.css']);
const server = http.createServer((req, res) => {
    const file = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
    if ((!files.has(file) && !/^assets\/[\w/-]+\.(png|svg|jpg|webp)$/.test(file)) || !fs.existsSync(path.join(root, file))) return res.writeHead(404).end();
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
    res.writeHead(200, { 'Content-Type': (mime[path.extname(file)] || 'application/octet-stream') + '; charset=utf-8' });
    fs.createReadStream(path.join(root, file)).pipe(res);
});
const report = { checks: [], screenshots: [], errors: [], generationRequests: 0 };
(async () => {
    fs.mkdirSync(output, { recursive: true });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch();
    try {
        for (const theme of ['light', 'dark', 'playful']) for (const width of [1440, 390, 320]) {
            const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'Europe/Amsterdam', hasTouch: width < 769 });
            await context.route('**/*', route => {
                const request = route.request(), url = new URL(request.url());
                if (/\/api\/(tuinassistent|gemini-ai|seed-info)/.test(url.pathname)) report.generationRequests++;
                if (url.origin !== base) return route.abort();
                if (url.pathname === '/api/ai-config') return route.fulfill({ json: { defaultProvider: 'ollama', providers: { ollama: { label: 'Ollama', configured: true, model: 'llama3:latest' } } } });
                return url.pathname.startsWith('/api/') ? route.abort() : route.continue();
            });
            await context.addInitScript(theme => {
                localStorage.setItem('onboarding_done', 'true'); localStorage.setItem('theme', theme);
                if (!localStorage.getItem('userProfile')) localStorage.setItem('userProfile', JSON.stringify({ name: 'Test', experience: 'Beginner' }));
                if (!localStorage.getItem('kweekkompas_ai')) localStorage.setItem('kweekkompas_ai', JSON.stringify({ provider: 'ollama', model: 'llama3:latest' }));
            }, theme);
            const page = await context.newPage(); page.on('pageerror', error => report.errors.push(error.message));
            await page.clock.setFixedTime(new Date('2026-10-02T12:00:00+02:00'));
            await page.goto(base); await page.waitForSelector('#view-home:not(.hidden)');
            const baseline = await page.evaluate(() => window.KweekLocalData.capture());
            const prefs = await page.evaluate(() => localStorage.getItem('kweekkompas_ai'));
            const initialReminders = baseline.reminders.length;
            const initialWishlist = baseline.wishlist.length;
            async function reminders() { return page.evaluate(() => JSON.parse(localStorage.getItem('moestuin_reminders') || '[]')); }
            async function wishlist() { return page.evaluate(() => JSON.parse(localStorage.getItem('moestuin_wishlist') || '[]')); }
            async function answer(actions, text = 'Gesimuleerd tuinadvies.') {
                await page.evaluate(({ actions, text }) => {
                    window.KweekServices.requestAI = async () => ({ answer: text, actions });
                    window.switchView('home');
                }, { actions, text });
                await page.fill('#ai-question-input', 'Mijn tuinvraag');
                await page.click('#btn-ask-ai');
                await page.waitForSelector('#ai-assistant-output .ai-advies-card');
            }
            async function shot(selector, name) {
                const file = `${theme}-${width}-${name}.png`;
                await page.locator(selector).screenshot({ path: path.join(output, file), animations: 'disabled' });
                report.screenshots.push(file);
            }
            const rows = page.locator('#ai-assistant-output .ai-suggestion-row');
            const valid = { type: 'sow', label: 'Zaai spinazie', plantName: 'Spinazie', date: '2026-10-20' };
            await answer([valid]);
            assert.equal(await rows.count(), 1);
            assert.equal(await rows.locator('button').innerText(), 'Inplannen');
            assert.match(await rows.innerText(), /Zaaien: Spinazie/);
            await shot('#ai-assistant-output', 'voorstel');
            await rows.locator('button').evaluate(button => { button.click(); button.click(); });
            assert.equal(await page.inputValue('#new-reminder-input'), 'Spinazie zaaien');
            assert.equal(await page.inputValue('#ai-planning-date'), '2026-10-20');
            assert.equal((await reminders()).length, initialReminders);
            assert.equal((await wishlist()).length, initialWishlist);
            assert.match(await page.locator('#toast-container').innerText(), /voorstel klaar/);
            assert(await page.locator('#toast-container').evaluate(element => element.getBoundingClientRect().right <= innerWidth));
            await page.waitForSelector('#toast-container .toast', { state: 'detached' });
            await shot('#day-details', 'planning-controleren');
            await page.click('#ai-planning-cancel');
            assert(await page.locator('#view-home').isVisible());
            assert.equal((await reminders()).length, initialReminders);
            assert.equal(await page.inputValue('#ai-question-input'), 'Mijn tuinvraag');
            await rows.locator('button').click();
            await page.fill('#new-reminder-input', 'Spinazie buiten zaaien');
            await page.fill('#ai-planning-date', '2026-11-03');
            await page.locator('#ai-planning-date').dispatchEvent('change');
            await page.locator('#btn-add-reminder').evaluate(button => { button.click(); button.click(); });
            assert.equal((await reminders()).length, initialReminders + 1);
            assert.deepEqual((await reminders()).at(-1), { id: (await reminders()).at(-1).id, date: '2026-11-03', title: 'Spinazie buiten zaaien', done: false });
            await page.evaluate(() => window.switchView('home'));
            assert(await rows.locator('button').isDisabled());
            // A fresh copy of the same suggestion also cannot duplicate an existing task.
            await answer([valid]); await rows.locator('button').click();
            await page.fill('#new-reminder-input', 'Spinazie buiten zaaien');
            await page.fill('#ai-planning-date', '2026-11-03');
            await page.click('#btn-add-reminder');
            assert.equal((await reminders()).length, initialReminders + 1);

            await answer([{ type: 'Sow', label: 'Sow', plantName: 'Radijs' }]);
            assert.equal(await rows.innerText(), 'Zaaien: Radijs\nInplannen');
            await rows.locator('button').click();
            assert.equal(await page.inputValue('#ai-planning-date'), '', 'No invented date');
            assert.equal(await page.locator('.calendar-day.selected').count(), 0);
            await page.click('#btn-add-reminder');
            assert.equal((await reminders()).length, initialReminders + 1);
            // The date can also be chosen in the existing calendar itself.
            await page.locator('.calendar-day:not(.other-month)').first().click();
            assert.match(await page.inputValue('#ai-planning-date'), /^2026-11-01$/);
            await page.click('#ai-planning-cancel');
            assert.equal((await reminders()).length, initialReminders + 1);

            for (const actions of [
                [{ type: 'sow', label: 'Zaai spinazie' }],
                [{ type: 'unknown', label: 'Doen', plantName: 'Spinazie' }],
                [], [{ type: 'none', label: 'Een goed appelras', plantName: 'Elstar' }],
                [{ type: 'sow', label: 'Elstar is een goed appelras', plantName: 'Elstar' }],
                [{ ...valid, date: '2026-02-30' }],
                [{ type: 'care', label: 'Care', plantName: 'Tomaat' }],
                [{ ...valid, plantName: ' ' }], [{ ...valid, destination: 'unknown' }]
            ]) {
                await answer(actions);
                assert.equal(await rows.count(), 0);
                assert(!((await page.locator('#ai-assistant-output').innerText()).includes('Voorgestelde Acties')));
            }
            await answer([{ type: 'unknown' }, { type: 'none' }, { type: 'sow' }, valid]);
            assert.equal(await rows.count(), 1, 'Invalid proposals cannot hide a later valid one');
            await answer([{ type: 'recommend', label: 'Elstar is een geschikt appelras', plantName: 'Elstar' }]);
            assert.equal(await rows.locator('button').innerText(), 'Op verlanglijst');
            assert.doesNotMatch(await rows.innerText(), /Inplannen|Zaaien/);
            await rows.locator('button').evaluate(button => { button.click(); button.click(); });
            assert.equal((await wishlist()).length, initialWishlist + 1);
            assert.equal((await wishlist())[0].name, 'Elstar');
            assert.equal((await reminders()).length, initialReminders + 1);
            await answer([{ type: 'recommend', label: 'Kies Elstar', plantName: 'Elstar' }]);
            await rows.locator('button').click();
            assert.equal((await wishlist()).length, initialWishlist + 1);
            assert(await rows.locator('button').isDisabled());
            await answer([{ type: 'buy', label: 'Koop een snoeischaar', subject: 'Snoeischaar' }]);
            await rows.locator('button').click();
            assert.equal((await wishlist())[0].type, 'item');

            const payload = '<img src=x onerror=alert(1)><script>alert(2)</script>';
            await answer([{ type: 'recommend', label: payload, plantName: payload }], payload);
            assert.equal(await page.locator('#ai-assistant-output img, #ai-assistant-output script').count(), 0);
            assert((await page.locator('#ai-assistant-output').innerText()).includes(payload));
            assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            const after = await page.evaluate(() => window.KweekLocalData.capture());
            assert.deepEqual(after.seeds, baseline.seeds, 'Actions never create or change seeds');
            assert.deepEqual(after.calendar, baseline.calendar);
            assert.deepEqual(after.userProfile, baseline.userProfile);
            assert.equal(await page.evaluate(() => localStorage.getItem('kweekkompas_ai')), prefs);
            report.checks.push(`${theme}/${width}: Nederlands, geldig/Engels/onvolledig/onbekend/leeg, geen zaaiopdracht uit rasadvies, expliciete verlanglijst, bewerkbaar datumvoorstel, geen verzonnen datum, dubbelklik/annuleren/deduplicatie, veilige tekst`);
            await context.close();
        }
        assert.equal(report.generationRequests, 0); assert.deepEqual(report.errors, []);
        assert(fs.readFileSync(path.join(root, 'services.js')).equals(fs.readFileSync(path.join(output, 'before/services.js'))), 'Provider/model settings remain untouched');
        const before = fs.readFileSync(path.join(output, 'before/app-v132.js'), 'utf8');
        const after = fs.readFileSync(path.join(root, 'app-v132.js'), 'utf8');
        assert.equal(after.split('// --- SAFE DYNAMIC CONTENT ---')[0], before.split('// --- SAFE DYNAMIC CONTENT ---')[0], 'Database code remains untouched');
        fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
        console.log(JSON.stringify({ ...report, screenshots: report.screenshots.length }, null, 2));
    } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });

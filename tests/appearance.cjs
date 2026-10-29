const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const screenshots = process.env.MUJI_SCREENSHOTS;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg' };

async function serveFile(route) {
    if (route === '/js/collaboration-config.js') return { status: 200, contentType: types['.js'], body: 'export const collaborationConfig={enabled:false,url:"",publishableKey:""};' };
    const file = path.resolve(root, '.' + (route.endsWith('/') ? route + 'index.html' : route));
    if (!file.startsWith(root + path.sep)) return { status: 403, body: '' };
    try { return { status: 200, contentType: types[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) }; }
    catch { return { status: 404, body: '' }; }
}
const server = http.createServer(async (req, res) => {
    const route = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/algorithm-question-bank(?=\/)/, '');
    const result = await serveFile(route);
    res.writeHead(result.status, { 'Content-Type': result.contentType || 'text/plain', 'Cache-Control': 'no-store' });
    res.end(result.body);
});

(async () => {
    let browser;
    const errors = [];
    try {
        const scheduleModule = new vm.SourceTextModule(fs.readFileSync(path.join(root, 'js/appearance.js'), 'utf8'), { context: vm.createContext({}) });
        await scheduleModule.link(() => { throw Error('Unexpected appearance dependency'); });
        await scheduleModule.evaluate();
        const getSchedule = scheduleModule.namespace.getTaipeiSchedule;
        for (const [time, theme, next] of [
            ['2026-10-29T05:59:59.999+08:00', 'night', '2026-10-29T06:00:00+08:00'],
            ['2026-10-29T06:00:00+08:00', 'day', '2026-10-29T18:00:00+08:00'],
            ['2026-10-29T17:59:59.999+08:00', 'day', '2026-10-29T18:00:00+08:00'],
            ['2026-10-29T18:00:00+08:00', 'night', '2026-10-30T06:00:00+08:00'],
            ['2026-10-31T23:59:59+08:00', 'night', '2026-11-01T06:00:00+08:00'],
            ['2026-12-31T23:59:59+08:00', 'night', '2027-01-01T06:00:00+08:00']
        ]) {
            const actual = getSchedule(Date.parse(time));
            assert.equal(actual.theme, theme);
            assert.equal(actual.nextSwitchAt, Date.parse(next));
        }
        console.log('PASS Taipei 06:00/18:00 boundaries, month/year rollover');
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const offline = process.env.MUJI_OFFLINE === '1';
        const url = offline ? 'http://muji-preview.local/algorithm-question-bank/' : 'http://127.0.0.1:' + server.address().port + '/algorithm-question-bank/';
        browser = await chromium.launch({ channel: 'msedge', headless: true });
        const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark', timezoneId: 'America/Los_Angeles' });
        if (offline) await context.route('http://muji-preview.local/**', async route => {
            const p = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\/algorithm-question-bank(?=\/)/, '');
            await route.fulfill(await serveFile(p));
        });
        const page = await context.newPage();
        await page.clock.install({ time: new Date('2026-10-29T12:00:00+08:00') });
        page.setDefaultTimeout(15000);
        page.on('pageerror', e => errors.push(e.message));
        const body = page.locator('body');
        async function settle() { await page.waitForTimeout(350); }
        async function shot(name) { if (screenshots) { await settle(); fs.mkdirSync(screenshots, { recursive: true }); await page.screenshot({ path: path.join(screenshots, name + '.png') }); } }
        async function panel(name) {
            if (await page.locator('#mobileMenuBtn').getAttribute('aria-expanded') !== 'true') await page.locator('#mobileMenuBtn').click();
            await page.locator('[data-panel="' + name + '"]').click();
        }
        async function home() {
            if (await page.locator('#mobileMenuBtn').getAttribute('aria-expanded') !== 'true') await page.locator('#mobileMenuBtn').click();
            await page.locator('#switchSubjectBtn').click();
            await page.locator('#subjectHome').waitFor({ state: 'visible' });
        }
        async function colors(bg, card, accent) {
            await settle();
            const actual = await body.evaluate(el => {
                const style = getComputedStyle(el);
                return ['--bg', '--card', '--primary'].map(name => style.getPropertyValue(name).trim().toLowerCase());
            });
            assert.deepEqual(actual, [bg, card, accent]);
        }
        await page.goto(url);
        await page.locator('body[data-theme="day"]').waitFor();
        await colors('#f9f6f0', '#f0eae1', '#a88460');
        assert.equal(await page.locator('#studyThemeBtn').isHidden(), true);
        assert.equal(await page.locator('.subject-card').count(), 3);
        await shot('home-light');

        // Fine-pointer following is bounded, lagged and enabled only on the homepage.
        await page.mouse.move(100, 180);
        await page.waitForFunction(() => document.querySelector('#homeSparkles').classList.contains('is-following'));
        await page.mouse.move(900, 180);
        await page.waitForTimeout(30);
        const lag = await page.locator('.home-pointer-ring').evaluate(el => new DOMMatrixReadOnly(getComputedStyle(el).transform).m41 + el.getBoundingClientRect().width / 2);
        assert.ok(lag < 900 && lag > 100, 'Ring should follow with a small delay');
        assert.equal(await page.locator('#homeSparkles > *').count(), 2);
        assert.equal(await body.evaluate(el => getComputedStyle(el).getPropertyValue('--glow-strength').trim()), '.15');
        await page.locator('#algorithmSubjectBtn').hover();
        await settle();
        assert.equal(await page.locator('#homeSparkles').evaluate(el => el.classList.contains('is-over-control')), true);
        assert.ok(await page.locator('#algorithmSubjectBtn').evaluate(el => new DOMMatrixReadOnly(getComputedStyle(el).transform).m42 < 0));
        await page.mouse.down();
        await page.waitForTimeout(180);
        assert.ok(await page.locator('#algorithmSubjectBtn').evaluate(el => new DOMMatrixReadOnly(getComputedStyle(el).transform).m11 < 1));
        // Release away from the card so this check does not navigate.
        await page.mouse.move(100, 180); await page.mouse.up();
        await page.locator('#homeThemeBtn').click();
        await colors('#1a1917', '#242320', '#c29d76');
        await page.mouse.move(100, 80); await settle(); await shot('home-dark');

        await page.locator('#algorithmSubjectBtn').click();
        await page.locator('#summary').filter({ hasText: '目前顯示' }).waitFor();
        assert.equal(await page.locator('#currentUnitLabel').innerText(), '演算法｜U6');
        assert.match(await page.locator('#summary').innerText(), /\/ 71 題/);
        assert.equal(await page.locator('#searchInput').getAttribute('placeholder'), '搜尋題目與關鍵字');
        assert.doesNotMatch(await page.locator('#sidebar').innerText(), /\p{Extended_Pictographic}/u);
        for (const icon of ['.sidebar-brand', '.nav-btn[data-panel="bank"]', '.nav-btn[data-panel="units"]', '#practiceNavBtn', '#switchSubjectBtn', '#sidebar > a.nav-btn']) {
            assert.match(await page.locator(icon).evaluate(el => getComputedStyle(el, '::before').maskImage), /data:image\/svg\+xml/);
        }
        await page.locator('#studyThemeBtn').waitFor();
        assert.equal(await page.locator('#homeSparkles').evaluate(el => el.classList.contains('is-following')), false);
        await page.locator('#studyThemeBtn').click();
        await colors('#f9f6f0', '#f0eae1', '#a88460');
        const navSize = await page.locator('#sidebar .sidebar-nav .nav-btn').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize));
        const collaboration = await page.locator('#sidebar > a.nav-btn').evaluate(el => ({ size: parseFloat(getComputedStyle(el).fontSize), gap: parseFloat(getComputedStyle(el).marginTop) }));
        assert.ok(collaboration.size < navSize && collaboration.gap >= 30);
        assert.equal(await page.locator('#sidebar > a.nav-btn').getAttribute('href'), './collaborate.html');
        await shot('algorithm-light');
        const initialCount = await page.locator('.question-card').count();
        assert.ok(initialCount > 0);
        await page.locator('#hideAllBtn').click();
        const answer = page.locator('.answer-btn').first();
        await answer.click(); assert.equal(await answer.getAttribute('aria-expanded'), 'true');
        await page.locator('#searchInput').fill('no-match-muji-2026');
        assert.equal(await page.locator('.question-card').count(), 0);
        await page.locator('#clearBtn').click();
        assert.equal(await page.locator('.question-card').count(), initialCount);
        await page.locator('#nextPageBtn').click(); assert.match(await page.locator('#pageInfo').innerText(), /第 2/);
        await page.locator('#studyThemeBtn').click(); await settle(); await shot('algorithm-dark');
        await panel('units');
        assert.ok(await page.locator('.unit-card').count() >= 5);
        await panel('practice');
        await page.waitForFunction(() => !document.getElementById('practiceStart').disabled);
        await shot('practice-dark');
        await page.locator('#studyThemeBtn').click(); await settle(); await shot('practice-light');
        await page.locator('#practiceUnit').selectOption('u7');
        await page.waitForFunction(() => !document.getElementById('practiceStart').disabled);
        await page.locator('#practiceStart').click();
        await page.locator('.practice-card').waitFor();
        assert.equal(await page.locator('#practiceUnit').isDisabled(), true);
        await page.locator('#studyThemeBtn').click();
        assert.equal(await page.locator('.practice-card').count(), 1);
        assert.equal(await page.locator('#practiceUnit').isDisabled(), true);

        await home();
        await page.locator('#osSubjectBtn').click();
        await page.locator('#summary').filter({ hasText: '目前顯示' }).waitFor();
        assert.equal(await page.locator('#currentUnitLabel').innerText(), '作業系統｜U3');
        assert.equal(await page.locator('#searchInput').getAttribute('placeholder'), '搜尋題目與關鍵字');
        assert.doesNotMatch(await page.locator('#sidebar').innerText(), /\p{Extended_Pictographic}/u);
        await colors('#1a1917', '#242320', '#c29d76');
        await page.locator('#studyThemeBtn').click();
        await colors('#fafafa', '#f4f4f4', '#6b7f6d');
        assert.equal(await page.locator('#practiceNavBtn').isHidden(), true);
        await shot('os-light');
        await page.locator('#studyThemeBtn').click(); await settle(); await shot('os-dark');
        await panel('units'); await page.locator('[data-unit="u6"]').click();
        await page.locator('#summary').filter({ hasText: '目前顯示' }).waitFor();
        await page.locator('#studyThemeBtn').click();
        await page.locator('#mobileMenuBtn').click();
        await page.setViewportSize({ width: 320, height: 740 });
        await page.waitForFunction(() => document.getElementById('sidebar').inert);
        for (const width of [320, 390, 768]) {
            await page.setViewportSize({ width, height: 844 });
            await settle();
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        }
        await page.setViewportSize({ width: 390, height: 844 });
        await shot('os-mobile');
        await panel('units');
        await page.locator('#mobileMenuBtn').click();
        await page.locator('#switchSubjectBtn').click();
        await page.locator('#subjectHome').waitFor({ state: 'visible' });
        await colors('#f9f6f0', '#f0eae1', '#a88460');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await shot('home-mobile');

        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.mouse.move(100, 200);
        assert.equal(await page.locator('#homeSparkles').isVisible(), false);
        await page.locator('#algorithmSubjectBtn').hover();
        assert.equal(await page.locator('#algorithmSubjectBtn').evaluate(el => getComputedStyle(el).transform), 'none');
        assert.equal(await page.locator('#algorithmSubjectBtn').evaluate(el => getComputedStyle(el).transitionDuration), '0s');
        await page.locator('#homeThemeBtn').click();
        assert.equal(await body.getAttribute('data-theme'), 'night');
        await page.reload();
        await page.locator('body[data-theme="night"]').waitFor();
        assert.equal(await page.locator('#homeThemeBtn').getAttribute('aria-pressed'), 'true');
        await page.goto(url + 'english.html');
        assert.equal(await page.locator('.muji-theme').count(), 0);
        assert.equal(await page.locator('#studyThemeBtn').count(), 0);
        assert.equal(await page.locator('link[href*="muji.css"]').count(), 0);
        assert.deepEqual(errors, []);
        console.log('PASS exact day/night palettes, 15% bounded pointer following, hover/press, study theme persistence, smaller collaboration link, search/answers/pagination, in-progress quiz preservation, OS U6, 320/390/768px layouts, reduced motion, English isolation');

        const system = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light', timezoneId: 'Pacific/Honolulu', reducedMotion: 'reduce' });
        if (offline) await system.route('http://muji-preview.local/**', async route => {
            const p = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\/algorithm-question-bank(?=\/)/, '');
            await route.fulfill(await serveFile(p));
        });
        const systemPage = await system.newPage();
        systemPage.on('pageerror', e => errors.push(e.message));
        await systemPage.clock.install({ time: new Date('2026-10-29T05:59:58+08:00') });
        await systemPage.clock.pauseAt(new Date('2026-10-29T05:59:59+08:00'));
        await systemPage.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Storage unavailable', 'SecurityError'); } }); });
        await systemPage.goto(url);
        await systemPage.locator('body[data-theme="night"]').waitFor();
        await systemPage.locator('#homeThemeBtn').click();
        assert.equal(await systemPage.locator('body').getAttribute('data-theme'), 'day');
        await systemPage.locator('#homeThemeBtn').click();
        assert.equal(await systemPage.locator('body').getAttribute('data-theme'), 'night');
        await systemPage.clock.fastForward(1001);
        assert.equal(await systemPage.locator('body').getAttribute('data-theme'), 'day');
        console.log('PASS automatic 06:00 switch, independent device timezone/theme and storage-unavailable fallback');

        // Keep a manual choice over reload, then expire it at the next Taipei boundary.
        await page.goto(url);
        await page.clock.pauseAt(new Date('2026-10-29T17:59:59+08:00'));
        await page.evaluate(() => localStorage.setItem('question_bank_taipei_theme_v1', 'invalid'));
        await page.reload();
        await page.locator('body[data-theme="day"]').waitFor();
        await page.locator('#homeThemeBtn').click();
        await page.reload();
        await page.locator('body[data-theme="night"]').waitFor();
        await page.locator('#homeThemeBtn').click();
        await page.locator('#algorithmSubjectBtn').click();
        await page.locator('#summary').filter({ hasText: '目前顯示' }).waitFor();
        await page.clock.fastForward(1001);
        assert.equal(await body.getAttribute('data-theme'), 'night');
        assert.equal(await page.locator('#currentUnitLabel').innerText(), '演算法｜U6');
        assert.equal(await page.locator('#studyThemeBtn').getAttribute('aria-pressed'), 'true');
        assert.deepEqual(errors, []);
        console.log('PASS manual selection survives reload and expires at 18:00 without disturbing the current unit; SVG icons, shared search hint and U6 default');
    } finally {
        if (browser) await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
})().catch(error => { console.error(error); process.exitCode = 1; });

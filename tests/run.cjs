const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8" };
const server = http.createServer((req, res) => {
    let route;
    try { route = decodeURIComponent(new URL(req.url, "http://localhost").pathname); }
    catch { res.writeHead(400).end(); return; }
    if (route.startsWith("/algorithm-question-bank/")) route = route.slice("/algorithm-question-bank".length);
    const filename = path.resolve(root, "." + (route.endsWith("/") ? route + "index.html" : route));
    if (!filename.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(filename, (error, data) => {
        if (error) { res.writeHead(404).end("Not found"); return; }
        res.writeHead(200, { "Content-Type": types[path.extname(filename)] || "application/octet-stream", "Cache-Control": "no-store" });
        res.end(data);
    });
});
server.listen(0, "127.0.0.1", async () => {
    const url = "http://127.0.0.1:" + server.address().port + "/algorithm-question-bank/";
    console.log("Preview: " + url);
    if (process.argv.includes("--serve")) return;
    let browser;
    const errors = [];
    const checks = [];
    const record = name => { checks.push(name); console.log("PASS " + name); };
    async function openPanel(page, panel) {
        if (await page.locator("#mobileMenuBtn").getAttribute("aria-expanded") !== "true") {
            await page.locator("#mobileMenuBtn").click();
        }
        await page.locator('[data-panel="' + panel + '"]').click();
    }
    async function openUnit(page, unit) {
        await openPanel(page, "units");
        await page.locator('#unitGrid [data-unit="' + unit + '"]').click();
    }
    try {
        const { chromium } = require("playwright");
        const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
        const channel = !fs.existsSync(chromium.executablePath()) && fs.existsSync(edgePath) ? "msedge" : undefined;
        browser = await chromium.launch({ headless: true, channel });
        const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
        // Stub third-party media for deterministic UI tests; do not claim audio playback verification.
        await context.route("https://www.youtube.com/embed/**", route =>
            route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Test player</title><p>YouTube player fixture</p>" }));
        const page = await context.newPage();
        page.on("pageerror", error => errors.push(error.message));
        await page.goto(url);
        assert.equal(await page.locator("#subjectHome").isVisible(), true);
        assert.equal(await page.locator("#osSubjectBtn").isDisabled(), true);
        assert.equal(await page.locator("#mobileMenuBtn").isVisible(), false);
        assert.equal(await page.locator("#subjectHome .subtitle").innerText(), "既然無法修仙 不如來魔修");
        assert.equal(await page.locator("#musicPlayerHost iframe").count(), 0);
        assert.equal(await page.locator("#musicToggleBtn").isVisible(), true);
        await page.locator("#musicToggleBtn").click();
        assert.equal(await page.locator("#musicPanel").isVisible(), true);
        const playerSrc = new URL(await page.locator("#musicPlayerHost iframe").getAttribute("src"));
        assert.equal(playerSrc.hostname, "www.youtube.com");
        assert.equal(playerSrc.pathname, "/embed/xKhBGvx4W98");
        assert.equal(playerSrc.searchParams.get("autoplay"), "1");
        const size = await page.locator("#musicPlayerHost iframe").boundingBox();
        assert.ok(size.width >= 200 && size.height >= 200);
        assert.equal(await page.locator("#musicToggleBtn").getAttribute("aria-expanded"), "true");
        await page.locator("#musicCloseBtn").click();
        assert.equal(await page.locator("#musicPlayerHost iframe").count(), 0);
        assert.equal(await page.locator("#musicToggleBtn").evaluate(el => document.activeElement === el), true);
        await page.locator("#musicToggleBtn").click();
        await page.keyboard.press("Escape");
        assert.equal(await page.locator("#musicPanel").isVisible(), false);
        await page.locator("#musicToggleBtn").click();
        await page.locator("#musicToggleBtn").click();
        assert.equal(await page.locator("#musicPlayerHost iframe").count(), 0);
        await page.locator("#musicToggleBtn").click();
        await page.locator("#algorithmSubjectBtn").click();
        assert.equal(await page.locator("#musicPlayerHost iframe").count(), 0);
        assert.equal(await page.locator("#musicToggleBtn").isVisible(), false);
        assert.equal(await page.locator("#sidebarUnitList").count(), 0);
        record("Lazy music embed, configured video, close/Escape/toggle/entry cleanup and home copy");
        record("Subject entry, unavailable OS, algorithm opens U2");
        await page.waitForFunction(() => document.querySelector("#summary").textContent.includes("25 / 60"));
        assert.equal(await page.locator("#questionList article").count(), 25);
        assert.equal(await page.locator("#sidebar").evaluate(el => el.inert), true);
        record("GitHub Pages subpath loads all modules/data; 60 questions; sidebar closed");
        await page.locator("#nextPageBtn").click();
        await page.locator("#nextPageBtn").click();
        assert.equal(await page.locator("#questionList article").count(), 10);
        assert.equal(await page.locator("#nextPageBtn").isDisabled(), true);
        record("25/25/10 pagination and last-page boundary");
        await page.locator("#searchInput").fill("function fibonacci");
        assert.equal(await page.locator("#pageInfo").innerText(), "第 1 / 1 頁");
        assert.equal(await page.locator("#questionList article").count(), 1);
        await page.locator(".answer-btn").click();
        assert.match(await page.locator(".answer-content").innerText(), /n<=0\/n==1/);
        record("Search resets page; Fibonacci answer retained");
        await page.locator("#searchInput").fill("no-match-xyz");
        assert.equal(await page.locator("#pageInfo").innerText(), "第 0 / 0 頁");
        assert.equal(await page.locator("#prevPageBtn").isDisabled(), true);
        assert.equal(await page.locator("#nextPageBtn").isDisabled(), true);
        await page.locator("#clearBtn").click();
        await page.locator('[data-filter="disputed"]').click();
        assert.equal(await page.locator("#questionList article").count(), 1);
        assert.equal(await page.locator("#questionList article").getAttribute("data-id"), "43");
        assert.equal(await page.locator("#questionList .option").count(), 4);
        await page.locator(".answer-btn").click();
        assert.match(await page.locator(".answer-label").innerText(), /含爭議項/);
        assert.match(await page.locator(".answer-note").innerText(), /第 2 項有數學疑義/);
        const starts = await page.locator(".answer-content").evaluate(el => {
            const node = el.firstChild;
            const text = node.textContent;
            return [0, text.indexOf("\n") + 1].map(start => {
                const range = document.createRange(); range.setStart(node, start); range.setEnd(node, start + 1);
                return range.getBoundingClientRect().left;
            });
        });
        assert.ok(Math.abs(starts[0] - starts[1]) < 1);
        record("Empty results, disputed #43, four choices, and multiline alignment");
        await page.locator('[data-filter="all"]').click();
        await page.locator("#showAllBtn").click();
        assert.equal(await page.locator("#questionList .answer.show").count(), 25);
        await page.locator("#hideAllBtn").click();
        assert.equal(await page.locator("#questionList .answer.show").count(), 0);
        await page.evaluate(() => {
            const el = document.scrollingElement;
            window.scrollTo(0, (el.scrollHeight - el.clientHeight) * .74);
        });
        await page.waitForTimeout(100);
        assert.equal(await page.locator("#backToTopBtn").isVisible(), false);
        await page.evaluate(() => {
            const el = document.scrollingElement;
            window.scrollTo(0, (el.scrollHeight - el.clientHeight) * .76);
        });
        await page.waitForFunction(() => !document.querySelector("#backToTopBtn").hidden);
        assert.equal(await page.locator("#backToTopBtn").evaluate(el => getComputedStyle(el).backgroundColor), "rgb(251, 207, 232)");
        await page.locator("#backToTopBtn").click();
        await page.waitForFunction(() => document.scrollingElement.scrollTop === 0);
        record("Show/hide answers; pink button appears after 75% and returns to top");
        await page.locator("#mobileMenuBtn").click();
        assert.equal(await page.locator("#sidebar").evaluate(el => el.inert), false);
        assert.equal(await page.locator(".sidebar-brand").getAttribute("href"), "https://canva.link/evygbbmrt3v2umy");
        await page.locator('[data-panel="units"]').click();
        await page.locator('#unitGrid [data-unit="u2"]').click();
        assert.equal(await page.locator("#panel-bank").isVisible(), true);
        await page.locator('[data-panel="add"]').click();
        await page.locator("#newQuestion").fill("Regression test question");
        await page.locator("#newAnswer").fill("first answer\nsecond answer");
        await page.locator("#optA").fill("first answer");
        await page.locator("#saveQuestionBtn").click();
        assert.equal(await page.locator("#userQuestionList article").count(), 1);
        await page.reload();
        await page.locator("#algorithmSubjectBtn").click();
        await page.waitForFunction(() => document.querySelector("#summary").textContent.includes("25 / 61"));
        await page.locator("#mobileMenuBtn").click();
        await page.locator('[data-panel="add"]').click();
        assert.match(await page.locator("#userQuestionList").innerText(), /Regression test question/);
        await page.locator("[data-delete-question]").click();
        assert.equal(await page.locator("#userQuestionList article").count(), 0);
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("algorithm_question_bank_user_questions_v1")).length), 0);
        record("Unit navigation, Canva link, add/persist/reload/delete custom question");
        await page.evaluate(() => localStorage.setItem("algorithm_question_bank_user_questions_v1", JSON.stringify([
            { id: 9001, type: "fill_blank", title: "Legacy question", question: "Legacy content", correct_answer: "Legacy answer", options: [], user_created: true }
        ])));
        await page.reload();
        await page.locator("#algorithmSubjectBtn").click();
        await page.waitForFunction(() => document.querySelector("#summary").textContent.includes("25 / 61"));
        record("Existing storage key and legacy custom questions survive refactor");
        const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, reducedMotion: "reduce" });
        await mobile.route("https://www.youtube.com/embed/**", route =>
            route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Test player</title>" }));
        const phone = await mobile.newPage();
        phone.on("pageerror", e => errors.push(e.message));
        await phone.goto(url);
        assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await phone.screenshot({ path: path.join(root, "..", "subject-home-mobile.png") });
        await phone.locator("#musicToggleBtn").click();
        assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        const mobilePlayer = await phone.locator("#musicPlayerHost iframe").boundingBox();
        assert.ok(mobilePlayer.width >= 200 && mobilePlayer.height >= 200);
        await phone.screenshot({ path: path.join(root, "..", "music-panel-mobile.png") });
        await phone.locator("#musicCloseBtn").click();
        await phone.locator("#algorithmSubjectBtn").click();
        await phone.waitForFunction(() => document.querySelector("#summary").textContent.includes("25 / 60"));
        assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await phone.locator("#mobileMenuBtn").click();
        assert.equal(await phone.locator("#sidebarBackdrop").isVisible(), true);
        await phone.locator('[data-panel="units"]').click();
        assert.equal(await phone.locator("#sidebar").evaluate(el => el.inert), true);
        await phone.locator('#unitGrid [data-unit="u2"]').click();
        await phone.locator('[data-filter="disputed"]').click();
        await phone.locator(".answer-btn").click();
        assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        record("Mobile sidebar, unit navigation, and no horizontal overflow");
        const failure = await context.newPage();
        await failure.route("**/data/questions.json", route => route.fulfill({ status: 503, body: "Unavailable" }));
        await failure.goto(url);
        await failure.locator("#algorithmSubjectBtn").click();
        await failure.locator("#retryLoadBtn").waitFor();
        await failure.unroute("**/data/questions.json");
        await failure.locator("#retryLoadBtn").click();
        await failure.waitForFunction(() => document.querySelector("#summary").textContent.includes("25 / 61"));
        record("Failed JSON request shows retry and recovers");
        const questionData = JSON.parse(fs.readFileSync(path.join(root, "data/questions.json"), "utf8"));
        assert.equal(questionData.length, 60);
        assert.equal(new Set(questionData.map(q => q.id)).size, 60);
        questionData.filter(q => q.answer_basis === "content_verified_2026_10_04").forEach(q => {
            q.correct_answer.split("\n").forEach(answer => assert.ok(q.options.includes(answer), "Answer mismatch #" + q.id));
        });
        
        await page.locator("#mobileMenuBtn").click();
        await page.locator("#switchSubjectBtn").click();
        assert.equal(await page.locator("#subjectHome").isVisible(), true);
        assert.equal(await page.locator("#studyShell").isVisible(), false);
        assert.equal(await page.locator("#backToTopBtn").isVisible(), false);
        await page.screenshot({ path: path.join(root, "..", "subject-home-desktop.png") });
        await page.locator("#algorithmSubjectBtn").click();
        await page.waitForFunction(() => document.querySelector("#summary").textContent.includes("25 / 61"));
        await page.locator("#mobileMenuBtn").click();
        await page.locator('[data-panel="units"]').click();
        assert.equal(await page.locator('#unitGrid [data-unit="u1"]').isDisabled(), true);
        assert.equal(await page.locator('#unitGrid [data-unit="u3"]').isDisabled(), true);
        assert.equal(await page.locator('#unitGrid [data-unit="u2"]').getAttribute("aria-current"), "true");
        assert.equal(await page.locator("#panel-units").isVisible(), true);
        assert.equal(await page.locator("#unitGrid [data-unit]").count(), 3);
        record("Return to subjects; units appear only through unit selection");

        await phone.setViewportSize({ width: 390, height: 300 });
        await phone.locator("#mobileMenuBtn").click();
        const scrollbar = await phone.locator("#sidebar").evaluate(el => {
            el.scrollTop = el.scrollHeight;
            return {
                scrolls: el.scrollTop > 0,
                hidden: getComputedStyle(el).scrollbarWidth === "none",
                webkitHidden: getComputedStyle(el, "::-webkit-scrollbar").display === "none"
            };
        });
        assert.equal(scrollbar.scrolls, true);
        assert.equal(scrollbar.hidden, true);
        assert.equal(scrollbar.webkitHidden, true);
        await phone.locator("#switchSubjectBtn").click();
        await phone.setViewportSize({ width: 320, height: 568 });
        await phone.locator("#musicToggleBtn").click();
        const narrowPlayer = await phone.locator("#musicPlayerHost iframe").boundingBox();
        assert.ok(narrowPlayer.width >= 200 && narrowPlayer.height >= 200);
        assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await phone.locator("#musicCloseBtn").click();
        record("Sidebar scrolls without a scrollbar; music fits a 320px phone");

        // Test future units through intercepted responses; no invented questions are published.
        const isolated = await context.newPage();
        isolated.on("pageerror", e => errors.push(e.message));
        const catalog = fs.readFileSync(path.join(root, "js/units.js"), "utf8")
            .replace('{ id: "u1", name: "U1", dataUrl: null }', '{ id: "u1", name: "U1", dataUrl: "../data/test-u1.json" }')
            .replace('{ id: "u3", name: "U3", dataUrl: null }', '{ id: "u3", name: "U3", dataUrl: "../data/test-u3.json" }');
        await isolated.route("**/js/units.js", route => route.fulfill({ contentType: "text/javascript", body: catalog }));
        const fixture = Array.from({length: 63}, (_, i) => ({
            id: i + 1, type: "fill_blank", question: "U1 fixture " + (i + 1), correct_answer: "U1 answer", options: []
        }));
        await isolated.route("**/data/test-u1.json", route => route.fulfill({ contentType: "application/json", body: JSON.stringify(fixture) }));
        await isolated.route("**/data/test-u3.json", route => route.fulfill({ contentType: "application/json", body: JSON.stringify([{...fixture[0], question: "U3 fixture"}]) }));
        await isolated.goto(url);
        await isolated.locator("#algorithmSubjectBtn").click();
        await isolated.waitForFunction(() => document.querySelector("#summary").textContent.includes("25 / 61"));
        const legacyBefore = await isolated.evaluate(() => localStorage.getItem("algorithm_question_bank_user_questions_v1"));
        await isolated.locator("#showAllBtn").click();
        await isolated.locator("#nextPageBtn").click();
        await isolated.locator("#searchInput").fill("Legacy");
        await openUnit(isolated, "u1");
        await isolated.waitForFunction(() => document.querySelector("#summary").textContent.includes("25 / 63"));
        assert.equal(await isolated.locator("#currentUnitLabel").innerText(), "演算法｜U1");
        assert.equal(await isolated.locator("#searchInput").inputValue(), "");
        assert.equal(await isolated.locator("#pageInfo").innerText(), "第 1 / 3 頁");
        assert.equal(await isolated.locator("#questionList .answer.show").count(), 0);
        await isolated.locator("#nextPageBtn").click();
        await isolated.locator("#nextPageBtn").click();
        assert.equal(await isolated.locator("#questionList article").count(), 13);
        await isolated.locator("#searchInput").fill("Legacy");
        assert.equal(await isolated.locator("#questionList article").count(), 0);
        await openPanel(isolated, "add");
        assert.equal(await isolated.locator("#userQuestionList article").count(), 0);
        assert.match(await isolated.locator("#addUnitLabel").innerText(), /U1/);
        await isolated.locator("#newQuestion").fill("U1 custom question");
        await isolated.locator("#newAnswer").fill("U1 custom answer");
        await isolated.locator("#saveQuestionBtn").click();
        assert.equal(await isolated.locator("#userQuestionList article").count(), 1);
        assert.equal(await isolated.evaluate(() => localStorage.getItem("algorithm_question_bank_user_questions_v1")), legacyBefore);
        await openUnit(isolated, "u2");
        await isolated.waitForFunction(() => document.querySelector("#summary").textContent.includes("25 / 61"));
        await openPanel(isolated, "add");
        assert.match(await isolated.locator("#userQuestionList").innerText(), /Legacy content/);
        assert.doesNotMatch(await isolated.locator("#userQuestionList").innerText(), /U1 custom/);
        await openUnit(isolated, "u1");
        await isolated.waitForFunction(() => document.querySelector("#summary").textContent.includes("25 / 64"));
        await openPanel(isolated, "add");
        assert.match(await isolated.locator("#userQuestionList").innerText(), /U1 custom/);
        await isolated.locator("[data-delete-question]").click();
        assert.equal(await isolated.evaluate(() => localStorage.getItem("algorithm_question_bank_user_questions_v1")), legacyBefore);
        record("Independent 63/60-question units, pagination, answer reset and scoped custom storage");

        let releaseSlow;
        const slowResponse = new Promise(resolve => { releaseSlow = resolve; });
        await isolated.route("**/data/test-u1.json", async route => {
            await slowResponse;
            await route.fulfill({contentType: "application/json", body: JSON.stringify(fixture)});
        });
        await openUnit(isolated, "u2");
        await isolated.waitForFunction(() => document.querySelector("#summary").textContent.includes("25 / 61"));
        await openUnit(isolated, "u1");
        await openUnit(isolated, "u3");
        await isolated.waitForFunction(() => document.querySelector("#summary").textContent.includes("1 / 1"));
        releaseSlow();
        await isolated.waitForTimeout(150);
        assert.match(await isolated.locator("#questionList").innerText(), /U3 fixture/);
        assert.equal(await isolated.locator("#currentUnitLabel").innerText(), "演算法｜U3");
        record("Fast unit switching ignores stale responses");
        assert.deepEqual(errors, []);
        record("Unique IDs, verified option/answer mapping, and no browser exceptions");
        console.log(JSON.stringify({ passed: checks.length, checks }));
    } catch (error) {
        console.error(error);
        process.exitCode = 1;
    } finally {
        if (browser) await browser.close();
        server.close();
    }
});


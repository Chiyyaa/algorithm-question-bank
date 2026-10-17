const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(root,'data/english-vocabulary.json'),'utf8'));
let serverClock = Date.parse('2026-10-17T12:00:00+08:00');
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png'};
const server = http.createServer((req,res)=>{
    const route = new URL(req.url,'http://localhost').pathname.replace(/^\/algorithm-question-bank/,'');
    if(route==='/js/collaboration-config.js') { res.writeHead(200,{'Content-Type':'text/javascript'});res.end('export const collaborationConfig={enabled:false,url:"",publishableKey:""};');return; }
    const file = path.resolve(root,'.'+(route.endsWith('/') ? route+'index.html' : route));
    if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    fs.readFile(file,(error,body)=>{
        if(error){res.writeHead(404).end();return;}
        res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Date':new Date(serverClock).toUTCString(),'Cache-Control':'no-store'});
        res.end(req.method==='HEAD'?undefined:body);
    });
});
function fakeSpeech() {
    window.__spoken = []; window.__speechMode='ok';
    Object.defineProperty(window,'SpeechSynthesisUtterance',{configurable:true,value:class {constructor(text){this.text=text;}}});
    Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{
        getVoices:()=>[{lang:'en-US',name:'Test English'}],cancel(){},
        speak(u){window.__spoken.push(u.text);queueMicrotask(()=>{u.onstart?.();setTimeout(()=>window.__speechMode==='error'?u.onerror?.():u.onend?.(),15);});}
    }});
    Date.now = () => Date.parse('2040-01-01T00:00:00Z'); // Network time must override a bad device clock.
}
(async()=>{
    const core = await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync(path.join(root,'js/english-core.js'),'utf8')).toString('base64'));
    assert.equal(data.words.length,645);
    assert.ok(data.words.every((w,i)=>w.id===i+1&&w.word&&w.meaning&&w.pos));
    assert.deepEqual(data.words.filter(w=>w.word.toLowerCase()==='dos').map(w=>w.id),[191,384]);
    assert.equal(data.words[100].word,'drill down');assert.equal(data.words[149].word,'option button');
    assert.equal(core.weekInfo(Date.parse('2026-10-16T15:59:59.999+08:00'),data.schedule,645).week,2);
    assert.equal(core.weekInfo(Date.parse('2026-10-16T16:00:00+08:00'),data.schedule,645).week,3);
    assert.equal(core.weekInfo(Date.parse('2026-10-23T07:59:59.999Z'),data.schedule,645).end,150);
    assert.equal(core.weekInfo(Date.parse('2026-10-23T08:00:00Z'),data.schedule,645).start,151);
    assert.equal(core.weekInfo(Date.parse('2027-01-01T08:00:00Z'),data.schedule,645).finished,true);
    assert.equal(core.weekInfo(Date.parse('2027-01-01T08:00:00Z'),data.schedule,645).end,645);
    assert.equal(core.serverTime('Fri, 23 Oct 2026 08:00:00 GMT','2',200),Date.parse('2026-10-23T08:00:02.100Z'));
    assert.throws(()=>core.serverTime(null,null));
    assert.equal(core.isCorrect('  CENTRAL   PROCESSING UNIT  ','central processing unit'),true);
    assert.equal(core.isCorrect('ＩＣＴ','ICT'),true);
    assert.equal(core.isCorrect('readonly memory','read-only memory'),false);
    assert.ok(data.words.every(w=>!/[a-z]/i.test(core.quizPrompt(w.meaning))&&core.quizPrompt(w.meaning).length));
    for(let week=1;week<=13;week++){
        const info=core.weekInfo(Date.parse(data.schedule.weekOneStartsAt)+(week-1)*core.WEEK_MS,data.schedule,645);
        const quiz=core.createQuiz(data.words,info,20);
        assert.equal(quiz.items.length,20);assert.equal(new Set(quiz.items.map(i=>i.word.id)).size,20);
        assert.ok(quiz.items.every(i=>i.word.id>=info.start&&i.word.id<=info.end));
        assert.equal(core.advanceQuiz(quiz),false);assert.equal(core.submitAnswer(quiz,' '),false);
        for(let i=0;i<20;i++){assert.equal(core.submitAnswer(quiz,quiz.items[i].word.word),true);assert.equal(core.submitAnswer(quiz,'wrong'),false);core.advanceQuiz(quiz);}
        assert.equal(quiz.complete,true);assert.equal(quiz.items.filter(i=>i.correct).length,20);
    }
    console.log('PASS source fidelity structure, all weekly pools, Friday boundary, final week, clock age and grading');
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const url='http://127.0.0.1:'+server.address().port+'/algorithm-question-bank/';
    let browser;
    try{
        const channel=process.env.ENGLISH_BROWSER_CHANNEL||(!fs.existsSync(chromium.executablePath())&&fs.existsSync('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe')?'msedge':undefined);
        browser=await chromium.launch({headless:true,channel});
        const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Pacific/Honolulu',reducedMotion:'reduce'});
        await context.addInitScript(fakeSpeech);
        const page=await context.newPage();page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(20000);
        const errors=[];page.on('pageerror',e=>errors.push(e.message));
        await page.goto(url);
        assert.equal(await page.locator('#englishSubjectLink').getAttribute('href'),'./english.html');
        assert.equal(await page.locator('#algorithmSubjectBtn').count(),1);assert.equal(await page.locator('#osSubjectBtn').count(),1);
        await page.locator('#englishSubjectLink').click();
        await page.locator('.current-week').waitFor();
        assert.equal(await page.locator('#englishHeading').innerText(),'單字表');
        assert.equal(await page.locator('.current-week').getAttribute('data-week'),'3');
        assert.equal(await page.locator('.current-week tbody tr').count(),50);
        assert.equal(await page.locator('.current-week tbody tr').first().getAttribute('data-word-id'),'101');
        assert.equal(await page.locator('.current-week tbody tr').last().getAttribute('data-word-id'),'150');
        assert.match(await page.locator('#clockStatus').innerText(),/已由網站校時/);
        assert.equal(await page.locator('.sidebar-nav button').count(),3);assert.equal(await page.locator('.sidebar-nav button:disabled').count(),1);
        const screenshotDir=process.env.ENGLISH_SCREENSHOT_DIR;
        if(screenshotDir){fs.mkdirSync(screenshotDir,{recursive:true});await page.screenshot({path:path.join(screenshotDir,'english-vocabulary-desktop.png')});}
        await page.locator('#wordSearch').fill('ROM');assert.ok(await page.locator('#wordGroups').innerText().then(t=>t.includes('Read-Only Memory')));
        await page.locator('#wordSearch').fill('zzzz-no-such-word');assert.match(await page.locator('#wordGroups').innerText(),/找不到/);
        await page.locator('#wordSearch').fill('');
        await page.locator('#goQuizBtn').click();await page.locator('#startQuizBtn').click();
        await page.locator('#spellingForm button[type=submit]').click();assert.equal(await page.locator('#answerError').isVisible(),true);
        for(let i=0;i<3;i++){await page.locator('[data-speak="quiz"]').click();await page.waitForFunction(()=>!document.querySelector('[data-speak="quiz"]').disabled||document.querySelector('#playCount').textContent.includes('0'));}
        await page.waitForFunction(()=>document.querySelector('[data-speak="quiz"]').disabled);
        assert.equal(await page.evaluate(()=>window.__spoken.length),3);assert.match(await page.locator('#playCount').innerText(),/0/);
        await page.locator('#spellingAnswer').fill('draft answer');
        await page.locator('[data-view="vocabulary"]').click();await page.locator('[data-view="quiz"]').click();
        assert.equal(await page.locator('#spellingAnswer').inputValue(),'draft answer');assert.match(await page.locator('#playCount').innerText(),/0/);
        const seen=[];
        for(let i=0;i<20;i++){
            const id=Number(await page.locator('.quiz-card').getAttribute('data-question-id'));seen.push(id);
            assert.ok(id>=101&&id<=150);assert.ok(!/[a-z]/i.test(await page.locator('.quiz-meaning').innerText()));
            if(i===1){
                assert.match(await page.locator('#playCount').innerText(),/3/);
                await page.evaluate(()=>window.__speechMode='error');await page.locator('[data-speak="quiz"]').click();
                await page.waitForFunction(()=>document.querySelector('#speechStatus').textContent.includes('未扣除'));
                assert.match(await page.locator('#playCount').innerText(),/3/);await page.evaluate(()=>window.__speechMode='ok');
                serverClock=Date.parse('2026-10-23T16:00:00+08:00');await page.locator('#syncClockBtn').click();
                await page.waitForFunction(()=>document.querySelector('#weekHeading').textContent==='第 4 週',null,{timeout:15000});
                assert.equal(await page.locator('#quizWeekNotice').isVisible(),true);
                assert.equal(Number(await page.locator('.quiz-card').getAttribute('data-question-id')),id);
            }
            await page.locator('#spellingAnswer').fill(i===0?'definitely wrong':`  ${data.words[id-1].word.toUpperCase()}  `);
            await page.locator('#spellingForm button[type=submit]').click();
            assert.match(await page.locator('#answerFeedback').innerText(),new RegExp(data.words[id-1].word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
            if(i===0&&screenshotDir)await page.screenshot({path:path.join(screenshotDir,'english-quiz-desktop.png')});
            await page.locator('#nextQuestionBtn').click();
        }
        assert.equal(new Set(seen).size,20);assert.match(await page.locator('.result-score').innerText(),/95/);
        assert.equal(await page.locator('.review-item').count(),1);
        await page.locator('#restartQuizBtn').click();
        const newId=Number(await page.locator('.quiz-card').getAttribute('data-question-id'));assert.ok(newId>=151&&newId<=200);
        assert.equal(await page.locator('#quizWeekNotice').isVisible(),false);
        await page.setViewportSize({width:390,height:844});
        await page.locator('#englishMenuBtn').click();await page.locator('[data-view="vocabulary"]').click();
        assert.equal(await page.locator('#englishMenuBtn').getAttribute('aria-expanded'),'false');
        assert.equal(await page.locator('.current-week').getAttribute('data-week'),'4');
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
        if(screenshotDir)await page.screenshot({path:path.join(screenshotDir,'english-vocabulary-mobile.png')});
        await page.goBack();assert.equal(await page.locator('#englishHeading').innerText(),'當週測驗');
        assert.deepEqual(errors,[]);
        console.log('PASS home link, corrected Taipei time, 50 pinned words, 20 unique questions, three plays, failed speech refund, feedback, 95-point result, active rollover, mobile drawer and history');
        await context.close();
        const unsupported=await browser.newContext();
        await unsupported.addInitScript(()=>Object.defineProperty(window,'SpeechSynthesisUtterance',{value:undefined,configurable:true}));
        const p=await unsupported.newPage();await p.goto(url+'english.html');await p.locator('.current-week').waitFor();
        assert.match(await p.locator('#speechStatus').innerText(),/未提供語音/);assert.equal(await p.locator('[data-speak]').first().isDisabled(),true);
        await p.locator('#goQuizBtn').click();await p.locator('#startQuizBtn').click();assert.equal(await p.locator('#spellingAnswer').isEnabled(),true);
        await unsupported.close();
        const failure=await browser.newContext();const fp=await failure.newPage();let block=true;
        await fp.route('**/data/english-vocabulary.json*',route=>block?route.fulfill({status:503,body:'unavailable'}):route.continue());
        await fp.goto(url+'english.html');await fp.locator('#retryLoadBtn').waitFor();assert.match(await fp.locator('#loadStatus').innerText(),/無法載入/);
        block=false;await fp.locator('#retryLoadBtn').click();await fp.locator('.current-week').waitFor();
        console.log('PASS unsupported speech remains usable, failed data load and retry recovery');
        await failure.close();
    } finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});

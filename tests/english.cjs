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
    window.__spoken = []; window.__speechTimes = []; window.__speechMode='ok';
    Object.defineProperty(window,'SpeechSynthesisUtterance',{configurable:true,value:class {constructor(text){this.text=text;}}});
    Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{
        getVoices:()=>[{lang:'en-US',name:'Test English'}],cancel(){},
        speak(u){window.__spoken.push(u.text);window.__speechTimes.push(performance.now());queueMicrotask(()=>{u.onstart?.();setTimeout(()=>window.__speechMode==='error'?u.onerror?.():u.onend?.(),15);});}
    }});
    Date.now = () => Date.parse('2040-01-01T00:00:00Z'); // Network time must override a bad device clock.
}
async function checkResultScreens(browser, url, data) {
    const ctx = await browser.newContext({viewport:{width:1280,height:960},reducedMotion:'reduce'});
    await ctx.addInitScript(fakeSpeech);
    const page = await ctx.newPage(); page.setDefaultTimeout(15000);
    await page.goto(url+'english.html#quiz'); await page.locator('#startQuizBtn').click();
    const shots = process.env.ENGLISH_SCREENSHOT_DIR;
    for (const target of [0,7,8,18,19,20]) {
        if (target !== 0) await page.locator('#restartQuizBtn').click();
        let incorrect = 0;
        for (let i=0;i<target;i++) {
            const id=Number(await page.locator('.quiz-card').getAttribute('data-question-id'));
            await page.locator('#spellingAnswer').fill(data.words[id-1].word);
            await page.locator('#spellingForm button[type=submit]').click();
            if(target===20||i<target-1)await page.locator('#nextQuestionBtn').click();
        }
        if(target!==20) {
            // After the last submitted correct answer, quitting includes the remaining questions.
            if(target>0)await page.locator('#nextQuestionBtn').click();
            if(target===7||target===18) {
                await page.locator('#spellingAnswer').fill('incorrect example');
                await page.locator('#spellingForm button[type=submit]').click(); incorrect=1;
            }
            if(target===0) {
                await page.locator('#spellingAnswer').fill('not submitted');
                const quit=await page.locator('#giveUpQuizBtn').boundingBox();
                const progress=await page.locator('.quiz-progress-row').boundingBox();
                assert.ok(quit.y+quit.height<=progress.y);
                if(shots){fs.mkdirSync(shots,{recursive:true});await page.screenshot({path:path.join(shots,'quiz-autoplay.png')});}
            }
            const before=await page.evaluate(()=>window.__spoken.length);
            await page.locator('#giveUpQuizBtn').click();
            if(target===0) {await page.waitForTimeout(1150);assert.equal(await page.evaluate(()=>window.__spoken.length),before);}
        }
        const key=target===20?'perfect':target===19?'almost':target>=8?'good':'low';
        const text=target===20?'很棒 恭喜過關':target===19?'嘻嘻 差一題 ! !':target>=8?'還不錯 就只有不錯':'你拉完了還不背...';
        assert.equal(await page.locator('.result-card').getAttribute('data-rating'),key);
        assert.equal(await page.locator('#resultHeading').innerText(),text);
        assert.equal(await page.locator('.result-rating-image').getAttribute('src'),'./images/english-result-'+key+'.jpg');
        await page.waitForFunction(()=>{const img=document.querySelector('.result-rating-image');return img&&img.complete&&img.naturalWidth>0;});
        assert.match(await page.locator('.result-score').innerText(),new RegExp(String(target*5)));
        assert.equal(await page.locator('[data-review-status="incorrect"]').count(),incorrect);
        assert.equal(await page.locator('[data-review-status="unanswered"]').count(),20-target-incorrect);
        if(target===0) {
            assert.match(await page.locator('.review-input').innerText(),/尚未送出/);
            await page.setViewportSize({width:390,height:844});
            assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
            assert.ok(await page.locator('.result-rating-image').evaluate(img=>img.clientWidth<=innerWidth));
            if(shots)await page.screenshot({path:path.join(shots,'early-result-mobile.png')});
            await page.setViewportSize({width:1280,height:960});
        }
        if(target===20)assert.equal(await page.locator('.review-item').count(),0);
    }
    await ctx.close();
    const blocked=await browser.newContext();
    await blocked.addInitScript(fakeSpeech);
    const p=await blocked.newPage();p.setDefaultTimeout(15000);
    await p.goto(url+'english.html#quiz');await p.evaluate(()=>window.__speechMode='error');
    await p.locator('#startQuizBtn').click();
    await p.waitForFunction(()=>document.querySelector('#quizAudioNotice')?.textContent.includes('自動發音未能播放'));
    assert.match(await p.locator('#playCount').innerText(),/2/);
    const before=await p.evaluate(()=>window.__spoken.length);
    await p.locator('[data-view="vocabulary"]').click();await p.locator('[data-view="quiz"]').click();
    await p.waitForTimeout(1150);assert.equal(await p.evaluate(()=>window.__spoken.length),before);
    await p.locator('#giveUpQuizBtn').click();await blocked.close();
    console.log('PASS 0/7/8/18/19/20 ratings, original images, early settlement, unsubmitted drafts, wrong/unanswered review, pending autoplay cancellation and blocked autoplay recovery');
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

    for (const [count,key] of [[0,'low'],[7,'low'],[8,'good'],[18,'good'],[19,'almost'],[20,'perfect']]) assert.equal(core.resultRating(count).key,key);
    const early=core.createQuiz(data.words,core.weekInfo(serverClock,data.schedule,645),20);
    core.submitAnswer(early,early.items[0].word.word);core.advanceQuiz(early);
    core.submitAnswer(early,'wrong');core.advanceQuiz(early);early.items[2].input='draft';
    assert.equal(core.finishQuiz(early),true);assert.equal(core.finishQuiz(early),false);
    const summary=core.quizSummary(early);
    assert.equal(summary.correct,1);assert.equal(summary.incorrect.length,1);assert.equal(summary.unanswered.length,18);assert.equal(summary.score,5);
    assert.equal(core.submitAnswer(early,early.items[2].word.word),false);assert.equal(core.advanceQuiz(early),false);
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
        const screenshotDir=undefined; // This revision emits only the two explicitly requested preview files.
        if(screenshotDir){fs.mkdirSync(screenshotDir,{recursive:true});await page.screenshot({path:path.join(screenshotDir,'english-vocabulary-desktop.png')});}
        await page.locator('#wordSearch').fill('ROM');assert.ok(await page.locator('#wordGroups').innerText().then(t=>t.includes('Read-Only Memory')));
        await page.locator('#wordSearch').fill('zzzz-no-such-word');assert.match(await page.locator('#wordGroups').innerText(),/找不到/);
        await page.locator('#wordSearch').fill('');
        await page.locator('#goQuizBtn').click();await page.locator('#startQuizBtn').click();
        await page.locator('#spellingForm button[type=submit]').click();assert.equal(await page.locator('#answerError').isVisible(),true);
        const questionSeenAt=await page.evaluate(()=>performance.now());
        assert.equal(await page.evaluate(()=>window.__spoken.length),0);
        await page.waitForFunction(()=>window.__spoken.length===1);
        assert.ok(await page.evaluate(()=>window.__speechTimes[0])-questionSeenAt>=850);
        for(let i=0;i<2;i++){await page.locator('[data-speak="quiz"]').click();await page.waitForFunction(()=>!document.querySelector('[data-speak="quiz"]').disabled||document.querySelector('#playCount').textContent.includes('0'));}
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
                await page.waitForFunction(()=>document.querySelector('#playCount').textContent.includes('手動剩餘 2')&&!document.querySelector('[data-speak="quiz"]').disabled);
                assert.match(await page.locator('#playCount').innerText(),/2/);
                await page.evaluate(()=>window.__speechMode='error');await page.locator('[data-speak="quiz"]').click();
                await page.waitForFunction(()=>document.querySelector('#speechStatus').textContent.includes('未扣除'));
                assert.match(await page.locator('#playCount').innerText(),/2/);await page.evaluate(()=>window.__speechMode='ok');
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
        console.log('PASS home link, corrected Taipei time, 50 pinned words, 20 unique questions, one delayed autoplay plus two manual replays, failed speech refund, feedback, 95-point result, active rollover, mobile drawer and history');
        await context.close();
        await checkResultScreens(browser,url,data);
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

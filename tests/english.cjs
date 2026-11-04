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
function fakeSpeech(options) {
    if (!options?.showAnnouncement) localStorage.setItem('english_biweekly_total_20261022_seen','seen');
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
    assert.ok(data.words.every(w=>!/[a-z]/i.test(core.quizPrompt(w.meaning))&&core.quizPrompt(w.meaning).length));
    const cutoff=Date.parse('2026-11-11T16:00:00+08:00');
    for(const at of ['2026-10-16T16:00:00+08:00','2026-10-30T16:00:00+08:00','2026-11-05T12:00:00+08:00','2026-11-11T15:59:59.999+08:00']) {
        const info=core.weekInfo(Date.parse(at),data.schedule,645);
        assert.deepEqual([info.week,info.start,info.end,info.nextAt],[3,101,150,cutoff]);
    }
    const fourth=core.weekInfo(cutoff,data.schedule,645);
    assert.deepEqual([fourth.week,fourth.start,fourth.end],[4,151,250]);
    assert.equal(core.wordsForWeek(data.words,fourth).length,100);
    assert.equal(core.weekInfo(Date.parse('2026-10-16T15:59:59.999+08:00'),data.schedule,645).week,2);
    const periods=core.vocabularyPeriods(data.schedule,645);
    assert.deepEqual(periods[3],{week:4,start:151,end:250});
    assert.deepEqual(periods[4],{week:5,start:251,end:300});
    assert.deepEqual(periods.flatMap(p=>data.words.filter(w=>w.id>=p.start&&w.id<=p.end)).map(w=>w.id),data.words.map(w=>w.id));
    const samples=new Set();
    for(let n=0;n<60;n++) {
        const q=core.createMidtermQuiz(data.words);
        assert.equal(q.mode,'midterm');assert.equal(q.items.length,20);
        const ids=q.items.map(i=>i.word.id);assert.equal(new Set(ids).size,20);assert.ok(ids.every(id=>id>=1&&id<=150));
        ids.forEach(id=>samples.add(id));
    }
    assert.ok(samples.has(1)&&samples.has(150));
    assert.equal(core.isCorrect('  CENTRAL   PROCESSING UNIT  ','central processing unit'),true);
    assert.equal(core.isCorrect('readonly memory','read-only memory'),false);
    assert.equal(core.serverTime('Fri, 23 Oct 2026 08:00:00 GMT','2',200),Date.parse('2026-10-23T08:00:02.100Z'));
    console.log('PASS midterm unique sampling across 1–150, complete vocabulary grouping, held period 3 and exact 11/11 period 4 boundary');
    serverClock=Date.parse('2026-11-05T12:00:00+08:00');
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const url='http://127.0.0.1:'+server.address().port+'/algorithm-question-bank/';
    let browser;
    try {
        browser=await chromium.launch({headless:true,executablePath:process.env.ENGLISH_BROWSER_PATH||undefined});
        const ctx=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Pacific/Honolulu'});
        await ctx.addInitScript(fakeSpeech);
        const page=await ctx.newPage();page.setDefaultTimeout(15000);
        const errors=[];page.on('pageerror',e=>errors.push(e.message));
        await page.goto(url+'english.html');
        await page.locator('.midterm-words').waitFor();
        assert.equal(await page.locator('#englishAnnouncement').evaluate(e=>e.open),false);
        assert.equal(await page.locator('.midterm-words tbody tr').count(),150);
        assert.equal(await page.locator('#wordGroups > :first-child').getAttribute('class'),'word-group midterm-words');
        assert.equal(await page.locator('.midterm-words tbody tr').first().getAttribute('data-word-id'),'1');
        assert.equal(await page.locator('.midterm-words tbody tr').last().getAttribute('data-word-id'),'150');
        assert.equal(await page.locator('[data-week="4"] tbody tr').count(),100);
        assert.match(await page.locator('#weekHeading').innerText(),/第 3 期/);
        assert.match(await page.locator('#weekRange').innerText(),/101–150/);
        assert.match(await page.locator('#nextWeekTime').innerText(),/11\/11.*16:00/);
        assert.equal(await page.locator('[data-view="total"]').count(),0);
        assert.equal(await page.locator('[data-view="grammar"]').count(),1);
        await page.locator('#wordSearch').fill('zzzz-no-match');assert.match(await page.locator('#wordGroups').innerText(),/找不到/);
        await page.locator('#wordSearch').fill('645');assert.equal(await page.locator('#wordGroups tbody tr').count(),1);
        await page.locator('#wordSearch').fill('');
        await page.locator('[data-view="midterm"]').click();
        assert.match(await page.locator('.quiz-intro').innerText(),/考試當天不會播放音檔/);
        assert.match(await page.locator('.quiz-intro').innerText(),/1–150/);
        assert.match(await page.locator('.quiz-intro').innerText(),/手動播放 1 次，不會自動播放/);
        await page.locator('#startQuizBtn').click();
        await page.waitForTimeout(1250);assert.equal(await page.evaluate(()=>window.__spoken.length),0);
        assert.equal(await page.locator('[data-speak="quiz"]').isEnabled(),true);
        const id=await page.locator('.quiz-card').getAttribute('data-question-id');
        await page.locator('#spellingAnswer').fill('saved midterm draft');
        await page.locator('[data-speak="quiz"]').click();
        await page.waitForFunction(()=>document.querySelector('#playCount').textContent.includes('剩餘 0'));
        assert.equal(await page.locator('[data-speak="quiz"]').isDisabled(),true);
        assert.equal(await page.evaluate(()=>window.__spoken.length),1);
        await page.locator('[data-view="quiz"]').click();
        assert.match(await page.locator('.quiz-intro').innerText(),/第 3 期 · 101–150/);
        await page.locator('#startQuizBtn').click();
        await page.locator('#spellingAnswer').fill('saved weekly draft');
        const weeklyId=await page.locator('.quiz-card').getAttribute('data-question-id');
        await page.locator('[data-view="midterm"]').click();
        assert.equal(await page.locator('.quiz-card').getAttribute('data-question-id'),id);
        assert.equal(await page.locator('#spellingAnswer').inputValue(),'saved midterm draft');
        assert.equal(await page.locator('[data-speak="quiz"]').isDisabled(),true);
        await page.waitForTimeout(1250);assert.equal(await page.evaluate(()=>window.__spoken.length),1);
        const shots=process.env.ENGLISH_SCREENSHOT_DIR;
        if(shots){fs.mkdirSync(shots,{recursive:true});await page.screenshot({path:path.join(shots,'期中測驗_桌面.png')});}
        const ids=[];
        for(let i=0;i<20;i++) {
            const qid=Number(await page.locator('.quiz-card').getAttribute('data-question-id'));ids.push(qid);
            assert.ok(qid>=1&&qid<=150);assert.ok(!/[a-z]/i.test(await page.locator('.quiz-meaning').innerText()));
            if(i===1) {
                await page.waitForTimeout(1100);assert.equal(await page.evaluate(()=>window.__spoken.length),1);
                await page.evaluate(()=>window.__speechMode='error');await page.locator('[data-speak="quiz"]').click();
                await page.waitForFunction(()=>document.querySelector('#speechStatus').textContent.includes('未扣除'));
                assert.match(await page.locator('#playCount').innerText(),/剩餘 1/);
                await page.evaluate(()=>window.__speechMode='ok');await page.locator('[data-speak="quiz"]').click();
                await page.waitForFunction(()=>document.querySelector('#playCount').textContent.includes('剩餘 0'));
            }
            await page.locator('#spellingAnswer').fill(i===0?'wrong':data.words[qid-1].word);
            await page.locator('#spellingForm button[type="submit"]').click();
            assert.equal(await page.locator('.correct-word').innerText(),data.words[qid-1].word);
            await page.locator('#nextQuestionBtn').click();
        }
        assert.equal(new Set(ids).size,20);assert.match(await page.locator('.result-score').innerText(),/95/);
        assert.match(await page.locator('.result-card .prompt-label').innerText(),/期中單字測驗/);
        assert.equal(await page.locator('.review-item').count(),1);
        await page.locator('[data-view="quiz"]').click();
        assert.equal(await page.locator('.quiz-card').getAttribute('data-question-id'),weeklyId);
        assert.equal(await page.locator('#spellingAnswer').inputValue(),'saved weekly draft');
        await page.waitForFunction(()=>window.__spoken.length===4);
        assert.match(await page.locator('#playCount').innerText(),/剩餘 2/);
        serverClock=cutoff-1000;await page.locator('#syncClockBtn').click();
        assert.match(await page.locator('#weekHeading').innerText(),/第 3 期/);
        serverClock=cutoff;await page.locator('#syncClockBtn').click();
        await page.waitForFunction(()=>document.querySelector('#weekHeading').textContent==='第 4 期');
        assert.match(await page.locator('#weekRange').innerText(),/151–250.*100/);
        assert.equal(await page.locator('#quizWeekNotice').isVisible(),true);
        assert.equal(await page.locator('.quiz-card').getAttribute('data-question-id'),weeklyId);
        await page.locator('#giveUpQuizBtn').click();await page.locator('#restartQuizBtn').click();
        const newId=Number(await page.locator('.quiz-card').getAttribute('data-question-id'));assert.ok(newId>=151&&newId<=250);
        await page.locator('[data-view="midterm"]').click();await page.locator('#restartQuizBtn').click();
        await page.setViewportSize({width:390,height:844});
        await page.waitForTimeout(400);
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        if(shots)await page.screenshot({path:path.join(shots,'期中測驗_手機.png')});
        await page.locator('#englishMenuBtn').click();await page.locator('[data-view="vocabulary"]').click();
        await page.waitForTimeout(400);
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        if(shots)await page.screenshot({path:path.join(shots,'期中單字表_手機.png')});
        await page.goto(url+'english.html#total');await page.locator('.midterm-words').waitFor();
        assert.equal(await page.locator('#quizView').isVisible(),false);
        assert.deepEqual(errors,[]);await ctx.close();
        console.log('PASS hidden total including old deep link, 150 pinned words, midterm reminder, no autoplay, one manual play, speech failure refund, independent saved sessions, 20 questions and 95-point grading, live rollover and mobile layout');
        serverClock=Date.parse('2026-11-05T12:00:00+08:00');
        await checkResultScreens(browser,url,data);
        const unsupported=await browser.newContext();
        await unsupported.addInitScript(()=>Object.defineProperty(window,'SpeechSynthesisUtterance',{value:undefined,configurable:true}));
        const p=await unsupported.newPage();await p.goto(url+'english.html#midterm');await p.locator('#startQuizBtn').click();
        assert.equal(await p.locator('[data-speak="quiz"]').isDisabled(),true);
        assert.equal(await p.locator('#spellingAnswer').isEnabled(),true);
        await unsupported.close();
        console.log('PASS midterm remains usable without speech support');
    } finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});

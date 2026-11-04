const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const data=JSON.parse(fs.readFileSync(path.join(root,'data/english-grammar.json'),'utf8'));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.css':'text/css; charset=utf-8','.jpg':'image/jpeg'};
const server=http.createServer((req,res)=>{
    const route=new URL(req.url,'http://localhost').pathname.replace(/^\/algorithm-question-bank/,'');
    const file=path.resolve(root,'.'+(route.endsWith('/')?route+'index.html':route));
    if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    fs.readFile(file,(error,body)=>{if(error){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Date':'Thu, 05 Nov 2026 04:00:00 GMT','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:body);});
});
(async()=>{
    const {createGrammarSession}=await import(pathToFileURL(path.join(root,'js/english-grammar.js')));
    assert.equal(data.questions.length,50);assert.deepEqual(data.questions.map(q=>q.id),Array.from({length:50},(_,i)=>i+1));
    if(process.env.ENGLISH_GRAMMAR_SOURCE){
        const source=fs.readFileSync(process.env.ENGLISH_GRAMMAR_SOURCE,'utf8');
        const rows=[...source.matchAll(/^(\d+)\. (.+)\r?\n\(A\) (.+?) \(B\) (.+?) \(C\) (.+?) \(D\) (.+)\r?\n答案：([A-D])\r?\n解析：(.+)/gm)];
        assert.equal(rows.length,50);
        assert.deepEqual(data.questions,rows.map(m=>({id:Number(m[1]),question:m[2],options:m.slice(3,7),answer:m[7],explanation:m[8]})));
    }
    for(const size of [20,50])for(const random of [()=>0,()=>.99999,Math.random]){
        const s=createGrammarSession(data.questions,size,random);assert.equal(s.items.length,size);assert.equal(new Set(s.items.map(i=>i.question.id)).size,size);
        assert.ok(s.items.every(i=>i.question.id>=1&&i.question.id<=50&&!i.answered));
        if(size===50)assert.deepEqual(s.items.map(i=>i.question.id).sort((a,b)=>a-b),data.questions.map(q=>q.id));
    }
    assert.throws(()=>createGrammarSession(data.questions,30));
    console.log('PASS exact source fidelity for 50 questions/options/answers/explanations, 20/50 unique sampling');
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const url='http://127.0.0.1:'+server.address().port+'/algorithm-question-bank/english.html';
    let browser;
    try{
        browser=await chromium.launch({headless:true,executablePath:process.env.ENGLISH_BROWSER_PATH||undefined});
        const ctx=await browser.newContext({viewport:{width:1280,height:960},reducedMotion:'reduce'});
        await ctx.addInitScript(()=>{window.__speechCalls=0;Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{cancel(){},getVoices:()=>[],speak(){window.__speechCalls++;}}});});
        const page=await ctx.newPage();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
        await page.goto(url+'#grammar');await page.locator('#grammarStartForm').waitFor();
        assert.equal(await page.locator('#englishHeading').innerText(),'期中文法測驗');
        assert.equal(await page.locator('[data-view="total"]').count(),0);
        assert.equal(await page.locator('.week-banner').isVisible(),false);
        assert.equal(await page.locator('#englishAnnouncement').evaluate(e=>e.open),false);
        assert.equal(await page.locator('[name="grammarCount"]:checked').inputValue(),'20');
        await page.locator('#grammarStartForm button').click();
        await page.locator('#grammarAnswerForm button[type="submit"]').click();assert.equal(await page.locator('#grammarError').isVisible(),true);
        const firstId=await page.locator('.grammar-card').getAttribute('data-grammar-id');
        const first=data.questions[Number(firstId)-1];
        assert.equal(await page.locator('#grammarQuestion').innerText(),first.question.replace(/__/g,'＿＿'));
        const wrong=['A','B','C','D'].find(x=>x!==first.answer);
        await page.locator('[name="grammarAnswer"][value="'+wrong+'"]').check();
        await page.locator('[data-view="vocabulary"]').click();await page.locator('[data-view="grammar"]').click();
        assert.equal(await page.locator('.grammar-card').getAttribute('data-grammar-id'),firstId);
        assert.equal(await page.locator('[name="grammarAnswer"]:checked').inputValue(),wrong);
        await page.locator('#grammarAnswerForm button[type="submit"]').click();
        assert.equal(await page.locator('.grammar-explanation').innerText(),first.explanation);
        assert.equal(await page.locator('.grammar-option.option-correct').count(),1);
        assert.equal(await page.locator('.grammar-option.option-incorrect').count(),1);
        await page.locator('[data-view="midterm"]').click();await page.locator('[data-view="grammar"]').click();
        assert.equal(await page.locator('.grammar-explanation').innerText(),first.explanation);
        const ids=[Number(firstId)];await page.locator('#grammarNextBtn').click();
        for(let i=1;i<20;i++){
            const id=Number(await page.locator('.grammar-card').getAttribute('data-grammar-id'));ids.push(id);
            await page.locator('[name="grammarAnswer"][value="'+data.questions[id-1].answer+'"]').check();
            await page.locator('#grammarAnswerForm button[type="submit"]').click();await page.locator('#grammarNextBtn').click();
        }
        assert.equal(new Set(ids).size,20);assert.match(await page.locator('.grammar-results .result-score').innerText(),/95/);
        assert.equal(await page.locator('[data-grammar-review-id]').count(),1);
        assert.equal(await page.locator('[data-grammar-review-id]').getAttribute('data-grammar-review-id'),firstId);
        assert.match(await page.locator('[data-grammar-review-id]').innerText(),new RegExp('你的答案：'+wrong));
        assert.ok((await page.locator('[data-grammar-review-id]').innerText()).includes(first.explanation));
        await page.locator('#grammarRestartBtn').click();assert.match(await page.locator('.quiz-progress-row').innerText(),/1 \/ 20/);
        await page.goBack();await page.goForward();assert.equal(await page.locator('#englishHeading').innerText(),'期中文法測驗');
        await page.reload();await page.locator('[name="grammarCount"][value="50"]').check();
        await page.locator('[data-view="quiz"]').click();await page.locator('[data-view="grammar"]').click();
        assert.equal(await page.locator('[name="grammarCount"]:checked').inputValue(),'50');
        await page.locator('#grammarStartForm button').click();
        await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        if(process.env.ENGLISH_GRAMMAR_SCREENSHOT){
            assert.equal(fs.existsSync(process.env.ENGLISH_GRAMMAR_SCREENSHOT),false,'Never overwrite an existing screenshot');
            await page.screenshot({path:process.env.ENGLISH_GRAMMAR_SCREENSHOT,fullPage:true});
        }
        await page.setViewportSize({width:1280,height:960});
        const all=[];
        for(let i=0;i<50;i++){
            const id=Number(await page.locator('.grammar-card').getAttribute('data-grammar-id'));all.push(id);
            assert.deepEqual(await page.locator('.grammar-option > span[lang="en"]').allTextContents(),data.questions[id-1].options);
            await page.locator('[name="grammarAnswer"][value="'+data.questions[id-1].answer+'"]').check();
            await page.locator('#grammarAnswerForm button[type="submit"]').click();
            assert.equal(await page.locator('.grammar-explanation').innerText(),data.questions[id-1].explanation);
            await page.locator('#grammarNextBtn').click();
        }
        assert.deepEqual(all.sort((a,b)=>a-b),data.questions.map(q=>q.id));
        assert.match(await page.locator('.result-score').innerText(),/100/);assert.equal(await page.locator('[data-grammar-review-id]').count(),0);
        await page.locator('#grammarResetBtn').click();assert.equal(await page.locator('[name="grammarCount"]:checked').inputValue(),'50');
        assert.equal(await page.evaluate(()=>window.__speechCalls),0);assert.deepEqual(errors,[]);
        await ctx.close();
        const retry=await browser.newContext();const rp=await retry.newPage();let blocked=true;
        await rp.route('**/data/english-grammar.json*',route=>blocked?route.fulfill({status:503,body:'unavailable'}):route.continue());
        await rp.goto(url+'#grammar');await rp.locator('#grammarRetryBtn').waitFor();blocked=false;
        await rp.locator('#grammarRetryBtn').click();await rp.locator('#grammarStartForm').waitFor();await retry.close();
        console.log('PASS grammar deep link/history, hidden total, required choice, saved drafts and feedback, 20 questions/95 points/wrong review, all 50/100 points/exact options and explanations, mobile layout, no audio, restart and load retry');
    }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});

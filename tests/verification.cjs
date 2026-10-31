const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),http=require('node:http'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const data=JSON.parse(fs.readFileSync(path.join(root,'data/practice-verification.json'),'utf8'));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png'};
(async()=>{
 let server,browser;
 try{
  assert.deepEqual(data.map(q=>[q.question,q.options,q.correct_answer]),[
   ['aespa有幾位成員?',['2','3','4','5'],'4'],
   ['aespa的隊長是哪一位?',['Karina','Giselle','Winter','Ningning'],'Karina'],
   ['請問<BLUE>是下列哪位solo的?',['Karina','Giselle','Winter','Ningning'],'Winter'],
   ['請問aespa的韓國出道日期是哪天?',['2020/11/17','2020/10/10','2020/1/1','2020/12/25'],'2020/11/17']
  ]);
  const context=vm.createContext({});
  const core=new vm.SourceTextModule(fs.readFileSync(path.join(root,'js/practice-core.js'),'utf8'),{context});
  const practice=new vm.SourceTextModule(fs.readFileSync(path.join(root,'js/practice.js'),'utf8'),{context});
  await core.link(()=>{throw Error('Unexpected core import');});await core.evaluate();
  await practice.link(()=>core);await practice.evaluate();
  const api=practice.namespace,pool=api.prepareVerificationQuestions(data);
  assert.equal(pool.length,4);
  assert.deepEqual(Array.from(new Set([0,.25,.5,.75,.999].map(r=>api.drawVerificationQuestion(pool,()=>r).id))),data.map(q=>q.id));
  assert.throws(()=>api.prepareVerificationQuestions([]));
  assert.throws(()=>api.prepareVerificationQuestions([{...data[0],correct_answer:'missing'}]));
  assert.throws(()=>api.prepareVerificationQuestions([data[0],data[0]]));
  assert.throws(()=>api.prepareVerificationQuestions([{...data[0],options:['4','4']}]));
  assert.throws(()=>api.prepareVerificationQuestions([{...data[0],type:'fill'}]));
  const clone=api.drawVerificationQuestion(pool,()=>0);clone.options[0]='changed';assert.equal(pool[0].options[0],'2');
  console.log('PASS attachment text/options/answers, all four random draws, invalid-data rejection and isolated copies');
  server=http.createServer((req,res)=>{
   const route=new URL(req.url,'http://localhost').pathname.replace(/^\/algorithm-question-bank/,'');
   if(route==='/js/collaboration-config.js'){res.writeHead(200,{'Content-Type':types['.js']});res.end('export const collaborationConfig={enabled:false,url:"",publishableKey:""};');return;}
   const file=path.resolve(root,'.'+(route.endsWith('/')?route+'index.html':route));
   if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
   fs.readFile(file,(e,b)=>{if(e){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(b);});
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const url='http://127.0.0.1:'+server.address().port+'/algorithm-question-bank/';
  const {chromium}=require('playwright');browser=await chromium.launch({headless:true,channel:'msedge'});
  const p=await browser.newPage({viewport:{width:1280,height:900},reducedMotion:'reduce'}),errors=[];
  p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));
  const nav=async panel=>{if(await p.locator('#mobileMenuBtn').getAttribute('aria-expanded')!=='true')await p.locator('#mobileMenuBtn').click();await p.locator('[data-panel="'+panel+'"]').click();};
  const start=async(index,unit='u6',count=15)=>{
   await p.goto(url);await p.locator('#algorithmSubjectBtn').click();await nav('practice');
   await p.locator('#practiceUnit').selectOption(unit);await p.locator('[name="practiceCount"][value="'+count+'"]').check();
   await p.waitForFunction(()=>!document.getElementById('practiceStart').disabled);
   await p.evaluate(r=>{Math.random=()=>r;},(index+.1)/4);
   await p.locator('#practiceStart').click();await p.locator('#verificationHeading').waitFor();
  };
  for(let i=0;i<4;i++){
   const q=data[i],unit=i%2?'u7':'u6',count=i%2?30:15;
   await start(i,unit,count);
   assert.equal(await p.locator('[data-verification-question-id]').getAttribute('data-verification-question-id'),q.id);
   assert.equal(await p.locator('[data-practice-question-id],.practice-progress,.practice-result').count(),0);
   assert.equal(await p.locator('.practice-stem').innerText(),q.question);
   assert.equal(await p.locator('.practice-stem blue').count(),0);
   assert.equal(await p.locator('#practiceUnit').isDisabled(),true);
   await p.locator('#verificationSubmit').click();assert.equal(await p.locator('#verificationError').isVisible(),true);
   assert.equal(await p.locator('#subjectHome').isHidden(),true);
   await p.locator('[data-verification-choice="'+((q.options.indexOf(q.correct_answer)+1)%q.options.length)+'"]').check();
   await p.locator('#verificationSubmit').click();await p.locator('#subjectHome').waitFor({state:'visible'});
   assert.equal(await p.locator('#studyShell').isHidden(),true);assert.equal(await p.locator('.practice-card,.practice-result').count(),0);
   assert.equal(await p.evaluate(()=>history.state.questionBank.view),'home');
   await start(i,unit,count);
   const expected=q.options.indexOf(q.correct_answer);
   await p.locator('[data-verification-choice="'+expected+'"]').check();
   await p.locator('#studyThemeBtn').click();
   assert.equal(await p.locator('[data-verification-choice="'+expected+'"]').isChecked(),true);
   await nav('bank');await nav('practice');
   assert.equal(await p.locator('[data-verification-question-id]').getAttribute('data-verification-question-id'),q.id);
   assert.equal(await p.locator('[data-verification-choice="'+expected+'"]').isChecked(),true);
   if(i===2&&process.env.VERIFICATION_SCREENSHOTS){fs.mkdirSync(process.env.VERIFICATION_SCREENSHOTS,{recursive:true});await p.screenshot({path:path.join(process.env.VERIFICATION_SCREENSHOTS,'verification.png')});}
   await p.locator('#verificationSubmit').click();await p.locator('[data-practice-question-id]').waitFor();
   assert.equal(await p.locator('#verificationHeading').count(),0);
   assert.equal(await p.locator('.practice-progress').getAttribute('max'),String(count));
   assert.equal(await p.locator('.practice-progress').getAttribute('value'),'0');
   assert.match(await p.locator('.practice-question-header').innerText(),new RegExp('第 1 / '+count+' 題'));
   const inputs=p.locator('[data-practice-blank]');
   if(await inputs.count()){for(const input of await inputs.all())await input.fill('incorrect test response');}
   else await p.locator('[data-practice-choice]').first().check();
   await p.locator('#practiceSubmit').click();await p.locator('#practiceFeedbackHeading').waitFor();
   assert.equal(await p.locator('#subjectHome').isHidden(),true);
   await p.locator('#practiceNext').click();assert.match(await p.locator('.practice-question-header').innerText(),/第 2 /);
   p.once('dialog',d=>d.accept());await p.locator('#practiceReset').click();
   await p.locator('#practiceStart').click();await p.locator('#verificationHeading').waitFor();
  }
  console.log('PASS all four questions: empty-answer guard, wrong => homepage, correct => question 1 of 15/30, formal feedback, preserved pending answers and revalidation per attempt');
  await p.reload();await p.locator('#algorithmSubjectBtn').click();await nav('practice');
  await p.waitForFunction(()=>!document.getElementById('practiceStart').disabled);await p.locator('#practiceStart').click();
  p.once('dialog',d=>d.accept());await p.locator('#practiceReset').click();assert.equal(await p.locator('#verificationHeading').count(),0);
  assert.equal(await p.locator('#practiceUnit').isDisabled(),false);
  await p.route('**/data/practice-verification.json*',route=>route.fulfill({status:503,body:'Unavailable'}));
  await p.reload();await p.locator('#algorithmSubjectBtn').click();await nav('practice');await p.locator('#practiceRetry').waitFor();
  assert.equal(await p.locator('#practiceStart').isDisabled(),true);
  await p.unroute('**/data/practice-verification.json*');await p.locator('#practiceRetry').click();
  await p.waitForFunction(()=>!document.getElementById('practiceStart').disabled);
  for(const subject of ['algorithm','os']){
   await p.goto(url);await p.locator('#'+subject+'SubjectBtn').click();await p.locator('#summary').filter({hasText:'目前顯示'}).waitFor();
   for(const width of [1280,390]){
    await p.setViewportSize({width,height:844});await p.evaluate(()=>scrollTo(0,0));
    const before=await p.locator('#studyThemeBtn').boundingBox();assert.ok(before.y>=0);
    assert.equal(await p.locator('#studyThemeBtn').evaluate(el=>getComputedStyle(el).position),'absolute');
    await p.evaluate(()=>scrollTo(0,700));await p.waitForFunction(()=>scrollY>500);
    const after=await p.locator('#studyThemeBtn').boundingBox();assert.ok(after.y<0);
    const offset=await p.evaluate(()=>scrollY);assert.ok(Math.abs(before.y-after.y-offset)<2);
    assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   }
  }
  await p.setViewportSize({width:390,height:844});await start(3);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await p.locator('[data-verification-choice="1"]').check();await p.locator('#verificationSubmit').click();
  await p.locator('#subjectHome').waitFor({state:'visible'});
  await p.locator('#algorithmSubjectBtn').click();await nav('practice');await p.waitForFunction(()=>!document.getElementById('practiceStart').disabled);
  await p.locator('#practiceStart').click();await p.locator('#verificationHeading').waitFor();
  assert.deepEqual(errors,[]);
  console.log('PASS reset/reload, load failure and retry, desktop/mobile scrolling theme controls on both subjects, mobile failure and no verification bypass');
 }finally{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});

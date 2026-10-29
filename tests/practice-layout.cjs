const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
(async()=>{
 let browser,server;
 try{
  const core=new vm.SourceTextModule(fs.readFileSync(path.join(root,'js/practice-core.js'),'utf8'),{context:vm.createContext({})});await core.link(()=>{throw Error('Unexpected dependency');});await core.evaluate();
  const api=core.namespace,raw={},pools={};
  for(const unit of ['u6','u7']){raw[unit]=JSON.parse(fs.readFileSync(path.join(root,'data/algorithm-'+unit+'.json'),'utf8'));pools[unit]=api.buildPracticePool(raw[unit],'algorithm',unit);}
  server=http.createServer((req,res)=>{
   const route=new URL(req.url,'http://localhost').pathname.replace(/^\/algorithm-question-bank/,'');
   if(route==='/js/collaboration-config.js'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end('export const collaborationConfig={enabled:false,url:"",publishableKey:""};');return;}
   const file=path.resolve(root,'.'+(route.endsWith('/')?route+'index.html':route));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
   fs.readFile(file,(e,b)=>{if(e){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png'})[path.extname(file)]||'application/octet-stream'});res.end(b);});
  });await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const url='http://127.0.0.1:'+server.address().port+'/algorithm-question-bank/';
  const {chromium}=require('playwright');browser=await chromium.launch({headless:true,channel:'msedge'});
  const p=await browser.newPage({viewport:{width:1280,height:800},reducedMotion:'reduce'}),errors=[];
  p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(15000);
  let chosen=null;
  await p.route('**/data/algorithm-u*.json',route=>{
   const unit=/algorithm-(u[67])\.json/.exec(route.request().url())?.[1];
   if(!unit||!chosen||chosen.unit!==unit)return route.continue();
   const reordered=[raw[unit].find(q=>q.id===chosen.id),...raw[unit].filter(q=>q.id!==chosen.id)];
   return route.fulfill({contentType:'application/json',body:JSON.stringify(reordered)});
  });
  const nav=async name=>{if(await p.locator('#mobileMenuBtn').getAttribute('aria-expanded')!=='true')await p.locator('#mobileMenuBtn').click();await p.locator('[data-panel="'+name+'"]').click();};
  async function begin(unit,item){
   chosen=item;
   await p.goto(url);await p.locator('#algorithmSubjectBtn').click();await nav('practice');await p.locator('#practiceUnit').selectOption(unit);
   await p.waitForFunction(()=>!document.getElementById('practiceStart').disabled);await p.evaluate(()=>{Math.random=()=>.999999;});await p.locator('#practiceStart').click();
   await p.locator('#verificationHeading').waitFor();assert.equal(await p.locator('#practiceSettings').isHidden(),true);assert.equal(await p.locator('#practiceReset').isVisible(),true);
   const gate=await p.locator('[data-verification-question-id]').getAttribute('data-verification-question-id');assert.equal(gate,'verification-4');
   await p.locator('[data-verification-choice="0"]').check();await p.locator('#verificationSubmit').click();await p.locator('[data-practice-question-id]').waitFor();
   assert.equal(await p.locator('[data-practice-question-id]').getAttribute('data-practice-question-id'),String(item.id));
  }
  async function inView(selector){
   const bounds=await p.locator(selector).evaluateAll(elements=>elements.map(el=>{const r=el.getBoundingClientRect();return{top:r.top,bottom:r.bottom,width:r.width};}));
   const height=await p.evaluate(()=>innerHeight);
   assert.ok(bounds.length>0,selector+' should exist');
   for(const b of bounds)assert.ok(b.top>=0&&b.bottom<=height&&b.width>0,selector+' must fit the current viewport: '+JSON.stringify({bounds:b,height}));
  }
  for(const size of [{width:1280,height:800},{width:390,height:844}]){
   await p.setViewportSize(size);
   for(const unit of ['u6','u7'])for(const kind of ['single','multiple','fill']){
    const candidates=pools[unit].filter(q=>q.kind===kind).sort((a,b)=>(a.question.question.length+(a.question.options||[]).join('').length)-(b.question.question.length+(b.question.options||[]).join('').length));
    if(!candidates.length)continue;
    const item=candidates[0];await begin(unit,item);
    assert.equal(await p.locator('#panel-practice > header').isHidden(),true);
    assert.equal(await p.evaluate(()=>scrollY),0);
    await inView('.practice-stem');await inView(kind==='fill'?'.practice-blanks input':'.practice-option');await inView('#practiceSubmit');
    assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    if(process.env.LAYOUT_SCREENSHOTS&&unit==='u6'&&kind==='single'){
     fs.mkdirSync(process.env.LAYOUT_SCREENSHOTS,{recursive:true});await p.screenshot({path:path.join(process.env.LAYOUT_SCREENSHOTS,size.width>700?'desktop.png':'mobile.png')});
    }
    if(kind==='fill'){for(let i=0;i<item.answers.length;i++)await p.locator('[data-practice-blank="'+i+'"]').fill(item.answers[i]);}
    else for(const i of item.expected)await p.locator('[data-practice-choice="'+i+'"]').check();
    await p.locator('#practiceSubmit').click();await p.locator('#practiceFeedbackHeading').waitFor();await p.locator('#practiceNext').click();
    assert.equal(await p.evaluate(()=>scrollY),0);const card=await p.locator('[data-practice-question-id]').boundingBox();assert.ok(card.y>=0&&card.y<=150);
    assert.equal(await p.locator('#practiceSettings').isHidden(),true);
    p.once('dialog',d=>d.dismiss());await p.locator('#practiceReset').click();assert.equal(await p.locator('#practiceSettings').isHidden(),true);
    p.once('dialog',d=>d.accept());await p.locator('#practiceReset').click();assert.equal(await p.locator('#practiceSettings').isVisible(),true);
    assert.equal(await p.locator('#panel-practice > header').isVisible(),true);assert.equal(await p.locator('#practiceSessionControls').isHidden(),true);
   }
  }
  console.log('PASS actual U6/U7 single/multiple/fill questions and submit buttons fit desktop/mobile; next-question position is stable; reset remains accessible and restores settings');
  // Preserve full long content instead of clipping it or shrinking it beyond readability.
  const longest=pools.u6.slice().sort((a,b)=>b.question.question.length-a.question.question.length)[0];await p.setViewportSize({width:320,height:640});await begin('u6',longest);
  assert.equal(await p.locator('.practice-stem').innerText(),longest.question.question);
  assert.equal(await p.locator('.practice-stem').evaluate(el=>getComputedStyle(el).overflowY),'visible');
  assert.ok(await p.locator('.practice-stem').evaluate(el=>parseFloat(getComputedStyle(el).fontSize))>=15);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await nav('bank');assert.equal(await p.locator('#panel-bank').isVisible(),true);
  await nav('practice');assert.equal(await p.locator('#practiceSettings').isHidden(),true);assert.equal(await p.evaluate(()=>scrollY),0);
  assert.deepEqual(errors,[]);console.log('PASS full long-question text, readable small-screen text, no horizontal overflow and navigation back into the active quiz');
 }finally{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});

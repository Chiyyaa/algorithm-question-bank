const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),origin='https://loading-test.supabase.co';
const sharedId=1000009001;
(async()=>{
 let browser,server;const pages=[];
 try{
  server=http.createServer((req,res)=>{
   const route=new URL(req.url,'http://localhost').pathname.replace(/^\/algorithm-question-bank/,'');
   if(route==='/js/collaboration-config.js'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end('export const collaborationConfig={enabled:true,url:"'+origin+'",publishableKey:"sb_publishable_loading_test"};');return;}
   const file=path.resolve(root,'.'+(route.endsWith('/')?route+'index.html':route));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
   fs.readFile(file,(e,b)=>{if(e){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8'})[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(b);});
  });await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port+'/algorithm-question-bank/';
  browser=await chromium.launch({headless:true,channel:'msedge'});
  async function fixture({subject='algorithm',unit='u6',fail=false,counts=[]}={}){
   const p=await browser.newPage({viewport:{width:1280,height:900},reducedMotion:'reduce'});p.setDefaultTimeout(10000);pages.push(p);
   let release,seen,failed=fail,released=false,requests=0,builtInRequests=0;
   const gate=new Promise(r=>release=()=>{released=true;r();}),started=new Promise(r=>seen=r);
   const errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(r.url().includes('/data/'+(subject==='algorithm'?'algorithm':'os')+'-'+unit+'.json'))builtInRequests++;});
   await p.route(origin+'/**',async route=>{
    const u=new URL(route.request().url());let rows=[];
    if(u.pathname.endsWith('/published_question_counts'))rows=counts;
    if(u.pathname.endsWith('/published_questions')&&u.searchParams.get('subject_id')==='eq.'+subject&&u.searchParams.get('unit_id')==='eq.'+unit){
     requests++;seen();await gate;
     if(failed)return route.fulfill({status:503,contentType:'application/json',body:'{}',headers:{'Access-Control-Allow-Origin':'*'}});
     rows=[{id:sharedId,subject_id:subject,unit_id:unit,content:{type:'fill_blank',question:'LATE-SHARED [__1__]',correct_answer:'late',options:[]}}];
    }
    await route.fulfill({contentType:'application/json',body:JSON.stringify(rows),headers:{'Access-Control-Allow-Origin':'*'}});
   });
   return {p,release,started,errors,fail:value=>{failed=value;},stats:()=>({released,requests,builtInRequests}),base};
  }
  const nav=async(p,name)=>{if(await p.locator('#mobileMenuBtn').getAttribute('aria-expanded')!=='true')await p.locator('#mobileMenuBtn').click();await p.locator('[data-panel="'+name+'"]').click();};
  for(const [subject,unit,total] of [['algorithm','u6',71],['os','u3',277]]){
   const f=await fixture({subject,unit}),p=f.p;await p.goto(base);const start=performance.now();await p.locator('#'+subject+'SubjectBtn').click();
   await p.locator('.question-card').first().waitFor({timeout:3000});await f.started;
   assert.equal(f.stats().released,false);assert.equal(await p.locator('#searchInput').isEnabled(),true);assert.match(await p.locator('#summary').innerText(),new RegExp('/ '+total+' 題'));
   console.log('FIRST BUILT-IN '+subject+' '+Math.round(performance.now()-start)+'ms while shared response is held');
   await p.locator('#hideAllBtn').click();await p.locator('#nextPageBtn').click();
   const button=p.locator('.answer-btn').first(),id=await button.getAttribute('data-toggle-answer');await button.click();
   await p.locator('[data-toggle-answer="'+id+'"]').focus();await p.evaluate(()=>scrollTo(0,700));
   const scroll=await p.evaluate(()=>scrollY),pageInfo=await p.locator('#pageInfo').innerText();f.release();
   await p.locator('#bankFooter').filter({hasText:'共用 1 題'}).waitFor();
   assert.equal(await p.locator('#pageInfo').innerText(),pageInfo);assert.equal(await p.locator('[data-toggle-answer="'+id+'"]').getAttribute('aria-expanded'),'true');
   assert.equal(await p.evaluate(()=>document.activeElement.getAttribute('data-toggle-answer')),id);assert.ok(Math.abs(await p.evaluate(()=>scrollY)-scroll)<2);
   assert.match(await p.locator('#summary').innerText(),new RegExp('/ '+(total+1)+' 題'));assert.deepEqual(f.errors,[]);await p.close();
  }
  // Search, filter and text-field focus stay intact while results are updated.
  const search=await fixture(),sp=search.p;await sp.goto(base);await sp.locator('#algorithmSubjectBtn').click();await sp.locator('.question-card').first().waitFor();
  await sp.locator('[data-filter="choice"]').click();await sp.locator('#searchInput').fill('Counting');await sp.locator('#searchInput').focus();search.release();
  await sp.locator('#bankFooter').filter({hasText:'共用 1 題'}).waitFor();assert.equal(await sp.locator('#searchInput').inputValue(),'Counting');
  assert.equal(await sp.locator('.filter-btn.active').getAttribute('data-filter'),'choice');assert.equal(await sp.evaluate(()=>document.activeElement.id),'searchInput');await sp.close();
  // Retry only the shared service; built-in rows remain usable and are not fetched again.
  const retry=await fixture({fail:true}),rp=retry.p;await rp.goto(base);await rp.locator('#algorithmSubjectBtn').click();await rp.locator('.question-card').first().waitFor();
  const before=retry.stats().builtInRequests;retry.release();await rp.getByRole('button',{name:'重試共用題庫',exact:true}).waitFor();
  assert.ok(await rp.locator('.question-card').count());assert.equal(await rp.locator('#searchInput').isEnabled(),true);retry.fail(false);
  await rp.getByRole('button',{name:'重試共用題庫',exact:true}).click();await rp.locator('#bankFooter').filter({hasText:'共用 1 題'}).waitFor();
  assert.equal(retry.stats().builtInRequests,before);assert.equal(retry.stats().requests,2);await rp.close();
  // A shared-only link waits for its real row without claiming that the question is absent.
  const only=await fixture({unit:'u8',counts:[{subject_id:'algorithm',unit_id:'u8',question_count:1}]}),op=only.p;
  await op.goto(base+'?subject=algorithm&unit=u8&question='+sharedId);await only.started;
  assert.equal(await op.locator('#searchInput').isDisabled(),true);assert.equal(await op.locator('.batch-target').count(),0);assert.doesNotMatch(await op.locator('#bankFooter').innerText(),/沒有載入/);
  only.release();await op.locator('.batch-target').waitFor();assert.equal(await op.locator('.batch-target').getAttribute('data-id'),String(sharedId));await op.close();
  const deep=await fixture(),dp=deep.p;await dp.goto(base+'?subject=algorithm&unit=u6&question='+sharedId);await dp.locator('.question-card').first().waitFor();
  assert.doesNotMatch(await dp.locator('#bankFooter').innerText(),/沒有載入/);deep.release();await dp.locator('.batch-target').waitFor();assert.equal(await dp.locator('.batch-target').getAttribute('data-id'),String(sharedId));await dp.close();
  // Built-in direct links reveal immediately, retaining their highlight and position after shared rows arrive.
  const direct=await fixture(),bp=direct.p;await bp.goto(base+'?subject=algorithm&unit=u6&question=60');await bp.locator('.batch-target').waitFor({timeout:3000});
  assert.equal(direct.stats().released,false);const offset=await bp.evaluate(()=>scrollY);direct.release();await bp.locator('#bankFooter').filter({hasText:'共用 1 題'}).waitFor();
  assert.equal(await bp.locator('.batch-target').getAttribute('data-id'),'60');assert.ok(Math.abs(await bp.evaluate(()=>scrollY)-offset)<2);await bp.close();
  // A later user search takes priority over a still-pending direct-link target.
  const intent=await fixture(),ip=intent.p;await ip.goto(base+'?subject=algorithm&unit=u6&question='+sharedId);await ip.locator('.question-card').first().waitFor();
  await ip.locator('#searchInput').fill('Counting');intent.release();await ip.locator('#bankFooter').filter({hasText:'共用 1 題'}).waitFor();assert.equal(await ip.locator('#searchInput').inputValue(),'Counting');assert.equal(await ip.locator('.batch-target').count(),0);await ip.close();
  // Late completions cannot overwrite another subject after navigation.
  const stale=await fixture(),tp=stale.p;await tp.goto(base);await tp.locator('#algorithmSubjectBtn').click();await tp.locator('.question-card').first().waitFor();
  await tp.locator('#switchSubjectBtn').click();await tp.locator('#subjectHome').waitFor({state:'visible'});await tp.locator('#osSubjectBtn').click();await tp.locator('#bankFooter').filter({hasText:'作業系統｜U3'}).waitFor();
  stale.release();await tp.waitForTimeout(100);assert.equal(await tp.locator('body').getAttribute('data-subject'),'os');assert.match(await tp.locator('#summary').innerText(),/\/ 277 題/);assert.equal(await tp.locator('[data-id="'+sharedId+'"]').count(),0);await tp.close();
  console.log('PASS local-first display, parallel shared loading, search/page/answers/focus/scroll preservation, shared retry, deep links, shared-only units and stale-response isolation');
 }finally{for(const p of pages)if(!p.isClosed())await p.close();if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});

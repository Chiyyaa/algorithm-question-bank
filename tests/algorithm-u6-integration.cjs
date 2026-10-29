const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const root=process.env.U6_PROJECT_ROOT||path.resolve(__dirname,'..');
const bank=JSON.parse(fs.readFileSync(path.join(root,'data/algorithm-u6.json'),'utf8'));
const integration=JSON.parse(fs.readFileSync(path.join(root,'data/algorithm-u6-integration.json'),'utf8'));
(async()=>{
 const sandbox=vm.createContext({URL,fetch:async()=>({ok:true,json:async()=>integration})});
 const module=new vm.SourceTextModule(fs.readFileSync(path.join(root,'js/question-curation.js'),'utf8'),{context:sandbox,initializeImportMeta:m=>{m.url='https://example.com/js/question-curation.js';}});
 await module.link(()=>{throw Error('Unexpected import');});await module.evaluate();const api=module.namespace;
 assert.equal(bank.length,71);assert.equal(new Set(bank.map(q=>q.id)).size,71);assert.equal(bank.filter(q=>q.reference_id).length,60);
 assert.equal(bank.filter(q=>q.options.length===4).length,39);assert.equal(bank.filter(q=>q.type==='disputed').length,2);
 for(let id=1;id<=30;id++)assert.ok(bank.some(q=>q.id===id));
 assert.equal(new Set(bank.filter(q=>q.reference_id).map(q=>q.reference_id)).size,60);
 assert.equal(integration.records.length,76);assert.equal(new Set(integration.records.map(q=>q.id)).size,76);
 for(const r of integration.records){assert.ok(r.canonical_ids.length);assert.ok(r.canonical_ids.every(id=>bank.some(q=>q.id===id)));}
 const shared=integration.records.map(q=>({...q,shared_question:true}));assert.equal(api.omitIntegratedAlgorithmU6Shared(shared,integration).length,0);
 for(const field of ['question','correct_answer','type','options']){const q={...shared[0],[field]:field==='options'?['新選項']:'已修改'};assert.equal(api.omitIntegratedAlgorithmU6Shared([q],integration)[0],q);}
 const fresh={...shared[0],id:1000000999};assert.equal(api.omitIntegratedAlgorithmU6Shared([fresh],integration)[0],fresh);
 const unshared={...shared[0],shared_question:false};assert.equal(api.omitIntegratedAlgorithmU6Shared([unshared],integration)[0],unshared);
 assert.equal((await api.curatePublishedQuestions(shared,'algorithm','u6')).length,0);assert.equal(await api.curatePublishedQuestions(shared,'algorithm','u4'),shared);
 const os=[{id:1000000093,shared_question:true,question:'What are the advantages of multicore processors?',type:'choice_options_missing',correct_answer:'They are faster\nThey consume less power\nThey can leverage memory stalls for multithreading',options:[]}];
 assert.equal((await api.curatePublishedQuestions(os,'os','u6')).length,0);
 const a8=[2,5,3,0,2,3,0,3],a11=[2,5,3,0,1,2,1,3,2,0,4],a15=[2,5,3,0,2,3,0,5,1,2,1,3,2,0,4];
 function state(A,target){const B=Array(A.length).fill(0),C=Array(6).fill(0);A.forEach(x=>C[x]++);for(let i=1;i<6;i++)C[i]+=C[i-1];for(let j=A.length;j>=1;j--){if(j===target)return[B,C];const x=A[j-1];B[C[x]-1]=x;C[x]--;}return[B,C];}
 const answer=q=>q.correct_answer.split('\n').map(s=>s.replace(/^（\d+）/,'').split(',').map(Number));
 for(const [ref,A,j] of [['L6-028',a8,8],['L6-063',a8,4],['L6-065',a11,4],['L6-066',a11,0],['L6-021',a15,15],['L6-022',a15,12],['L6-052',a15,4],['L6-042',a15,0]])assert.deepEqual(answer(bank.find(q=>q.reference_id===ref)),state(A,j),ref);
 const disputed=bank.find(q=>q.reference_id==='L6-047');assert.notDeepEqual(answer(disputed),state(a8,2));assert.match(disputed.answer_note,/0,0,0,2,3,3,3,0/);
 assert.match(bank.find(q=>q.reference_id==='L6-065').answer_note,/推算/);assert.match(bank.find(q=>q.reference_id==='L6-003').question,/B\[7\]/);
 console.log('PASS 60 reference questions + 11 unique supplements, all 76 shared records accounted for, 39 complete option sets, source disputes and independent counting-sort states; edited/new shared rows and OS dedup remain intact');
 if(!process.argv.includes('--browser'))return;
 const http=require('node:http'),{chromium}=require('playwright');let server,browser;
 try{
  server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');const f=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(f,(e,b)=>{if(e){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':({'.js':'text/javascript','.json':'application/json','.css':'text/css','.html':'text/html'})[path.extname(f)]||'application/octet-stream'});res.end(b);});});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  browser=await chromium.launch({headless:true,channel:'msedge'});const p=await browser.newPage({viewport:{width:1280,height:900}});const errors=[];p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(15000);
  await p.route('https://kzgfbfarihvzuutnkpfu.supabase.co/**',async route=>{const u=new URL(route.request().url());let body=[];if(u.pathname.endsWith('/published_question_counts'))body=[{subject_id:'algorithm',unit_id:'u6',question_count:76}];else if(u.pathname.endsWith('/published_questions')&&u.searchParams.get('subject_id')==='eq.algorithm'&&u.searchParams.get('unit_id')==='eq.u6')body=integration.records.map(q=>({id:q.id,content:q,subject_id:'algorithm',unit_id:'u6'}));await route.fulfill({contentType:'application/json',body:JSON.stringify(body),headers:{'Access-Control-Allow-Origin':'*'}});});
  await p.goto('http://127.0.0.1:'+server.address().port+'/');await p.locator('#algorithmSubjectBtn').click();await p.locator('[data-panel="units"]').click();
  await p.waitForFunction(()=>document.querySelector('[data-unit="u6"] .unit-card-count strong')?.textContent==='71');await p.locator('[data-unit="u6"]').click();
  await p.locator('#summary').filter({hasText:'/ 71 題'}).waitFor();assert.match(await p.locator('#bankFooter').innerText(),/內建 71 題｜共用 0 題/);
  const visible=[];while(true){visible.push(...await p.locator('.question-card').evaluateAll(es=>es.map(e=>({id:Number(e.dataset.id),options:e.querySelectorAll('.option').length,badges:e.querySelector('.badges').innerText}))));if(await p.locator('#nextPageBtn').isDisabled())break;await p.locator('#nextPageBtn').click();}
  assert.equal(visible.length,71);assert.equal(new Set(visible.map(q=>q.id)).size,71);assert.equal(visible.filter(q=>q.options===4).length,39);assert.ok(visible.every(q=>!q.badges.includes('友列')));
  await p.locator('#searchInput').fill('2,5,3,0,1,2,1,3,2,0,4');const added=bank.find(q=>q.reference_id==='L6-065');const card=p.locator('.question-card[data-id="'+added.id+'"]');assert.match(await card.innerText(),/j=4/);await card.locator('[data-toggle-answer]').click();assert.match(await card.locator('.answer-content').innerText(),/1,2,5,8,9,11/);
  await p.locator('#searchInput').fill('');await p.locator('[data-filter="shared"]').click();assert.match(await p.locator('#summary').innerText(),/\/ 0 題/);
  await p.locator('[data-filter="all"]').click();await p.setViewportSize({width:390,height:844});await p.waitForFunction(()=>document.getElementById('sidebar').inert);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({ui:'PASS',questions:71,fullOptions:39,duplicateShared:0,newCase:'present',mobile:'PASS',errors}));
 }finally{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});


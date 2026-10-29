const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const root=process.env.U7_PROJECT_ROOT||path.resolve(__dirname,'..'),bank=JSON.parse(fs.readFileSync(path.join(root,'data/algorithm-u7.json'),'utf8')),classification=JSON.parse(fs.readFileSync(path.join(root,'data/algorithm-u7-classification.json'),'utf8'));
(async()=>{
 assert.equal(bank.length,60);assert.equal(new Set(bank.map(q=>q.id)).size,60);assert.deepEqual(bank.map(q=>q.id),Array.from({length:60},(_,i)=>i+1));
 assert.equal(bank.filter(q=>q.options.length===4).length,40);for(const kind of ['單選','多選','填空題'])assert.equal(bank.filter(q=>q.source_type===kind).length,20);
 assert.equal(classification.records.length,51);assert.equal(classification.records.filter(q=>q.classification==='misclassified_os').length,30);assert.equal(classification.records.filter(q=>q.classification==='integrated_algorithm').length,21);
 for(const r of classification.records.filter(q=>q.classification==='integrated_algorithm')){assert.equal(r.canonical_ids.length,1);assert.ok(bank.find(q=>q.id===r.canonical_ids[0]).previous_shared_ids.includes(r.id));}
 for(const [id,target] of [[6,'59'],[35,'63'],[59,'63']])assert.ok(bank.find(q=>q.id===id).correct_answer.includes(target)||bank.find(q=>q.id===id).question.includes(target));
 assert.match(bank.find(q=>q.id===6).question,/59/);assert.match(bank.find(q=>q.id===35).question,/63/);assert.notEqual(bank.find(q=>q.id===35).question,bank.find(q=>q.id===59).question);
 for(const id of [30,42,53])assert.equal(bank.find(q=>q.id===id).sources.length,2);
 if(process.env.U7_SOURCE_FILE){
  const text=fs.readFileSync(process.env.U7_SOURCE_FILE,'utf8').replace(/\r/g,''),heads=[...text.matchAll(/^(ALG7-EXPORT-(\d{3})|U[A-F0-9]{32})\s*$/gm)];
  const blocks=[{id:1,raw:text.slice(0,heads[0].index),inferred:true},...heads.map((h,i)=>({id:h[2]?Number(h[2]):null,raw:text.slice(h.index+h[0].length,heads[i+1]?.index??text.length)}))];
  assert.equal(blocks.length,63);
  for(const b of blocks.filter(b=>b.id)){const lines=b.raw.trim().split('\n');if(!b.inferred){lines.shift();lines.shift();}const pos=lines.findIndex(l=>l.trim()==='正確答案');assert.ok(pos>=0);const body=lines.slice(0,pos),tail=lines.slice(pos+1);const end=tail.findIndex(l=>/^由提供|^由網站|^答案說明$|^觀念提示/.test(l.trim()));const answers=(end<0?tail:tail.slice(0,end)).map(l=>l.trim()).filter(Boolean);const indices=body.map((l,i)=>/^[1-9]\.$/.test(l.trim())?i:-1).filter(i=>i>=0);const question=(indices.length?body.slice(0,indices[0]):body).join('\n').trim().replace(/^\*{2,}/,'');const opts=indices.map((idx,i)=>body.slice(idx+1,indices[i+1]??body.length).filter(l=>l.trim()!=='✓ 正確').join('\n').trim());const q=bank.find(q=>q.id===b.id);assert.equal(q.question,question);assert.deepEqual(q.options.map(x=>x.replace(/^[A-D]\.\s*/,'')),opts);assert.equal(q.correct_answer,answers.map((s,i)=>opts.length||answers.length===1?s:'（'+(i+1)+'）'+s).join('\n'));}
 }
 let fail=false;async function load(){const m=new vm.SourceTextModule(fs.readFileSync(path.join(root,'js/question-curation.js'),'utf8'),{context:vm.createContext({URL,fetch:async()=>{if(fail)throw Error('offline');return{ok:true,json:async()=>classification};}}),initializeImportMeta:x=>{x.url='https://example.com/js/question-curation.js';}});await m.link(()=>{throw Error('Unexpected import');});await m.evaluate();return m.namespace;}
 const core=await load(),shared=classification.records.map(q=>({...q,shared_question:true}));assert.equal((await core.curatePublishedQuestions(shared,'algorithm','u7')).length,0);assert.equal(await core.curatePublishedQuestions(shared,'os','u7'),shared);
 for(const field of ['question','correct_answer','type','options']){const changed={...shared[0],[field]:field==='options'?['新選項']:'修改'};assert.equal(core.omitProcessedAlgorithmU7([changed],classification)[0],changed);}
 const fresh={...shared[0],id:1000000999};assert.equal(core.omitProcessedAlgorithmU7([fresh],classification)[0],fresh);
 fail=true;const retry=await load();await assert.rejects(()=>retry.curatePublishedQuestions(shared,'algorithm','u7'),/分類資料/);fail=false;assert.equal((await retry.curatePublishedQuestions(shared,'algorithm','u7')).length,0);
 console.log('PASS 63 source records -> 60 unique questions, exact source text/options/answers, 20 each source type, all 21 existing algorithm questions integrated, all 30 OS rows excluded, array variants and later edits preserved');
 if(!process.argv.includes('--browser'))return;
 const http=require('node:http'),{chromium}=require('playwright');let server,browser;
 try{
  server=http.createServer((req,res)=>{const u=new URL(req.url,'http://localhost'),f=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':u.pathname));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(f,(e,b)=>{if(e){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':({'.js':'text/javascript','.json':'application/json','.css':'text/css','.html':'text/html'})[path.extname(f)]||'application/octet-stream'});res.end(b);});});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  browser=await chromium.launch({headless:true,channel:'msedge'});const p=await browser.newPage({viewport:{width:1280,height:900}});p.setDefaultTimeout(15000);const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.route('https://kzgfbfarihvzuutnkpfu.supabase.co/**',async route=>{const u=new URL(route.request().url());let rows=[];if(u.pathname.endsWith('/published_question_counts'))rows=[{subject_id:'algorithm',unit_id:'u7',question_count:51}];else if(u.pathname.endsWith('/published_questions')&&u.searchParams.get('subject_id')==='eq.algorithm'&&u.searchParams.get('unit_id')==='eq.u7')rows=classification.records.map(q=>({id:q.id,content:q,subject_id:'algorithm',unit_id:'u7'}));await route.fulfill({contentType:'application/json',body:JSON.stringify(rows),headers:{'Access-Control-Allow-Origin':'*'}});});
  await p.goto('http://127.0.0.1:'+server.address().port+'/');await p.locator('#algorithmSubjectBtn').click();await p.locator('[data-panel="units"]').click();await p.waitForFunction(()=>document.querySelector('[data-unit="u7"] .unit-card-count strong')?.textContent==='60');await p.locator('[data-unit="u7"]').click();
  await p.locator('#summary').filter({hasText:'/ 60 題'}).waitFor();assert.match(await p.locator('#bankFooter').innerText(),/內建 60 題｜共用 0 題/);
  const seen=[];while(true){seen.push(...await p.locator('.question-card').evaluateAll(es=>es.map(e=>({id:Number(e.dataset.id),q:e.querySelector('.question').innerText,options:e.querySelectorAll('.option').length}))));if(await p.locator('#nextPageBtn').isDisabled())break;await p.locator('#nextPageBtn').click();}
  assert.equal(seen.length,60);assert.equal(new Set(seen.map(q=>q.id)).size,60);assert.equal(seen.filter(q=>q.options===4).length,40);assert.ok(seen.every(q=>!/(Peterson|Readers.Writers|Linux 核心|信號量)/.test(q.q)));
  await p.locator('#searchInput').fill('請完成以下的虛擬碼');let card=p.locator('.question-card[data-id="3"]');await card.locator('[data-toggle-answer]').click();assert.match(await card.locator('.answer-content').innerText(),/q-1/);assert.match(await card.locator('.answer-content').innerText(),/i-k/);
  await p.locator('#searchInput').fill('18 個未排序');assert.equal(await p.locator('.question-card').count(),3);
  await p.locator('#searchInput').fill('');await p.locator('[data-filter="shared"]').click();assert.match(await p.locator('#summary').innerText(),/\/ 0 題/);
  await p.locator('[data-panel="units"]').click();await p.locator('[data-unit="u6"]').click();await p.locator('#summary').filter({hasText:'/ 71 題'}).waitFor();assert.deepEqual(errors,[]);
  console.log(JSON.stringify({ui:'PASS',algorithmU7:60,fullOptions:40,wrongSubject:0,duplicateShared:0,arrayVariants:3,algorithmU6:71,errors}));
 }finally{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});


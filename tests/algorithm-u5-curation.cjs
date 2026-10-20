const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const root=process.env.U5_PROJECT_ROOT||path.resolve(__dirname,'..');
const proposal=process.env.U5_PROPOSAL?JSON.parse(fs.readFileSync(process.env.U5_PROPOSAL,'utf8')):null;
const read=p=>proposal?.files.find(f=>f.path===p)?.content??fs.readFileSync(path.join(root,p),'utf8');
const curation=JSON.parse(read('data/algorithm-u5-curation.json'));
const original=curation.records.map(r=>({id:r.id,type:r.expected_type,question:r.expected_question,correct_answer:r.expected_answer,options:[],shared_question:true,sources:['協作題庫（管理員已審核）']}));
original.push({id:1000000999,type:'short_answer',question:'未核對題目',correct_answer:'原答案',options:[],shared_question:true});
async function pure(){
 let calls=0,fail=false;const sandbox=vm.createContext({URL,fetch:async()=>{calls++;if(fail)throw Error('offline');return{ok:true,json:async()=>curation};}});
 const module=new vm.SourceTextModule(read('js/question-curation.js'),{context:sandbox,initializeImportMeta:m=>{m.url='https://example.com/js/question-curation.js';}});await module.link(()=>{throw Error('Unexpected import');});await module.evaluate();
 const {applyQuestionCuration:apply,curatePublishedQuestions:load}=module.namespace;
 const before=JSON.stringify(original),result=apply(original,curation,'algorithm','u5');
 assert.equal(curation.records.length,32);assert.equal(new Set(curation.records.map(r=>r.id)).size,32);assert.equal(result.length,original.length);
 assert.equal(result.filter(r=>!r.shared_question).length,32);assert.equal(result.filter(r=>r.type==='choice').length,20);assert.equal(result.filter(r=>r.type==='fill_blank').length,10);assert.equal(result.filter(r=>r.type==='choice_options_missing').length,2);
 for(let i=0;i<32;i++){assert.equal(result[i].question,original[i].question);assert.equal(result[i].correct_answer,original[i].correct_answer);assert.equal(result[i].id,original[i].id);assert.deepEqual(JSON.parse(JSON.stringify(result[i].options)),curation.records[i].options);}
 assert.equal(result.at(-1),original.at(-1));assert.equal(JSON.stringify(original),before);assert.equal(apply(original,curation,'os','u5'),original);assert.equal(apply(original,curation,'algorithm','u4'),original);
 for(const field of ['question','correct_answer','type']){const changed={...original[0],[field]:'新內容'};assert.equal(apply([changed],curation,'algorithm','u5')[0],changed);}
 const withOptions={...original[0],options:['新選項']};assert.equal(apply([withOptions],curation,'algorithm','u5')[0],withOptions);
 const unshared={...original[0],shared_question:false};assert.equal(apply([unshared],curation,'algorithm','u5')[0],unshared);
 assert.equal(curation.duplicates.length,1);const duplicate=curation.duplicates[0];
 const keep={id:duplicate.keep_id,...duplicate.keep_expected,options:[],shared_question:true};
 const remove={id:duplicate.remove_id,...duplicate.remove_expected,options:[],shared_question:true};
 const deduped=apply([...original,keep,remove],curation,'algorithm','u5');assert.equal(deduped.length,original.length+1);assert.ok(deduped.some(q=>q.id===keep.id));assert.ok(!deduped.some(q=>q.id===remove.id));
 assert.equal(apply([remove],curation,'algorithm','u5').length,1);assert.equal(apply([keep,{...remove,correct_answer:'另一答案'}],curation,'algorithm','u5').length,2);
 assert.equal(apply([{...keep,question:'另一題'},remove],curation,'algorithm','u5').length,2);
 await load(original,'os','u5');assert.equal(calls,0);fail=true;assert.equal(await load(original,'algorithm','u5'),original);fail=false;assert.equal((await load(original,'algorithm','u5')).filter(q=>!q.shared_question).length,32);await load(original,'algorithm','u5');assert.equal(calls,2);
 console.log('PASS 32 matched IDs: 20 complete choices, 10 blanks, 2 choices without supplied options; content/answers/IDs and unmatched units preserved; stale source and network fallback checked');
}
async function browserTest(){
 const http=require('node:http'),{chromium}=require('playwright');let server,browser;
 const snapshot=process.env.U5_SNAPSHOT_PATH?JSON.parse(fs.readFileSync(process.env.U5_SNAPSHOT_PATH,'utf8').replace(/^\uFEFF/,'')):original.map(q=>({id:q.id,subject_id:'algorithm',unit_id:'u5',content:q}));
 try{
  server=http.createServer((req,res)=>{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const target=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!target.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(target,(err,body)=>{if(err){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':({'.js':'text/javascript','.json':'application/json','.css':'text/css','.html':'text/html'})[path.extname(target)]||'application/octet-stream'});res.end(body);});});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({channel:'msedge',headless:true});const p=await browser.newPage({viewport:{width:1280,height:900}});const errors=[],writes=[];p.on('pageerror',e=>errors.push(e.message));
  await p.route('https://kzgfbfarihvzuutnkpfu.supabase.co/**',async route=>{const r=route.request(),u=new URL(r.url());let body=[];if(u.pathname.endsWith('/published_question_counts'))body=[{subject_id:'algorithm',unit_id:'u5',question_count:snapshot.length}];else if(u.pathname.endsWith('/published_questions'))body=u.searchParams.get('subject_id')==='eq.algorithm'&&u.searchParams.get('unit_id')==='eq.u5'?snapshot:[];else if(!['GET','HEAD','OPTIONS'].includes(r.method()))writes.push(u.pathname);await route.fulfill({contentType:'application/json',body:JSON.stringify(body),headers:{'Access-Control-Allow-Origin':'*'}});});
  await p.goto('http://127.0.0.1:'+server.address().port+'/');await p.locator('#algorithmSubjectBtn').click();await p.locator('[data-panel="units"]').click();await p.locator('[data-unit="u5"]').click();await p.locator('#summary').filter({hasText:'目前顯示'}).waitFor();
  await p.locator('#searchInput').fill('下列關於 PARTITION 的敘述');let card=p.locator('.question-card');assert.equal(await card.count(),1);assert.match(await card.locator('.badges').innerText(),/選擇題/);assert.doesNotMatch(await card.locator('.badges').innerText(),/友列/);assert.equal(await card.locator('.option').count(),4);assert.doesNotMatch(await card.innerText(),/僅列來源/);await card.locator('[data-toggle-answer]').click();assert.match(await card.locator('.answer-content').innerText(),/回傳 pivot/);
  await p.locator('#searchInput').fill('在 partition 函數中，pivot 的值');assert.match(await card.locator('.badges').innerText(),/填空題/);assert.doesNotMatch(await card.innerText(),/友列協助題|僅列來源/);assert.equal(await card.locator('.option').count(),0);
  await p.locator('#searchInput').fill('Partition 函數中的 exchange 操作用於');assert.match(await card.locator('.badges').innerText(),/選項未記錄/);assert.doesNotMatch(await card.locator('.badges').innerText(),/友列/);assert.equal(await card.locator('.option').count(),0);
  const duplicateRemoved=snapshot.some(q=>q.id===1000000001)&&snapshot.some(q=>q.id===1000000033)?1:0;
  await p.locator('#searchInput').fill('');await p.locator('[data-filter="shared"]').click();assert.match(await p.locator('#summary').innerText(),new RegExp('/ '+(snapshot.length-32-duplicateRemoved)+' 題'));assert.equal(await p.locator('.badges').filter({hasText:'友列協助題'}).count(),Math.min(25,snapshot.length-32-duplicateRemoved));
  if(duplicateRemoved){await p.locator('[data-filter="all"]').click();await p.locator('#searchInput').fill('快速排序的征服階段包含兩個');assert.equal(await p.locator('.question-card').count(),1);assert.equal(await p.locator('.question-card').getAttribute('data-id'),'1000000001');}
  await p.locator('[data-filter="all"]').click();await p.locator('#searchInput').fill('下列關於 PARTITION 的敘述');await p.setViewportSize({width:390,height:844});await p.waitForFunction(()=>document.getElementById('sidebar').inert);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
  if(process.env.U5_SCREENSHOT_PATH){assert.equal(fs.existsSync(process.env.U5_SCREENSHOT_PATH),false);await p.screenshot({path:process.env.U5_SCREENSHOT_PATH});}
  console.log(JSON.stringify({ui:'PASS',originalQuestions:snapshot.length,curated:32,duplicateRemoved,remaining:snapshot.length-duplicateRemoved,mobile:'PASS',errors,productionWrites:writes}));
 }finally{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));}
}
(async()=>{await pure();if(process.argv.includes('--browser'))await browserTest();})().catch(e=>{console.error(e);process.exitCode=1;});


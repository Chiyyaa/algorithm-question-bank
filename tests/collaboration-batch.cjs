const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const vm=require('node:vm');
let fault=null;const saveCalls=[];
const identities={admin:'20000000-0000-0000-0000-000000000001',alice:'20000000-0000-0000-0000-000000000002'};
const passwords={admin:'Correct-password-123!',alice:'Correct-password-123!'};let resetCalls=0;
const db=new PGlite();let browser,server,passed=0,gate=Promise.resolve();const errors=[];
const pass=s=>{passed++;console.log('PASS '+s);};
const serverUrl='https://collab-test.supabase.co';
async function routeApi(route){
 const request=route.request(),url=new URL(request.url()),token=(request.headers().authorization||'').replace('Bearer ',''),name=token.startsWith('admin-')?'admin':token.startsWith('alice-')?'alice':null;
 const json=(data,status=200)=>route.fulfill({status,headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'},body:JSON.stringify(data)});
 if(request.method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,PUT,OPTIONS'}});
 if(url.pathname==='/auth/v1/token'){
  const b=request.postDataJSON();let who;
  if(url.searchParams.get('grant_type')==='refresh_token')who=b.refresh_token.split('-')[0];
  else {const candidate=b.email?.split('@')[0];if(b.password===passwords[candidate])who=candidate;}
  if(!identities[who])return json({message:'Invalid login credentials'},400);
  return json({access_token:who+'-token',refresh_token:who+'-refresh',user:{id:identities[who],email:who+'@example.com'}});
 }
 if(url.pathname==='/auth/v1/user')return name?json({id:identities[name],email:name+'@example.com'}):json({message:'Invalid JWT'},401);
 if(url.pathname==='/auth/v1/logout')return json({});
 try{
  await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[name?identities[name]:'']);await db.exec('set role '+(name?'authenticated':'anon'));
  if(url.pathname==='/functions/v1/manage-collaborators'){
   if(!name||(await db.query('select public.collaboration_is_admin() as allowed')).rows[0].allowed!==true)return json({message:'ADMIN_REQUIRED'},403);
   const body=request.postDataJSON();
   if(body.action==='reset_password'){
    const target=(await db.query('select public.request_collaborator_password_reset($1) as data',[body.userId])).rows[0].data;
    const who=Object.keys(identities).find(k=>identities[k]===target.user_id);passwords[who]='TEST-ONLY-RESET-aA9-NEW-PASSWORD';resetCalls++;
    await db.exec('reset role;set role service_role');await db.query('select public.complete_collaborator_password_reset($1,true)',[target.request_id]);
    return json({email:target.email,temporaryPassword:passwords[who]});
   }
   const id='20000000-0000-0000-0000-000000000003';
   await db.exec('reset role');await db.query('insert into auth.users values($1,$2,now())',[id,body.email]);await db.exec('set role authenticated');
   await db.query('select * from public.grant_question_collaborator($1,$2)',[body.email,body.name]);
   return json({email:body.email,temporaryPassword:'TEST-ONLY-aA9-INITIAL-PASSWORD'});
  }
  if(url.pathname.startsWith('/rest/v1/rpc/')){
   const fn=url.pathname.split('/').pop(),b=request.postDataJSON()||{};
   const map={
    save_question_submission:['p_id','p_subject','p_unit','p_content','p_submit','p_revision'],
    review_question_submission:['p_id','p_revision','p_action','p_content','p_note'],
    set_question_collaborator_active:['p_user_id','p_active'],create_collaboration_unit:['p_subject','p_unit'],published_question_counts:[],collaboration_is_admin:[]
   };
   if(!map[fn])return json({message:'Unknown RPC'},404);
   let injected=null;
   if(fn==='save_question_submission'){saveCalls.push(b);if(fault&&saveCalls.length===fault.at){injected=fault.kind;fault=null;if(injected==='reject')return json({message:'SUBMISSION_LIMIT'},400);if(injected==='abort')return route.abort('failed');}}
   const values=map[fn].map(k=>b[k]);const sql='select * from public.'+fn+'('+values.map((_,i)=>'$'+(i+1)).join(',')+')';
   const result=(await db.query(sql,values)).rows;
   if(injected==='lost')return route.abort('failed');
   return json(result);
  }
  const table=url.pathname.split('/').pop();
  if(!['collaboration_members','question_submissions','collaboration_audit','published_questions','collaboration_units'].includes(table))return json({message:'Not found'},404);
  let sql='select '+(table==='collaboration_units'?'subject_id,unit_id':'*')+' from public.'+table;const filters=[],args=[];
  for(const column of ['user_id','author_id','subject_id','unit_id','status','visible']){
   const value=url.searchParams.get(column);if(value?.startsWith('eq.')){args.push(value.slice(3));filters.push(column+'=$'+args.length);}
  }
  if(filters.length)sql+=' where '+filters.join(' and ');
  sql+=' order by '+(table==='collaboration_audit'?'id desc':table==='question_submissions'?'updated_at desc,id desc':'created_at');
  if(table==='published_questions')sql=sql.replace('order by created_at','order by id');
  if(table==='collaboration_units')sql=sql.replace('order by created_at','order by subject_id,unit_id');
  const limit=Number(url.searchParams.get('limit')||500),offset=Number(url.searchParams.get('offset')||0);
  sql+=' limit '+limit+' offset '+offset;
  const result=(await db.query(sql,args)).rows;
  if(table==='question_submissions')for(const row of result)row.published_questions=(await db.query('select visible from public.published_questions where submission_id=$1',[row.id])).rows[0]||null;
  return json(result);
 }catch(error){return json({message:error.message,code:error.code},/permission denied|ADMIN_REQUIRED|MEMBERSHIP_REQUIRED/.test(error.message)?403:400);}
}
async function batchFlows(context, base) {
    const ac=await context(),mc=await context();const alice=await ac.newPage(),admin=await mc.newPage();
    alice.setDefaultTimeout(15000);admin.setDefaultTimeout(15000);
    const idle=page=>page.waitForFunction(()=>!document.querySelector('#submitForReview').disabled);
    async function login(page,name) {
        await page.goto(base+'collaborate.html');await page.locator('#loginEmail').fill(name+'@example.com');
        await page.locator('#loginPassword').fill('Correct-password-123!');await page.locator('#loginForm button').click();
        await page.locator('#collabWorkspace').waitFor();await idle(page);
    }
    async function inspect() {await gate;await db.exec('reset role');return (await db.query('select * from public.question_submissions order by created_at,id')).rows;}
    async function closePreview() {await alice.locator('#closeBatchPreview').click();await alice.locator('#batchPreview').waitFor({state:'hidden'});}
    await login(alice,'alice');
    await alice.locator('#submissionSubject').selectOption('os');await alice.locator('#submissionUnit').selectOption('u6');
    await alice.locator('#submissionFormat').selectOption('auto');
    const raw='題目：批次題一\n你的答案：thread\n正確答案：kernel\n得分：0 / 1\n\n題目：批次題二\nA. 甲\nB. 乙\n\n題目：<img src=x onerror=alert(1)>\n正確答案：<script>alert(1)</script>';
    await alice.locator('#submissionDraft').fill(raw);await alice.locator('#submitForReview').click();await idle(alice);
    assert.equal(await alice.locator('.batch-item').count(),3);assert.equal(saveCalls.length,0);
    assert.match(await alice.locator('[data-batch-body="1"]').innerText(),/請貼上一題/);
    assert.equal(await alice.locator('#batchItems img,#batchItems script').count(),0);
    assert.equal(await alice.locator('#submissionSubject').isDisabled(),true);
    assert.equal(await alice.locator('#submissionDraft').getAttribute('readonly'),'');
    await alice.locator('#submitForReview').click();await idle(alice);
    assert.equal(saveCalls.length,0);assert.match(await alice.locator('#collabMessage').innerText(),/仍有格式錯誤/);
    await alice.locator('.batch-item').nth(1).locator('summary').click();
    await alice.locator('#batchText-1').fill('題目：批次題二\nA. 甲\nB. 乙\n你的答案：甲\n正確答案：乙');
    assert.equal(await alice.locator('[data-batch-status="1"]').innerText(),'待處理');
    await alice.locator('[data-batch-select="2"]').uncheck();
    fault={at:saveCalls.length+2,kind:'reject'};
    await alice.locator('#submitForReview').click();await idle(alice);
    assert.equal((await inspect()).length,1);
    assert.equal(await alice.locator('[data-batch-status="0"]').innerText(),'已送出審核');
    assert.equal(await alice.locator('[data-batch-status="1"]').innerText(),'送出失敗');
    assert.equal(await alice.locator('[data-batch-select="0"]').isDisabled(),true);
    const firstId=(await inspect())[0].id;
    await alice.locator('#submitForReview').click();await idle(alice);
    const firstRows=await inspect();assert.equal(firstRows.length,2);assert.equal(firstRows.filter(r=>r.id===firstId).length,1);
    assert.ok(firstRows.every(r=>r.status==='pending'));
    assert.equal(firstRows.find(r=>r.content.question==='批次題一').content.user_answer,'thread');
    assert.ok(firstRows.every(r=>!('score' in r.content)));
    pass('Multi-paste first shows editable preview, invalid selection blocks writes, HTML stays text, explicit rejection preserves successes and retry never resends them');
    await closePreview();const remaining=await alice.locator('#submissionDraft').inputValue();
    assert.ok(remaining.includes('<img'));assert.ok(!remaining.includes('批次題一'));assert.ok(!remaining.includes('批次題二'));
    await alice.locator('#previewSubmissions').click();await idle(alice);
    await alice.locator('#saveSubmission').click();await idle(alice);
    const draftId=(await inspect()).find(r=>r.status==='draft').id;
    await alice.locator('.batch-edit summary').click();
    await alice.locator('#batchText-0').fill('題目：草稿修改測試\n正確答案：draft answer');
    await alice.locator('#closeBatchPreview').click();assert.equal(await alice.locator('#batchPreview').isVisible(),true);
    assert.match(await alice.locator('#collabMessage').innerText(),/修改尚未儲存/);
    await alice.locator('#saveSubmission').click();await idle(alice);
    assert.equal((await inspect()).length,3);assert.equal((await inspect()).find(r=>r.id===draftId).revision,2);
    await alice.locator('#submitForReview').click();await idle(alice);
    assert.equal((await inspect()).length,3);assert.equal((await inspect()).find(r=>r.id===draftId).status,'pending');
    await closePreview();assert.equal(await alice.locator('#submissionDraft').inputValue(),'');
    pass('Batch drafts remain editable, unsaved draft changes are protected, and later submission updates the same IDs and revisions');
    await alice.locator('#submissionDraft').fill('題目：回應遺失第一題\n正確答案：one\n\n題目：回應遺失第二題\n正確答案：two');
    await alice.locator('#previewSubmissions').click();await idle(alice);
    fault={at:saveCalls.length+1,kind:'lost'};
    await alice.locator('#submitForReview').click();await idle(alice);
    assert.equal(await alice.locator('[data-batch-status="0"]').innerText(),'結果待查核');
    const callsBefore=saveCalls.length;
    await alice.locator('#submitForReview').click();await idle(alice);assert.equal(saveCalls.length,callsBefore);
    await alice.locator('#batchReconcile').click();await idle(alice);
    assert.equal(await alice.locator('[data-batch-status="0"]').innerText(),'已送出審核');
    await alice.locator('#submitForReview').click();await idle(alice);
    const rowsAfterLoss=await inspect();assert.equal(rowsAfterLoss.length,5);
    assert.equal(rowsAfterLoss.filter(r=>r.content.question==='回應遺失第一題').length,1);
    assert.equal(rowsAfterLoss.filter(r=>r.content.question==='回應遺失第二題').length,1);
    await closePreview();
    await alice.locator('#submissionDraft').fill('題目：尚未確認的題目\n正確答案：uncertain');
    await alice.locator('#previewSubmissions').click();await idle(alice);
    fault={at:saveCalls.length+1,kind:'abort'};await alice.locator('#submitForReview').click();await idle(alice);
    await alice.locator('#batchReconcile').click();await idle(alice);
    assert.equal(await alice.locator('[data-batch-status="0"]').innerText(),'結果待查核');
    const uncertainCalls=saveCalls.length;await alice.locator('#submitForReview').click();await idle(alice);assert.equal(saveCalls.length,uncertainCalls);
    await alice.locator('#closeBatchPreview').click();assert.equal(await alice.locator('#batchPreview').isVisible(),true);
    alice.once('dialog',d=>d.accept());await alice.locator('#newSubmission').click();
    pass('Lost success response is reconciled before retry, while an unresolved request stays blocked instead of duplicating a question');
    await gate;await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub','',false)");await db.exec('set role anon');
    assert.equal((await db.query('select * from public.published_questions')).rows.length,0);
    await login(admin,'admin');assert.equal(await admin.locator('#submissionList .submission-card').count(),5);
    await admin.locator('.submission-card').filter({hasText:'批次題一'}).locator('[data-view]').click();
    assert.match(await admin.locator('#reviewDraft').inputValue(),/你的答案：\nthread/);
    await admin.locator('#approveSubmission').click();await idle(admin);
    assert.equal(await admin.locator('#submissionList .submission-card').count(),4);
    await gate;await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub','',false)");await db.exec('set role anon');
    const visible=(await db.query('select * from public.published_questions')).rows;
    assert.equal(visible.length,1);assert.equal(visible[0].content.question,'批次題一');
    await admin.locator('.submission-card').filter({hasText:'批次題二'}).locator('[data-view]').click();
    await admin.locator('#reviewNote').fill('請確認選項');await admin.locator('#returnSubmission').click();await idle(admin);
    await alice.locator('#refreshCollab').click();await idle(alice);
    await alice.locator('.submission-card').filter({hasText:'批次題二'}).locator('[data-edit]').click();
    assert.equal(await alice.locator('#previewSubmissions').isDisabled(),true);
    const beforeEdit=saveCalls.length;await alice.locator('#submissionDraft').fill('題目：不應覆寫第一題\n正確答案：a\n題目：不應覆寫第二題\n正確答案：b');
    await alice.locator('#submitForReview').click();await idle(alice);assert.equal(saveCalls.length,beforeEdit);
    assert.match(await alice.locator('#collabMessage').innerText(),/編輯既有草稿/);
    await alice.locator('#submissionFormat').selectOption('no_options');
    await alice.locator('#submissionDraft').fill('題目：批次題二修正版\n正確答案：乙');
    await alice.locator('#saveSubmission').click();await idle(alice);assert.equal((await inspect()).length,5);
    pass('Administrator reviews one question at a time, only the approved row becomes public, and returned single-question editing cannot overwrite a record with multiple pasted questions');
    alice.once('dialog',d=>d.accept());await alice.locator('#newSubmission').click();
    await alice.locator('#submissionDraft').fill('題目：CPU 排程器是哪一種類型的排程器？\n你的答案：long-term scheduler\n正確答案：short-term scheduler\n得分：0 / 1\n\n題目：輪轉排程的英文名稱是什麼？\n正確答案：Round Robin');
    await alice.locator('#previewSubmissions').click();await idle(alice);
    await alice.setViewportSize({width:390,height:844});assert.equal(await alice.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await alice.setViewportSize({width:1280,height:1000});
    if(process.env.BATCH_SCREENSHOT_PATH){
        const destination=process.env.BATCH_SCREENSHOT_PATH;
        if(fs.existsSync(destination))throw new Error('Screenshot target already exists; do not overwrite');
        fs.mkdirSync(path.dirname(destination),{recursive:true});await alice.screenshot({path:destination,fullPage:false});
    }
    assert.deepEqual(errors,[]);
    pass('Mobile preview fits, reviewed contents stay text, and no real accounts or production data were used');
    await ac.close();await mc.close();
}
(async()=>{
 try{

  const sandbox=vm.createContext({});
  const moduleCache=new Map();
  function moduleFor(file){file=path.resolve(file);if(!moduleCache.has(file))moduleCache.set(file,new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{context:sandbox,identifier:file}));return moduleCache.get(file);}
  const rules=moduleFor(path.join(root,'js/collaboration-batch.js'));
  await rules.link((spec,ref)=>moduleFor(path.resolve(path.dirname(ref.identifier),spec.split('?')[0])));await rules.evaluate();
  const {parseBatch,parseSubmission,contentKey,questionCount}=rules.namespace;
  const sample='題目：第一題\n你的答案：錯答\n正確答案：正解\n得分：0 / 1\n\n題目：第二題\nA. 甲\nB. 乙\n正確答案：乙';
  const parsed=parseBatch(sample,'auto');assert.equal(parsed.length,2);assert.equal(parsed[0].content.user_answer,'錯答');assert.equal(parsed[0].content.score,undefined);assert.equal(parsed[1].content.options.length,2);
  assert.equal(questionCount('1. **題目：**甲\r\n正確答案：乙\r\n第 2 題\r\n題目：丙\r\n正確答案：丁'),2);
  assert.equal(parseBatch('1. **題目：**甲\r\n正確答案：乙\r\n第 2 題\r\n題目：丙\r\n正確答案：丁').length,2);
  assert.ok(parseBatch('題目：缺答案\n\n題目：完整\n正確答案：有')[0].error);
  assert.equal(parseBatch('題目：甲\n正確答案：乙\n-----\n題目：丙\n正確答案：丁')[0].content.correct_answer,'乙');
  assert.throws(()=>parseBatch('未歸屬文字\n題目：測試\n正確答案：答案'),/未歸屬/);
  assert.throws(()=>parseBatch(Array.from({length:31},(_,i)=>'題目：'+i+'\n正確答案：x').join('\n')),/最多/);
  assert.throws(()=>parseSubmission('題目：'+ 'x'.repeat(10001)+'\n正確答案：y'),/過長/);
  assert.equal(contentKey(parsed[0].content),contentKey(JSON.parse(JSON.stringify(parsed[0].content))));
  const legacy=moduleFor(path.join(root,'js/custom-questions.js'));assert.throws(()=>legacy.namespace.parseDraft(sample),/請貼上一題/);
  pass('Batch parsing keeps every question, numbered/bold CRLF headings, per-item errors, scoring exclusion, limits and unchanged private single-question parser');
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth,public to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated;`);
  await db.exec(fs.readFileSync(path.join(root,'backend/schema.sql'),'utf8'));
  await db.exec(fs.readFileSync(path.join(root,'backend/migrations/20261017-password-reset.sql'),'utf8'));
  await db.exec(fs.readFileSync(path.join(root,'backend/migrations/20261017-collaboration-formats-units.sql'),'utf8'));
  for(const [name,id] of Object.entries(identities)){
   await db.query('insert into auth.users values($1,$2,now())',[id,name+'@example.com']);
   await db.query('insert into public.collaboration_members(user_id,email,display_name,role) values($1,$2,$3,$4)',[id,name+'@example.com',name==='admin'?'題庫管理員':'小雨',name==='admin'?'admin':'contributor']);
  }
  server=http.createServer((req,res)=>{
   const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/algorithm-question-bank/,'');
   const filename=path.resolve(root,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));
   if(!filename.startsWith(root+path.sep)){res.writeHead(403).end();return;}
   fs.readFile(filename,(error,content)=>{if(error){res.writeHead(404).end();return;}
    const type={'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.mp3':'audio/mpeg'}[path.extname(filename)]||'text/plain';
    res.writeHead(200,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store'});res.end(content);
   });
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port+'/algorithm-question-bank/';
  browser=await chromium.launch({channel:'msedge',headless:true});
  async function context(){const c=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});
   await c.route('**/collaboration-config.js*',route=>route.fulfill({contentType:'text/javascript',body:`export const collaborationConfig={enabled:true,url:'${serverUrl}',publishableKey:'sb_publishable_test'};`}));
   await c.route(serverUrl+'/**',route=>{const job=gate.then(()=>routeApi(route));gate=job.catch(()=>{});return job;});
   c.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));return c;}
  await batchFlows(context,base);
  console.log(JSON.stringify({passed,errors,saveRequests:saveCalls.length}));
 }finally{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.join(__dirname,'artifacts'); fs.mkdirSync(out,{recursive:true});
const identities={admin:'20000000-0000-0000-0000-000000000001',alice:'20000000-0000-0000-0000-000000000002'};
const passwords={admin:'Correct-password-123!',alice:'Correct-password-123!'};let resetCalls=0;
const db=new PGlite();let browser,server,passed=0,gate=Promise.resolve();const errors=[];
const pass=s=>{passed++;console.log('PASS '+s);};
const serverUrl='https://collab-test.supabase.co';
async function routeApi(route){
 const request=route.request(),url=new URL(request.url()),token=(request.headers().authorization||'').replace('Bearer ',''),name=token.startsWith('admin-')?'admin':token.startsWith('alice-')?'alice':null;
 const json=(data,status=200)=>route.fulfill({status,headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'},body:JSON.stringify(data)});
 if(url.pathname==='/rest/v1/question_replacements')return json([]);
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
   const values=map[fn].map(k=>b[k]);const sql='select * from public.'+fn+'('+values.map((_,i)=>'$'+(i+1)).join(',')+')';
   return json((await db.query(sql,values)).rows);
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
(async()=>{
 try{
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
  const ac=await context(),mc=await context(),pc=await context();const alice=await ac.newPage(),admin=await mc.newPage(),pub=await pc.newPage();
  async function login(page,name){await page.goto(base+'collaborate.html');await page.locator('#loginEmail').fill(name+'@example.com');await page.locator('#loginPassword').fill('Correct-password-123!');await page.locator('#loginForm button').click();await page.locator('#collabWorkspace').waitFor({state:'visible'});await page.locator('#refreshCollab').waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('#refreshCollab').disabled);await page.locator('#manualContribution').evaluate(e=>e.open=true);}
  await login(alice,'alice');assert.equal(await alice.locator('[data-tab="pending"]').isVisible(),false);
  await alice.locator('#submissionSubject').selectOption('os');await alice.locator('#submissionUnit').selectOption('u6');
  const draft='題目：協作整合測試 [__1__]\n\n正確答案：\nkernel';
  await alice.locator('#submissionDraft').fill(draft);await alice.locator('#saveSubmission').click();await alice.getByText('草稿已儲存。',{exact:true}).waitFor();
  assert.equal(await alice.locator('.submission-card').count(),1);pass('Contributor login, destination selection and persisted draft');
  await alice.waitForFunction(()=>!document.querySelector('#refreshCollab').disabled);
  await alice.screenshot({path:path.join(out,'collaboration-contributor-preview.png')});
  await alice.setViewportSize({width:390,height:844});await alice.screenshot({path:path.join(out,'collaboration-mobile-preview.png'),fullPage:true});await alice.setViewportSize({width:1280,height:900});
  await alice.locator('#submitForReview').click();await alice.getByText('已送出審核，核准後才會公開。',{exact:true}).waitFor();
  assert.equal(await alice.locator('[data-edit]').count(),0);assert.equal(await alice.locator('#submissionDraft').inputValue(),'');
  await pub.goto(base);await pub.locator('#osSubjectBtn').click();await pub.waitForFunction(()=>document.querySelector('#bankFooter').textContent.includes('共用 0 題'));
  await pub.locator('[data-panel="units"]').click();await pub.locator('[data-unit="u6"]').click();await pub.waitForFunction(()=>document.querySelector('#bankFooter').textContent.includes('U6｜內建 233 題｜共用 0 題'));
  await pub.locator('#searchInput').fill('協作整合測試');assert.equal(await pub.locator('#questionList article').count(),0);pass('Pending content stays out of anonymous public search');
  await login(admin,'admin');await admin.locator('[data-view]').click();await admin.locator('#returnSubmission').click();await admin.locator('#reviewDialog').getByText('請填寫退回原因。',{exact:true}).waitFor();
  await admin.locator('#reviewNote').fill('請補充解析後重新送審');await admin.locator('#returnSubmission').click();await admin.getByText('題目已退回，協作者可修改後再送審。',{exact:true}).waitFor();
  await alice.locator('#refreshCollab').click();await alice.getByText('請補充解析後重新送審',{exact:true}).waitFor();await alice.locator('[data-edit]').click();
  await alice.locator('#submissionDraft').fill(draft+'（修正版）');await alice.locator('#submitForReview').click();await alice.getByText('已送出審核，核准後才會公開。',{exact:true}).waitFor();pass('Admin return requires reason; author can edit and resubmit');
  await admin.locator('#refreshCollab').click();await admin.locator('[data-view]').click();await admin.locator('#reviewDraft').fill('題目：協作整合測試 [__1__]\n\n正確答案：\n管理員核對答案');await admin.waitForFunction(()=>!document.querySelector('#refreshCollab').disabled);await admin.screenshot({path:path.join(out,'collaboration-review-preview.png')});await admin.locator('.review-mode input[value="add"]').check();await admin.locator('#approveSubmission').click();await admin.getByText('題目已核准並發布。',{exact:true}).waitFor();
  await pub.reload();await pub.locator('#osSubjectBtn').click();await pub.waitForFunction(()=>document.querySelector('#bankFooter').textContent.includes('共用 0 題'));
  await pub.locator('[data-panel="units"]').click();assert.match(await pub.locator('[data-unit="u6"]').innerText(),/234/);await pub.locator('[data-unit="u6"]').click();await pub.waitForFunction(()=>document.querySelector('#bankFooter').textContent.includes('共用 1 題'));
  await pub.locator('#searchInput').fill('協作整合測試');assert.equal(await pub.locator('#questionList article').count(),1);await pub.locator('.answer-btn').click();assert.match(await pub.locator('.answer.show').innerText(),/管理員核對答案/);pass('Admin-edited approval publishes the reviewed snapshot and updates public unit counts');
  await admin.locator('[data-tab="published"]').click();await admin.locator('[data-publication]').waitFor();await admin.screenshot({path:path.join(out,'collaboration-admin-published.png')});
  await admin.locator('[data-publication]').click();await admin.getByText('題目已撤回，可隨時恢復。',{exact:true}).waitFor();
  await pub.reload();await pub.locator('#osSubjectBtn').click();await pub.waitForFunction(()=>document.querySelector('#bankFooter').textContent.includes('共用 0 題'));
  await pub.locator('[data-panel="units"]').click();await pub.locator('[data-unit="u6"]').click();await pub.waitForFunction(()=>document.querySelector('#bankFooter').textContent.includes('U6｜內建 233 題｜共用 0 題'));await pub.locator('#searchInput').fill('協作整合測試');assert.equal(await pub.locator('#questionList article').count(),0);
  await admin.locator('[data-publication]').click();await admin.getByText('題目已恢復發布。',{exact:true}).waitFor();pass('Withdrawal removes public access and restoration works without deleting history');
  await admin.locator('[data-tab="members"]').click();await admin.locator('[data-member]').waitFor();await admin.locator('[data-member]').click();await admin.getByText('帳號已停用，後端會拒絕後續協作操作。',{exact:true}).waitFor();
  await alice.locator('#submissionDraft').fill(draft);await alice.locator('#submitForReview').click();await alice.getByText('帳號沒有協作權限，或已被停用。',{exact:true}).waitFor();assert.equal(await alice.locator('#submissionDraft').inputValue(),draft);pass('Disabling an already logged-in collaborator blocks writes and preserves their unsaved text');
  await admin.locator('[data-tab="audit"]').click();await admin.locator('#auditList').getByText('新增一題',{exact:true}).waitFor();await admin.screenshot({path:path.join(out,'collaboration-audit-preview.png')});
  await admin.locator('[data-tab="members"]').click();await admin.locator('[data-member]').click();await admin.getByText('帳號已啟用。',{exact:true}).waitFor();
  await admin.locator('#memberName').fill('新協作者');await admin.locator('#memberEmail').fill('new@example.com');await admin.locator('#memberForm button').click();await admin.locator('#createdCredentials').waitFor({state:'visible'});
  assert.equal(await admin.locator('#initialPassword').inputValue(),'TEST-ONLY-aA9-INITIAL-PASSWORD');await admin.locator('#dismissCredentials').click();assert.equal(await admin.locator('#initialPassword').inputValue(),'');pass('Admin creates a contributor and dismisses the once-visible initial password');
  const resetButton=admin.locator('[data-reset-password="'+identities.alice+'"]');
  await admin.waitForFunction(()=>!document.querySelector('#refreshCollab').disabled);await admin.screenshot({path:path.join(out,'collaboration-password-reset-preview.png')});
  admin.once('dialog',d=>d.dismiss());await resetButton.click();assert.equal(resetCalls,0);
  admin.once('dialog',d=>d.accept());await resetButton.click();await admin.getByText('密碼已重設，請複製新密碼交給本人。',{exact:true}).waitFor();assert.equal(resetCalls,1);
  assert.equal(await admin.locator('#initialPassword').inputValue(),'TEST-ONLY-RESET-aA9-NEW-PASSWORD');assert.equal(await admin.locator('#credentialEmail').innerText(),'帳號：alice@example.com');
  await admin.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.testClipboard=text;}}}));await admin.locator('#copyCredentials').click();await admin.getByText('帳號與密碼已複製，請私下交給本人。',{exact:true}).waitFor();assert.match(await admin.evaluate(()=>window.testClipboard),/alice@example.com\n密碼：TEST-ONLY-RESET/);
  await admin.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('denied');}}}));await admin.locator('#copyCredentials').click();await admin.getByText('瀏覽器未允許自動複製，請手動複製上方帳號與密碼。',{exact:true}).waitFor();await admin.waitForFunction(()=>document.activeElement.id==='initialPassword');
  await admin.locator('#dismissCredentials').click();assert.equal(await admin.locator('#initialPassword').inputValue(),'');assert.equal(await admin.locator('#credentialEmail').innerText(),'');assert.ok(!(await admin.evaluate(()=>JSON.stringify(sessionStorage))).includes('TEST-ONLY-RESET'));pass('Reset confirmation, targeted credential display, copying and manual-copy fallback work without persisting passwords');
  const recoveredContext=await context(),recovered=await recoveredContext.newPage();await recovered.goto(base+'collaborate.html');await recovered.locator('#loginEmail').fill('alice@example.com');await recovered.locator('#loginPassword').fill('Correct-password-123!');await recovered.locator('#loginForm button').click();await recovered.getByText('Email 或密碼不正確。',{exact:true}).waitFor();
  await recovered.locator('#loginPassword').fill(passwords.alice);await recovered.locator('#loginForm button').click();await recovered.locator('#collabWorkspace').waitFor({state:'visible'});assert.match(await recovered.locator('#accountName').innerText(),/小雨/);pass('After recovery the old password fails and the new password logs into the same collaborator identity');
  await alice.locator('#refreshCollab').click();await alice.locator('#submissionDraft').fill('題目：<img src=x onerror=alert(1)>\n\n正確答案：<script>alert(1)</script>');await alice.locator('#saveSubmission').click();await alice.getByText('草稿已儲存。',{exact:true}).waitFor();assert.equal(await alice.locator('.submission-card img').count(),0);await alice.locator('[data-view]').first().click();assert.equal(await alice.locator('#reviewDialog script').count(),0);await alice.locator('#closeReview').click();pass('Pasted HTML remains text and never becomes executable markup');
  await alice.setViewportSize({width:390,height:844});assert.equal(await alice.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await alice.setViewportSize({width:1280,height:900});
  assert.equal(await alice.locator('#submissionFormat').count(),0);
  alice.once('dialog',d=>d.accept());await alice.locator('#newSubmission').click();
  await alice.locator('#openUnitDialog').click();await alice.locator('#newUnitNumber').fill('7');await alice.locator('#unitForm button[type=submit]').click();await alice.getByText('已選用 U7，可開始新增題目。',{exact:true}).waitFor();
  assert.equal(await alice.locator('#submissionUnit').inputValue(),'u7');
  await pub.reload();await pub.locator('#osSubjectBtn').click();await pub.locator('[data-panel="units"]').click();assert.equal(await pub.locator('[data-unit="u7"]').count(),0);
  const pasted='題目：I/O綁定型程序的特徵是什麼？\n\n你的答案：\n花費大部分時間進行CPU運算\n\n正確答案：\n花費大部分時間進行I/O操作\n\n得分：0 / 1';
  await alice.locator('#submissionDraft').fill(pasted);await alice.locator('#submitForReview').click();await alice.getByText('已送出審核，核准後才會公開。',{exact:true}).waitFor();
  await admin.locator('[data-tab="pending"]').click();await admin.locator('.submission-card').filter({hasText:'I/O綁定型程序'}).locator('[data-view]').click();
  assert.match(await admin.locator('#reviewDraft').inputValue(),/你的答案：\n花費大部分時間進行CPU運算/);assert.ok(!(await admin.locator('#reviewDraft').inputValue()).includes('得分'));
  await admin.screenshot({path:path.join(out,'collaboration-no-options-review.png')});await admin.locator('.review-mode input[value="add"]').check();await admin.locator('#approveSubmission').click();await admin.getByText('題目已核准並發布。',{exact:true}).waitFor();
  await pub.reload();await pub.locator('#osSubjectBtn').click();await pub.locator('[data-panel="units"]').click();await pub.locator('[data-unit="u7"]').click();await pub.waitForFunction(()=>document.querySelector('#bankFooter').textContent.includes('U7｜內建 0 題｜共用 1 題'));
  await pub.locator('[data-filter="shared"]').click();assert.equal(await pub.locator('#questionList article').count(),1);assert.match(await pub.locator('#questionList').innerText(),/友列協助題/);await pub.locator('.answer-btn').click();
  assert.match(await pub.locator('.answer.show').innerText(),/曾有作答錯誤：花費大部分時間進行CPU運算/);assert.ok(!(await pub.locator('#questionList').innerText()).includes('原始訓練紀錄'));assert.ok(!(await pub.locator('#questionList').innerText()).includes('小雨'));await pub.screenshot({path:path.join(out,'collaboration-helped-question.png')});
  pass('Default no-option paste ignores score, preserves wrong answer through admin review, opens an approved new unit and appears in the helper filter anonymously');
  const parsing=await alice.evaluate(async()=>{
   const {parseDraft,mistakenAnswer}=await import('./js/custom-questions.js?v=20261017-formats1');
   const same=parseDraft('題目：測試\n你的答案：\nI/O  操作\n正確答案：\nI/O\n操作\n得分：1 / 1',{format:'no_options',retainAnswer:true});
   const absent=parseDraft('題目：測試\n正確答案：解答',{format:'no_options',retainAnswer:true});
   const choice=parseDraft('題目：測試\nA. 甲\nB. 乙\n你的答案：甲\n正確答案：乙\n得分：0 / 1',{format:'with_options',retainAnswer:true});
   let rejected=false;try{parseDraft('題目：測試\nA. 甲\n正確答案：甲',{format:'no_options'});}catch{rejected=true;}
   return {same,absent,choice,note:mistakenAnswer(same),missingNote:mistakenAnswer(absent),rejected};
  });
  assert.equal(parsing.same.user_answer,'I/O  操作');assert.equal(parsing.note,'');assert.equal(parsing.missingNote,'');assert.equal(parsing.choice.type,'choice');assert.equal(parsing.choice.options.length,2);assert.equal(parsing.choice.user_answer,'甲');assert.equal(parsing.rejected,true);assert.equal(parsing.same.score,undefined);
  await alice.locator('#submissionDraft').fill('題目：選項格式保留測試\nA. 甲\nB. 乙\n你的答案：甲\n正確答案：乙\n得分：0 / 1');await alice.locator('#saveSubmission').click();await alice.getByText('草稿已儲存。',{exact:true}).waitFor();await alice.locator('.submission-card').filter({hasText:'選項格式保留測試'}).locator('[data-edit]').click();assert.equal(await alice.locator('#submissionFormat').count(),0);assert.match(await alice.locator('#submissionDraft').inputValue(),/你的答案：\n甲/);
  pass('Matching or absent answers add no wrong-answer note; choice mode and draft editing retain options and submitted answer; mismatched format never discards options');
  await alice.locator('#logoutBtn').click();await alice.locator('#loginCard').waitFor({state:'visible'});assert.equal(await alice.evaluate(()=>sessionStorage.getItem('question_bank_collaboration_session_v1')),null);pass('Mobile layout fits, logout clears session and private form contents');
  const offline=await browser.newContext();await offline.route('**/collaboration-config.js*',route=>route.fulfill({contentType:'text/javascript',body:'export const collaborationConfig={enabled:false,url:"",publishableKey:""};'}));const off=await offline.newPage();await off.goto(base+'collaborate.html');await off.getByText('協作服務準備中',{exact:true}).waitFor();assert.equal(await off.locator('#loginCard').isVisible(),false);pass('Unconfigured production connection keeps collaboration safely disabled');
  await admin.locator('[data-tab="mine"]').click();await admin.locator('#submissionEditor').waitFor({state:'visible'});await admin.waitForFunction(()=>!document.querySelector('#refreshCollab').disabled);await admin.screenshot({path:path.join(out,'collaboration-admin-preview.png')});
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed,errors}));
 }finally{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

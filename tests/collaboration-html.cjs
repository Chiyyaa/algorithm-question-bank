const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {PGlite}=require('@electric-sql/pglite');
const root=path.resolve(__dirname,'..'),fixture=name=>fs.readFileSync(path.join(__dirname,'fixtures',name),'utf8');
let server,browser,db;const saved=[],errors=[],shared=[];
const member={user_id:'20000000-0000-0000-0000-000000000002',display_name:'協作者測試',role:'contributor',active:true};
(async()=>{try{
 server=http.createServer((req,res)=>{const name=decodeURIComponent(new URL(req.url,'http://local').pathname);const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}fs.readFile(file,(error,data)=>{res.writeHead(error?404:200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'}[path.extname(file)]||'text/plain')+'; charset=utf-8'});res.end(error?'Not found':data);});});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});
 await context.addInitScript(()=>sessionStorage.setItem('question_bank_collaboration_session_v1',JSON.stringify({access_token:'test-only',user:{id:'20000000-0000-0000-0000-000000000002'}})));
 let failBank=false;
 await context.route('https://*.supabase.co/**',async route=>{
   const url=new URL(route.request().url()),p=url.pathname;let data=[];
   if(p==='/auth/v1/user')data={id:member.user_id};
   else if(p==='/rest/v1/collaboration_members')data=[member];
   else if(p==='/rest/v1/question_submissions')data=saved;
   else if(p==='/rest/v1/published_questions'){if(failBank)return route.fulfill({status:503,contentType:'application/json',body:'{}'});data=url.searchParams.get('unit_id')==='eq.u5'?shared:[];}
   else if(p==='/rest/v1/rpc/save_question_submission'){
     const b=route.request().postDataJSON();assert.equal(b.p_submit,true);assert.equal(b.p_subject,'os');assert.equal(b.p_unit,'u5');assert.deepEqual(Object.keys(b.p_content).sort(),['correct_answer','options','question','type']);
     data={id:'test-'+(saved.length+1),content:b.p_content,status:'pending',revision:1,subject_id:'os',unit_id:'u5',author_id:member.user_id,updated_at:new Date().toISOString()};saved.push(data);
   }
   await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/collaborate.html');await page.locator('#collabWorkspace').waitFor();await page.waitForFunction(()=>!document.querySelector('#refreshCollab').disabled);
 const result=await page.evaluate(async({q,a})=>{
   const m=await import('./js/collaboration-import.js'),p=await import('./js/batch-import.js');
   const questions=p.parseBatchHTML(q),answers=m.parseAnswerHTML(a),entries=m.pairHTML(questions,answers);
   const bank=await(await fetch('./data/os-u5.json')).json();bank.forEach(x=>Object.assign(x,{subject:'os',unit:'u5'}));m.classifyEntries(entries,bank);
   const c={question:'模型條件？',type:'choice',options:['A. 甲','B. 乙'],correct_answer:'甲'};
   const reversed={...c,id:1,subject:'os',unit:'u5',options:['A. 乙','B. 甲'],correct_answer:'B'};
   const check=x=>m.classifyContribution(x,[reversed]).kind;
   const mismatch=m.pairHTML(questions,answers.slice(1));
   const empty=m.pairHTML(questions,answers.map((x,i)=>i?x:{...x,answer:''}));
   const repeated=m.classifyEntries([{content:c,error:'',selected:true},{content:c,error:'',selected:true}],[]);
   const missing=m.classifyContribution(c,[{...c,id:2,options_status:'known_options_only'}]);
   const unsafe=m.parseAnswerHTML('<script>window.IMPORT_EXECUTED=1</script><img src="https://invalid.test/leak"><div class="question-result"><p><strong>題目：</strong>X</p><p><strong>你的答案：</strong>WRONG</p><p><strong>正確答案：</strong>RIGHT</p></div>');
   return {contents:entries.map(e=>e.content),count:questions.length,answers:answers.length,errors:entries.filter(e=>e.error).map(e=>({n:e.number,error:e.error})),counts:entries.reduce((a,e)=>(a[e.comparison.kind]=(a[e.comparison.kind]||0)+1,a),{}),choice:entries[0].content,multiple:entries[4].content,fill:entries[3].content,mathDistinct:m.canonical('x²')!==m.canonical('x2'),subscriptDistinct:m.canonical('x₂')!==m.canonical('x2'),reordered:check(c),conflict:check({...c,correct_answer:'乙'}),different:check({...c,question:'模型條件不成立？'}),missing:missing.kind,mismatch:mismatch.filter(e=>e.error).length,empty:empty[0].error,repeated:repeated[1].comparison.kind,unsafe,executed:window.IMPORT_EXECUTED||false};
 },{q:fixture('collaboration-os5-questions.html'),a:fixture('collaboration-os5-results.html')});
 assert.equal(result.mathDistinct,true);assert.equal(result.subscriptDistinct,true);assert.equal(result.count,25);assert.equal(result.answers,25);assert.deepEqual(result.errors,[]);assert.equal(result.choice.correct_answer,'Windows NT/XP/2000');assert.equal(result.multiple.correct_answer.split('\n').length,3);assert.equal(result.fill.type,'fill_blank');assert.equal(result.fill.correct_answer,'processing cores');
 assert.equal(result.reordered,'duplicate');assert.equal(result.conflict,'review');assert.notEqual(result.different,'duplicate');assert.equal(result.missing,'supplement');assert.ok(result.mismatch>0);assert.ok(result.empty);assert.equal(result.repeated,'duplicate');assert.equal(result.unsafe[0].answer,'RIGHT');assert.equal(result.executed,false);console.log('PASS real 5-7 files: '+JSON.stringify(result.counts)+'; exact/reordered/conflict/incomplete/mismatched/safe parsing controls');
 db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated;`);
 await db.exec(fs.readFileSync(path.join(root,'backend/schema.sql'),'utf8'));await db.exec(fs.readFileSync(path.join(root,'backend/migrations/20261017-collaboration-formats-units.sql'),'utf8'));
 for(const c of result.contents)assert.equal((await db.query('select public.collaboration_valid_content($1) as valid',[c])).rows[0].valid,true);
 const author=member.user_id,admin='20000000-0000-0000-0000-000000000001';
 for(const [id,role] of [[author,'contributor'],[admin,'admin']]){await db.query('insert into auth.users values($1,$2,now())',[id,role+'@example.com']);await db.query('insert into public.collaboration_members(user_id,display_name,email,role) values($1,$2,$3,$4)',[id,role,role+'@example.com',role]);}
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[author]);await db.exec('set role authenticated');
 const pending=(await db.query('select * from public.save_question_submission(null,$1,$2,$3,true,null)',['os','u5',result.contents[0]])).rows[0];assert.equal(pending.status,'pending');assert.equal((await db.query('select * from public.published_questions')).rows.length,0);
 await assert.rejects(db.query("select * from public.review_question_submission($1,1,'approve',$2,'')",[pending.id,result.contents[0]]),/ADMIN_REQUIRED/);
 await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[admin]);await db.exec('set role authenticated');await db.query("select * from public.review_question_submission($1,1,'approve',$2,'核對 HTML')",[pending.id,result.contents[0]]);
 const published=(await db.query('select content from public.published_questions')).rows;assert.equal(published.length,1);assert.deepEqual(published[0].content,result.contents[0]);console.log('PASS all 25 generated payloads pass existing server validator; actual PostgreSQL enforces admin-only publication');
 await page.locator('#submissionSubject').selectOption('os');await page.locator('#submissionUnit').selectOption('u5');
 const syntheticQuestion='<div class="question-block"><p class="question-text">妖獸 1. 協作新增測試問題？</p><label><input type="radio" name="answers[777]">A. 正確</label><label><input type="radio" name="answers[777]">B. 錯誤</label></div>';
 const syntheticAnswer='<div class="question-result"><p><strong>題目：</strong>協作新增測試問題？</p><p><strong>正確答案：</strong><br>正確</p></div>';
 const setFiles=async(q,a)=>{await page.locator('#contributionQuestionFile').setInputFiles({name:'題目.html',mimeType:'text/html',buffer:Buffer.from(q)});await page.locator('#contributionAnswerFile').setInputFiles({name:'結果.html',mimeType:'text/html',buffer:Buffer.from(a)});};
 await setFiles(fixture('collaboration-os5-questions.html'),fixture('collaboration-os5-results.html'));await page.locator('#importContribution').click();await page.locator('#batchPreview').waitFor();await page.waitForFunction(()=>!document.querySelector('#refreshCollab').disabled);
 assert.equal(await page.locator('.batch-item').count(),25);assert.equal(saved.length,0);const dup=page.locator('.batch-item:has([data-kind="duplicate"]) input[type="checkbox"]');assert.equal(await dup.count(),result.counts.duplicate||0);for(const e of await dup.all()){assert.equal(await e.isChecked(),false);assert.equal(await e.isDisabled(),true);}
 const links=page.locator('.contribution-comparison a');if(await links.count()){assert.equal(await links.first().getAttribute('target'),'_blank');assert.equal(await links.first().getAttribute('rel'),'noopener noreferrer');}
 await page.locator('#closeBatchPreview').click();await setFiles(syntheticQuestion,syntheticAnswer);failBank=true;await page.locator('#importContribution').click();await page.waitForFunction(()=>!document.querySelector('#refreshCollab').disabled);assert.equal(await page.locator('#batchPreview').isVisible(),false);assert.equal(saved.length,0);failBank=false;
 await page.locator('#importContribution').click();await page.locator('#batchPreview').waitFor();await page.waitForFunction(()=>!document.querySelector('#refreshCollab').disabled);assert.equal(await page.locator('[data-kind="new"]').count(),1);
 shared.push({id:1000000010,content:{question:'協作新增測試問題？',type:'choice',options:['A. 正確','B. 錯誤'],correct_answer:'正確'}});
 await page.locator('#submitForReview').click();await page.waitForFunction(()=>!document.querySelector('#refreshCollab').disabled);assert.equal(saved.length,0);assert.equal(await page.locator('[data-kind="duplicate"]').count(),1);console.log('PASS imported preview, automatic duplicate exclusion, load failure blocks sending, pre-submit fresh-bank race check');
 await page.locator('#closeBatchPreview').click();shared.length=0;await setFiles(syntheticQuestion,syntheticAnswer);await page.locator('#importContribution').click();await page.locator('#batchPreview').waitFor();await page.waitForFunction(()=>!document.querySelector('#refreshCollab').disabled);await page.locator('#submitForReview').click();await page.waitForFunction(()=>!document.querySelector('#refreshCollab').disabled);assert.equal(saved.length,1);assert.equal(saved[0].status,'pending');assert.equal(shared.length,0);console.log('PASS missing question saved only as pending; never auto-published');
 await page.locator('#collabTheme').click();await page.waitForTimeout(50);const theme=await page.locator('body').getAttribute('data-theme');assert.equal(await page.locator('body').evaluate(e=>getComputedStyle(e).backgroundColor),theme==='night'?'rgb(26, 25, 23)':'rgb(250, 250, 250)');
 const artifacts=path.join(__dirname,'artifacts');fs.mkdirSync(artifacts,{recursive:true});await page.screenshot({path:path.join(artifacts,'collaboration-html-desktop.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.locator('#collabTheme').click();await page.screenshot({path:path.join(artifacts,'collaboration-html-mobile.png'),fullPage:true});
 assert.deepEqual(errors,[]);console.log('PASS Taipei theme switch, mobile width, no script errors');
}finally{await db?.close();await browser?.close();await new Promise(r=>server?server.close(r):r());}})().catch(e=>{console.error(e);process.exitCode=1;});

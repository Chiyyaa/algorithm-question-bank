const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const root=process.env.LIMITS_PROJECT_ROOT||path.resolve(__dirname,'..');
const proposed=process.env.LIMITS_PROPOSAL?JSON.parse(fs.readFileSync(process.env.LIMITS_PROPOSAL,'utf8')).files:[];
const read=p=>proposed.find(f=>f.path===p)?.content||fs.readFileSync(path.join(root,p),'utf8');
const signature='public.save_question_submission(uuid,text,text,jsonb,boolean,integer)';
const alice='40000000-0000-0000-0000-000000000001',bob='40000000-0000-0000-0000-000000000002',outsider='40000000-0000-0000-0000-000000000003';
(async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
   create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth,public to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated;`);
  await db.exec(read('backend/schema.sql'));
  await db.exec(read('backend/migrations/20261017-password-reset.sql'));
  await db.exec(read('backend/migrations/20261017-collaboration-formats-units.sql'));
  const definition=async()=>(await db.query('select pg_get_functiondef($1::regprocedure) as definition',[signature])).rows[0].definition;
  const metadata=async()=>(await db.query('select proowner,prosecdef,proconfig,proacl from pg_proc where oid=$1::regprocedure',[signature])).rows[0];
  assert.match(await definition(),/>=300 then raise exception 'SUBMISSION_LIMIT'/);
  await db.exec((await definition()).replace(">=300 then raise exception 'SUBMISSION_LIMIT'",">=30 then raise exception 'SUBMISSION_LIMIT'"));
  const before=await metadata();
  await db.exec(read('backend/migrations/20261017-collaboration-limits.sql'));
  assert.match(await definition(),/>=300 then raise exception 'SUBMISSION_LIMIT'/);assert.deepEqual(await metadata(),before);
  const after=await definition();await db.exec(read('backend/migrations/20261017-collaboration-limits.sql'));assert.equal(await definition(),after);
  console.log('PASS legacy 30 -> 300 migration, repeated application and unchanged owner/grants/security settings');
  for(const [id,email] of [[alice,'alice@test.invalid'],[bob,'bob@test.invalid'],[outsider,'outsider@test.invalid']])await db.query('insert into auth.users values($1,$2,now())',[id,email]);
  for(const [id,email] of [[alice,'alice@test.invalid'],[bob,'bob@test.invalid']])await db.query("insert into public.collaboration_members(user_id,email,display_name,role) values($1,$2,'測試協作者','contributor')",[id,email]);
  const content={question:'本機上限測試',correct_answer:'kernel',type:'short_answer',options:[]};
  await db.query("insert into public.question_submissions(author_id,subject_id,unit_id,content,status) select $1,'os','u6',$2::jsonb,'draft' from generate_series(1,299)",[alice,JSON.stringify(content)]);
  const first=(await db.query('select id,revision from public.question_submissions where author_id=$1 limit 1',[alice])).rows[0];
  async function role(id){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');}
  const save=(id=null,revision=null)=>db.query('select * from public.save_question_submission($1,$2,$3,$4,$5,$6)',[id,'os','u6',content,false,revision]);
  await role(alice);assert.equal((await save()).rows[0].status,'draft');await assert.rejects(()=>save(),/SUBMISSION_LIMIT/);
  assert.equal((await save(first.id,first.revision)).rows[0].revision,2);
  await role(bob);assert.equal((await save()).rows[0].author_id,bob);assert.equal((await db.query('select * from public.question_submissions where author_id=$1',[alice])).rows.length,0);
  await role(outsider);await assert.rejects(()=>save(),/MEMBERSHIP_REQUIRED/);
  await db.exec('reset role');await db.query("update public.question_submissions set created_at=now()-interval '61 minutes' where id=$1",[first.id]);
  await role(alice);assert.equal((await save()).rows[0].author_id,alice);await assert.rejects(()=>save(),/SUBMISSION_LIMIT/);
  console.log('PASS 299 drafts + 300th creation, 301st rejection, existing-draft updates, per-account isolation, rolling-hour expiry and membership checks');
  await db.exec('reset role');const saved=await definition();await db.exec(saved.replace(">=300 then raise exception 'SUBMISSION_LIMIT'",">=17 then raise exception 'SUBMISSION_LIMIT'"));
  await assert.rejects(()=>db.exec(read('backend/migrations/20261017-collaboration-limits.sql')),/Expected exactly one 30-question limit/);await db.exec('rollback');
  assert.match(await definition(),/>=17 then raise exception 'SUBMISSION_LIMIT'/);
  console.log('PASS unexpected live function definitions abort without overwriting their rules');
 }finally{await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});


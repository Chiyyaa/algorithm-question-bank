const path=require('node:path'),fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {stripTypeScriptTypes}=require('node:module');
const source=stripTypeScriptTypes(fs.readFileSync(path.join(__dirname,'../backend/functions/manage-collaborators/index.ts'),'utf8'));
let handler,calls=[],admin=true,validUser=true,grantOk=true;let passed=0;
const env={SUPABASE_URL:'https://project.supabase.co',SUPABASE_ANON_KEY:'anon-public',SUPABASE_SERVICE_ROLE_KEY:'legacy.server.secret',COLLAB_ALLOWED_ORIGINS:'https://chiyyaa.github.io'};
function boot(){vm.runInNewContext(source,{
 Deno:{env:{get:k=>env[k]},serve:fn=>handler=fn},crypto:globalThis.crypto,Request,Response,AbortSignal,Uint8Array,
 fetch:async(url,options={})=>{
  calls.push({url,options});
  if(url.endsWith('/auth/v1/user'))return new Response(JSON.stringify({id:'verified-user'}),{status:validUser?200:401});
  if(url.endsWith('/rpc/collaboration_is_admin'))return new Response(JSON.stringify(admin));
  if(url.includes('/collaboration_members?'))return new Response('[]');
  if(url.endsWith('/auth/v1/admin/users'))return new Response(JSON.stringify({id:'new-user'}));
  if(url.endsWith('/rpc/grant_question_collaborator'))return new Response('{}',{status:grantOk?200:400});
  throw Error('unexpected request');
 }
});}boot();
const input={action:'create',email:'person@example.com',name:'協作者'};
async function request({origin='https://chiyyaa.github.io',token='valid-session',body=input,method='POST'}={}){
 calls=[];return handler(new Request('https://project.supabase.co/functions/v1/manage-collaborators',{
  method,headers:{Origin:origin,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(method==='POST'?{body:JSON.stringify(body)}:{})
 }));
}
const pass=s=>{passed++;console.log('PASS '+s);};
(async()=>{
 let r=await request({origin:'https://attacker.example'});assert.equal(r.status,403);assert.equal(calls.length,0);pass('Disallowed origins fail before account operations');
 r=await request({token:''});assert.equal(r.status,401);assert.equal(calls.length,0);pass('Missing credentials cannot reach administrative APIs');
 validUser=false;r=await request({token:'forged-admin-claim'});assert.equal(r.status,401);assert.equal(calls.length,1);validUser=true;pass('Tokens are verified with Auth instead of trusting client role claims');
 admin=false;r=await request();assert.equal(r.status,403);assert.ok(!calls.some(c=>c.url.includes('/admin/users')));admin=true;pass('Authenticated non-admins cannot create accounts');
 r=await request({body:{...input,role:'admin',action:'escalate'}});assert.equal(r.status,400);pass('Unknown actions cannot assign elevated privileges');
 r=await request();assert.equal(r.status,200);const data=await r.json();assert.ok(data.temporaryPassword.length>=48);assert.equal(data.email,input.email);assert.ok(!JSON.stringify(data).includes(env.SUPABASE_SERVICE_ROLE_KEY));
 const creation=calls.find(c=>c.url.endsWith('/auth/v1/admin/users'));const created=JSON.parse(creation.options.body);assert.equal(created.email_confirm,true);assert.equal(created.password,data.temporaryPassword);assert.equal(created.role,undefined);
 const grant=calls.find(c=>c.url.endsWith('/rpc/grant_question_collaborator'));assert.equal(grant.options.headers.Authorization,'Bearer valid-session');assert.equal(JSON.parse(grant.options.body).p_email,input.email);pass('Admin-only creation uses server secret privately and user-scoped database authorization');
 grantOk=false;r=await request();assert.equal(r.status,503);const failure=JSON.stringify(await r.json());assert.ok(!failure.includes('temporaryPassword'));assert.ok(!calls.some(c=>c.options.method==='DELETE'));pass('Partial provisioning failure exposes no credentials and never deletes accounts');
 r=await request({method:'OPTIONS'});assert.equal(r.status,204);assert.equal(calls.length,0);pass('Preflight contains no account side effects');
 env.SUPABASE_PUBLISHABLE_KEYS=JSON.stringify({default:'sb_publishable_modern'});env.SUPABASE_SECRET_KEYS=JSON.stringify({default:'sb_secret_modern_server_only'});grantOk=true;boot();
 r=await request();assert.equal(r.status,200);
 const modernAdmin=calls.find(c=>c.url.endsWith('/auth/v1/admin/users'));assert.equal(modernAdmin.options.headers.apikey,'sb_secret_modern_server_only');assert.equal(modernAdmin.options.headers.Authorization,undefined);
 const modernResult=JSON.stringify(await r.json());assert.ok(!modernResult.includes('sb_secret_modern_server_only'));pass('Modern injected key dictionaries work without sending secret keys as bearer tokens');
 delete env.SUPABASE_PUBLISHABLE_KEYS;delete env.SUPABASE_SECRET_KEYS;delete env.SUPABASE_ANON_KEY;delete env.SUPABASE_SERVICE_ROLE_KEY;boot();r=await request();assert.equal(r.status,503);assert.equal(calls.length,0);pass('Missing server configuration fails closed');
 console.log(JSON.stringify({passed}));
})().catch(e=>{console.error(e);process.exitCode=1;});

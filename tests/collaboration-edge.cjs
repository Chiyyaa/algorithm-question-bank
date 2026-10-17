const path=require('node:path'),fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {stripTypeScriptTypes}=require('node:module');
const source=stripTypeScriptTypes(fs.readFileSync(path.join(__dirname,'../backend/functions/manage-collaborators/index.ts'),'utf8'));
let handler,calls=[],admin=true,validUser=true,grantOk=true,resetReady=true,resetAllowed=true,updateOk=true,finishOk=true;let passed=0;
const resetUser='30000000-0000-0000-0000-000000000002';
const env={SUPABASE_URL:'https://project.supabase.co',SUPABASE_ANON_KEY:'anon-public',SUPABASE_SERVICE_ROLE_KEY:'legacy.server.secret',COLLAB_ALLOWED_ORIGINS:'https://chiyyaa.github.io'};
function boot(){vm.runInNewContext(source,{
 Deno:{env:{get:k=>env[k]},serve:fn=>handler=fn},crypto:globalThis.crypto,Request,Response,AbortSignal,Uint8Array,
 fetch:async(url,options={})=>{
  calls.push({url,options});
  if(url.endsWith('/auth/v1/user'))return new Response(JSON.stringify({id:'verified-user'}),{status:validUser?200:401});
  if(url.endsWith('/rpc/collaboration_is_admin'))return new Response(JSON.stringify(admin));
  if(url.endsWith('/rpc/request_collaborator_password_reset'))return new Response(JSON.stringify(!resetReady?{code:'PGRST202'}:!resetAllowed?{message:'INVALID_MEMBER'}:{user_id:resetUser,email:'person@example.com',request_id:55}),{status:!resetReady?404:!resetAllowed?400:200});
  if(url.includes('/auth/v1/admin/users/'))return new Response('{}',{status:updateOk?200:500});
  if(url.endsWith('/rpc/complete_collaborator_password_reset'))return new Response('{}',{status:finishOk?200:500});
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
 admin=false;r=await request({body:{action:'reset_password',userId:resetUser}});assert.equal(r.status,403);assert.ok(!calls.some(c=>c.options.method==='PUT'));admin=true;
 r=await request({body:{action:'reset_password',userId:'not-a-user-id'}});assert.equal(r.status,400);pass('Reset is unavailable to contributors and malformed target IDs are rejected');
 resetAllowed=false;r=await request({body:{action:'reset_password',userId:resetUser}});assert.equal(r.status,403);assert.ok(!calls.some(c=>c.options.method==='PUT'));resetAllowed=true;
 resetReady=false;r=await request({body:{action:'reset_password',userId:resetUser}});assert.equal(r.status,503);assert.match((await r.json()).message,/PASSWORD_RESET_NOT_READY/);assert.ok(!calls.some(c=>c.options.method==='PUT'));resetReady=true;pass('Target authorization and migration readiness must succeed before any password is changed');
 r=await request({body:{action:'reset_password',userId:resetUser}});assert.equal(r.status,200);const resetData=await r.json();
 const put=calls.find(c=>c.options.method==='PUT');assert.ok(put.url.endsWith('/'+resetUser));assert.deepEqual(Object.keys(JSON.parse(put.options.body)),['password']);assert.equal(JSON.parse(put.options.body).password,resetData.temporaryPassword);assert.ok(resetData.temporaryPassword.length>=48);
 assert.ok(calls.findIndex(c=>c.url.includes('request_collaborator_password_reset'))<calls.indexOf(put));assert.ok(!calls.some(c=>c.options.method==='DELETE'||c.url.endsWith('/admin/users')));pass('Reset updates the existing Auth user only, preserving identity and recording intent first');
 finishOk=false;r=await request({body:{action:'reset_password',userId:resetUser}});assert.equal(r.status,200);const partial=await r.json();assert.ok(partial.temporaryPassword);assert.equal(partial.warning,'PASSWORD_RESET_AUDIT_PENDING');finishOk=true;pass('A successful password is still shown if only audit completion fails');
 updateOk=false;r=await request({body:{action:'reset_password',userId:resetUser}});assert.equal(r.status,503);assert.equal((await r.json()).temporaryPassword,undefined);const failedLog=calls.find(c=>c.url.includes('complete_collaborator_password_reset'));assert.equal(JSON.parse(failedLog.options.body).p_success,false);updateOk=true;pass('Failed Auth updates return no unconfirmed password and record failure');
 env.SUPABASE_PUBLISHABLE_KEYS=JSON.stringify({default:'sb_publishable_modern'});env.SUPABASE_SECRET_KEYS=JSON.stringify({default:'sb_secret_modern_server_only'});grantOk=true;boot();
 r=await request();assert.equal(r.status,200);
 const modernAdmin=calls.find(c=>c.url.endsWith('/auth/v1/admin/users'));assert.equal(modernAdmin.options.headers.apikey,'sb_secret_modern_server_only');assert.equal(modernAdmin.options.headers.Authorization,undefined);
 const modernResult=JSON.stringify(await r.json());assert.ok(!modernResult.includes('sb_secret_modern_server_only'));pass('Modern injected key dictionaries work without sending secret keys as bearer tokens');
 r=await request({body:{action:'reset_password',userId:resetUser}});assert.equal(r.status,200);const resetLog=calls.find(c=>c.url.includes('complete_collaborator_password_reset'));assert.equal(resetLog.options.headers.apikey,'sb_secret_modern_server_only');assert.equal(resetLog.options.headers.Authorization,undefined);assert.ok(!JSON.stringify(resetLog.options.body).includes('password'));pass('Only server credentials finalize audit results, and passwords never enter audit payloads');
 delete env.SUPABASE_PUBLISHABLE_KEYS;delete env.SUPABASE_SECRET_KEYS;delete env.SUPABASE_ANON_KEY;delete env.SUPABASE_SERVICE_ROLE_KEY;boot();r=await request();assert.equal(r.status,503);assert.equal(calls.length,0);pass('Missing server configuration fails closed');
 console.log(JSON.stringify({passed}));
})().catch(e=>{console.error(e);process.exitCode=1;});

// Supabase Edge Function. Service-role key remains on the server.
// Deploy with JWT verification disabled at the gateway because we verify the
// access token explicitly with Auth below (supports current signing keys).
const project = Deno.env.get('SUPABASE_URL')!;
function injectedKey(dictionary: string, legacy: string): string {
    try {
        const values=JSON.parse(Deno.env.get(dictionary)||'{}');
        const selected=values.default || Object.values(values)[0];
        return typeof selected==='string'?selected:Deno.env.get(legacy)||'';
    } catch { return Deno.env.get(legacy)||''; }
}
const anonKey = injectedKey('SUPABASE_PUBLISHABLE_KEYS','SUPABASE_ANON_KEY');
const serviceKey = injectedKey('SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY');
const adminHeaders={apikey:serviceKey,...(serviceKey.split('.').length===3?{Authorization:'Bearer '+serviceKey}:{})};
const allowedOrigins = (Deno.env.get('COLLAB_ALLOWED_ORIGINS') || 'https://chiyyaa.github.io').split(',').map(s=>s.trim()).filter(Boolean);

Deno.serve(async (request: Request) => {
    const origin=request.headers.get('Origin')||'';
    const allowed=allowedOrigins.includes(origin);
    const headers={'Content-Type':'application/json','Cache-Control':'no-store',
        'Vary':'Origin',...(allowed?{'Access-Control-Allow-Origin':origin}:{}),
        'Access-Control-Allow-Headers':'authorization, apikey, content-type',
        'Access-Control-Allow-Methods':'POST, OPTIONS'};
    const respond=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers});
    if(!allowed)return respond(403,{message:'Origin not allowed'});
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
    if(request.method!=='POST')return respond(405,{message:'Method not allowed'});
    if(!project||!anonKey||!serviceKey)return respond(503,{message:'Service configuration unavailable'});
    const authorization=request.headers.get('Authorization')||'';
    if(!/^Bearer \S+$/.test(authorization))return respond(401,{message:'Authentication required'});
    try {
        // Never trust decoded JWT claims or user-provided role values.
        const user=await fetch(project+'/auth/v1/user',{headers:{apikey:anonKey,Authorization:authorization},signal:AbortSignal.timeout(10000)});
        if(!user.ok)return respond(401,{message:'Authentication required'});
        const isAdmin=await fetch(project+'/rest/v1/rpc/collaboration_is_admin',{
            method:'POST',headers:{apikey:anonKey,Authorization:authorization,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(10000)});
        if(!isAdmin.ok||await isAdmin.json()!==true)return respond(403,{message:'ADMIN_REQUIRED'});
        const raw=await request.text();if(raw.length>4000)return respond(400,{message:'Invalid request'});
        const input=JSON.parse(raw);
        if(input.action==='reset_password') {
            if(typeof input.userId!=='string'||!/^([0-9a-f]{8}-)([0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(input.userId))return respond(400,{message:'INVALID_MEMBER'});
            // Authorize the exact target and persist an intent before changing Auth.
            const started=await fetch(project+'/rest/v1/rpc/request_collaborator_password_reset',{
                method:'POST',headers:{apikey:anonKey,Authorization:authorization,'Content-Type':'application/json'},
                body:JSON.stringify({p_user_id:input.userId}),signal:AbortSignal.timeout(10000)});
            if(!started.ok){const detail=await started.json().catch(()=>({}));return respond(started.status===404?503:403,{message:detail.code==='PGRST202'?'PASSWORD_RESET_NOT_READY':'INVALID_MEMBER'});}
            const target=await started.json();
            if(target.user_id!==input.userId||typeof target.email!=='string'||!Number.isSafeInteger(Number(target.request_id)))return respond(503,{message:'Service unavailable'});
            const temporaryPassword='aA9!'+Array.from(crypto.getRandomValues(new Uint8Array(24)),b=>b.toString(16).padStart(2,'0')).join('');
            let success=false;
            try {
                const updated=await fetch(project+'/auth/v1/admin/users/'+encodeURIComponent(target.user_id),{
                    method:'PUT',headers:{...adminHeaders,'Content-Type':'application/json'},
                    body:JSON.stringify({password:temporaryPassword}),signal:AbortSignal.timeout(10000)});
                success=updated.ok;
            } catch { /* Outcome may be unknown after a network timeout; allow a new reset. */ }
            let auditComplete=false;
            try {
                const logged=await fetch(project+'/rest/v1/rpc/complete_collaborator_password_reset',{
                    method:'POST',headers:{...adminHeaders,'Content-Type':'application/json'},
                    body:JSON.stringify({p_request_id:target.request_id,p_success:success}),signal:AbortSignal.timeout(10000)});
                auditComplete=logged.ok;
            } catch { /* The intent is already persisted; never hide a confirmed new password. */ }
            if(!success)return respond(503,{message:'PASSWORD_RESET_FAILED'});
            return respond(200,{email:target.email,temporaryPassword,...(!auditComplete?{warning:'PASSWORD_RESET_AUDIT_PENDING'}:{})});
        }
        if(input.action!=='create'||typeof input.email!=='string'||typeof input.name!=='string')return respond(400,{message:'INVALID_MEMBER'});
        const email=input.email.trim().toLowerCase(),name=input.name.trim();
        if(email.length>254||!/^\S+@\S+\.\S+$/.test(email)||!name||name.length>80)return respond(400,{message:'INVALID_MEMBER'});
        const existing=await fetch(project+'/rest/v1/collaboration_members?select=user_id&email=eq.'+encodeURIComponent(email),{
            headers:adminHeaders,signal:AbortSignal.timeout(10000)});
        if(!existing.ok)return respond(503,{message:'Service unavailable'});
        if((await existing.json()).length)return respond(409,{message:'MEMBER_EXISTS'});
        const temporaryPassword='aA9!'+Array.from(crypto.getRandomValues(new Uint8Array(24)),b=>b.toString(16).padStart(2,'0')).join('');
        const created=await fetch(project+'/auth/v1/admin/users',{
            method:'POST',headers:{...adminHeaders,'Content-Type':'application/json'},
            body:JSON.stringify({email,password:temporaryPassword,email_confirm:true}),signal:AbortSignal.timeout(10000)});
        // Do not echo upstream responses or log credentials.
        if(!created.ok)return respond(400,{message:'帳號建立失敗，請確認 Email 是否已存在。'});
        const grant=await fetch(project+'/rest/v1/rpc/grant_question_collaborator',{
            method:'POST',headers:{apikey:anonKey,Authorization:authorization,'Content-Type':'application/json'},
            body:JSON.stringify({p_email:email,p_name:name}),signal:AbortSignal.timeout(10000)});
        if(!grant.ok)return respond(503,{message:'帳號已建立，但尚未取得協作權限，請管理員在資料庫檢查後重新授權。'});
        return respond(200,{email,temporaryPassword});
    } catch {return respond(503,{message:'Service unavailable'});}
});

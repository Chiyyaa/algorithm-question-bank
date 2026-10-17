import { collaborationConfig as config } from './collaboration-config.js?v=20261017';

const KEY = 'question_bank_collaboration_session_v1';
let session = null;
let refreshing = null;
try { session = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch { /* Memory-only session. */ }
export function collaborationEnabled() {
    let publicKey = /^sb_publishable_/.test(config.publishableKey);
    if (!publicKey && config.publishableKey?.split('.').length===3) {
        try { publicKey=JSON.parse(atob(config.publishableKey.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role==='anon'; } catch { /* Reject secrets and malformed keys. */ }
    }
    return config.enabled === true && /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(config.url) && publicKey;
}
function storeSession(value) {
    session = value;
    try { if(value) sessionStorage.setItem(KEY, JSON.stringify(value)); else sessionStorage.removeItem(KEY); } catch { /* Memory-only session. */ }
}
export function forgetSession() { storeSession(null); }
export function sessionUser() { return session?.user || null; }
function safeError(data) {
    const text = String(data?.message || data?.error_description || data?.error || '');
    const messages = {
        MEMBERSHIP_REQUIRED:'帳號沒有協作權限，或已被停用。', ADMIN_REQUIRED:'只有管理員可以執行這個操作。',
        NOT_YOUR_SUBMISSION:'無法存取這筆題目。', SUBMISSION_LOCKED:'已送審或發布的題目不能由協作者修改。',
        REVISION_CONFLICT:'這筆資料已被更新，請重新整理後再操作。', SUBMISSION_LIMIT:'提交過於頻繁，請稍後再試。',
        RETURN_NOTE_REQUIRED:'請填寫退回原因。', NOT_PENDING:'這筆題目已不在待審狀態，請重新整理。',
        NOT_PUBLISHED:'這筆題目尚未發布。', INVALID_CONTENT:'題目格式不完整或超過長度限制。',
        ACCOUNT_NOT_FOUND:'找不到已建立的帳號。', MEMBER_EXISTS:'這個帳號已經有協作權限。',
        INVALID_MEMBER:'帳號資料不正確，或這不是協作者帳號。',
        INVALID_UNIT:'請選擇有效科目，單元編號需為 2～999。', UNIT_LIMIT:'新增單元過於頻繁，請稍後再試。',
        PASSWORD_RESET_NOT_READY:'密碼重設尚未啟用，請先更新伺服器設定。',
        PASSWORD_RESET_FAILED:'密碼重設未確認成功，請稍後重新產生一次；帳號與題目仍保留。'
    };
    for(const [code,message] of Object.entries(messages)) if(text.includes(code)) return message;
    if(/invalid login credentials/i.test(text)) return 'Email 或密碼不正確。';
    if(/rate limit|too many/i.test(text)) return '操作過於頻繁，請稍後再試。';
    if(/password/i.test(text)) return '密碼不符合要求，請使用至少 12 個字元。';
    return '操作未完成，請重新登入或稍後再試。';
}
async function refresh() {
    if (!session?.refresh_token) {forgetSession();throw new Error('登入已過期，請重新登入。');}
    if (!refreshing) refreshing = (async()=>{
        try {
            const response=await fetch(config.url+'/auth/v1/token?grant_type=refresh_token',{
                method:'POST',headers:{apikey:config.publishableKey,'Content-Type':'application/json'},
                body:JSON.stringify({refresh_token:session.refresh_token}),signal:AbortSignal.timeout(15000)
            });
            const data=await response.json();if(!response.ok)throw new Error();storeSession(data);
        } catch {forgetSession();throw new Error('登入已過期，請重新登入。');}
        finally {refreshing=null;}
    })();
    return refreshing;
}
export async function api(path,{method='GET',body,authenticated=true,headers={}}={},retry=true) {
    if(!collaborationEnabled())throw new Error('協作服務尚未啟用。');
    if(authenticated&&!session?.access_token)throw new Error('請先登入。');
    const response=await fetch(config.url+path,{
        method,headers:{apikey:config.publishableKey,'Content-Type':'application/json',
            ...(authenticated?{Authorization:'Bearer '+session.access_token}:{}),...headers},
        ...(body!==undefined?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(path.startsWith('/functions/v1/')?60000:15000)
    });
    if(response.status===401&&authenticated&&retry){await refresh();return api(path,{method,body,authenticated,headers},false);}
    const data=response.status===204?null:await response.json().catch(()=>null);
    if(!response.ok)throw new Error(safeError(data));
    return data;
}
export async function login(email,password) {
    const data=await api('/auth/v1/token?grant_type=password',{method:'POST',authenticated:false,body:{email,password}});
    storeSession(data);
    try {return await currentMember();} catch(error){forgetSession();throw error;}
}
export async function logout() { try{if(session)await api('/auth/v1/logout',{method:'POST'});}finally{forgetSession();} }
export async function currentMember() {
    if(!session)return null;
    // Verify identity with Auth; do not trust a browser-stored role or user id.
    const user=await api('/auth/v1/user');
    const rows=await api('/rest/v1/collaboration_members?select=*&user_id=eq.'+encodeURIComponent(user.id));
    const member=rows[0];if(!member?.active)throw new Error('帳號沒有協作權限，或已被停用。');
    return member;
}
export const rpc = async (name,body) => {
    const data=await api('/rest/v1/rpc/'+name,{method:'POST',body});
    return Array.isArray(data)?data[0]:data;
};
export async function publishedCounts(){return collaborationEnabled()?api('/rest/v1/rpc/published_question_counts',{method:'POST',body:{},authenticated:false}):[];}
export async function listSubmissions({status,author,offset=0}={}){
    const params=new URLSearchParams({select:'*,published_questions(visible)',order:'updated_at.desc,id.desc',limit:'100',offset:String(offset)});
    if(status)params.set('status','eq.'+status);if(author)params.set('author_id','eq.'+author);
    return api('/rest/v1/question_submissions?'+params);
}
export async function listMembers(){return api('/rest/v1/collaboration_members?select=*&order=created_at.asc');}
export async function listCollaborationUnits(){return api('/rest/v1/collaboration_units?select=subject_id,unit_id&order=subject_id,unit_id');}
export async function listAudit(){return api('/rest/v1/collaboration_audit?select=*&order=id.desc&limit=100');}
export async function changePassword(password){return api('/auth/v1/user',{method:'PUT',body:{password}});}
export async function manageAccount(body){return api('/functions/v1/manage-collaborators',{method:'POST',body});}
export async function loadPublishedQuestions(subject,unit) {
    if(!collaborationEnabled())return [];
    const params=new URLSearchParams({select:'id,content,subject_id,unit_id',subject_id:'eq.'+subject,unit_id:'eq.'+unit,visible:'eq.true',order:'id.asc'});
    const result=[];
    for(let offset=0;offset<50000;offset+=500){
        const rows=await api('/rest/v1/published_questions?'+params,{authenticated:false,headers:{Range:`${offset}-${offset+499}`,'Range-Unit':'items'}});
        if(!Array.isArray(rows))throw new Error('共用題庫格式不正確。');
        result.push(...rows.map(q=>({...q.content,id:Number(q.id),title:'',shared_question:true,
            options_status:'known_options_only',sources:['協作題庫（管理員已審核）']})));
        if(rows.length<500)return result;
    }
    throw new Error('共用題庫超過目前載入上限，請聯絡管理員。');
}

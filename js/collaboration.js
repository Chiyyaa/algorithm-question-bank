import { escapeHtml } from './utils.js';
import { parseDraft } from './custom-questions.js?v=20261017';
import { SUBJECTS, getUnit } from './units.js?v=20261009-os';
import * as service from './collaboration-api.js?v=20261017';

const $=id=>document.getElementById(id);
const labels={draft:'草稿',pending:'待審核',returned:'已退回',published:'已發布'};
const actions={save_draft:'儲存草稿',submit:'送出審核',approve:'核准發布',return:'退回修改',withdraw:'撤回發布',restore:'恢復發布',grant_member:'新增協作者',disable_member:'停用帳號',activate_member:'啟用帳號'};
let member=null,tab='mine',rows=[],members=[],editing=null,reviewing=null,busy=false,hasMore=false;
function notice(text,error=false){
    const el=$('collabMessage');el.textContent=text;el.hidden=!text;el.className='collab-message'+(error?' error':'');
    document.querySelectorAll('dialog[open] .dialog-message').forEach(e=>e.remove());
    const dialog=document.querySelector('dialog[open]');
    if(dialog&&text){const p=document.createElement('p');p.className='dialog-message collab-message'+(error?' error':'');p.setAttribute('role',error?'alert':'status');p.textContent=text;dialog.prepend(p);}
}
async function run(task){
    if(busy)return;
    busy=true;document.querySelectorAll('button,input,textarea,select').forEach(e=>{if(!e.disabled){e.disabled=true;e.dataset.busyDisabled='true';}});
    try{await task();}catch(error){notice(error.message||'無法連線，請稍後再試。',true);}
    finally{busy=false;document.querySelectorAll('[data-busy-disabled]').forEach(e=>{e.disabled=false;delete e.dataset.busyDisabled;});}
}
function clearCredentials(){$('initialPassword').value='';$('createdCredentials').hidden=true;}
function signedOut(){member=null;rows=[];members=[];editing=null;reviewing=null;clearCredentials();$('submissionDraft').value='';$('reviewDraft').value='';$('loginPassword').value='';$('newPassword').value='';$('confirmPassword').value='';$('accountBar').hidden=true;$('collabWorkspace').hidden=true;$('loginCard').hidden=false;document.querySelectorAll('dialog[open]').forEach(d=>d.close());}
function populateUnits(){
    const subject=SUBJECTS.find(s=>s.id===$('submissionSubject').value);
    $('submissionUnit').replaceChildren(...subject.units.filter(u=>u.dataUrl).map(u=>new Option(u.name,u.id)));
}
function asDraft(q){return '題目：'+q.question+(q.options?.length?'\n\n選項：\n'+q.options.join('\n'):'')+'\n\n正確答案：\n'+q.correct_answer;}
function contentFrom(text){
    const q=parseDraft(text);
    if(q.question.length>10000||q.correct_answer.length>10000||q.options.length>12||q.options.some(o=>o.length>2000))throw new Error('題目、答案或選項過長，請分開整理後再提交。');
    return q;
}
function subjectLabel(q){return (SUBJECTS.find(s=>s.id===q.subject_id)?.name||q.subject_id)+'｜'+q.unit_id.toUpperCase();}
function authorName(id){return members.find(m=>m.user_id===id)?.display_name||(id===member?.user_id?member.display_name:'協作者');}
function time(value){return new Date(value).toLocaleString('zh-TW');}
function resetEditor(){editing=null;$('editorHeading').textContent='新增題目';$('submissionDraft').value='';}
function publishedVisible(q){const p=q.published_questions;return Array.isArray(p)?p[0]?.visible!==false:p?.visible!==false;}
function renderRows(){
    const mine=tab==='mine';$('questionsView').classList.toggle('review-only',!mine);
    $('listHeading').textContent=mine?'我的題目':tab==='pending'?'待審核':'已發布';
    $('submissionCount').textContent=`已載入 ${rows.length} 題`;
    $('moreSubmissions').hidden=!hasMore;
    $('submissionList').innerHTML=rows.length?rows.map(q=>`<article class="submission-card">
        <div class="section-heading"><span class="status-pill status-${escapeHtml(q.status)}">${escapeHtml(q.status==='published'&&!publishedVisible(q)?'已撤回':labels[q.status])}</span><span class="meta">${escapeHtml(subjectLabel(q))}</span></div>
        <p class="question">${escapeHtml(q.content.question)}</p>
        <p class="meta">${escapeHtml(authorName(q.author_id))} · ${escapeHtml(time(q.updated_at))}</p>
        ${q.review_note?`<p class="review-note">${escapeHtml(q.review_note)}</p>`:''}
        <div class="form-actions">
        ${mine&&['draft','returned'].includes(q.status)?`<button data-edit="${q.id}" type="button">編輯</button>`:''}
        <button data-view="${q.id}" type="button">${member.role==='admin'&&q.status==='pending'?'審核':'查看內容'}</button>
        ${member.role==='admin'&&q.status==='published'?`<button data-publication="${q.id}" data-action="${publishedVisible(q)?'withdraw':'restore'}" type="button">${publishedVisible(q)?'撤回發布':'恢復發布'}</button>`:''}
        </div></article>`).join(''):'<div class="empty">目前沒有題目。</div>';
}
async function loadRows(append=false){
    const next=await service.listSubmissions({...(tab==='mine'?{author:member.user_id}:{status:tab}),offset:append?rows.length:0});
    hasMore=next.length===100;
    rows=append?[...new Map([...rows,...next].map(q=>[q.id,q])).values()]:next;
    renderRows();
}
async function loadMembers(){
    members=await service.listMembers();
    $('memberList').innerHTML=members.map(m=>`<article class="submission-card"><div class="section-heading"><div><strong>${escapeHtml(m.display_name)}</strong><p class="meta">${escapeHtml(m.email)}</p></div><span class="status-pill">${m.role==='admin'?'管理員':m.active?'使用中':'已停用'}</span></div>
        ${m.role==='contributor'?`<button type="button" data-member="${m.user_id}" data-active="${!m.active}">${m.active?'停用帳號':'重新啟用'}</button>`:''}</article>`).join('');
}
async function loadAudit(){
    const audit=await service.listAudit();
    $('auditList').innerHTML=audit.length?audit.map(e=>`<article class="submission-card"><div class="section-heading"><strong>${escapeHtml(actions[e.action]||e.action)}</strong><span class="meta">${escapeHtml(time(e.created_at))}</span></div><p>${escapeHtml(authorName(e.actor_id))}</p>
        <details><summary>查看紀錄內容</summary><pre class="audit-detail">${escapeHtml(JSON.stringify({變更前:e.before_data,變更後:e.after_data},null,2))}</pre></details></article>`).join(''):'<div class="empty">目前沒有操作紀錄。</div>';
}
async function refresh(){
    const fresh=await service.currentMember();if(!fresh)throw new Error('請先登入。');member=fresh;
    $('accountName').textContent=member.display_name+' · '+(member.role==='admin'?'管理員':'協作者');
    $('accountBar').hidden=false;$('loginCard').hidden=true;$('collabWorkspace').hidden=false;
    document.querySelectorAll('[data-admin]').forEach(el=>{el.hidden=member.role!=='admin';});
    if(member.role!=='admin'&&['pending','published','members'].includes(tab))tab='mine';
    document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tab===tab)));
    $('questionsView').hidden=['members','audit'].includes(tab);$('membersView').hidden=tab!=='members';$('auditView').hidden=tab!=='audit';
    if(member.role==='admin')await loadMembers();else members=[member];
    if(tab==='members')return;if(tab==='audit')await loadAudit();else await loadRows();
}
async function save(submit){
    const subject=$('submissionSubject').value,unit=$('submissionUnit').value;
    if(!getUnit(subject,unit))throw new Error('請選擇有效的科目與單元。');
    const content=contentFrom($('submissionDraft').value);
    const saved=await service.rpc('save_question_submission',{p_id:editing?.id||null,p_subject:subject,p_unit:unit,p_content:content,p_submit:submit,p_revision:editing?.revision||null});
    if(submit)resetEditor();else{editing=saved;$('editorHeading').textContent='編輯草稿';}
    await refresh();notice(submit?'已送出審核，核准後才會公開。':'草稿已儲存。');
}
function openReview(q){
    reviewing=q;const canReview=member.role==='admin'&&q.status==='pending';
    $('reviewDialog').querySelectorAll('.dialog-message').forEach(e=>e.remove());
    $('reviewHeading').textContent=canReview?'審核題目':'題目內容';
    $('reviewContext').textContent=subjectLabel(q)+' · '+authorName(q.author_id)+' · '+labels[q.status];
    $('reviewDraft').value=asDraft(q.content);$('reviewDraft').readOnly=!canReview;
    $('reviewNote').value=q.review_note||'';$('reviewNote').readOnly=!canReview;
    $('approveSubmission').hidden=!canReview;$('returnSubmission').hidden=!canReview;
    $('reviewDialog').showModal();
}
async function review(action){
    if(!reviewing) return;
    const note=$('reviewNote').value.trim();if(action==='return'&&!note)throw new Error('請填寫退回原因。');
    await service.rpc('review_question_submission',{p_id:reviewing.id,p_revision:reviewing.revision,p_action:action,p_content:action==='approve'?contentFrom($('reviewDraft').value):null,p_note:note});
    $('reviewDialog').close();reviewing=null;await refresh();notice(action==='approve'?'題目已核准並發布。':'題目已退回，協作者可修改後再送審。');
}

$('submissionSubject').replaceChildren(...SUBJECTS.filter(s=>s.available).map(s=>new Option(s.name,s.id)));populateUnits();
$('submissionSubject').addEventListener('change',populateUnits);
$('loginForm').addEventListener('submit',e=>{e.preventDefault();run(async()=>{
    try{member=await service.login($('loginEmail').value.trim(),$('loginPassword').value);$('loginPassword').value='';tab=member.role==='admin'?'pending':'mine';await refresh();notice('已登入。');}
    catch(error){signedOut();throw error;}
});});
$('logoutBtn').addEventListener('click',()=>run(async()=>{try{await service.logout();}finally{signedOut();notice('已登出。');}}));
$('refreshCollab').addEventListener('click',()=>run(refresh));
document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>run(async()=>{clearCredentials();tab=b.dataset.tab;await refresh();notice('');})));
$('submissionForm').addEventListener('submit',e=>{e.preventDefault();run(()=>save(true));});
$('saveSubmission').addEventListener('click',()=>run(()=>save(false)));
$('newSubmission').addEventListener('click',()=>{if(!$('submissionDraft').value||confirm('要開啟新草稿嗎？未儲存的內容不會保留。'))resetEditor();});
$('moreSubmissions').addEventListener('click',()=>run(()=>loadRows(true)));
$('submissionList').addEventListener('click',e=>{
    const button=e.target.closest('button');if(!button||busy)return;
    const q=rows.find(q=>q.id===(button.dataset.edit||button.dataset.view||button.dataset.publication));if(!q)return;
    if(button.dataset.edit){if($('submissionDraft').value&&editing?.id!==q.id&&!confirm('要開啟這筆草稿嗎？未儲存的內容不會保留。'))return;editing=q;$('submissionSubject').value=q.subject_id;populateUnits();$('submissionUnit').value=q.unit_id;$('submissionDraft').value=asDraft(q.content);$('editorHeading').textContent=q.status==='returned'?'修改退回題目':'編輯草稿';$('submissionDraft').focus();}
    else if(button.dataset.view)openReview(q);
    else if(button.dataset.publication)run(async()=>{await service.rpc('review_question_submission',{p_id:q.id,p_revision:q.revision,p_action:button.dataset.action,p_content:null,p_note:''});await refresh();notice(button.dataset.action==='withdraw'?'題目已撤回，可隨時恢復。':'題目已恢復發布。');});
});
$('closeReview').addEventListener('click',()=>$('reviewDialog').close());
$('approveSubmission').addEventListener('click',()=>run(()=>review('approve')));
$('returnSubmission').addEventListener('click',()=>run(()=>review('return')));
$('memberForm').addEventListener('submit',e=>{e.preventDefault();run(async()=>{
    clearCredentials();const result=await service.manageAccount({action:'create',email:$('memberEmail').value.trim(),name:$('memberName').value.trim()});
    $('initialPassword').value=result.temporaryPassword;$('createdCredentials').hidden=false;$('memberForm').reset();await refresh();notice('協作者帳號已建立。');
});});
$('dismissCredentials').addEventListener('click',clearCredentials);
$('memberList').addEventListener('click',e=>{const b=e.target.closest('[data-member]');if(b)run(async()=>{await service.rpc('set_question_collaborator_active',{p_user_id:b.dataset.member,p_active:b.dataset.active==='true'});await refresh();notice(b.dataset.active==='true'?'帳號已啟用。':'帳號已停用，後端會拒絕後續協作操作。');});});
$('passwordOpen').addEventListener('click',()=>{$('passwordForm').reset();$('passwordDialog').querySelectorAll('.dialog-message').forEach(e=>e.remove());$('passwordDialog').showModal();});
$('cancelPassword').addEventListener('click',()=>$('passwordDialog').close());
$('passwordForm').addEventListener('submit',e=>{e.preventDefault();run(async()=>{
    const password=$('newPassword').value;if(password.length<12||password!==$('confirmPassword').value)throw new Error('請輸入至少 12 個字元，且兩次密碼需一致。');
    await service.changePassword(password);$('passwordForm').reset();$('passwordDialog').close();notice('密碼已更新。');
});});
window.addEventListener('pagehide',clearCredentials);
if(!service.collaborationEnabled())$('notConfigured').hidden=false;
else run(async()=>{try{if(await service.currentMember())await refresh();else signedOut();}catch(error){service.forgetSession();signedOut();notice(error.message,true);}});

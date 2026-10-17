import { escapeHtml } from './utils.js?v=20261017-formats1';
import { parseDraft } from './custom-questions.js?v=20261017-formats1';
import { SUBJECTS, getUnit, mergeCollaborationUnits } from './units.js?v=20261017-formats1';
import * as service from './collaboration-api.js?v=20261017-formats1';

const $=id=>document.getElementById(id);
const labels={draft:'草稿',pending:'待審核',returned:'已退回',published:'已發布'};
const actions={save_draft:'儲存草稿',submit:'送出審核',approve:'核准發布',return:'退回修改',withdraw:'撤回發布',restore:'恢復發布',grant_member:'新增協作者',disable_member:'停用帳號',activate_member:'啟用帳號',password_reset_requested:'開始重設密碼',password_reset:'重設協作者密碼',password_reset_failed:'密碼重設未完成',create_unit:'新增單元'};
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
function clearCredentials(){$('initialPassword').value='';$('credentialEmail').textContent='';$('createdCredentials').hidden=true;}
function showCredentials(result){
    $('initialPassword').value=result.temporaryPassword;$('credentialEmail').textContent='帳號：'+result.email;
    $('credentialsHint').textContent=result.warning?'新密碼已產生。完成紀錄暫未寫入，已保留開始紀錄；請先複製並交給本人。':'請先複製，再私下交給本人；登入後請變更密碼。';
    $('createdCredentials').hidden=false;
}
function signedOut(){member=null;rows=[];members=[];editing=null;reviewing=null;clearCredentials();$('submissionDraft').value='';$('reviewDraft').value='';$('loginPassword').value='';$('newPassword').value='';$('confirmPassword').value='';$('accountBar').hidden=true;$('collabWorkspace').hidden=true;$('loginCard').hidden=false;document.querySelectorAll('dialog[open]').forEach(d=>d.close());}
function populateUnits(){
    const subject=SUBJECTS.find(s=>s.id===$('submissionSubject').value);
    const selected=$('submissionUnit').value;
    $('submissionUnit').replaceChildren(...subject.units.filter(u=>u.dataUrl||u.sharedOnly).map(u=>new Option(u.name,u.id)));
    if(subject.units.some(u=>u.id===selected))$('submissionUnit').value=selected;
}
function asDraft(q){return '題目：'+q.question+(q.options?.length?'\n\n選項：\n'+q.options.join('\n'):'')+(q.user_answer?'\n\n你的答案：\n'+q.user_answer:'')+'\n\n正確答案：\n'+q.correct_answer;}
function contentFrom(text,format='auto'){
    const q=parseDraft(text,{format,retainAnswer:true});
    if(q.question.length>10000||q.correct_answer.length>10000||(q.user_answer||'').length>10000||q.options.length>12||q.options.some(o=>o.length>2000))throw new Error('題目、答案或選項過長，請分開整理後再提交。');
    return q;
}
function subjectLabel(q){return (SUBJECTS.find(s=>s.id===q.subject_id)?.name||q.subject_id)+'｜'+q.unit_id.toUpperCase();}
function authorName(id){return members.find(m=>m.user_id===id)?.display_name||(id===member?.user_id?member.display_name:'協作者');}
function time(value){return new Date(value).toLocaleString('zh-TW');}
function updateFormat(){
    $('submissionDraft').placeholder=$('submissionFormat').value==='no_options'?'題目：請輸入題目\n\n你的答案：\n請貼上作答內容\n\n正確答案：\n請貼上正確答案\n\n得分：1 / 1':'題目：請輸入題目\n\nA. 選項一\nB. 選項二\n\n你的答案：\n選項一\n\n正確答案：\n選項二';
}
function resetEditor(){editing=null;$('editorHeading').textContent='新增題目';$('submissionDraft').value='';$('submissionFormat').value='no_options';updateFormat();}
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
        ${m.role==='contributor'?`<div class="form-actions"><button type="button" data-reset-password="${m.user_id}">重設密碼</button><button type="button" data-member="${m.user_id}" data-active="${!m.active}">${m.active?'停用帳號':'重新啟用'}</button></div>`:''}</article>`).join('');
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
    mergeCollaborationUnits(await service.listCollaborationUnits());populateUnits();
    if(member.role==='admin')await loadMembers();else members=[member];
    if(tab==='members')return;if(tab==='audit')await loadAudit();else await loadRows();
}
async function save(submit){
    const subject=$('submissionSubject').value,unit=$('submissionUnit').value;
    if(!getUnit(subject,unit))throw new Error('請選擇有效的科目與單元。');
    const content=contentFrom($('submissionDraft').value,$('submissionFormat').value);
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
    const format=reviewing.content.type==='short_answer'?'no_options':'auto';
    await service.rpc('review_question_submission',{p_id:reviewing.id,p_revision:reviewing.revision,p_action:action,p_content:action==='approve'?contentFrom($('reviewDraft').value,format):null,p_note:note});
    $('reviewDialog').close();reviewing=null;await refresh();notice(action==='approve'?'題目已核准並發布。':'題目已退回，協作者可修改後再送審。');
}

$('submissionSubject').replaceChildren(...SUBJECTS.filter(s=>s.available).map(s=>new Option(s.name,s.id)));populateUnits();
$('submissionSubject').addEventListener('change',populateUnits);
$('submissionFormat').addEventListener('change',updateFormat);
$('openUnitDialog').addEventListener('click',()=>{$('unitForm').reset();$('unitSubjectLabel').textContent=SUBJECTS.find(s=>s.id===$('submissionSubject').value).name;$('unitDialog').showModal();});
$('cancelUnit').addEventListener('click',()=>$('unitDialog').close());
$('unitForm').addEventListener('submit',e=>{e.preventDefault();run(async()=>{
    const subject=$('submissionSubject').value,number=Number($('newUnitNumber').value);
    if(!Number.isInteger(number)||number<2||number>999)throw new Error('單元編號請填寫 2～999 的整數。');
    const unit=await service.rpc('create_collaboration_unit',{p_subject:subject,p_unit:'u'+number});
    mergeCollaborationUnits([unit]);populateUnits();$('submissionUnit').value=unit.unit_id;$('unitDialog').close();notice('已選用 '+unit.unit_id.toUpperCase()+'，可開始新增題目。');
});});
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
    if(button.dataset.edit){if($('submissionDraft').value&&editing?.id!==q.id&&!confirm('要開啟這筆草稿嗎？未儲存的內容不會保留。'))return;editing=q;$('submissionFormat').value=q.content.options?.length?'with_options':'no_options';updateFormat();$('submissionSubject').value=q.subject_id;populateUnits();$('submissionUnit').value=q.unit_id;$('submissionDraft').value=asDraft(q.content);$('editorHeading').textContent=q.status==='returned'?'修改退回題目':'編輯草稿';$('submissionDraft').focus();}
    else if(button.dataset.view)openReview(q);
    else if(button.dataset.publication)run(async()=>{await service.rpc('review_question_submission',{p_id:q.id,p_revision:q.revision,p_action:button.dataset.action,p_content:null,p_note:''});await refresh();notice(button.dataset.action==='withdraw'?'題目已撤回，可隨時恢復。':'題目已恢復發布。');});
});
$('closeReview').addEventListener('click',()=>$('reviewDialog').close());
$('approveSubmission').addEventListener('click',()=>run(()=>review('approve')));
$('returnSubmission').addEventListener('click',()=>run(()=>review('return')));
$('memberForm').addEventListener('submit',e=>{e.preventDefault();run(async()=>{
    clearCredentials();const result=await service.manageAccount({action:'create',email:$('memberEmail').value.trim(),name:$('memberName').value.trim()});
    showCredentials(result);$('memberForm').reset();await refresh();notice('協作者帳號已建立。');
});});
$('dismissCredentials').addEventListener('click',clearCredentials);
$('copyCredentials').addEventListener('click',async()=>{
    let manualCopy=false;
    await run(async()=>{
    if(!$('initialPassword').value)return;
    const text=$('credentialEmail').textContent+'\n密碼：'+$('initialPassword').value;
    try{await navigator.clipboard.writeText(text);notice('帳號與密碼已複製，請私下交給本人。');}
    catch{manualCopy=true;notice('瀏覽器未允許自動複製，請手動複製上方帳號與密碼。',true);}
    });
    if(manualCopy){$('initialPassword').focus();$('initialPassword').select();}
});
$('memberList').addEventListener('click',e=>{
    const reset=e.target.closest('[data-reset-password]');
    if(reset){
        const target=members.find(m=>m.user_id===reset.dataset.resetPassword);if(!target||busy)return;
        if(!confirm('要為 '+target.display_name+'（'+target.email+'）重設密碼嗎？舊密碼將無法再用，帳號與題目會保留。'))return;
        run(async()=>{clearCredentials();const result=await service.manageAccount({action:'reset_password',userId:target.user_id});showCredentials(result);$('createdCredentials').scrollIntoView({block:'center',behavior:'smooth'});notice(result.warning?'新密碼已產生，請先複製；操作紀錄待確認。':'密碼已重設，請複製新密碼交給本人。');});return;
    }
    const b=e.target.closest('[data-member]');if(b)run(async()=>{await service.rpc('set_question_collaborator_active',{p_user_id:b.dataset.member,p_active:b.dataset.active==='true'});await refresh();notice(b.dataset.active==='true'?'帳號已啟用。':'帳號已停用，後端會拒絕後續協作操作。');});
});
$('passwordOpen').addEventListener('click',()=>{$('passwordForm').reset();$('passwordDialog').querySelectorAll('.dialog-message').forEach(e=>e.remove());$('passwordDialog').showModal();});
$('cancelPassword').addEventListener('click',()=>$('passwordDialog').close());
$('passwordForm').addEventListener('submit',e=>{e.preventDefault();run(async()=>{
    const password=$('newPassword').value;if(password.length<12||password!==$('confirmPassword').value)throw new Error('請輸入至少 12 個字元，且兩次密碼需一致。');
    await service.changePassword(password);$('passwordForm').reset();$('passwordDialog').close();notice('密碼已更新。');
});});
window.addEventListener('pagehide',clearCredentials);
if(!service.collaborationEnabled())$('notConfigured').hidden=false;
else run(async()=>{try{if(await service.currentMember())await refresh();else signedOut();}catch(error){service.forgetSession();signedOut();notice(error.message,true);}});

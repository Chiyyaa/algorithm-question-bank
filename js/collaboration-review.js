import { escapeHtml } from './utils.js?v=20261017-formats1';

export const REVIEW_LIMIT = 100;

export function createBulkReview({compare,service,getMember,getRows,getTab,notify,refresh,run,isBusy}) {
    const $=id=>document.getElementById(id);
    const selected=new Map();
    let entries=null, action=null, note='';
    const enabled=()=>getMember()?.role==='admin'&&getTab()==='pending';
    const labels={ready:'待處理',approve:'已核准發布',return:'已退回修改',failed:'處理失敗',uncertain:'結果待查核',changed:'內容已變更'};
    function syncControls(){
        const busy=isBusy();
        $('bulkReviewToolbar').hidden=!enabled();
        $('bulkReviewCount').textContent=`已選 ${selected.size} 題（每次最多 ${REVIEW_LIMIT} 題）`;
        $('selectPendingAll').disabled=busy||!enabled()||!getRows().some(q=>q.status==='pending');
        $('clearPendingSelection').disabled=busy||!selected.size;
        $('previewBulkReview').disabled=busy||!selected.size;
        document.querySelectorAll('[data-review-select]').forEach(input=>{input.checked=selected.has(input.dataset.reviewSelect);input.disabled=busy;});
        const remaining=entries?.some(e=>['ready','failed'].includes(e.state));
        const unknown=entries?.some(e=>e.state==='uncertain');
        $('confirmBulkApprove').disabled=busy||!remaining||unknown||(action&&action!=='approve');
        $('confirmBulkReturn').disabled=busy||!remaining||unknown||(action&&action!=='return');
        $('reconcileBulkReview').hidden=!unknown;
        $('reconcileBulkReview').disabled=busy;
        $('closeBulkReview').disabled=busy;
        $('bulkReviewNote').readOnly=!!action;
    }
    function sync(){
        if(!enabled())selected.clear();
        else {
            const current=new Map(getRows().map(q=>[q.id,q]));
            for(const [id,q] of selected){const fresh=current.get(id);if(!fresh||fresh.status!=='pending'||fresh.revision!==q.revision)selected.delete(id);}
        }
        syncControls();
    }
    function render(){
        if(!entries)return;
        const completed=entries.filter(e=>['approve','return'].includes(e.state)).length;
        $('bulkReviewProgress').textContent=`共 ${entries.length} 題 · 已完成 ${completed} 題 · 待查核 ${entries.filter(e=>e.state==='uncertain').length} 題`;
        $('bulkReviewItems').innerHTML=entries.map((entry,i)=>{
            const q=entry.row,c=q.content;
            return `<article class="bulk-review-item" data-bulk-review-id="${escapeHtml(q.id)}"><div class="section-heading"><h3>第 ${i+1} 題</h3><span class="status-pill">${labels[entry.state]}</span></div><p class="help-text">${escapeHtml(q.subject_id==='os'?'作業系統':'演算法')}｜${escapeHtml(q.unit_id.toUpperCase())}</p><p class="batch-question">${escapeHtml(c.question)}</p>${c.options?.length?`<div class="batch-options">${c.options.map(o=>`<div>${escapeHtml(o)}</div>`).join('')}</div>`:''}<div class="batch-answer"><strong>正確答案：</strong><span>${escapeHtml(c.correct_answer)}</span></div>${c.user_answer?`<p class="help-text">你的答案：${escapeHtml(c.user_answer)}</p>`:''}${entry.message?`<p class="batch-entry-message" role="status">${escapeHtml(entry.message)}</p>`:''}</article>`;
        }).join('');
        if(compare)document.querySelectorAll('[data-bulk-review-id]').forEach(host=>{const entry=entries.find(e=>e.row.id===host.dataset.bulkReviewId);if(entry)compare(host,entry.row);});
        syncControls();
    }
    function open(){
        if(!enabled()||!selected.size)return;
        $('bulkReviewDialog').querySelectorAll('.dialog-message').forEach(e=>e.remove());
        entries=[...selected.values()].map(q=>({row:JSON.parse(JSON.stringify(q)),state:'ready',message:''}));
        action=null;note='';$('bulkReviewNote').value='';render();$('bulkReviewDialog').showModal();
    }
    function close(){
        if(isBusy())return;
        if(entries?.some(e=>e.state==='uncertain')){notify('尚有審核結果待查核，請先查核後再關閉。',true);return;}
        $('bulkReviewDialog').close();entries=null;action=null;note='';syncControls();
    }
    async function lookup(ids){
        if(ids.some(id=>!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)))throw new Error('題目識別資料不完整，請重新整理。');
        const params=new URLSearchParams({select:'*',id:'in.('+ids.join(',')+')',limit:String(REVIEW_LIMIT)});
        return service.api('/rest/v1/question_submissions?'+params);
    }
    async function reconcile(){
        if(!entries||getMember()?.role!=='admin')return;
        const targets=entries.filter(e=>e.state==='uncertain');
        if(!targets.length)return;
        const fresh=await lookup(targets.map(e=>e.row.id));
        for(const entry of targets){
            const q=fresh.find(q=>q.id===entry.row.id);
            if(!q){entry.message='尚無法查核此題，請稍後再試。';continue;}
            const desired=action==='approve'?'published':'returned';
            if(q.status===desired&&q.revision>entry.row.revision){entry.state=action;entry.message='已查核審核結果。';selected.delete(q.id);}
            else if(q.status==='pending'&&q.revision===entry.row.revision){entry.state='ready';entry.message='目前仍為相同版本的待審核題，可重試。';}
            else{entry.state='changed';entry.message='此題已由其他操作更新，請關閉後重新整理、選取及確認內容。';selected.delete(q.id);}
        }
        render();await refresh();notify('已查核批次審核狀態，請查看各題結果。');
    }
    async function send(nextAction){
        if(getMember()?.role!=='admin'||!entries)throw new Error('只有管理員可以批次審核。');
        if(action&&action!==nextAction)throw new Error('本次處理方式已固定，請先完成本次審核或關閉後重新選取。');
        if(entries.some(e=>e.state==='uncertain'))throw new Error('請先查核審核結果，再繼續處理。');
        const targets=entries.filter(e=>['ready','failed'].includes(e.state));
        if(!targets.length)throw new Error('沒有尚待處理的題目。');
        const nextNote=action?note:$('bulkReviewNote').value.trim();
        if(nextAction==='return'&&!nextNote)throw new Error('批次退回請填寫共同退回原因。');
        if(nextNote.length>2000)throw new Error('審核備註最多 2000 字元。');
        if(!confirm(nextAction==='approve'?`確定核准發布選取的 ${targets.length} 題？核准後會出現在公開題庫。`:`確定將選取的 ${targets.length} 題退回修改？將使用相同退回原因。`))return;
        action=nextAction;note=nextNote;
        let completed=0;
        for(const [index,entry] of targets.entries()){
            $('bulkReviewProgress').textContent=`正在處理第 ${index+1} / ${targets.length} 題……`;
            try{
                const result=await service.rpc('review_question_submission',{p_id:entry.row.id,p_revision:entry.row.revision,p_action:action,p_content:null,p_note:note});
                if(result?.id!==entry.row.id||result.status!==(action==='approve'?'published':'returned'))throw new Error('回應不完整，請先查核審核結果。');
                entry.state=action;entry.message='';selected.delete(entry.row.id);completed++;
            }catch(error){entry.state=error.definitive===true?'failed':'uncertain';entry.message=error.message;render();break;}
            render();
        }
        try{await refresh();}catch{notify('審核結果已保留，列表暫時無法更新，請稍後重新整理。',true);}
        render();notify(`本次已${action==='approve'?'核准':'退回'} ${completed} 題；已成功的題目不會重複處理。`);
    }
    $('submissionList').addEventListener('change',event=>{
        const input=event.target.closest('[data-review-select]');
        if(!input||!enabled()||isBusy())return;
        const q=getRows().find(q=>q.id===input.dataset.reviewSelect&&q.status==='pending');if(!q)return;
        if(input.checked){if(selected.size>=REVIEW_LIMIT){input.checked=false;notify(`一次最多選取 ${REVIEW_LIMIT} 題。`,true);return;}selected.set(q.id,q);}else selected.delete(q.id);
        syncControls();
    });
    $('selectPendingAll').addEventListener('click',()=>{selected.clear();getRows().filter(q=>q.status==='pending').slice(0,REVIEW_LIMIT).forEach(q=>selected.set(q.id,q));syncControls();});
    $('clearPendingSelection').addEventListener('click',()=>{selected.clear();syncControls();});
    $('previewBulkReview').addEventListener('click',open);
    $('closeBulkReview').addEventListener('click',close);
    $('bulkReviewDialog').addEventListener('cancel',event=>{event.preventDefault();close();});
    $('confirmBulkApprove').addEventListener('click',()=>run(()=>send('approve')));
    $('confirmBulkReturn').addEventListener('click',()=>run(()=>send('return')));
    $('reconcileBulkReview').addEventListener('click',()=>run(reconcile));
    return {sync,syncControls,isSelected:id=>selected.has(id),clear(){selected.clear();entries=null;action=null;note='';$('bulkReviewDialog').close();syncControls();}};
}

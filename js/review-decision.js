import { escapeHtml as esc } from './utils.js?v=20261017-formats1';
import { classifyContribution } from './collaboration-import.js?v=20261030-replace1';
import { reviewContent, sameReviewContent } from './question-versions.js?v=20261030-replace1';

function imageMarkup(q){if(!q.image)return '';try{const url=new URL(q.image,import.meta.url),root=new URL('../images/',import.meta.url);return url.href.startsWith(root.href)?'<img class="review-question-image" src="'+esc(url.href)+'" alt="'+esc(q.image_alt||'原題圖片')+'"><p class="help-text">原題含圖片，取代後以新題內容為準。</p>':'';}catch{return '';}}
const card=q=>`<p class="batch-question">${esc(q.question)}</p>${imageMarkup(q)}${(q.options||[]).map(o=>`<div class="batch-options">${esc(o)}</div>`).join('')}<div class="batch-answer"><strong>正確答案</strong><span>${esc(q.correct_answer)}</span></div>`;
export function createReviewDecisions({service,loadBank}) {
    async function initialize(row,state) {
        if(!state.loading)state.loading=(async()=>{
            const bank=await loadBank(row.subject_id);
            state.bank=bank;state.references=classifyContribution(row.content,bank).references;
            if(state.mode===undefined)state.mode=state.references.length?'':'add';
        })().catch(e=>{state.loading=null;throw e;});
        await state.loading;
    }
    async function target(row,state,q) {
        const result=await service.rpc('get_question_review_target',{p_subject:row.subject_id,p_unit:q.unit,p_target_id:q.id});
        if(!result?.content||result.subject!==row.subject_id||result.unit!==q.unit||result.id!==q.id||!Number.isInteger(result.revision))throw new Error('原題回應不完整，請重新選擇。');
        if(!sameReviewContent(q,result.content))throw new Error('原題已更新，請關閉審核、重新整理後再核對。');
        state.target={...result,...(q.image?{image:q.image,image_alt:q.image_alt}:{})};
    }
    async function mount(host,row,state,{locked=false}={}) {
        const panel=document.createElement('section');panel.className='review-decision';panel.textContent='正在比對原題與新題……';
        host.insertBefore(panel,host.querySelector('label[for=reviewDraft]'));
        try {
            await initialize(row,state);if(!panel.isConnected)return;
            const refs=state.references;
            panel.innerHTML=`<h3>審核發布方式</h3><div class="review-mode"><label><input type="radio" name="mode-${esc(row.id)}" value="add"${state.mode==='add'?' checked':''}>新增一題</label><label><input type="radio" name="mode-${esc(row.id)}" value="replace"${state.mode==='replace'?' checked':''}>取代指定舊題</label></div><p class="help-text">取代會沿用原題題號與連結，保存修改紀錄；新增則保留兩題。</p><label>搜尋其他原題<input class="review-target-search" type="search" placeholder="輸入題號或題目關鍵字"></label><label>選擇要對照／取代的原題<select class="review-target"><option value="">請選擇原題</option>${refs.length?'<optgroup label="比對候選">'+refs.map(q=>`<option value="${esc(q.unit+':'+q.id)}">${esc(q.unit.toUpperCase()+' 第 '+q.id+' 題：'+q.question.slice(0,80))}</option>`).join('')+'</optgroup>':''}<optgroup label="搜尋結果"></optgroup></select></label><p class="review-choice-message" role="status"></p><div class="review-compare-grid"><section class="review-old"><h4>原題目</h4><div class="review-old-content">${refs.length?'請選擇上方原題後比較。':'未找到相近題目；仍可手動選擇原題。'}</div></section><section class="review-new"><h4>新題目</h4><div class="review-new-content">${card(row.content)}</div></section></div>`;
            const select=panel.querySelector('select'),message=panel.querySelector('.review-choice-message');
            function renderTarget(){const t=state.target;panel.querySelector('.review-old-content').innerHTML=t?`<p>${esc(t.unit.toUpperCase())} 第 ${t.id} 題</p>${card({...t.content,image:t.image,image_alt:t.image_alt})}<a href="./?subject=${esc(row.subject_id)}&unit=${esc(t.unit)}&question=${t.id}" target="_blank" rel="noopener noreferrer">開啟原題 ↗</a>`:'請選擇原題。';}
            const search=panel.querySelector('.review-target-search');
            search.addEventListener('input',()=>{const term=search.value.trim();const matches=term?state.bank.filter(q=>String(q.id)===term||q.question.toLowerCase().includes(term.toLowerCase())).slice(0,30):[];select.querySelector('optgroup[label="搜尋結果"]').innerHTML=matches.filter(q=>!refs.includes(q)).map(q=>`<option value="${esc(q.unit+':'+q.id)}">${esc(q.unit.toUpperCase()+' 第 '+q.id+' 題：'+q.question.slice(0,80))}</option>`).join('');if(state.target)select.value=state.target.unit+':'+state.target.id;});
            if(!state.target&&refs.length===1){message.textContent='正在載入原題……';try{await target(row,state,refs[0]);message.textContent='請核對原題與新題，選擇取代或新增。';}catch(e){message.textContent=e.message;}}
            if(state.target){select.value=state.target.unit+':'+state.target.id;renderTarget();}
            panel.addEventListener('change',async event=>{
                if(locked)return;
                if(event.target.matches('input[type=radio]')){state.mode=event.target.value;message.textContent=state.mode==='replace'&&!state.target?'請明確選定要取代的原題。':'';return;}
                if(event.target!==select)return;
                const key=select.value,request=(state.targetRequest||0)+1;state.targetRequest=request;state.target=null;renderTarget();
                const q=state.bank.find(q=>q.unit+':'+q.id===key);if(!q)return;
                message.textContent='正在載入原題最新版本……';
                try{const next={};await target(row,next,q);if(request!==state.targetRequest)return;state.target=next.target;renderTarget();message.textContent='原題已載入，請比較題目、選項與答案。';}
                catch(e){if(request===state.targetRequest)message.textContent=e.message;}
            });
            if(locked)panel.querySelectorAll('input,select').forEach(e=>e.disabled=true);
        }catch(e){if(panel.isConnected)panel.textContent=e.message+' 請關閉後重新開啟審核。';}
        return panel;
    }
    async function prepare(row,state) {
        await initialize(row,state);
        if(!['add','replace'].includes(state.mode))throw new Error('請先選擇「取代指定舊題」或「新增一題」。');
        if(state.mode==='replace'&&!state.target)throw new Error('請先選定要取代的原題。');
        return state;
    }
    async function publish(row,content,note,state) {
        await prepare(row,state);
        return state.mode==='replace'
            ? service.rpc('replace_question_submission',{p_id:row.id,p_revision:row.revision,p_content:reviewContent(content),p_note:note,p_target_unit:state.target.unit,p_target_id:state.target.id,p_target_revision:state.target.revision,p_target_content:state.target.content})
            : service.rpc('review_question_submission',{p_id:row.id,p_revision:row.revision,p_action:'approve',p_content:reviewContent(content),p_note:note});
    }
    function updateNew(host,content){const panel=host.querySelector('.review-new-content');if(panel)panel.innerHTML=card(content);}
    return {mount,prepare,publish,updateNew};
}

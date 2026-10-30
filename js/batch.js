import {parseBatchHTML,decodeBatchFile,MAX_BATCH_BYTES} from './batch-import.js?v=20261030-batch1';
import {createBatchIndex,compareBatchQuestions,batchQuestionHref} from './batch-core.js?v=20261030-candidates2';
import {escapeHtml as esc} from './utils.js?v=20261017-formats1';

export function initBatch({getUnits,loadUnit}){
    const $=id=>document.getElementById(id);
    let subject=null,questions=[],version=0,busy=false;
    const names={algorithm:'演算法',os:'作業系統'};
    function status(text,error=false){$('batchStatus').textContent=text;$('batchStatus').classList.toggle('is-error',error);$('batchStatus').setAttribute('role',error?'alert':'status');}
    function sync(){$('batchCompare').disabled=busy||!questions.length||!subject;$('batchScope').disabled=busy;}
    function clearResults(){$('batchResults').hidden=true;$('batchResultList').replaceChildren();$('batchResultSummary').textContent='';}
    function details(q){
        return '<details class="batch-original"><summary>查看完整題目與選項</summary><div class="batch-stem">'+esc(q.stem)+'</div>'+
            (q.options.length?'<ul class="batch-options">'+q.options.map(o=>'<li>'+esc(o.label+'．'+o.text)+'</li>').join('')+'</ul>':'<p class="batch-muted">填空 '+q.blankCount+' 格</p>')+'</details>';
    }
    function refreshUnits(){
        const saved=$('batchScope').value||'all',units=subject?getUnits(subject):[];
        $('batchScope').innerHTML='<option value="all">全部單元</option>'+units.map(u=>'<option value="'+esc(u.id)+'">'+esc(u.name)+'</option>').join('');
        $('batchScope').value=units.some(u=>u.id===saved)?saved:'all';
    }
    function reset(){version++;busy=false;questions=[];$('batchFile').value='';$('batchPreview').hidden=true;$('batchPreviewList').replaceChildren();clearResults();status('請匯入題目頁 HTML，先確認辨識內容，再批次查答案。');sync();}
    $('batchFile').addEventListener('change',async()=>{
        const token=++version,file=$('batchFile').files[0];questions=[];busy=false;clearResults();$('batchPreview').hidden=true;$('batchPreviewList').replaceChildren();sync();
        if(!file){status('請選擇題目頁 HTML。');return;}
        try{
            if(!/\.html?$/i.test(file.name))throw new Error('初版僅支援 .html 或 .htm 題目頁。');
            if(file.size>MAX_BATCH_BYTES)throw new Error('檔案超過 2 MB，請改用較小的題目頁。');
            status('正在辨識題目……');
            const decoded=decodeBatchFile(await file.arrayBuffer());if(token!==version)return;
            const parsed=parseBatchHTML(decoded.text);if(token!==version)return;questions=parsed;
            $('batchPreviewSummary').textContent='已辨識 '+questions.length+' 題，依檔案中出現的順序排列。';
            $('batchPreviewList').innerHTML=questions.map(q=>'<li><span class="batch-preview-number">第 '+q.number+' 題</span><span>'+esc(q.stem.slice(0,110)||'題幹不完整')+'</span>'+details(q)+'</li>').join('');
            $('batchPreview').hidden=false;status(decoded.warning||'請確認預覽內容；接著按「批次查答案」。');sync();
        }catch(error){if(token===version){questions=[];status(error.message||'無法讀取這份檔案。',true);sync();}}
    });
    $('batchClear').addEventListener('click',reset);
    $('batchScope').addEventListener('change',()=>{version++;clearResults();status(questions.length?'範圍已變更，請重新批次查答案。':'請先匯入題目頁 HTML。');sync();});
    $('batchCompare').addEventListener('click',async()=>{
        if(busy||!questions.length||!subject)return;
        const token=++version,activeSubject=subject,scope=$('batchScope').value,units=getUnits(subject).filter(u=>scope==='all'||u.id===scope);
        if(!units.length){status('這個範圍目前沒有可用單元。',true);return;}
        busy=true;sync();clearResults();status('正在載入題庫並比對……');
        try{
            const entries=[],warnings=[];let cursor=0,loaded=0;
            async function worker(){while(cursor<units.length){const unit=units[cursor++];try{
                const result=await loadUnit(activeSubject,unit.id);if(token!==version)return;
                entries.push(...result.questions.map(q=>({...q,subject:activeSubject,unit:unit.id})));loaded++;
                if(result.warning)warnings.push(unit.name+'：'+result.warning);
            }catch{if(token!==version)return;warnings.push(unit.name+' 暫時無法載入');}}}
            await Promise.all(Array.from({length:Math.min(3,units.length)},worker));if(token!==version)return;
            if(!loaded)throw new Error('題庫無法載入，請稍後再按「批次查答案」重試。');
            const rows=compareBatchQuestions(questions,createBatchIndex(entries),{subject:activeSubject,unit:scope});
            const labels={matched:'找到對應',review:'需要核對',unmatched:'尚未收錄'};
            $('batchResultSummary').textContent='共 '+rows.length+' 題：'+['matched','review','unmatched'].map(s=>labels[s]+' '+rows.filter(r=>r.status===s).length+' 題').join('・');
            $('batchResultList').innerHTML=rows.map(row=>'<li class="batch-result" data-batch-number="'+row.input.number+'" data-status="'+row.status+'"><div class="batch-result-heading"><h3>第 '+row.input.number+' 題</h3><span class="batch-state batch-state-'+row.status+'">'+labels[row.status]+'</span></div><div class="batch-stem">'+esc(row.input.stem)+'</div>'+
                (row.answers.length?'<div class="batch-answer"><strong>正確答案</strong>'+row.answers.map(a=>'<p>'+esc(a)+'</p>').join('')+'</div>':'<p class="batch-reason">'+esc(row.reason)+'</p>')+
                row.notes.map(note=>'<p class="batch-note">'+esc(note)+'</p>').join('')+
                (row.references.length?'<div class="batch-candidates">'+row.references.map(ref=>'<a class="batch-question-link" href="'+esc(batchQuestionHref(ref))+'" target="_blank" rel="noopener noreferrer" data-subject="'+esc(ref.subject)+'" data-unit="'+esc(ref.unit)+'" data-question-id="'+ref.id+'">查看題庫：'+names[ref.subject]+' '+esc(ref.unit.toUpperCase())+' 第 '+ref.id+' 題 ↗<span class="sr-only">（開啟新分頁）</span></a>').join('')+'</div>':'')+details(row.input)+'</li>').join('');
            $('batchCoverage').textContent=warnings.length?'部分題庫尚未完整載入，本次結果可能不完整。'+warnings.join('；'):'答案依本次匯入的選項順序對應；需要核對的題目不會直接套用答案。';
            $('batchResults').hidden=false;status(warnings.length?'比對完成，請留意題庫載入提醒。':'比對完成。');
            $('batchResultsHeading').focus({preventScroll:true});$('batchResults').scrollIntoView({block:'start',behavior:'instant'});
        }catch(error){if(token===version)status(error.message||'比對未完成，請再試一次。',true);}
        finally{if(token===version){busy=false;sync();}}
    });
    $('batchNavBtn').addEventListener('click',()=>{refreshUnits();$('batchHeading').focus({preventScroll:true});});
    function setSubject(next){if(next===subject){refreshUnits();return;}subject=next;reset();$('batchHeading').textContent=(names[next]||'')+'批次查題';refreshUnits();}
    reset();return {setSubject};
}

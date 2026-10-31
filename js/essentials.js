import { escapeHtml as esc } from './utils.js?v=20261017-formats1';

const configs={algorithm:{label:'演算法',lastUnit:7,version:'20261031-essentials1'},os:{label:'作業系統',lastUnit:6,version:'20261101-os-essentials1'}};
export function validateEssentials(data,subject='algorithm') {
    if(!configs[subject]||(data.subject&&data.subject!==subject))throw new Error('考前題目的科目不符。');
    if(data?.schema!==1||!Array.isArray(data.questions)||data.questions.length!==65)throw new Error('考前題目資料不完整，請重新載入。');
    data.questions.forEach((q,i)=>{
        if(q.number!==i+1||q.group!==(q.number<=50?'key':'extra')||!new RegExp('^u[2-'+configs[subject].lastUnit+']$').test(q.unit)||
            !['single','multiple','fill'].includes(q.kind)||typeof q.question!=='string'||!q.question.trim()||
            typeof q.answerText!=='string'||!q.answerText.trim()||typeof q.explanation!=='string'||!q.explanation.trim()||
            !Array.isArray(q.options)||new Set(q.options.map(o=>o.label)).size!==q.options.length||
            q.options.some(o=>!/^([A-H])$/.test(o.label)||typeof o.text!=='string'||!o.text.trim())||
            (q.kind==='fill'?q.options.length!==0||!Number.isInteger(q.blankCount)||q.blankCount<1||q.blankCount>10:q.options.length<2)||
            (q.image&&!(subject==='os'?/^\.\/images\/os-u6-rr\.png$/:/^\.\/images\/exam-l4-(017|019)\.png$/).test(q.image)))throw new Error('第 '+(i+1)+' 題資料格式不完整，請重新載入。');
    });
    return data.questions;
}
export function initEssentials() {
    const $=id=>document.getElementById(id),panel=$('panel-essentials'),list=$('essentialsList');
    let subject=null,questions=null;
    const sessions=new Map();
    const session=()=>sessions.get(subject);
    const answers={has:n=>session().answers.has(n),set:(n,v)=>session().answers.set(n,v),get:n=>session().answers.get(n)};
    const state=q=>{if(!answers.has(q.number))answers.set(q.number,{values:q.kind==='fill'?Array(q.blankCount).fill(''):[],revealed:false,viewed:false});return answers.get(q.number);};
    const complete=(q,s)=>q.kind==='fill'?s.values.length===q.blankCount&&s.values.every(v=>v.trim()):s.values.length>0;
    function progress(){if(!questions){$('essentialsProgress').textContent='';return;}const done=questions.filter(q=>complete(q,state(q))).length,viewed=questions.filter(q=>state(q).viewed).length;$('essentialsProgress').textContent='已作答 '+done+' / 65 題 · 已查看解析 '+viewed+' 題';}
    function response(q,s){return q.kind==='fill'?s.values.map((v,i)=>'第 '+(i+1)+' 格：'+v).join('\n'):q.options.filter(o=>s.values.includes(o.label)).map(o=>o.label+'．'+o.text).join('\n');}
    function card(q) {
        const s=state(q),id='essential-'+q.number,legend=q.kind==='fill'?'請填寫答案；多格依題目順序填寫。':q.kind==='single'?'請選擇一個答案。':'請勾選所有你認為正確的選項。';
        const controls=q.kind==='fill'?s.values.map((v,i)=>'<label class="essentials-blank"><span>第 '+(i+1)+' 格</span><input data-essential-answer data-slot="'+i+'" type="text" autocomplete="off" spellcheck="false" maxlength="10000" aria-label="第 '+q.number+' 題，第 '+(i+1)+' 格" value="'+esc(v)+'"></label>').join(''):
            q.options.map(o=>'<label class="essentials-option"><input data-essential-answer type="'+(q.kind==='single'?'radio':'checkbox')+'" name="essential-choice-'+q.number+'" value="'+o.label+'"'+(s.values.includes(o.label)?' checked':'')+'><span>'+esc(o.label+'．'+o.text)+'</span></label>').join('');
        return '<article id="'+id+'" class="essentials-card" data-essential-number="'+q.number+'" data-essential-kind="'+q.kind+'"><div class="essentials-meta"><strong>第 '+String(q.number).padStart(2,'0')+' 題</strong><span>'+q.unit.toUpperCase()+' · '+(q.group==='key'?'重點題':'延伸題')+' · '+esc(q.typeLabel)+'</span></div><pre class="essentials-stem">'+esc(q.question)+'</pre>'+
            (q.image?'<a class="essentials-image-link" href="'+esc(q.image)+'" target="_blank" rel="noopener noreferrer" aria-label="以原尺寸查看第 '+q.number+' 題圖片（開啟新分頁）"><img class="essentials-image" src="'+esc(q.image)+'" alt="'+esc(q.imageAlt)+'" loading="lazy"></a><p class="essentials-image-help">點圖片可在新分頁放大查看。</p><p class="essentials-image-help" data-image-fallback hidden>圖片暫時無法顯示，請依下方完整文字資料作答。</p>':'')+
            (q.note?'<p class="essentials-note">'+esc(q.note)+'</p>':'')+
            '<fieldset class="essentials-fields"'+(s.revealed?' disabled':'')+'><legend>'+legend+'</legend>'+controls+'</fieldset><p class="essentials-error" role="alert" hidden></p><button class="primary-btn essentials-reveal" type="button" data-essential-reveal aria-expanded="'+s.revealed+'" aria-controls="'+id+'-solution">'+(s.revealed?'收合答案，繼續修改':'查看答案')+'</button><div id="'+id+'-solution" class="essentials-solution"'+(s.revealed?'':' hidden')+'><h3>你的作答</h3><pre data-essential-response>'+esc(response(q,s))+'</pre><h3>正確答案</h3><pre>'+esc(q.answerText)+'</pre><h3>解析</h3><pre>'+esc(q.explanation)+'</pre></div>'+
            (q.bankQuestionId?'<a class="essentials-source" href="./?subject='+subject+'&amp;unit='+q.unit+'&amp;question='+q.bankQuestionId+'" target="_blank" rel="noopener noreferrer">查看題庫中的完整題目 ↗</a>':'')+'</article>';
    }
    function render(){if(!questions)return;const group=$('essentialsGroup').value,unit=$('essentialsUnit').value,rows=questions.filter(q=>(group==='all'||q.group===group)&&(unit==='all'||q.unit===unit));list.innerHTML=rows.map(card).join('')||'<p class="essentials-empty">這個範圍沒有題目，請更換單元或題目範圍。</p>';$('essentialsStatus').textContent='目前顯示 '+rows.length+' 題，依原題號排列。作答會保留至重新整理頁面。';$('essentialsStatus').classList.remove('is-error');for(const img of list.querySelectorAll('.essentials-image'))img.addEventListener('error',()=>{img.hidden=true;img.closest('.essentials-card').querySelector('[data-image-fallback]').hidden=false;});progress();}
    function status(){const ctx=session();$('essentialsRetry').hidden=!ctx?.error;$('essentialsStatus').classList.toggle('is-error',!!ctx?.error);$('essentialsStatus').textContent=ctx?.error||(ctx?.loading?'正在載入考前題目……':'');for(const id of ['essentialsGroup','essentialsUnit'])$(id).disabled=!!ctx?.loading;}
    async function load(){if(!subject)return;const requested=subject,ctx=session();if(ctx.questions){questions=ctx.questions;render();return;}if(ctx.loading)return ctx.loading;ctx.error=null;ctx.loading=(async()=>{try{const r=await fetch(new URL('../data/'+requested+'-exam-essentials.json?v='+configs[requested].version,import.meta.url),{cache:'no-cache',signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error('考前題目無法載入，請重試。');ctx.questions=validateEssentials(await r.json(),requested);}catch(e){ctx.error=e.message||'考前題目無法載入，請重試。';}finally{ctx.loading=null;if(subject===requested){questions=ctx.questions;status();if(questions)render();}}})();status();return ctx.loading;}
    function collect(event){const input=event.target;if(!input.matches('[data-essential-answer]'))return;const article=input.closest('[data-essential-number]'),q=questions?.find(q=>q.number===Number(article.dataset.essentialNumber));if(!q)return;const s=state(q);if(s.revealed)return;s.values=q.kind==='fill'?Array.from(article.querySelectorAll('[data-essential-answer]')).map(i=>i.value):Array.from(article.querySelectorAll('[data-essential-answer]:checked')).map(i=>i.value);article.querySelector('.essentials-error').hidden=true;progress();}
    list.addEventListener('input',collect);list.addEventListener('change',collect);
    list.addEventListener('click',event=>{const button=event.target.closest('[data-essential-reveal]');if(!button)return;const article=button.closest('[data-essential-number]'),q=questions.find(q=>q.number===Number(article.dataset.essentialNumber)),s=state(q);if(!s.revealed&&!complete(q,s)){const error=article.querySelector('.essentials-error');error.textContent=q.kind==='fill'?'請先填寫每一格，再查看答案與解析。':'請先作答，再查看答案與解析。';error.hidden=false;return;}s.revealed=!s.revealed;if(s.revealed)s.viewed=true;article.querySelector('[data-essential-response]').textContent=response(q,s);article.querySelector('.essentials-solution').hidden=!s.revealed;article.querySelector('.essentials-fields').disabled=s.revealed;button.setAttribute('aria-expanded',String(s.revealed));button.textContent=s.revealed?'收合答案，繼續修改':'查看答案';progress();});
    for(const [id,key] of [['essentialsGroup','group'],['essentialsUnit','unit']])$(id).addEventListener('change',()=>{session()[key]=$(id).value;render();});$('essentialsRetry').addEventListener('click',load);
    $('essentialsNavBtn').addEventListener('click',()=>{if(!subject)return;$('essentialsHeading').focus({preventScroll:true});load();});
    function setSubject(next){subject=configs[next]?next:null;questions=null;list.innerHTML='';$('essentialsNavBtn').hidden=!subject;panel.hidden=!subject;$('essentialsProgress').textContent='';if(!subject){$('essentialsStatus').textContent='';return;}if(!sessions.has(subject))sessions.set(subject,{questions:null,loading:null,answers:new Map(),group:'all',unit:'all',error:null});const ctx=session(),cfg=configs[subject];questions=ctx.questions;$('essentialsDescription').textContent=cfg.label+' U2～U'+cfg.lastUnit+' · 50 題重點＋15 題延伸。先逐題作答，再查看答案與解析。';$('essentialsUnit').innerHTML='<option value="all">全部單元</option>'+Array.from({length:cfg.lastUnit-1},(_,i)=>'<option value="u'+(i+2)+'">U'+(i+2)+'</option>').join('');$('essentialsGroup').value=ctx.group;$('essentialsUnit').value=ctx.unit;status();if(questions)render();}
    setSubject(null);return {setSubject};
}

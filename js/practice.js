import { PRACTICE_UNITS, PRACTICE_COUNTS, buildPracticePool, createPractice, gradePracticeQuestion, practiceSummary } from './practice-core.js?v=20261029-practice';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function initPractice({getContext,loadQuestions}) {
    const $=id=>document.getElementById(id);
    let subject=null,opened=false,pool=null,poolUnit=null,loading=false,version=0,session=null;
    const selectedCount=()=>Number(document.querySelector('[name="practiceCount"]:checked')?.value);
    const unitLabel=unit=>'演算法｜'+unit.toUpperCase();
    function message(text,error=false) {
        $('practicePoolStatus').textContent=text;
        $('practicePoolStatus').classList.toggle('is-error',error);
    }
    function sync() {
        const running=!!session&&!session.complete;
        $('practiceUnit').disabled=running;
        document.querySelectorAll('[name="practiceCount"]').forEach(input=>input.disabled=running);
        $('practiceStart').hidden=running;
        $('practiceStart').disabled=subject!=='algorithm'||loading||!pool||poolUnit!==$('practiceUnit').value||
            !PRACTICE_COUNTS.includes(selectedCount())||pool.length<selectedCount();
        $('practiceStart').textContent=session?.complete?'開始新練習':'開始練習';
        $('practiceReset').hidden=!running;
        $('practiceRetry').disabled=loading;
    }
    function placeholder() {
        $('practiceContent').innerHTML='<div class="practice-placeholder"><p>先選擇單元與題數，再開始這次練習。</p><p>單選使用圓形選項，複選使用方形選項；填空依題目輸入答案。</p></div>';
    }
    async function load() {
        const unit=$('practiceUnit').value,request=++version;
        pool=null;poolUnit=null;loading=true;$('practiceRetry').hidden=true;
        message('正在載入 '+unitLabel(unit)+'……');sync();
        try {
            if(subject!=='algorithm'||!PRACTICE_UNITS.includes(unit))throw new Error('目前僅開放演算法 U6、U7。');
            const questions=await loadQuestions('algorithm',unit);
            if(request!==version||subject!=='algorithm'||$('practiceUnit').value!==unit)return;
            pool=buildPracticePool(questions,'algorithm',unit);poolUnit=unit;
            message(unitLabel(unit)+'：共 '+questions.length+' 題，可出題 '+pool.length+' 題；爭議、缺選項或無法可靠核對格式的題目暫不納入。');
        } catch(error) {
            if(request!==version)return;
            message(error.message||'題庫無法載入，請重新載入後再試。',true);
            $('practiceRetry').hidden=false;
        } finally {if(request===version){loading=false;sync();}}
    }
    function expected(item) {
        return item.kind==='fill'?item.answers.map((a,i)=>'第 '+(i+1)+' 格：'+a).join('\n'):
            item.expected.map(i=>item.question.options[i]).join('\n');
    }
    function responseText(item) {
        return item.kind==='fill'?item.response.map((a,i)=>'第 '+(i+1)+' 格：'+a).join('\n'):
            item.response.map(i=>item.question.options[i]).join('\n')||'未選擇';
    }
    function showQuestion(focus=false) {
        if(!session)return;
        if(session.complete){showResults();return;}
        const item=session.items[session.index],q=item.question;
        const type=item.kind==='single'?'單選題':item.kind==='multiple'?'複選題':'填空題';
        const answered=session.items.filter(q=>q.answered).length;
        const choices=item.kind==='fill'
            ?'<div class="practice-blanks">'+item.answers.map((_,i)=>'<div><label for="practiceBlank-'+i+'">第 '+(i+1)+' 格</label><input id="practiceBlank-'+i+'" data-practice-blank="'+i+'" type="text" autocomplete="off" spellcheck="false" maxlength="2000" value="'+escape(item.response[i])+'"'+(item.answered?' disabled':'')+'></div>').join('')+'</div><p class="practice-help">填空會忽略空白及常見全半形差異；O／o、Ω／ω 和陣列順序仍須正確。</p>'
            :'<fieldset class="practice-choices"><legend>'+ (item.kind==='multiple'?'請勾選所有正確選項，漏選或多選均算錯誤。':'請選擇一個正確選項。')+'</legend>'+
                item.options.map((_,i)=>'<label class="practice-option"><input type="'+(item.kind==='single'?'radio':'checkbox')+'" name="practiceChoice" data-practice-choice="'+i+'" value="'+i+'"'+(item.response.includes(i)?' checked':'')+(item.answered?' disabled':'')+'><span>'+escape(q.options[i])+'</span></label>').join('')+'</fieldset>';
        const feedback=item.answered?'<div class="practice-feedback '+(item.correct?'correct':'incorrect')+'" role="status"><h3 id="practiceFeedbackHeading" tabindex="-1">'+(item.correct?'✓ 答對了':'答錯了，再記住這題')+'</h3><strong>正確答案</strong><pre>'+escape(expected(item))+'</pre>'+
            (!item.correct?'<strong>你的答案</strong><pre>'+escape(responseText(item))+'</pre>':'')+
            (q.answer_note?'<details class="practice-note"><summary>題庫補充說明</summary><p>'+escape(q.answer_note)+'</p></details>':'')+'</div>':'';
        $('practiceContent').innerHTML='<article class="practice-card" data-practice-unit="'+session.unit+'" data-practice-question-id="'+item.id+'" data-practice-kind="'+item.kind+'"><div class="practice-question-header"><span>'+unitLabel(session.unit)+'</span><span>第 '+(session.index+1)+' / '+session.count+' 題</span></div><progress class="practice-progress" value="'+answered+'" max="'+session.count+'" aria-label="已作答題數"></progress><div class="practice-question-heading"><h2 id="practiceQuestionHeading" tabindex="-1">'+type+'</h2><span>題庫 #'+item.id+'</span></div><div class="practice-stem">'+escape(q.question)+'</div><form id="practiceAnswerForm">'+choices+'<p id="practiceAnswerError" class="practice-error" role="alert" hidden></p>'+feedback+'<div class="practice-actions">'+
            (item.answered?'<button id="practiceNext" class="primary-btn" type="button">'+(session.index===session.count-1?'查看成績':'下一題 →')+'</button>':'<button id="practiceSubmit" class="primary-btn" type="submit">送出答案</button>')+'</div></form></article>';
        const form=$('practiceAnswerForm');
        function collect() {
            item.response=item.kind==='fill'?Array.from(form.querySelectorAll('[data-practice-blank]')).map(input=>input.value):
                Array.from(form.querySelectorAll('[data-practice-choice]:checked')).map(input=>Number(input.dataset.practiceChoice));
        }
        form.addEventListener('input',()=>{if(!item.answered)collect();});
        form.addEventListener('change',()=>{if(!item.answered)collect();});
        form.addEventListener('submit',event=>{
            event.preventDefault();if(item.answered)return;collect();
            if(item.kind==='fill'?item.response.some(v=>!v.trim()):item.response.length===0){
                $('practiceAnswerError').textContent=item.kind==='fill'?'請填寫每一格答案。':'請先選擇答案。';
                $('practiceAnswerError').hidden=false;return;
            }
            item.correct=gradePracticeQuestion(item,item.response);item.answered=true;
            showQuestion();$('practiceFeedbackHeading').focus({preventScroll:false});
        });
        $('practiceNext')?.addEventListener('click',()=>{
            if(!item.answered)return;
            if(session.index===session.count-1)session.complete=true;else session.index++;
            render();window.scrollTo({top:0,behavior:'instant'});
            (session.complete?$('practiceResultHeading'):$('practiceQuestionHeading')).focus({preventScroll:true});
        });
        if(focus)$('practiceQuestionHeading').focus({preventScroll:true});
    }
    function showResults() {
        const summary=practiceSummary(session);
        $('practiceContent').innerHTML='<section class="practice-result"><p class="practice-help">'+unitLabel(session.unit)+' · '+summary.total+' 題</p><h2 id="practiceResultHeading" tabindex="-1">練習完成</h2><div class="practice-score">'+summary.score+'<small> / 100</small></div><p>答對 '+summary.correct+' / '+summary.total+' 題 · 答錯 '+summary.incorrect.length+' 題</p><p class="practice-help">可在上方直接更換單元與題數，再開始一輪練習。</p>'+
            (summary.incorrect.length?'<h3>錯誤題目複習</h3>'+summary.incorrect.map(item=>'<details class="practice-review"><summary>題庫 #'+item.id+' · '+escape(item.question.question.slice(0,65))+'</summary><div class="practice-stem">'+escape(item.question.question)+'</div><strong>你的答案</strong><pre>'+escape(responseText(item))+'</pre><strong>正確答案</strong><pre>'+escape(expected(item))+'</pre></details>').join(''):'<p class="practice-perfect">本次全部答對！</p>')+'</section>';
    }
    function render(){sync();if(session)showQuestion();else placeholder();}
    function reset(ask=true) {
        if(ask&&session&&!session.complete&&!confirm('要重新選擇單元與題數嗎？本次練習進度將重新開始。'))return;
        session=null;render();
    }
    function open() {
        if(subject!=='algorithm')return;
        if(!opened){const current=getContext()?.unitId;if(PRACTICE_UNITS.includes(current))$('practiceUnit').value=current;opened=true;}
        render();if(!session&&(!pool||poolUnit!==$('practiceUnit').value)&&!loading)load();
        $('practiceHeading').focus({preventScroll:true});
    }
    $('practiceNavBtn').addEventListener('click',open);
    $('practiceSettings').addEventListener('submit',event=>{
        event.preventDefault();if(loading||!pool||poolUnit!==$('practiceUnit').value||subject!=='algorithm')return;
        try {session=createPractice(pool,'algorithm',$('practiceUnit').value,selectedCount());render();$('practiceQuestionHeading').focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});}
        catch(error){message(error.message,true);sync();}
    });
    $('practiceUnit').addEventListener('change',()=>{if(session&&!session.complete)return;session=null;placeholder();load();});
    document.querySelectorAll('[name="practiceCount"]').forEach(input=>input.addEventListener('change',sync));
    $('practiceRetry').addEventListener('click',load);
    $('practiceReset').addEventListener('click',()=>reset(true));
    function setSubject(next) {
        $('practiceNavBtn').hidden=next!=='algorithm';
        if(next===subject)return;
        subject=next;version++;pool=null;poolUnit=null;loading=false;session=null;opened=false;
        $('practiceUnit').value='u6';document.querySelector('[name="practiceCount"][value="20"]').checked=true;
        $('practiceRetry').hidden=true;message('目前開放演算法 U6、U7。');render();
    }
    setSubject(null);
    return {setSubject};
}

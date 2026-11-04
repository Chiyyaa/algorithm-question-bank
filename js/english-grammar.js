import { sampleWords } from './english-core.js?v=20261104-midterm';

const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const letters = ['A','B','C','D'];

export function createGrammarSession(questions, count, random = Math.random) {
    if (![20, 50].includes(count) || questions.length !== 50) throw new Error('題庫或題數不正確');
    return { index:0, complete:false, items:sampleWords(questions,count,random).map(question => ({question, choice:'', answered:false, correct:false})) };
}

export function createGrammarController(container) {
    let questions, session = null, count = 20, pending;
    const find = selector => container.querySelector(selector);
    const focus = selector => { find(selector)?.focus({preventScroll:true}); container.scrollIntoView({block:'start',behavior:'instant'}); };
    function render() {
        if (!session) {
            container.innerHTML = `<div class="quiz-intro"><div class="quiz-emblem" aria-hidden="true">Aa</div><h3>期中文法測驗</h3><p>依考前複習題庫出題，共 50 題選擇題。</p><div class="quiz-facts"><span>四選一</span><span>作答後看解析</span><span>錯題複習</span></div><form id="grammarStartForm"><fieldset class="grammar-count"><legend>選擇測驗題數</legend><label><input type="radio" name="grammarCount" value="20"${count===20?' checked':''}> 隨機 20 題</label><label><input type="radio" name="grammarCount" value="50"${count===50?' checked':''}> 全部 50 題</label></fieldset><p>題目隨機排序、不重複；選項維持原題順序。</p><p>送出答案後顯示正確答案與精簡解析。</p><button class="primary-btn" type="submit">開始文法測驗 →</button></form></div>`;
            find('#grammarStartForm').addEventListener('change', event => { if(event.target.name==='grammarCount') count=Number(event.target.value); });
            find('#grammarStartForm').addEventListener('submit', event => { event.preventDefault(); session=createGrammarSession(questions,count); render(); focus('#grammarQuestion'); });
            return;
        }
        if (session.complete) { renderResults(); return; }
        const item = session.items[session.index], q = item.question;
        container.innerHTML = `<article class="quiz-card grammar-card" data-grammar-id="${q.id}"><div class="quiz-progress-row"><span>期中文法測驗 · 原題 ${q.id}</span><span>第 ${session.index+1} / ${session.items.length} 題</span></div><div class="quiz-progress" role="progressbar" aria-label="已作答題數" aria-valuemin="0" aria-valuemax="${session.items.length}" aria-valuenow="${session.index+(item.answered?1:0)}"><span style="width:${(session.index+(item.answered?1:0))/session.items.length*100}%"></span></div><h3 id="grammarQuestion" class="grammar-question" lang="en" tabindex="-1">${escape(q.question).replace(/__/g,'<span class="grammar-blank" aria-label="空格">＿＿</span>')}</h3><form id="grammarAnswerForm"><fieldset class="grammar-options"><legend class="sr-only">選擇正確答案</legend>${q.options.map((option,i)=>`<label class="grammar-option${item.answered && letters[i]===q.answer?' option-correct':''}${item.answered && letters[i]===item.choice && !item.correct?' option-incorrect':''}"><input type="radio" name="grammarAnswer" value="${letters[i]}"${item.choice===letters[i]?' checked':''}${item.answered?' disabled':''}><span class="grammar-letter">${letters[i]}</span><span lang="en">${escape(option)}</span></label>`).join('')}</fieldset><p id="grammarError" class="answer-error" role="alert" hidden>請先選擇一個答案。</p>${item.answered ? `<div class="feedback${item.correct?'':' incorrect'}" role="status"><h3>${item.correct?'✓ 答對了':'再記一次，下一題加油'}</h3><p>正確答案：<strong>${q.answer}</strong> · <span lang="en">${escape(q.options[letters.indexOf(q.answer)])}</span></p><p class="grammar-explanation">${escape(q.explanation)}</p></div><div class="quiz-actions"><button id="grammarNextBtn" type="button" class="primary-btn">${session.index===session.items.length-1?'查看測驗結果':'下一題 →'}</button></div>` : '<div class="quiz-actions"><button type="submit" class="primary-btn">送出答案</button></div>'}</form></article>`;
        find('#grammarAnswerForm').addEventListener('change', event => { if(event.target.name==='grammarAnswer' && !item.answered) { item.choice=event.target.value;find('#grammarError').hidden=true; } });
        find('#grammarAnswerForm').addEventListener('submit', event => {
            event.preventDefault(); if(item.answered) return;
            if(!item.choice) { find('#grammarError').hidden=false;find('[name="grammarAnswer"]').focus();return; }
            item.answered=true;item.correct=item.choice===q.answer;render();focus('#grammarNextBtn');
        });
        find('#grammarNextBtn')?.addEventListener('click',()=>{ if(!item.answered) return; if(session.index===session.items.length-1) session.complete=true;else session.index++;render();focus(session.complete?'#grammarResultHeading':'#grammarQuestion'); });
    }
    function renderResults() {
        const correct=session.items.filter(i=>i.correct).length;
        const wrong=session.items.filter(i=>!i.correct);
        container.innerHTML=`<section class="result-card grammar-results"><header><p class="prompt-label">期中文法測驗 · 測驗完成</p><h3 id="grammarResultHeading" tabindex="-1">這次的文法練習成績</h3><p class="result-score">${Math.round(correct/session.items.length*100)}<small> / 100</small></p><p class="result-caption">答對 ${correct} / ${session.items.length} 題 · 答錯 ${wrong.length} 題</p></header>${wrong.length?`<h3>錯題與解析</h3>${wrong.map(({question:q,choice})=>`<div class="review-item" data-grammar-review-id="${q.id}"><p class="prompt-label">原題 ${q.id}</p><p lang="en">${escape(q.question)}</p><ol class="grammar-review-options" type="A" lang="en">${q.options.map(o=>`<li>${escape(o)}</li>`).join('')}</ol><p class="review-input">你的答案：${choice}</p><p class="review-answer">正確答案：${q.answer} · <span lang="en">${escape(q.options[letters.indexOf(q.answer)])}</span></p><p>${escape(q.explanation)}</p></div>`).join('')}`:'<p class="all-correct-note">全部答對了，這次沒有錯題！</p>'}<div class="quiz-actions"><button id="grammarResetBtn" type="button">重新選擇題數</button><button id="grammarRestartBtn" class="primary-btn" type="button">再測驗一次</button></div></section>`;
        find('#grammarResetBtn').addEventListener('click',()=>{session=null;render();focus('[name="grammarCount"]:checked');});
        find('#grammarRestartBtn').addEventListener('click',()=>{session=createGrammarSession(questions,count);render();focus('#grammarQuestion');});
    }
    async function load() {
        container.innerHTML='<p class="notice" role="status">文法題庫載入中……</p>';
        try {
            const response=await fetch(new URL('../data/english-grammar.json?v=20261104-grammar',import.meta.url),{cache:'no-cache'});
            if(!response.ok) throw new Error('load');
            const data=await response.json();
            if(!Array.isArray(data.questions)||data.questions.length!==50||data.questions.some((q,i)=>q.id!==i+1||!q.question||!Array.isArray(q.options)||q.options.length!==4||q.options.some(o=>typeof o!=='string'||!o)||!letters.includes(q.answer)||!q.explanation)) throw new Error('format');
            questions=data.questions;render();
        }catch{
            container.innerHTML='<p class="notice" role="alert">文法題庫暫時無法載入，請確認連線後重試。</p><button id="grammarRetryBtn" type="button">重新載入文法題庫</button>';
            find('#grammarRetryBtn').addEventListener('click',()=>{pending=load();});
        }finally{pending=null;}
    }
    return { show(){ if(questions) render();else if(!pending) pending=load(); } };
}

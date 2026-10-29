export const PRACTICE_UNITS = Object.freeze(['u6', 'u7']);
export const PRACTICE_COUNTS = Object.freeze([10, 20]);

export function normalizePracticeAnswer(value) {
    let text=String(value??'').replace(/²/g,'^2').replace(/³/g,'^3').normalize('NFKC');
    text=text.replace(/[，、]/g,',').replace(/[−–]/g,'-')
        .replace(/big[\s_-]*omega/gi,'@bigomega').replace(/Ω/g,'@bigomega')
        .replace(/ω|\bomega\b/g,'@smallomega')
        .replace(/big[\s_-]*theta|Θ|θ|\btheta\b/gi,'@theta')
        .replace(/\bbig[\s_-]*o(?=\s*\()/gi,'@bigo')
        .replace(/(^|[^a-zA-Z])O(?=\s*\()/g,'$1@bigo')
        .replace(/(^|[^a-zA-Z])o(?=\s*\()/g,'$1@smallo')
        .toLowerCase().replace(/\s+/g,'');
    if (/^-?\d+(?:\.\d+)?(?:,-?\d+(?:\.\d+)?)*$/.test(text)) text=text.split(',').map(v=>String(Number(v))).join(',');
    return text;
}
export function optionText(value) {
    return String(value).replace(/^\s*[A-H][.．、)）:：]\s*/,'').trim();
}
function expectedFill(question) {
    const ids=[...new Set([...question.question.matchAll(/\[(?:__|\*\*)(\d+)(?:__|\*\*)\]/g)].map(m=>Number(m[1])))];
    if (!ids.length || ids.some((id,i)=>id!==i+1)) return null;
    const lines=String(question.correct_answer).split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    if (lines.length!==ids.length) return null;
    const labelled=lines.every((s,i)=>new RegExp('^[（(]'+(i+1)+'[）)]').test(s));
    if (ids.length>1 && !labelled) return null;
    const answers=lines.map(s=>s.replace(/^[（(]\d+[）)]\s*/,'').trim());
    return answers.every(Boolean)?answers:null;
}
function prepareQuestion(question, subject, unit) {
    if (!question || !Number.isFinite(question.id) || typeof question.question!=='string' ||
        !question.question.trim() || typeof question.correct_answer!=='string' || !question.correct_answer.trim()) return null;
    if (question.type==='fill_blank') {
        const answers=expectedFill(question);
        return answers?{subject,unit,id:question.id,kind:'fill',question:JSON.parse(JSON.stringify(question)),answers}:null;
    }
    if (question.type!=='choice' || question.options_status==='known_options_only' || !Array.isArray(question.options) || question.options.length<2) return null;
    const options=question.options.map(optionText),keys=options.map(normalizePracticeAnswer);
    if (new Set(keys).size!==keys.length) return null;
    const answerParts=question.correct_answer.split(/\r?\n/).map(s=>optionText(s.replace(/^\s*[-*•]\s*/,''))).filter(Boolean);
    const expected=[...new Set(answerParts.map(s=>keys.indexOf(normalizePracticeAnswer(s))))].sort((a,b)=>a-b);
    if (!expected.length || expected.some(i=>i<0)) return null;
    const declaredSingle=/單選/.test(question.source_type||''),declaredMultiple=/多選|複選/.test(question.source_type||'');
    if (declaredSingle && expected.length!==1) return null;
    return {subject,unit,id:question.id,kind:declaredMultiple||expected.length>1?'multiple':'single',
        question:JSON.parse(JSON.stringify(question)),options,expected};
}
export function buildPracticePool(questions, subject, unit) {
    if (subject!=='algorithm' || !PRACTICE_UNITS.includes(unit)) throw new Error('目前僅開放演算法 U6、U7 測驗練習。');
    if (!Array.isArray(questions)) throw new Error('題庫格式不正確。');
    const unique=new Map();
    for (const question of questions) if(question&&Number.isFinite(question.id)) unique.set(question.id,question);
    return [...unique.values()].map(q=>prepareQuestion(q,subject,unit)).filter(Boolean);
}
export function createPractice(pool, subject, unit, count, random=Math.random) {
    if (subject!=='algorithm' || !PRACTICE_UNITS.includes(unit) || !PRACTICE_COUNTS.includes(count))
        throw new Error('請選擇演算法 U6／U7，以及 10 或 20 題。');
    if (pool.some(q=>q.subject!==subject||q.unit!==unit)) throw new Error('題庫範圍不一致，請重新載入選定單元。');
    if (pool.length<count) throw new Error('此單元可用題目不足，請選擇較少題數。');
    const shuffled=[...pool];
    for(let i=shuffled.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}
    return {subject,unit,count,index:0,complete:false,items:shuffled.slice(0,count).map(q=>({
        ...JSON.parse(JSON.stringify(q)),response:q.kind==='fill'?q.answers.map(()=>''):[],
        answered:false,correct:false
    }))};
}
export function gradePracticeQuestion(item, response) {
    if (!Array.isArray(response)) return false;
    if (item.kind==='fill') return response.length===item.answers.length &&
        response.every((value,i)=>String(value).trim()&&normalizePracticeAnswer(value)===normalizePracticeAnswer(item.answers[i]));
    if (response.some(i=>!Number.isInteger(i)||i<0||i>=item.options.length)) return false;
    const selected=[...new Set(response)].sort((a,b)=>a-b);
    return selected.length===item.expected.length && selected.every((value,i)=>value===item.expected[i]);
}
export function practiceSummary(session) {
    const correct=session.items.filter(q=>q.answered&&q.correct).length;
    return {correct,total:session.count,score:Math.round(correct/session.count*100),
        incorrect:session.items.filter(q=>q.answered&&!q.correct)};
}

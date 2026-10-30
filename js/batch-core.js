export function normalizeBatchText(value) {
    return String(value??'').replace(/²/g,'^2').replace(/³/g,'^3').normalize('NFKC')
        .replace(/[−–]/g,'-').replace(/\[(?:__|\*\*)(\d+)(?:__|\*\*)\]/g,'[__$1__]').replace(/\s+/g,'');
}
export function stripBatchOption(value){return String(value??'').replace(/^\s*(?:[A-Ha-h][.．、:)）]\s*|[1-9][.．、:)）]\s+)/,'').trim();}
const blankCount=text=>new Set([...String(text).matchAll(/\[(?:__|\*\*)(\d+)(?:__|\*\*)\]/g)].map(m=>m[1])).size;
function grams(value){const result=new Set();for(let i=0;i<value.length-1;i++)result.add(value.slice(i,i+2));return result;}
function similarity(a,b){if(a===b)return 1;if(!a.size||!b.size)return 0;let shared=0;for(const g of a)if(b.has(g))shared++;return 2*shared/(a.size+b.size||1);}
export function createBatchIndex(entries){
    return entries.filter(e=>e&&['algorithm','os'].includes(e.subject)&&/^u\d+$/.test(e.unit)&&Number.isSafeInteger(e.id)&&e.id>0&&typeof e.question==='string').map(e=>{
        const stem=normalizeBatchText(e.question),options=(e.options||[]).map(stripBatchOption).map(normalizeBatchText);
        return {...e,normalizedStem:stem,normalizedOptions:options,grams:grams(stem.toLowerCase()),blanks:blankCount(e.question)};
    });
}
export function batchQuestionHref(entry){
    return './?subject='+encodeURIComponent(entry.subject)+'&unit='+encodeURIComponent(entry.unit)+'&question='+encodeURIComponent(entry.id);
}
function sameOptions(input,entry){
    const a=input.options.map(o=>normalizeBatchText(o.text));
    return a.length===entry.normalizedOptions.length&&new Set(a).size===a.length&&new Set(entry.normalizedOptions).size===a.length&&
        JSON.stringify([...a].sort())===JSON.stringify([...entry.normalizedOptions].sort());
}
function answerFor(input,entry){
    if(entry.type==='disputed'||entry.image||entry.options_status==='known_options_only'||typeof entry.correct_answer!=='string'||!entry.correct_answer.trim())return null;
    if(input.kind==='fill'){
        if(entry.type!=='fill_blank'||entry.blanks!==input.blankCount||!input.blankCount)return null;
        const raw=entry.correct_answer.trim(),lines=raw.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
        let answers;
        if(input.blankCount===1)answers=[raw];
        else if(lines.length===input.blankCount&&lines.every((s,i)=>new RegExp('^[（(]'+(i+1)+'[）)]').test(s)))answers=lines.map(s=>s.replace(/^[（(]\d+[）)]\s*/,''));
        else if(raw.split('/').length===input.blankCount)answers=raw.split('/').map(s=>s.trim());
        else return null;
        if(answers.some(a=>!a))return null;
        return {lines:answers.map((a,i)=>'第 '+(i+1)+' 格：'+a),signature:JSON.stringify(answers.map(normalizeBatchText))};
    }
    if(entry.type!=='choice'||!sameOptions(input,entry))return null;
    if((/單選/.test(entry.source_type||'')&&input.kind!=='single')||(/多選|複選/.test(entry.source_type||'')&&input.kind!=='multiple'))return null;
    const parts=entry.correct_answer.split(/\r?\n/).map(s=>stripBatchOption(s.replace(/^\s*[-*•]\s*/,''))).filter(Boolean);
    const keys=[...new Set(parts.map(normalizeBatchText))];
    if(!keys.length||keys.some(key=>!entry.normalizedOptions.includes(key))||(input.kind==='single'&&keys.length!==1))return null;
    const selected=input.options.map((o,i)=>({o,i})).filter(({o})=>keys.includes(normalizeBatchText(o.text)));
    if(selected.length!==keys.length)return null;
    return {lines:selected.map(({o})=>o.label+'．'+o.text),signature:JSON.stringify(selected.map(({i})=>i))};
}
export function compareBatchQuestions(questions,index,{subject,unit='all'}={}){
    const eligible=index.filter(e=>e.subject===subject&&(unit==='all'||e.unit===unit));
    return questions.map(input=>{
        const stem=normalizeBatchText(input.stem);
        const same=eligible.filter(e=>e.normalizedStem===stem);
        const exact=same.filter(e=>input.kind==='fill'?!e.normalizedOptions.length&&e.blanks===input.blankCount:sameOptions(input,e));
        const validInput=!input.issues.length&&input.stem&&(!input.options.length||new Set(input.options.map(o=>normalizeBatchText(o.text))).size===input.options.length);
        if(validInput&&exact.length){
            const resolved=exact.map(e=>answerFor(input,e));
            if(resolved.every(Boolean)&&new Set(resolved.map(a=>a.signature)).size===1){
                const notes=[...new Set(exact.map(e=>e.answer_note||'').filter(Boolean))];
                return {input,status:'matched',answers:resolved[0].lines,notes,references:exact.slice(0,3),reason:''};
            }
        }
        const inputGrams=grams(stem.toLowerCase());
        const candidates=eligible.map(e=>({entry:e,score:e.normalizedStem===stem?1:similarity(inputGrams,e.grams)}))
            .filter(e=>e.score>=(stem.length<12?.8:.56)).sort((a,b)=>b.score-a.score||a.entry.unit.localeCompare(b.entry.unit)||a.entry.id-b.entry.id)
            .slice(0,3).map(e=>e.entry);
        let reason=input.issues.length?input.issues.join('；'):exact.length?'找到相同題目，但答案版本、題型或可核對格式仍有差異。':same.length?'題幹相同，但選項內容、數量或填空格數不同。':'找到相近題目，請核對數值、條件與選項。';
        if(!candidates.length)reason=input.issues.length?reason+'；目前沒有可對應的題庫題目。':'目前沒有找到可可靠對應的題目。';
        return {input,status:candidates.length?'review':'unmatched',answers:[],notes:[],references:candidates,reason};
    });
}

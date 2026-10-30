import { curatePublishedQuestions } from './question-curation.js?v=20261030-replace1';
import { loadQuestionReplacements } from './collaboration-api.js?v=20261030-replace1';
import { mergeQuestionVersions } from './question-versions.js?v=20261030-replace1';
import { decodeBatchFile, parseBatchHTML, MAX_BATCH_BYTES } from './batch-import.js?v=20261030-collab-html1';
import { stripBatchOption } from './batch-core.js?v=20261030-collab-html1';
import { SUBJECTS } from './units.js?v=20261017-formats1';
import { escapeHtml } from './utils.js?v=20261017-formats1';

// Keep case, punctuation, numbers and negation. Only presentation spacing is ignored.
export const canonical = text => String(text ?? '').replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g,s=>'^'+[...s].map(c=>'⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(c)).join('')).replace(/[₀₁₂₃₄₅₆₇₈₉]+/g,s=>'_'+[...s].map(c=>'₀₁₂₃₄₅₆₇₈₉'.indexOf(c)).join('')).normalize('NFKC').replace(/\s+/g, '');
const optionKey = text => canonical(stripBatchOption(text));
const cleanStem = text => String(text).trim().replace(/^(?:(?:妖獸|Beast|題目|Question)\s*)?\d+[.．、:)）]\s*/i, '').trim();
function inertText(node) {
    if (node.nodeType === 3) return node.textContent;
    if (node.nodeType !== 1 || node.matches('script,style,template,noscript,iframe,object,embed,[hidden],[aria-hidden="true"],[style*="display:none"],[style*="display: none"]')) return '';
    if (node.tagName === 'BR') return '\n';
    if (node.matches('img,svg,canvas,math')) return '[未轉錄圖片]';
    return [...node.childNodes].map(inertText).join('') + (/^(P|DIV|LI)$/.test(node.tagName) ? '\n' : '');
}
export function parseAnswerHTML(raw) {
    if (!raw?.trim() || raw.length > MAX_BATCH_BYTES) throw new Error('答案頁沒有可讀內容或超過 2 MB。');
    const template = document.createElement('template'); template.innerHTML = raw;
    const blocks = [...template.content.querySelectorAll('.question-result')].filter(b => !b.closest('[hidden],[aria-hidden="true"]'));
    if (!blocks.length || blocks.length > 100) throw new Error('答案頁需包含 1～100 題的答題詳情與「正確答案」。');
    return blocks.map((block, index) => {
        const fields = {};
        for (const p of block.querySelectorAll('p')) {
            const text = inertText(p).trim(), match = /^(題目|正確答案|你的答案|得分)[：:]\s*([\s\S]*)$/.exec(text);
            if (match) {
                if (fields[match[1]] !== undefined) throw new Error(`答案頁第 ${index+1} 題有重複欄位，請確認檔案。`);
                fields[match[1]] = match[2].trim();
            }
        }
        return { stem: cleanStem(fields.題目 || ''), answer: fields.正確答案 || '', number:index+1 };
    });
}
function answerParts(q) {
    const raw = String(q.correct_answer || '').trim();
    if (q.type !== 'choice') return raw ? [canonical(raw)] : [];
    const options = q.options || [];
    const parts = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean).map(s => {
        const label = /^([A-L])[.．、)）]?$/.exec(s);
        if (label && options.some(o=>optionKey(o)===canonical(s))) return '[需核對答案代號：'+s+']';
        if (label) return options.find(o => new RegExp('^\\s*'+label[1]+'[.．、)）]').test(o)) || s;
        return s.replace(/^[-*•]\s*/, '');
    }).map(optionKey);
    return [...new Set(parts)].sort();
}
export function contentSignature(q) {
    const options = (q.options || []).map(optionKey), answers = answerParts(q);
    if (!q.question || !answers.length || q.type === 'disputed' || q.image || ['known_options_only','missing'].includes(q.options_status)) return null;
    if (q.type === 'choice' && (options.length < 2 || new Set(options).size !== options.length || answers.some(a => !options.includes(a)))) return null;
    if (q.type === 'choice_options_missing') return null;
    return JSON.stringify([canonical(q.question),q.type,[...options].sort(),answers]);
}
export function pairHTML(questions, answers) {
    const used = new Set();
    return questions.map(input => {
        const matches = answers.filter(a => canonical(a.stem) === canonical(input.stem));
        let error = input.issues.join('；'), answer = '';
        if (matches.length !== 1 || !matches[0]?.answer || !matches[0]?.stem) error += (error ? '；' : '') + '未找到唯一對應的正確答案，請核對兩份檔案';
        else {
            used.add(matches[0]); answer = matches[0].answer;
            if (answer.includes('[未轉錄圖片]')) error += (error ? '；' : '') + '答案含未轉錄圖片';
        }
        const content = {question:input.stem, options:input.options.map(o => `${o.label}. ${o.text}`), correct_answer:answer,
            type:input.kind==='fill'?'fill_blank':'choice'};
        if (!error && content.type === 'choice' && (!contentSignature(content) || (input.kind==='single' && answerParts(content).length!==1))) error = '正確答案無法完整對應本次選項，請人工核對';
        if (!error && (content.question.length>10000 || answer.length>10000 || content.options.length>12 || content.options.some(o=>o.length>2000))) error='題目、答案或選項超過送審上限';
        return {content,error,number:input.number,format:'auto',selected:!error,status:'ready',row:null,message:'',text:asSubmissionText(content)};
    }).map((entry,_,entries) => {
        // Never silently ignore an answer from a different result page.
        if (answers.some(a => !used.has(a))) { entry.error ||= '答案頁有未能配對的題目；請確認題目頁與答案頁屬於同一次測驗'; entry.selected=false; }
        return entry;
    });
}
export const asSubmissionText = q => '題目：'+q.question+(q.options?.length?'\n\n選項：\n'+q.options.join('\n'):'')+'\n\n正確答案：\n'+q.correct_answer;
function score(a,b) {
    const grams = s => new Set([...s].slice(1).map((_,i)=>s.slice(i,i+2)));
    const x=grams(a),y=grams(b); let n=0; for(const g of x)if(y.has(g))n++;
    return 2*n/(x.size+y.size||1);
}
export function classifyContribution(content, bank) {
    if(!content)return {kind:'review',label:'格式需修正',references:[]};
    const key = contentSignature(content), stem=canonical(content.question);
    const exact = bank.filter(q=>canonical(q.question)===stem);
    const duplicates=key ? exact.filter(q=>contentSignature(q)===key) : [];
    const sameStructure=q=>q.type===content.type&&JSON.stringify((q.options||[]).map(optionKey).sort())===JSON.stringify((content.options||[]).map(optionKey).sort());
    if(duplicates.length&&exact.some(q=>sameStructure(q)&&contentSignature(q)&&contentSignature(q)!==key))return {kind:'review',label:'題庫存在不同答案，需核對',references:exact.slice(0,3)};
    if (duplicates.length) return {kind:'duplicate',label:'已收錄，已排除',references:duplicates.slice(0,3)};
    if (exact.length) {
        const incomplete=exact.filter(q=>['known_options_only','missing'].includes(q.options_status)||q.type==='choice_options_missing');
        return {kind:incomplete.length?'supplement':'review',label:incomplete.length?'補齊提案':'選項或答案不同，需核對',references:(incomplete.length?incomplete:exact).slice(0,3)};
    }
    const candidates=bank.map(q=>({q,score:Math.max(score(stem,canonical(q.question)),...(q.question_aliases||[]).map(a=>score(stem,canonical(a))))}))
        .filter(x=>x.score>=.72).sort((a,b)=>b.score-a.score).slice(0,3).map(x=>x.q);
    return {kind:candidates.length?'review':'new',label:candidates.length?'相近題目，需核對':'尚未收錄',references:candidates};
}
export function classifyEntries(entries,bank) {
    const seen=new Map();
    entries.forEach((entry,i)=>{
        entry.comparison=classifyContribution(entry.content,bank);
        const key=!entry.error&&contentSignature(entry.content);
        if(key&&seen.has(key))entry.comparison={kind:'duplicate',label:`與本批第 ${seen.get(key)+1} 題重複，已排除`,references:[]};
        if(key&&!seen.has(key))seen.set(key,i);
        if(entry.comparison.kind==='duplicate')entry.selected=false;
    });
    return entries;
}
export function comparisonMarkup(result,{review=false}={}) {
    const links=result.references.map(q=>`<a href="./?subject=${encodeURIComponent(q.subject)}&unit=${encodeURIComponent(q.unit)}&question=${encodeURIComponent(q.id)}" target="_blank" rel="noopener noreferrer">${escapeHtml(q.unit.toUpperCase())} 第 ${escapeHtml(q.id)} 題：${escapeHtml(q.question.slice(0,100))}</a>`).join('');
    return `<div class="contribution-comparison" data-kind="${result.kind}"><strong>${escapeHtml(review&&result.kind==='duplicate'?'題庫已收錄相同內容，請核對是否仍需發布':result.label)}</strong>${links}${result.kind==='supplement'?'<p>管理員可對照原題，選擇取代指定舊題或新增一題。</p>':''}</div>`;
}
export async function readContributionFile(file) {
    if (!file || !/\.html?$/i.test(file.name)) throw new Error('請選擇 .html 或 .htm 檔案。');
    if (file.size > MAX_BATCH_BYTES) throw new Error('每份 HTML 上限 2 MB。');
    return decodeBatchFile(await file.arrayBuffer());
}
export async function importContributionFiles(questionFile,answerFile) {
    const [q,a]=await Promise.all([readContributionFile(questionFile),readContributionFile(answerFile)]);
    return {entries:pairHTML(parseBatchHTML(q.text),parseAnswerHTML(a.text)),warning:[q.warning,a.warning].filter(Boolean).join('；')};
}
export function createContributionBank(service) {
    const cache=new Map(),expires=new Map();
    return async function load(subject,{fresh=false}={}) {
        if(fresh || (expires.get(subject)||0)<Date.now())cache.delete(subject);
        expires.set(subject,Date.now()+15000);
        if(!cache.has(subject))cache.set(subject,(async()=>{
            const units=SUBJECTS.find(s=>s.id===subject)?.units;
            if(!units)throw new Error('請選擇科目。');
            const sets=await Promise.all(units.map(async unit=>{
                let local=[];
                if(unit.dataUrl){const r=await fetch(new URL(unit.dataUrl,import.meta.url),{cache:'no-cache',signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error('內建題庫載入失敗，請稍後重新比對。');local=await r.json();if(!Array.isArray(local))throw new Error('題庫格式不正確。');}
                const shared=[];
                for(let offset=0;offset<50000;offset+=500){
                    const params=new URLSearchParams({select:'id,content',subject_id:'eq.'+subject,unit_id:'eq.'+unit.id,visible:'eq.true',order:'id.asc',limit:'500',offset:String(offset)});
                    const rows=await service.api('/rest/v1/published_questions?'+params,{authenticated:false});
                    if(!Array.isArray(rows))throw new Error('共用題庫載入失敗。');
                    shared.push(...rows.map(r=>({...r.content,id:r.id})));
                    if(rows.length<500) return mergeQuestionVersions(local,await curatePublishedQuestions([...shared,...await loadQuestionReplacements(subject,unit.id)],subject,unit.id)).map(q=>({...q,subject,unit:unit.id}));
                }
                throw new Error('共用題庫超過比對上限。');
            }));
            return sets.flat();
        })().catch(e=>{cache.delete(subject);throw e;}));
        return cache.get(subject);
    };
}

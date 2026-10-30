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
export function inferContributionKind(content, sourceKind) {
    if(!content)return 'unknown';
    if(content.type==='fill_blank')return 'fill';
    if(content.type==='choice')return ['single','multiple'].includes(sourceKind)?sourceKind:answerParts(content).length>1?'multiple':'single';
    return content.type==='short_answer'?'short':'unknown';
}
export function validateContributionChoice(content, sourceKind) {
    if(content?.type!=='choice')return '';
    if(!contentSignature(content))return '正確答案無法完整對應選項，請修正題目、選項或答案。';
    if(sourceKind==='single'&&answerParts(content).length!==1)return '原檔是單選題，但目前有多個正確答案，請核對答案。';
    return '';
}
export function contentSignature(q) {
    const options = (q.options || []).map(optionKey), answers = answerParts(q);
    if (!q.question || !answers.length || q.type === 'disputed' || q.image || ['known_options_only','missing'].includes(q.options_status)) return null;
    if (q.type === 'choice' && (options.length < 2 || new Set(options).size !== options.length || answers.some(a => !options.includes(a)))) return null;
    if (q.type === 'choice_options_missing') return null;
    return JSON.stringify([canonical(q.question),q.type,[...options].sort(),answers]);
}
export function pairHTML(questions, answers) {
    const groups = new Map(), assigned = new Map(), used = new Set();
    questions.forEach((q,i)=>{const key=canonical(q.stem);if(!groups.has(key))groups.set(key,{questions:[],answers:[]});groups.get(key).questions.push(i);});
    answers.forEach((a,i)=>groups.get(canonical(a.stem))?.answers.push(i));
    for(const group of groups.values()) {
        if(group.questions.length===1 && group.answers.length===1){assigned.set(group.questions[0],group.answers[0]);continue;}
        const edges=group.questions.map(qi=>{
            const q=questions[qi];
            return group.answers.flatMap(ai=>{
                const a=answers[ai];if(!a.answer?.trim()||a.answer.includes('[未轉錄圖片]'))return [];
                const c={question:q.stem,options:q.options.map(o=>`${o.label}. ${o.text}`),correct_answer:a.answer,type:'choice'};
                if(q.kind!=='fill'&&validateContributionChoice(c,q.kind))return [];
                // Fill answers remain positional and case-sensitive; choice answers are compared by option text.
                const key=q.kind==='fill'?a.answer.replace(/\r\n?/g,'\n').trim():JSON.stringify(answerParts(c));
                return [{answer:ai,key}];
            });
        });
        function matching(bannedQuestion=-1,bannedKey=null,skipQuestion=-1){
            const owners=new Map();
            function visit(q,seen){
                for(const edge of edges[q]){
                    if((q===bannedQuestion&&edge.key===bannedKey)||seen.has(edge.answer))continue;
                    seen.add(edge.answer);const owner=owners.get(edge.answer);
                    if(owner===undefined||visit(owner,seen)){owners.set(edge.answer,q);return true;}
                }
                return false;
            }
            for(let q=0;q<edges.length;q++)if(q!==skipQuestion)visit(q,new Set());
            return new Map([...owners].map(([a,q])=>[q,a]));
        }
        const baseline=matching();
        group.questions.forEach((qi,i)=>{
            if(!baseline.has(i))return;
            if(baseline.size<group.questions.length&&matching(-1,null,i).size===baseline.size)return;
            const ai=baseline.get(i),key=edges[i].find(e=>e.answer===ai).key;
            // Accept only an always-matched answer meaning that every maximum one-to-one matching agrees on.
            // Identical repeated answers are interchangeable, while conflicting answers stay unresolved.
            if(new Set(edges[i].map(e=>e.key)).size===1||matching(i,key).size<baseline.size)assigned.set(qi,ai);
        });
    }
    const entries=questions.map((input,index) => {
        const answerIndex=assigned.get(index), match=answerIndex===undefined?null:answers[answerIndex];
        let error = input.issues.join('；'), answer = '';
        if (!match?.answer?.trim() || !match?.stem) error += (error ? '；' : '') + '未能唯一確認本題答案，請核對題幹、選項與答案';
        else {
            used.add(answerIndex); answer = match.answer;
            if (answer.includes('[未轉錄圖片]')) error += (error ? '；' : '') + '答案含未轉錄圖片';
        }
        const content = {question:input.stem, options:input.options.map(o => `${o.label}. ${o.text}`), correct_answer:answer,
            type:input.kind==='fill'?'fill_blank':'choice'};
        if (!error && content.type === 'choice' && (!contentSignature(content) || (input.kind==='single' && answerParts(content).length!==1))) error = '正確答案無法完整對應本次選項，請人工核對';
        if (!error && (content.question.length>10000 || answer.length>10000 || content.options.length>12 || content.options.some(o=>o.length>2000))) error='題目、答案或選項超過送審上限';
        return {content,error,number:input.number,sourceKind:input.kind,selected:!error,status:'ready',row:null,message:'',text:asSubmissionText(content)};
    });
    const extra=answers.filter((a,i)=>!used.has(i)&&(!groups.has(canonical(a.stem))||groups.get(canonical(a.stem)).answers.length>groups.get(canonical(a.stem)).questions.length));
    entries.fileIssue=extra.length?`答案頁有 ${extra.length} 筆多出或不對應的答案（第 ${extra.map(a=>a.number).join('、')} 題）。已配對的答案仍會顯示；請確認兩份檔案，本批暫不送出。`:'';
    return entries;
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
    const entries=pairHTML(parseBatchHTML(q.text),parseAnswerHTML(a.text));
    return {entries,fileIssue:entries.fileIssue,warning:[q.warning,a.warning].filter(Boolean).join('；')};
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

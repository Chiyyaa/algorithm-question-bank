import { importContributionFiles, classifyEntries, comparisonMarkup } from './collaboration-import.js?v=20261030-collab-html1';
import { parseDraft } from './custom-questions.js?v=20261017-formats1';
import { escapeHtml } from './utils.js?v=20261017-formats1';

export const BATCH_LIMIT = 100;
export const MAX_BATCH_TEXT = 6000000;
export const MAX_SUBMISSION_TEXT = 60000;

export function normalizeBatchText(text) {
    return String(text).replace(/\r\n?/g, '\n')
        .replace(/\*\*(題目|你的答案|正確答案|選項|得分)[：:]\*\*/g, '$1：')
        .replace(/^[ \t]*(?:第[ \t]*\d+[ \t]*題|\d+[.．、)）])[ \t]*[：:|｜]?[ \t]*(?:\n[ \t]*)?(?=題目[：:])/gm, '');
}

export function questionCount(text) {
    return [...normalizeBatchText(text).matchAll(/^[ \t]*題目[：:]/gm)].length;
}

export function parseSubmission(text, format = 'auto') {
    if (String(text).length > MAX_SUBMISSION_TEXT) throw new Error('單題原始內容超過 60000 字元，請整理後再提交。');
    const q = parseDraft(text, { format, retainAnswer:true });
    if (q.question.length > 10000 || q.correct_answer.length > 10000 || (q.user_answer || '').length > 10000 || q.options.length > 12 || q.options.some(o => o.length > 2000)) {
        throw new Error('題目、答案或選項過長，請分開整理後再提交。');
    }
    return q;
}

export function parseBatch(text, format = 'no_options') {
    if (String(text).length > MAX_BATCH_TEXT) throw new Error('整批內容超過 6000000 字元，請分批貼上。原始文字尚未送出。');
    const normalized = normalizeBatchText(text).trim();
    const headings = [...normalized.matchAll(/^[ \t]*題目[：:]/gm)];
    if (!headings.length) throw new Error('每題請以「題目：」開頭，並包含「正確答案：」。');
    if (normalized.slice(0, headings[0].index).trim()) throw new Error('第一題前有未歸屬的文字，請移除或移入第一題後再預覽。');
    if (headings.length > BATCH_LIMIT) throw new Error(`一次最多預覽 ${BATCH_LIMIT} 題，目前有 ${headings.length} 題，請分批貼上。每個帳號每小時最多新增 300 題。`);
    return headings.map((heading, i) => {
        const text = normalized.slice(heading.index, headings[i + 1]?.index ?? normalized.length)
            .trim().replace(/\n[ \t]*[-=─━]{3,}[ \t]*$/, '').trim();
        let content = null, error = '';
        try { content = parseSubmission(text, format); } catch (e) { error = e.message; }
        return { text, format, content, error, selected:true, status:'ready', row:null, message:'' };
    });
}

export function contentKey(content) {
    if (!content) return '';
    return JSON.stringify({ question:content.question, options:content.options, correct_answer:content.correct_answer,
        type:content.type, user_answer:content.user_answer || '' });
}

export function createBatchEditor({ loadBank, service, getMember, getEditing, notify, refresh, run, isBusy }) {
    const $ = id => document.getElementById(id);
    let batch = null;
    const labels = {ready:'待處理', draft:'草稿已儲存', pending:'已送出審核', published:'已發布', error:'送出失敗', uncertain:'結果待查核'};
    const locked = entry => ['pending','published','uncertain'].includes(entry.status) || entry.comparison?.kind==='duplicate';
    function duplicates() {
        if(batch.imported)classifyEntries(batch.entries,batch.bank);
        const seen = new Map();
        for (const [i, entry] of batch.entries.entries()) {
            const key = contentKey(entry.content);
            entry.warning = key && seen.has(key) ? `與第 ${seen.get(key) + 1} 題內容相同，請確認是否需要重複送出。` : '';
            if (key && !seen.has(key)) seen.set(key, i);
        }
    }
    function body(entry) {
        const comparison=entry.comparison ? comparisonMarkup(entry.comparison) : '';
        if (entry.error) return `${comparison}<p class="batch-error" role="alert">${escapeHtml(entry.error)}</p><pre class="batch-question">${escapeHtml(entry.text)}</pre>`;
        const q = entry.content;
        return `${comparison}<div class="batch-question">${escapeHtml(q.question)}</div>${q.options.length ? `<div class="batch-options">${q.options.map(o => `<div>${escapeHtml(o)}</div>`).join('')}</div>` : ''}<div class="batch-answer"><strong>正確答案：</strong><span>${escapeHtml(q.correct_answer)}</span></div>${q.user_answer ? `<p class="help-text">你的答案：${escapeHtml(q.user_answer)}</p>` : ''}${entry.warning ? `<p class="batch-warning">${escapeHtml(entry.warning)}</p>` : ''}`;
    }
    function summary() {
        if (!batch) return;
        const selected = batch.entries.filter(e => e.selected);
        const invalid = (batch.imported ? batch.entries : selected).filter(e => e.error).length;
        const pending = batch.entries.filter(e => ['pending','published'].includes(e.status)).length;
        const drafts = batch.entries.filter(e => e.status === 'draft').length;
        const uncertain = batch.entries.filter(e => e.status === 'uncertain').length;
        $('batchSummary').textContent = `共 ${batch.entries.length} 題 · 已勾選 ${selected.length} 題 · 格式錯誤 ${invalid} 題 · 已送審 ${pending} 題 · 草稿 ${drafts} 題${batch.imported ? ` · 重複排除 ${batch.entries.filter(e=>e.comparison?.kind==='duplicate').length} 題` : ''}`;
        $('batchReconcile').hidden = !uncertain;
        syncControls();
    }
    function render() {
        if (!batch) return;
        duplicates();
        $('batchPreview').hidden = false;
        $('batchDestination').textContent = batch.destinationLabel;
        $('batchItems').innerHTML = batch.entries.map((entry, i) => `<article class="batch-item" data-batch-index="${i}"><div class="section-heading"><label class="batch-check"><input type="checkbox" data-batch-select="${i}"${entry.selected ? ' checked' : ''}${locked(entry) || isBusy() ? ' disabled' : ''}>第 ${i + 1} 題</label><span class="status-pill" data-batch-status="${i}">${entry.error ? '格式需修正' : labels[entry.status]}</span></div><div data-batch-body="${i}">${body(entry)}</div><p class="batch-entry-message" data-batch-message="${i}" role="status">${escapeHtml(entry.message)}</p><details class="batch-edit"><summary>修改第 ${i + 1} 題</summary><label for="batchFormat-${i}">第 ${i + 1} 題格式</label><select id="batchFormat-${i}" data-batch-format="${i}"${locked(entry) || isBusy() ? ' disabled' : ''}><option value="no_options"${entry.format === 'no_options' ? ' selected' : ''}>無選項</option><option value="with_options"${entry.format === 'with_options' ? ' selected' : ''}>含選項</option><option value="auto"${entry.format === 'auto' ? ' selected' : ''}>自動辨識</option></select><label for="batchText-${i}">第 ${i + 1} 題內容</label><textarea id="batchText-${i}" data-batch-text="${i}" rows="7"${locked(entry) ? ' readonly' : ''}${isBusy() ? ' disabled' : ''}>${escapeHtml(entry.text)}</textarea></details></article>`).join('');
        if(batch.imported){
            const excluded=[...$('batchItems').querySelectorAll('.batch-item')].filter(host=>batch.entries[Number(host.dataset.batchIndex)].comparison?.kind==='duplicate');
            if(excluded.length){const details=document.createElement('details');details.className='excluded-contributions';const title=document.createElement('summary');title.textContent='已排除 '+excluded.length+' 題重複題目（展開查看）';details.append(title,...excluded);$('batchItems').append(details);}
        }
        summary();
    }
    function syncControls() {
        const active = !!batch, busy = isBusy();
        $('submissionDraft').readOnly = active;
        for(const id of ['contributionQuestionFile','contributionAnswerFile','importContribution']) $(id).disabled=active||busy||!!getEditing();
        for (const id of ['submissionSubject','submissionUnit','submissionFormat','openUnitDialog']) $(id).disabled = active || busy;
        $('previewSubmissions').disabled = active || busy || !!getEditing();
        $('saveSubmission').textContent = active ? '批次儲存草稿' : '儲存草稿';
        $('submitForReview').textContent = active ? '批次送出審核' : '送出審核';
        for (const id of ['closeBatchPreview','batchReconcile']) $(id).disabled = busy;
        if (batch) {
            for (const [i, entry] of batch.entries.entries()) {
                for (const attr of ['select','format','text']) {
                    const element = document.querySelector(`[data-batch-${attr}="${i}"]`);
                    if (element) element.disabled = busy || locked(entry);
                }
            }
        }
    }
    function preview() {
        if (getEditing()) throw new Error('編輯既有草稿時只能修改該題。請先開新草稿，再貼上多題。');
        if (batch) return;
        const entries = parseBatch($('submissionDraft').value, $('submissionFormat').value);
        batch = { entries, subject:$('submissionSubject').value, unit:$('submissionUnit').value,
            author:getMember().user_id, baseline:null, destinationLabel:$('submissionSubject').selectedOptions[0].textContent + '｜' + $('submissionUnit').selectedOptions[0].textContent };
        $('batchProgress').textContent = '請逐題檢查、修正或取消勾選，再按下方的批次送出。';
        render();
        notify(`已拆成 ${entries.length} 題，請逐題預覽後再批次送審。`);
    }
    async function importHTML(){
        if(batch||getEditing())throw new Error('請先結束目前預覽或開新草稿，再匯入檔案。');
        $('importStatus').textContent='正在解析檔案並載入題庫……';
        try{
            const result=await importContributionFiles($('contributionQuestionFile').files[0],$('contributionAnswerFile').files[0]);
            const subject=$('submissionSubject').value,unit=$('submissionUnit').value;
            const bank=await loadBank(subject,{fresh:true});
            classifyEntries(result.entries,bank);
            batch={entries:result.entries,subject,unit,bank,imported:true,author:getMember().user_id,baseline:null,destinationLabel:$('submissionSubject').selectedOptions[0].textContent+'｜'+unit.toUpperCase()};
            $('batchProgress').textContent='已排除確認重複的題目。請檢查留下的新增／補齊提案，再送出審核。';
            $('manualContribution').open=false;
            $('importStatus').textContent=result.warning||'比對完成；尚未送出任何題目。';render();
        }catch(e){$('importStatus').textContent='未完成匯入，沒有送出任何題目。';throw e;}
    }
    $('importContribution').addEventListener('click',()=>run(importHTML));
    function clear({ preserve = false, force = false } = {}) {
        if (batch && !force && batch.entries.some(e => e.status === 'uncertain')) {
            notify('還有送出結果待查核的題目，請先查核，避免重複送出。', true); return false;
        }
        if (batch && !force && batch.entries.some(e => e.row && !['pending','published'].includes(e.status) && contentKey(e.content) !== contentKey(e.row.content))) {
            notify('已儲存草稿的修改尚未儲存，請先批次儲存草稿，再關閉預覽。', true); return false;
        }
        if (batch && preserve) $('submissionDraft').value = batch.entries.filter(e => !e.row && e.comparison?.kind!=='duplicate').map(e => e.text).join('\n\n');
        batch = null; $('contributionQuestionFile').value='';$('contributionAnswerFile').value='';$('importStatus').textContent=''; $('batchPreview').hidden = true; $('batchItems').replaceChildren();
        $('batchProgress').textContent = ''; syncControls(); return true;
    }
    async function recent() {
        if (!getMember() || getMember().user_id !== batch.author) throw new Error('登入身分已變更，請重新登入後整理題目。');
        return service.listSubmissions({ author:batch.author });
    }
    async function send(submit) {
        if (!batch) return;
        if(batch.imported){
            $('batchProgress').textContent='正在重新確認目前題庫，避免重複送審……';
            const bank=await loadBank(batch.subject,{fresh:true});
            batch.bank=bank;classifyEntries(batch.entries,bank);render();
        }
        const entries = batch.entries.filter(e => e.comparison?.kind!=='duplicate' && e.selected && !['pending','published'].includes(e.status) && (submit || e.status !== 'draft'));
        if (batch.entries.some(e => e.status === 'uncertain')) throw new Error('有送出結果待查核的題目，請先按「查核送出狀態」。');
        if (!entries.length) throw new Error('沒有需要處理的勾選題目。已成功的題目不會重送。');
        if (entries.some(e => e.error || !e.content)) throw new Error('勾選的題目仍有格式錯誤，請先修正或取消勾選。');
        if (!batch.baseline) batch.baseline = new Set((await recent()).map(row => row.id));
        let success = 0, failure = null;
        for (const [index, entry] of entries.entries()) {
            $('batchProgress').textContent = `正在${submit ? '送審' : '儲存'}第 ${index + 1} / ${entries.length} 題……請勿關閉頁面。`;
            try {
                const row = await service.rpc('save_question_submission', { p_id:entry.row?.id || null, p_subject:batch.subject, p_unit:batch.unit,
                    p_content:entry.content, p_submit:submit, p_revision:entry.row?.revision || null });
                if (!row?.id || !['draft','pending'].includes(row.status)) throw new Error('伺服器回應不完整，請查核送出結果。');
                entry.row = row; entry.status = row.status; entry.message = ''; batch.baseline.add(row.id); success++;
            } catch (error) {
                entry.status = error.definitive === true ? 'error' : 'uncertain';
                entry.message = error.message + (entry.status === 'uncertain' ? ' 可能已儲存，查核前不會自動重送。' : ' 已成功的其他題目會保留，可修正後只重試尚未成功的題目。');
                failure = error; render(); break;
            }
            render();
        }
        $('batchProgress').textContent = `本次成功 ${success} 題${failure ? '，已暫停；其餘題目保留在預覽中。' : '。等待管理員審核。'}`;
        if(batch.imported)$('importStatus').textContent=submit ? `已送審 ${batch.entries.filter(e=>['pending','published'].includes(e.status)).length} 題，核准後才會公開。` : '草稿已保留，尚未送審。';
        try { await refresh(); } catch { notify('送出狀態已保留，但列表暫時無法更新，請稍後重新整理。', true); }
        notify(failure ? `本次成功 ${success} 題後暫停，請查看各題狀態。` : `本次已${submit ? '送出審核' : '儲存草稿'} ${success} 題。`, !!failure);
    }
    async function reconcile() {
        if (!batch) return;
        const rows = await recent();
        for (const entry of batch.entries.filter(e => e.status === 'uncertain')) {
            const matches = entry.row ? rows.filter(r => r.id === entry.row.id) : rows.filter(r => !batch.baseline.has(r.id) && r.subject_id === batch.subject && r.unit_id === batch.unit && contentKey(r.content) === contentKey(entry.content));
            if (matches.length === 1) {
                const row = matches[0]; entry.row = row; batch.baseline.add(row.id);
                entry.status = ['pending','published'].includes(row.status) ? row.status : contentKey(row.content) === contentKey(entry.content) ? 'draft' : 'ready';
                entry.message = '已查核伺服器狀態。';
            } else entry.message = '尚無法唯一確認送出結果。請稍後再查核或在「我的題目」確認；目前不會重送此題。';
        }
        render(); await refresh();
        notify(batch.entries.some(e => e.status === 'uncertain') ? '仍有題目待查核，為避免重複新增，暫停重送。' : '已完成查核，可繼續處理尚未成功的題目。');
    }
    $('previewSubmissions').addEventListener('click', () => run(preview));
    $('closeBatchPreview').addEventListener('click', () => clear({preserve:true}));
    $('batchReconcile').addEventListener('click', () => run(reconcile));
    $('batchItems').addEventListener('input', event => {
        if (!batch || isBusy()) return;
        const target = event.target;
        const index = target.dataset.batchText ?? target.dataset.batchFormat ?? target.dataset.batchSelect;
        if (index === undefined) return;
        const entry = batch.entries[Number(index)]; if (!entry || locked(entry)) return;
        if (target.dataset.batchSelect !== undefined) entry.selected = target.checked;
        else {
            if (target.dataset.batchText !== undefined) entry.text = target.value; else entry.format = target.value;
            try { entry.content = parseSubmission(entry.text, entry.format); entry.error = ''; } catch (e) { entry.content = null; entry.error = e.message; }
            entry.status = 'ready'; entry.message = '';
            duplicates();
            batch.entries.forEach((e, i) => {
                document.querySelector(`[data-batch-body="${i}"]`).innerHTML = body(e);
                document.querySelector(`[data-batch-status="${i}"]`).textContent = e.error ? '格式需修正' : labels[e.status];
                document.querySelector(`[data-batch-message="${i}"]`).textContent = e.message;
            });
        }
        summary();
    });
    return { preview, send, clear, syncControls, has:() => !!batch };
}

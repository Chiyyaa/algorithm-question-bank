import { initPractice } from './practice.js?v=20261029-focus1';
import { curatePublishedQuestions } from './question-curation.js?v=20261029-u7bank';
import { escapeHtml, normalize, highlight, searchableText, getTypeLabel } from "./utils.js?v=20261017-formats1";
import { mistakenAnswer } from "./custom-questions.js?v=20261029-no-private";
import { initNavigation } from "./navigation.js";
import { SUBJECTS, getUnit, mergeCollaborationUnits } from "./units.js?v=20261029-muji2";
import { initMusic } from "./music.js";
import { loadPublishedQuestions, collaborationEnabled, publishedCounts } from "./collaboration-api.js?v=20261017-formats1";
import { initAppearance, initHomeMotion } from './appearance.js?v=20261029-muji2';
import { initBatch } from './batch.js?v=20261030-batch1';
import { batchQuestionHref } from './batch-core.js?v=20261030-batch1';

initAppearance();
const { close: closeMusic } = initMusic();
const clearHomeMotion = initHomeMotion();

const QUESTIONS = [];
const sharedCounts = new Map();
let currentSubject = null;
let currentUnit = null;
let requestVersion = 0;
let loading = false;
let ready = false;
let pendingQuestionTarget = null;
const { updateBackToTop, setSidebarOpen } = initNavigation({
    onSelectUnit: selectUnit,
    onLeaveSubject: leaveSubject
});
const practice = initPractice({
    getContext: () => ({subjectId: currentSubject?.id, unitId: currentUnit?.id}),
    onVerificationFailed() {
        history.replaceState({ ...history.state, questionBank: { view: 'home' } }, '');
        leaveSubject(true);
    },
    async loadQuestions(subjectId, unitId) {
        if (subjectId !== 'algorithm' || !['u6','u7'].includes(unitId)) throw new Error('目前僅開放演算法 U6、U7。');
        const unit = getUnit(subjectId, unitId);
        const response = await fetch(new URL(unit.dataUrl, import.meta.url), {cache:'no-cache'});
        if (!response.ok) throw new Error('題庫無法載入，請稍後重試。');
        const builtIn = await response.json();
        if (!Array.isArray(builtIn) || !builtIn.length) throw new Error('題庫格式不正確。');
        const shared = await curatePublishedQuestions(await loadPublishedQuestions(subjectId, unitId), subjectId, unitId);
        return [...builtIn, ...shared];
    }
});
const PAGE_SIZE = 25;
const batch = initBatch({
    getUnits: subject => SUBJECTS.find(s => s.id === subject)?.units.filter(u => u.dataUrl || u.sharedOnly) || [],
    async loadUnit(subjectId, unitId) {
        const unit = getUnit(subjectId, unitId);
        if (!unit) throw new Error('單元不存在。');
        let builtIn = [];
        if (unit.dataUrl) {
            const response = await fetch(new URL(unit.dataUrl, import.meta.url), {cache:'no-cache',signal:AbortSignal.timeout(15000)});
            if (!response.ok) throw new Error('題庫無法載入。');
            builtIn = await response.json();
            if (!Array.isArray(builtIn) || builtIn.some(q => !q || !Number.isSafeInteger(q.id) || typeof q.question !== 'string' || typeof q.correct_answer !== 'string')) throw new Error('題庫格式不正確。');
        }
        try {
            const shared = await curatePublishedQuestions(await loadPublishedQuestions(subjectId, unitId), subjectId, unitId);
            return {questions:[...builtIn,...shared],warning:''};
        } catch { return {questions:builtIn,warning:'共用題庫暫時無法載入，目前僅比對內建題目。'}; }
    },
    onOpenQuestion(target) { enterSubject(target.subject, target.unit, true, target.id); }
});
let currentPage = 1;
let currentFilter = "all";
const answersVisible = new Set();
const answersHidden = new Set();
const ANSWER_DISPLAY_KEY = "question_bank_answers_shown_v1";
let answersShown = false;
try { answersShown = localStorage.getItem(ANSWER_DISPLAY_KEY) === "true"; } catch { /* Session-only fallback. */ }

function setAnswersShown(shown) {
    answersShown = shown;
    answersVisible.clear();
    answersHidden.clear();
    try { localStorage.setItem(ANSWER_DISPLAY_KEY, String(shown)); } catch { /* Keep controls usable without storage. */ }
    render();
}

const searchInput = document.getElementById("searchInput");
const list = document.getElementById("questionList");
const summary = document.getElementById("summary");

function getFilteredQuestions() {
    const term = normalize(searchInput.value);
    return QUESTIONS.filter(q => {
        const typeMatch = currentFilter === "all" || (currentFilter === 'shared' && q.shared_question) || q.type === currentFilter ||
            (currentFilter === "choice" && q.type === "choice_options_missing");
        const textMatch = !term || searchableText(q).includes(term);
        return typeMatch && textMatch;
    });
}

function render() {
    const term = normalize(searchInput.value);
    const filtered = getFilteredQuestions();

    const pageCount = Math.ceil(filtered.length / PAGE_SIZE);
    currentPage = Math.max(1, Math.min(currentPage, pageCount || 1));
    const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
    document.getElementById("pageInfo").textContent =
        `第 ${pageCount ? currentPage : 0} / ${pageCount} 頁`;
    document.getElementById("prevPageBtn").disabled = currentPage <= 1;
    document.getElementById("nextPageBtn").disabled = currentPage >= pageCount;
    summary.textContent =
        `目前顯示 ${pageItems.length} / ${filtered.length} 題`;

    if (!filtered.length) {
        list.innerHTML = `<div class="empty">找不到符合條件的題目，試試其他關鍵字。</div>`;
        updateBackToTop();
        return;
    }

    list.innerHTML = pageItems.map(q => {
        const alwaysShowAnswer = q.type === "choice_options_missing";
        const answerShown = alwaysShowAnswer || answersVisible.has(q.id) || (answersShown && !answersHidden.has(q.id));
        const options = q.options || [];

        const partialOptionsNote = q.options_status === "known_options_only"
            ? '<div class="help-text">僅列來源已提供的選項；編號依本頁順序編排，不代表原試卷順序。</div>'
            : "";
        const optionsHtml = options.length
            ? `<div class="options">${options.map(o =>
                `<div class="option">${highlight(o, term)}</div>`
              ).join("")}</div>`
            : (q.type === "choice_options_missing"
                ? `<div class="missing">這題的原始訓練紀錄沒有保存完整選項，因此未自行補寫。</div>`
                : "");


        return `
        <article class="question-card" data-id="${q.id}">
            <div class="card-top">
                <div class="number">#${q.id}</div>
                <div class="badges">
                    <span class="badge">${escapeHtml(getTypeLabel(q.type))}</span>
                    ${q.shared_question ? '<span class="badge user-badge">友列協助題</span>' : ''}
                </div>
            </div>

            <div class="title">${highlight(q.title || "", term)}</div>
            <div class="question">${highlight(q.question || "", term)}</div>

            ${q.type === "disputed" ? '<div class="missing">本題原標準答案含爭議項，請留意答案下方提醒。</div>' : ""}
            ${q.image && q.image.startsWith("../images/") ? `<img class="question-image" src="${escapeHtml(new URL(q.image, import.meta.url).href)}" alt="${escapeHtml(q.image_alt || "題目附圖")}" loading="lazy" style="display:block;max-width:100%;height:auto;margin:1rem 0">` : ""}
            ${optionsHtml}
            ${partialOptionsNote}

            ${alwaysShowAnswer ? "" : `<button class="answer-btn" type="button"
                    aria-expanded="${answerShown}" data-toggle-answer="${q.id}">
                ${answerShown ? "隱藏答案" : (q.type === "disputed" ? "顯示原標準答案與提醒" : "顯示正確答案")}
            </button>`}

            <div class="answer ${answerShown ? "show" : ""} ${alwaysShowAnswer ? "always-visible" : ""}">
                <div class="answer-label">${q.type === "disputed" ? "題庫原標準答案（含爭議項）：" : "正確答案："}</div>
                <div class="answer-content">${highlight(q.correct_answer || "未記錄", term)}</div>
                ${q.answer_note ? `<div class="answer-note">${escapeHtml(q.answer_note)}</div>` : ""}
                ${mistakenAnswer(q) ? `<div class="answer-note">曾有作答錯誤：${escapeHtml(mistakenAnswer(q))}</div>` : ''}
            </div>

            <div class="meta">
                題型：${escapeHtml(getTypeLabel(q.type))}
            </div>
        </article>`;
    }).join("");
    updateBackToTop();
}

function toggleAnswer(id) {
    const question = QUESTIONS.find(q => q.id === id);
    if (!question || question.type === "choice_options_missing") return;
    const shown = answersVisible.has(id) || (answersShown && !answersHidden.has(id));
    if (shown) {
        answersVisible.delete(id);
        answersHidden.add(id);
    } else {
        answersVisible.add(id);
        answersHidden.delete(id);
    }
    render();
}

function resetPagination() {
    currentPage = 1;
    render();
}
searchInput.addEventListener("input", resetPagination);

function changePage(offset) {
    currentPage += offset;
    render();
    document.querySelector(".toolbar").scrollIntoView({ block: "start" });
}
document.getElementById("prevPageBtn").addEventListener("click", () => changePage(-1));
document.getElementById("nextPageBtn").addEventListener("click", () => changePage(1));

document.getElementById("clearBtn").addEventListener("click", () => {
    searchInput.value = "";
    searchInput.focus();
    resetPagination();
});

document.querySelectorAll(".filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        currentFilter = btn.dataset.filter;
        resetPagination();
    });
});

document.getElementById("showAllBtn").addEventListener("click", () => {
    setAnswersShown(true);
});

document.getElementById("hideAllBtn").addEventListener("click", () => {
    setAnswersShown(false);
});



list.addEventListener("click", event => {
    const button = event.target.closest("[data-toggle-answer]");
    if (button) toggleAnswer(Number(button.dataset.toggleAnswer));
});

function renderUnitChoices() {
    if (!currentSubject) return;
    document.getElementById("unitGrid").innerHTML = currentSubject.units.map(unit => {
        const active = unit.id === currentUnit?.id;
        const available = !!unit.dataUrl || !!unit.sharedOnly;
        return `<button class="unit-card ${active ? "active" : ""}" data-unit="${escapeHtml(unit.id)}"
            type="button" ${available ? "" : "disabled"} ${active ? 'aria-current="true"' : ""}>
            <span class="unit-card-top"><span class="unit-card-name">${escapeHtml(unit.name)}</span>
            <span class="unit-card-status">${active ? "目前單元" : available ? "可練習" : "尚未開放"}</span></span>
            <span class="unit-card-count">${available ? `<strong>${unit.questionCount + (sharedCounts.get(currentSubject.id + ':' + unit.id) || 0)}</strong> 題` : "準備中"}</span>
            <span class="unit-card-action">${active ? "繼續練習" : available ? "進入題庫" : "敬請期待"}<span aria-hidden="true">${available ? "↗" : "—"}</span></span>
        </button>`;
    }).join("");
}
const publishedUnitsReady = collaborationEnabled() ? publishedCounts().then(rows => {
    mergeCollaborationUnits(rows.filter(row => Number(row.question_count)>0));
    const curated = row => (['os','algorithm'].includes(row.subject_id) && row.unit_id === 'u6') ||
        (row.subject_id === 'algorithm' && row.unit_id === 'u7');
    rows.forEach(row => sharedCounts.set(row.subject_id + ':' + row.unit_id, curated(row) ? 0 : Number(row.question_count)));
    renderUnitChoices();
    for (const row of rows.filter(curated)) {
        const subject=row.subject_id, unit=row.unit_id;
        loadPublishedQuestions(subject, unit)
            .then(questions => curatePublishedQuestions(questions, subject, unit))
            .then(questions => { sharedCounts.set(subject+':'+unit, questions.length); renderUnitChoices(); })
            .catch(() => { /* Keep the classified count unavailable until a successful retry. */ });
    }
}).catch(() => { /* Built-in counts remain available if the shared service is offline. */ }) : Promise.resolve();

function selectUnit(unitId) {
    const unit = getUnit(currentSubject?.id, unitId);
    if (!unit) return;
    if (unit === currentUnit && ready) return;
    currentUnit = unit;
    ready = false;
    loading = false;
    requestVersion++;
    QUESTIONS.length = 0;
    answersVisible.clear();
    answersHidden.clear();
    searchInput.value = "";
    currentFilter = "all";
    currentPage = 1;
    document.querySelectorAll(".filter-btn").forEach(button =>
        button.classList.toggle("active", button.dataset.filter === "all"));
    const label = currentSubject.name + "｜" + unit.name;
    document.getElementById("currentUnitLabel").textContent = label;
    document.getElementById("bankFooter").textContent = "";
    document.title = label + " 題庫";
    renderUnitChoices();
    if (history.state?.questionBank?.view === "bank") {
        history.replaceState({ ...history.state, questionBank: { view: "bank", subjectId: currentSubject.id, unitId: unit.id, ...(pendingQuestionTarget ? {questionId:pendingQuestionTarget.id} : {}) } }, "", pendingQuestionTarget ? batchQuestionHref(pendingQuestionTarget) : location.pathname);
    }
    loadQuestionBank();
}

function leaveSubject(fromHistory = false) {
    if (!fromHistory && history.state?.questionBank?.view === "bank") { history.back(); return; }
    setSidebarOpen(false);
    requestVersion++;
    loading = false;
    ready = false;
    currentSubject = null;
    currentUnit = null;
    pendingQuestionTarget = null;
    practice.setSubject(null);
    batch.setSubject(null);
    QUESTIONS.length = 0;
    answersVisible.clear();
    answersHidden.clear();
    document.getElementById("studyShell").hidden = true;
    document.getElementById("sidebar").hidden = true;
    document.getElementById("mobileMenuBtn").hidden = true;
    document.getElementById("subjectHome").hidden = false;
    document.body.classList.add("home-mode");
    delete document.body.dataset.subject;
    document.title = "學習題庫";
    window.scrollTo({ top: 0, behavior: "instant" });
    updateBackToTop();
    document.getElementById("subjectHeading").focus({ preventScroll: true });
}

history.replaceState({ ...history.state, questionBank: { view: "home" } }, "");
window.addEventListener("popstate", event => {
    if (event.state?.questionBank?.view === "bank") enterSubject(event.state.questionBank.subjectId || "algorithm", event.state.questionBank.unitId, false, event.state.questionBank.questionId);
    else leaveSubject(true);
});

function enterSubject(subjectId, unitId, pushHistory = true, questionId = null) {
    if (questionId != null && (!Number.isSafeInteger(questionId) || questionId < 1 || !getUnit(subjectId, unitId))) return;
    currentSubject = SUBJECTS.find(subject => subject.id === subjectId && subject.available);
    if (!currentSubject) return;
    pendingQuestionTarget = questionId != null ? {subject:subjectId,unit:unitId,id:questionId} : null;
    practice.setSubject(currentSubject.id);
    batch.setSubject(currentSubject.id);
    const selected = getUnit(currentSubject.id, unitId) || getUnit(currentSubject.id, currentSubject.defaultUnit);
    const bankState = {view:'bank',subjectId:currentSubject.id,unitId:selected.id,...(pendingQuestionTarget ? {questionId} : {})};
    if (pushHistory) history.pushState({ ...history.state, questionBank: bankState }, "", pendingQuestionTarget ? batchQuestionHref(pendingQuestionTarget) : location.pathname);
    else history.replaceState({ ...history.state, questionBank: bankState }, "");
    document.body.dataset.subject = currentSubject.id;
    document.getElementById("bankHeading").textContent = currentSubject.name + "題庫搜尋系統";
    document.getElementById("unitSubjectDescription").textContent = currentSubject.name + " · 選擇今天的練習單元";
    const brand = document.querySelector(".sidebar-brand");
    brand.textContent = currentSubject.name + "題庫";
    if (currentSubject.id === "algorithm") brand.setAttribute("href", "https://canva.link/evygbbmrt3v2umy");
    else brand.removeAttribute("href");
    closeMusic(false);
    clearHomeMotion();
    document.body.classList.remove("home-mode");
    document.getElementById("subjectHome").hidden = true;
    document.getElementById("studyShell").hidden = false;
    document.getElementById("sidebar").hidden = false;
    document.getElementById("mobileMenuBtn").hidden = false;
    document.querySelector('.nav-btn[data-panel="bank"]').click();
    selectUnit(selected.id);
    setSidebarOpen(questionId != null ? matchMedia('(min-width: 851px)').matches : true);
    document.getElementById("bankHeading").focus({ preventScroll: true });
    if (ready) revealQuestionTarget();
}
document.getElementById("algorithmSubjectBtn").addEventListener("click", () => enterSubject("algorithm"));
 document.getElementById("osSubjectBtn").addEventListener("click", () => enterSubject("os"));

async function loadQuestionBank() {
    if (loading || ready || !currentUnit) return;
    const version = requestVersion;
    const unit = currentUnit;
    const subject = currentSubject;
    loading = true;
    const controls = document.querySelectorAll(
        ".toolbar button, #searchInput, #prevPageBtn, #nextPageBtn"
    );
    controls.forEach(control => { control.disabled = true; });
    summary.textContent = "題庫載入中……";
    list.innerHTML = '<div class="empty" role="status">題庫載入中……</div>';
    try {
        let builtInQuestions = [];
        if (unit.dataUrl) {
            const response = await fetch(new URL(unit.dataUrl, import.meta.url), { cache: "no-cache" });
            if (!response.ok) throw new Error("HTTP " + response.status);
            builtInQuestions = await response.json();
        }
        if (!Array.isArray(builtInQuestions) || (unit.dataUrl && !builtInQuestions.length) ||
            builtInQuestions.some(q => !q || !Number.isFinite(q.id) ||
                typeof q.question !== "string" || typeof q.correct_answer !== "string") ||
            new Set(builtInQuestions.map(q => q.id)).size !== builtInQuestions.length) {
            throw new Error("Invalid question data");
        }
        if (version !== requestVersion) return;
        let sharedQuestions = [], sharedFailed = false;
        try { sharedQuestions = await curatePublishedQuestions(await loadPublishedQuestions(subject.id, unit.id), subject.id, unit.id); }
        catch { sharedFailed = true; }
        if (version !== requestVersion) return;
        QUESTIONS.push(...builtInQuestions, ...sharedQuestions);
        if (!sharedFailed && collaborationEnabled()) { sharedCounts.set(subject.id + ':' + unit.id, sharedQuestions.length); renderUnitChoices(); }
        document.getElementById("bankFooter").textContent =
            subject.name + "｜" + unit.name + "｜內建 " + builtInQuestions.length + " 題" +
            (collaborationEnabled() ? "｜共用 " + sharedQuestions.length + " 題" : "");
        if (sharedFailed) {
            const warning = document.createElement("p"); warning.className = "missing"; warning.setAttribute("role", "status");
            warning.append("共用題庫暫時無法載入，目前僅顯示內建題目。 ");
            const retry = document.createElement("button"); retry.type = "button"; retry.textContent = "重試共用題庫";
            retry.addEventListener("click", () => { if (loading) return; ready = false; QUESTIONS.length = 0; loadQuestionBank(); });
            warning.append(retry); document.getElementById("bankFooter").append(warning);
        }
        ready = true;
        controls.forEach(control => { control.disabled = false; });
        render();
        revealQuestionTarget();
    } catch (error) {
        if (version !== requestVersion) return;
        console.error("Question bank could not be loaded:", error);
        summary.textContent = "題庫尚未載入";
        list.innerHTML = '<div class="empty" role="alert">題庫載入失敗，請檢查網路後重試。<br><button id="retryLoadBtn" type="button">重新載入</button></div>';
        document.getElementById("retryLoadBtn").addEventListener("click", loadQuestionBank);
        updateBackToTop();
    } finally {
        if (version === requestVersion) loading = false;
    }
}

function revealQuestionTarget() {
    const target = pendingQuestionTarget;
    if (!target || target.subject !== currentSubject?.id || target.unit !== currentUnit?.id || !ready) return;
    pendingQuestionTarget = null;
    const index = QUESTIONS.findIndex(q => q.id === target.id);
    if (index < 0) {
        const notice = document.createElement('p');notice.className='missing';notice.setAttribute('role','status');
        notice.textContent='這個連結的題目目前沒有載入，可能已更新，或共用題庫暫時無法連線。';
        document.getElementById('bankFooter').append(notice);return;
    }
    searchInput.value='';currentFilter='all';currentPage=Math.floor(index/PAGE_SIZE)+1;
    document.querySelectorAll('.filter-btn').forEach(button=>button.classList.toggle('active',button.dataset.filter==='all'));
    answersHidden.delete(target.id);answersVisible.add(target.id);render();
    const card=list.querySelector('[data-id="'+target.id+'"]');
    if(card){card.classList.add('batch-target');card.tabIndex=-1;card.style.scrollMarginTop=(document.querySelector('.toolbar').offsetHeight+90)+'px';card.focus({preventScroll:true});card.scrollIntoView({block:'start',behavior:'instant'});}
    if(matchMedia('(max-width: 850px)').matches)setSidebarOpen(false);
}

const linkParams = new URLSearchParams(location.search);
const initialQuestionLink = {subject:linkParams.get('subject'),unit:linkParams.get('unit'),id:Number(linkParams.get('question'))};
if (['algorithm','os'].includes(initialQuestionLink.subject) && /^u(?:[2-9]|[1-9][0-9]{1,2})$/.test(initialQuestionLink.unit||'') && Number.isSafeInteger(initialQuestionLink.id) && initialQuestionLink.id > 0) {
    const openLinkedQuestion=()=>{if(getUnit(initialQuestionLink.subject,initialQuestionLink.unit))enterSubject(initialQuestionLink.subject,initialQuestionLink.unit,false,initialQuestionLink.id);};
    if(getUnit(initialQuestionLink.subject,initialQuestionLink.unit))openLinkedQuestion();
    else publishedUnitsReady.then(openLinkedQuestion);
}


import { escapeHtml, normalize, highlight, searchableText, getTypeLabel } from "./utils.js";
import { loadUserQuestions, initCustomQuestions } from "./custom-questions.js?v=20261009-os";
import { initNavigation } from "./navigation.js";
import { SUBJECTS, getUnit } from "./units.js?v=20261009-os";
import { initMusic } from "./music.js";

initHomeTheme();
const { close: closeMusic } = initMusic();

function initHomeTheme() {
    const home = document.getElementById("subjectHome");
    const button = document.getElementById("homeThemeBtn");
    const systemTheme = matchMedia("(prefers-color-scheme: dark)");
    const storageKey = "question_bank_home_theme_v1";
    let preference = null;
    try {
        const saved = localStorage.getItem(storageKey);
        if (saved === "night" || saved === "day") preference = saved;
    } catch { /* Theme remains usable when storage is unavailable. */ }
    function apply() {
        const night = preference ? preference === "night" : systemTheme.matches;
        home.dataset.theme = night ? "night" : "day";
        button.setAttribute("aria-pressed", String(night));
        button.setAttribute("aria-label", night ? "切換日間模式" : "切換夜間星空模式");
        button.title = night ? "切換日間模式" : "切換夜間星空模式";
        button.querySelector(".theme-icon").textContent = night ? "☀" : "☾";
        button.querySelector(".theme-label").textContent = night ? "日間模式" : "夜間星空";
    }
    button.addEventListener("click", () => {
        preference = home.dataset.theme === "night" ? "day" : "night";
        try { localStorage.setItem(storageKey, preference); } catch { /* Session-only fallback. */ }
        apply();
    });
    systemTheme.addEventListener("change", () => { if (!preference) apply(); });
    apply();
}
const clearHomeSparkles = initHomeSparkles();

function initHomeSparkles() {
    const home = document.getElementById("subjectHome");
    const layer = document.getElementById("homeSparkles");
    const enabled = matchMedia("(hover: hover) and (pointer: fine)");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let lastSparkle = 0;
    const clear = () => layer.replaceChildren();
    home.addEventListener("pointermove", event => {
        if (home.hidden || event.pointerType !== "mouse" || !enabled.matches || reduced.matches) return;
        const now = performance.now();
        if (now - lastSparkle < 45) return;
        lastSparkle = now;
        if (layer.childElementCount >= 18) layer.firstElementChild.remove();
        const sparkle = document.createElement("span");
        sparkle.className = "pointer-sparkle";
        sparkle.textContent = "✦";
        sparkle.style.left = event.clientX + "px";
        sparkle.style.top = event.clientY + "px";
        sparkle.style.fontSize = (8 + Math.random() * 7) + "px";
        layer.append(sparkle);
        sparkle.addEventListener("animationend", () => sparkle.remove(), { once: true });
        setTimeout(() => sparkle.remove(), 1000);
    });
    home.addEventListener("pointerleave", clear);
    enabled.addEventListener("change", clear);
    reduced.addEventListener("change", clear);
    return clear;
}

const QUESTIONS = [];
let currentSubject = null;
let currentUnit = null;
let requestVersion = 0;
let loading = false;
let ready = false;
let customQuestions;
const { updateBackToTop, setSidebarOpen } = initNavigation({
    onSelectUnit: selectUnit,
    onLeaveSubject: leaveSubject
});
const PAGE_SIZE = 25;
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
        const typeMatch = currentFilter === "all" || q.type === currentFilter ||
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

    const userCount = QUESTIONS.filter(q => q.user_created).length;
    summary.textContent =
        `目前顯示 ${pageItems.length} / ${filtered.length} 題｜自行新增 ${userCount} 題`;

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
                    ${q.user_created ? `<span class="badge user-badge">自行新增</span>` : ""}
                </div>
            </div>

            <div class="title">${highlight(q.title || "", term)}</div>
            <div class="question">${highlight(q.question || "", term)}</div>

            ${q.type === "disputed" ? '<div class="missing">本題原標準答案含爭議項，請留意答案下方提醒。</div>' : ""}
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
    document.getElementById("unitGrid").innerHTML = currentSubject.units.map(unit => {
        const active = unit.id === currentUnit?.id;
        const available = !!unit.dataUrl;
        return `<button class="unit-card ${active ? "active" : ""}" data-unit="${escapeHtml(unit.id)}"
            type="button" ${available ? "" : "disabled"} ${active ? 'aria-current="true"' : ""}>
            <span class="unit-card-top"><span class="unit-card-name">${escapeHtml(unit.name)}</span>
            <span class="unit-card-status">${active ? "目前單元" : available ? "可練習" : "尚未開放"}</span></span>
            <span class="unit-card-count">${unit.questionCount ? `<strong>${unit.questionCount}</strong> 題` : "準備中"}</span>
            <span class="unit-card-action">${active ? "繼續練習" : available ? "進入題庫" : "敬請期待"}<span aria-hidden="true">${available ? "↗" : "—"}</span></span>
        </button>`;
    }).join("");
}

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
    customQuestions.resetForm();
    customQuestions.refresh();
    const label = currentSubject.name + "｜" + unit.name;
    document.getElementById("currentUnitLabel").textContent = label;
    document.getElementById("bankFooter").textContent = "";
    document.title = label + " 題庫";
    renderUnitChoices();
    if (history.state?.questionBank?.view === "bank") {
        history.replaceState({ ...history.state, questionBank: { view: "bank", subjectId: currentSubject.id, unitId: unit.id } }, "");
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
    QUESTIONS.length = 0;
    answersVisible.clear();
    answersHidden.clear();
    customQuestions.resetForm();
    customQuestions.refresh();
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

customQuestions = initCustomQuestions({
    questions: QUESTIONS, answersVisible,
    getCurrentUnit: () => currentUnit
        ? { subjectId: currentSubject.id, unitId: currentUnit.id } : null,
    onChange: render
});
history.replaceState({ ...history.state, questionBank: { view: "home" } }, "");
window.addEventListener("popstate", event => {
    if (event.state?.questionBank?.view === "bank") enterSubject(event.state.questionBank.subjectId || "algorithm", event.state.questionBank.unitId, false);
    else leaveSubject(true);
});

function enterSubject(subjectId, unitId, pushHistory = true) {
    currentSubject = SUBJECTS.find(subject => subject.id === subjectId && subject.available);
    if (!currentSubject) return;
    const selected = getUnit(currentSubject.id, unitId) || getUnit(currentSubject.id, currentSubject.defaultUnit);
    if (pushHistory) history.pushState({ ...history.state, questionBank: { view: "bank", subjectId: currentSubject.id, unitId: selected.id } }, "");
    document.body.dataset.subject = currentSubject.id;
    document.getElementById("bankHeading").textContent = currentSubject.name + "題庫搜尋系統";
    document.getElementById("unitSubjectDescription").textContent = currentSubject.name + " · 選擇今天的練習單元";
    const brand = document.querySelector(".sidebar-brand");
    brand.textContent = "📚 " + currentSubject.name + "題庫";
    if (currentSubject.id === "algorithm") brand.setAttribute("href", "https://canva.link/evygbbmrt3v2umy");
    else brand.removeAttribute("href");
    closeMusic(false);
    clearHomeSparkles();
    document.body.classList.remove("home-mode");
    document.getElementById("subjectHome").hidden = true;
    document.getElementById("studyShell").hidden = false;
    document.getElementById("sidebar").hidden = false;
    document.getElementById("mobileMenuBtn").hidden = false;
    document.querySelector('.nav-btn[data-panel="bank"]').click();
    selectUnit(selected.id);
    setSidebarOpen(true);
    document.getElementById("bankHeading").focus({ preventScroll: true });
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
        ".toolbar button, #searchInput, #prevPageBtn, #nextPageBtn, #panel-add input, #panel-add textarea, #panel-add select, #addUnitLabel, #saveQuestionBtn, #resetFormBtn"
    );
    controls.forEach(control => { control.disabled = true; });
    summary.textContent = "題庫載入中……";
    list.innerHTML = '<div class="empty" role="status">題庫載入中……</div>';
    try {
        const response = await fetch(new URL(unit.dataUrl, import.meta.url), { cache: "no-cache" });
        if (!response.ok) throw new Error("HTTP " + response.status);
        const builtInQuestions = await response.json();
        if (!Array.isArray(builtInQuestions) || !builtInQuestions.length ||
            builtInQuestions.some(q => !q || !Number.isFinite(q.id) ||
                typeof q.question !== "string" || typeof q.correct_answer !== "string") ||
            new Set(builtInQuestions.map(q => q.id)).size !== builtInQuestions.length) {
            throw new Error("Invalid question data");
        }
        if (version !== requestVersion) return;
        QUESTIONS.push(...builtInQuestions, ...loadUserQuestions(subject.id, unit.id));
        customQuestions.refresh();
        document.getElementById("bankFooter").textContent =
            subject.name + "｜" + unit.name + "｜內建 " + builtInQuestions.length + " 題";
        ready = true;
        controls.forEach(control => { control.disabled = false; });
        render();
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



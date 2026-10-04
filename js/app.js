import { escapeHtml, normalize, highlight, searchableText, getTypeLabel } from "./utils.js";
import { loadUserQuestions, initCustomQuestions } from "./custom-questions.js";
import { initNavigation } from "./navigation.js";
import { SUBJECTS, getUnit } from "./units.js";
import { initMusic } from "./music.js";

const { close: closeMusic } = initMusic();
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
const { updateBackToTop } = initNavigation({
    onSelectUnit: selectUnit,
    onLeaveSubject: leaveSubject
});
const PAGE_SIZE = 25;
let currentPage = 1;
let currentFilter = "all";
const answersVisible = new Set();

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
        const answerShown = answersVisible.has(q.id);
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

            <button class="answer-btn" type="button"
                    data-toggle-answer="${q.id}">
                ${answerShown ? "隱藏答案" : (q.type === "disputed" ? "顯示原標準答案與提醒" : "顯示正確答案")}
            </button>

            <div class="answer ${answerShown ? "show" : ""}">
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
    if (answersVisible.has(id)) answersVisible.delete(id);
    else answersVisible.add(id);
    render();
};

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
    getFilteredQuestions().forEach(q => answersVisible.add(q.id));
    render();
});

document.getElementById("hideAllBtn").addEventListener("click", () => {
    answersVisible.clear();
    render();
});



list.addEventListener("click", event => {
    const button = event.target.closest("[data-toggle-answer]");
    if (button) toggleAnswer(Number(button.dataset.toggleAnswer));
});

function renderUnitChoices() {
    const buttons = currentSubject.units.map(unit => {
        const active = unit.id === currentUnit?.id;
        return `<button class="unit-btn ${active ? "active" : ""}" data-unit="${escapeHtml(unit.id)}"
            type="button" ${unit.dataUrl ? "" : "disabled"} ${active ? 'aria-current="true"' : ""}>
            ${escapeHtml(unit.name)}<span class="unit-status">${unit.dataUrl ? (active ? "目前單元" : "進入題庫") : "尚未開放"}</span></button>`;
    });
    document.getElementById("unitGrid").innerHTML = currentSubject.units.map((unit, i) =>
        `<div class="form-card ${unit.dataUrl ? "" : "unit-coming"}">${buttons[i]}</div>`).join("");
}

function selectUnit(unitId) {
    const unit = getUnit(currentSubject?.id, unitId);
    if (!unit) return;
    if (unit.id === currentUnit?.id && ready) return;
    currentUnit = unit;
    ready = false;
    loading = false;
    requestVersion++;
    QUESTIONS.length = 0;
    answersVisible.clear();
    searchInput.value = "";
    currentFilter = "all";
    currentPage = 1;
    document.querySelectorAll(".filter-btn").forEach(button =>
        button.classList.toggle("active", button.dataset.filter === "all"));
    customQuestions.resetForm();
    customQuestions.refresh();
    const label = currentSubject.name + "｜" + unit.name;
    document.getElementById("currentUnitLabel").textContent = label;
    document.getElementById("addUnitLabel").textContent = "新增至：" + label;
    document.getElementById("bankFooter").textContent = "";
    document.title = label + " 題庫";
    renderUnitChoices();
    loadQuestionBank();
}

function leaveSubject() {
    requestVersion++;
    loading = false;
    ready = false;
    currentSubject = null;
    currentUnit = null;
    QUESTIONS.length = 0;
    answersVisible.clear();
    customQuestions.resetForm();
    customQuestions.refresh();
    document.getElementById("studyShell").hidden = true;
    document.getElementById("sidebar").hidden = true;
    document.getElementById("mobileMenuBtn").hidden = true;
    document.getElementById("subjectHome").hidden = false;
    document.body.classList.add("home-mode");
    document.title = "學習題庫";
    window.scrollTo({ top: 0, behavior: "instant" });
    updateBackToTop();
    document.getElementById("subjectHeading").focus({ preventScroll: true });
}

customQuestions = initCustomQuestions({
    questions: QUESTIONS, answersVisible,
    getCurrentUnit: () => ready && currentUnit
        ? { subjectId: currentSubject.id, unitId: currentUnit.id } : null,
    onChange: render
});
document.getElementById("algorithmSubjectBtn").addEventListener("click", () => {
    currentSubject = SUBJECTS.find(subject => subject.id === "algorithm" && subject.available);
    if (!currentSubject) return;
    closeMusic(false);
    clearHomeSparkles();
    document.body.classList.remove("home-mode");
    document.getElementById("subjectHome").hidden = true;
    document.getElementById("studyShell").hidden = false;
    document.getElementById("sidebar").hidden = false;
    document.getElementById("mobileMenuBtn").hidden = false;
    document.querySelector('.nav-btn[data-panel="bank"]').click();
    selectUnit(currentSubject.defaultUnit);
    document.getElementById("bankHeading").focus({ preventScroll: true });
});

async function loadQuestionBank() {
    if (loading || ready || !currentUnit) return;
    const version = requestVersion;
    const unit = currentUnit;
    const subject = currentSubject;
    loading = true;
    const controls = document.querySelectorAll(
        ".toolbar button, #searchInput, #prevPageBtn, #nextPageBtn, #panel-add input, #panel-add textarea, #panel-add select, #saveQuestionBtn, #resetFormBtn"
    );
    controls.forEach(control => { control.disabled = true; });
    summary.textContent = "題庫載入中……";
    list.innerHTML = '<div class="empty" role="status">題庫載入中……</div>';
    try {
        const response = await fetch(new URL(unit.dataUrl, import.meta.url));
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

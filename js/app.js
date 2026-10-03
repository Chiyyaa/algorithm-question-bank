import { escapeHtml, normalize, highlight, searchableText, getTypeLabel } from "./utils.js";
import { loadUserQuestions, initCustomQuestions } from "./custom-questions.js";
import { initNavigation } from "./navigation.js";

const QUESTIONS = [];
const { updateBackToTop } = initNavigation();
const PAGE_SIZE = 25;
let currentPage = 1;
let currentFilter = "all";
let answersVisible = new Set();

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

let loading = false;
let ready = false;
async function loadQuestionBank() {
    if (loading || ready) return;
    loading = true;
    const controls = document.querySelectorAll(
        ".toolbar button, #searchInput, #prevPageBtn, #nextPageBtn, #saveQuestionBtn, #resetFormBtn"
    );
    controls.forEach(control => { control.disabled = true; });
    summary.textContent = "題庫載入中……";
    list.innerHTML = '<div class="empty" role="status">題庫載入中……</div>';
    try {
        const response = await fetch(new URL("../data/questions.json", import.meta.url));
        if (!response.ok) throw new Error("HTTP " + response.status);
        const builtInQuestions = await response.json();
        if (!Array.isArray(builtInQuestions) || !builtInQuestions.length ||
            builtInQuestions.some(q => !q || !Number.isFinite(q.id) ||
                typeof q.question !== "string" || typeof q.correct_answer !== "string") ||
            new Set(builtInQuestions.map(q => q.id)).size !== builtInQuestions.length) {
            throw new Error("Invalid question data");
        }
        QUESTIONS.push(...builtInQuestions, ...loadUserQuestions());
        initCustomQuestions({ questions: QUESTIONS, answersVisible, onChange: render });
        ready = true;
        controls.forEach(control => { control.disabled = false; });
        render();
    } catch (error) {
        console.error("Question bank could not be loaded:", error);
        summary.textContent = "題庫尚未載入";
        list.innerHTML = '<div class="empty" role="alert">題庫載入失敗，請檢查網路後重試。<br><button id="retryLoadBtn" type="button">重新載入</button></div>';
        document.getElementById("retryLoadBtn").addEventListener("click", loadQuestionBank);
        updateBackToTop();
    } finally {
        loading = false;
    }
}
loadQuestionBank();


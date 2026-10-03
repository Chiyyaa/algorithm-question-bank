import { escapeHtml, getTypeLabel } from "./utils.js";

const STORAGE_KEY = "algorithm_question_bank_user_questions_v1";

export function loadUserQuestions() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function saveUserQuestions(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}


export function initCustomQuestions({ questions, answersVisible, onChange }) {
    function persistUserQuestions(items) {
        try {
            saveUserQuestions(items);
            return true;
        } catch {
            showToast("無法儲存，請確認瀏覽器允許本機儲存且空間足夠。");
            return false;
        }
    }
function showToast(message) {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 1800);
}

function renderUserQuestions() {
    const target = document.getElementById("userQuestionList");
    const items = questions.filter(q => q.user_created);

    if (!items.length) {
        target.innerHTML = `<div class="empty">你目前還沒有新增任何題目。</div>`;
        return;
    }

    target.innerHTML = items.map(q => `
        <article class="question-card">
            <div class="card-top">
                <div>
                    <div class="number">${escapeHtml(q.title || "自訂題目")}</div>
                    <div class="meta">${escapeHtml(getTypeLabel(q.type))}</div>
                </div>
                <button class="danger-btn" type="button" data-delete-question="${q.id}">刪除</button>
            </div>
            <div class="question">${escapeHtml(q.question || "")}</div>
            <div class="answer show">
                <div class="answer-label">正確答案：</div>
                <div class="answer-content">${escapeHtml(q.correct_answer || "")}</div>
            </div>
        </article>
    `).join("");
}

function deleteUserQuestion(id) {
    const saved = loadUserQuestions().filter(q => q.id !== id);
    if (!persistUserQuestions(saved)) return;
    const index = questions.findIndex(q => q.user_created && q.id === id);
    if (index >= 0) questions.splice(index, 1);
    answersVisible.delete(id);
    renderUserQuestions();
    onChange();
    showToast("題目已刪除");
};

function resetQuestionForm() {
    document.getElementById("newType").value = "choice";
    document.getElementById("newTitle").value = "";
    document.getElementById("newQuestion").value = "";
    document.getElementById("optA").value = "";
    document.getElementById("optB").value = "";
    document.getElementById("optC").value = "";
    document.getElementById("optD").value = "";
    document.getElementById("newAnswer").value = "";
    document.getElementById("newKeywords").value = "";
    document.getElementById("choiceArea").style.display = "";
}

const newType = document.getElementById("newType");
newType.addEventListener("change", () => {
    document.getElementById("choiceArea").style.display = newType.value === "choice" ? "" : "none";
});

document.getElementById("saveQuestionBtn").addEventListener("click", () => {
    const type = newType.value;
    const title = document.getElementById("newTitle").value.trim();
    const question = document.getElementById("newQuestion").value.trim();
    const correctAnswer = document.getElementById("newAnswer").value.trim();
    const keywords = document.getElementById("newKeywords").value
        .split(",").map(v => v.trim()).filter(Boolean);

    if (!question) {
        alert("請輸入題目內容。");
        return;
    }
    if (!correctAnswer) {
        alert("請輸入正確答案。");
        return;
    }

    const options = type === "choice"
        ? ["optA", "optB", "optC", "optD"]
            .map(id => document.getElementById(id).value.trim())
            .filter(Boolean)
        : [];

    const item = {
        id: Math.max(Date.now(), ...questions.map(q => Number(q.id) || 0)) + 1,
        title,
        type,
        question,
        options,
        options_status: options.length ? "user_created" : "not_applicable_or_not_recorded",
        correct_answer: correctAnswer,
        answer_variants: [correctAnswer],
        answer_basis: "user_created",
        sources: ["使用者新增"],
        keywords,
        user_created: true,
        created_at: new Date().toISOString()
    };

    const saved = loadUserQuestions();
    saved.unshift(item);
    saveUserQuestions(saved);
    questions.push(item);

    resetQuestionForm();
    renderUserQuestions();
    onChange();
    showToast("題目已新增到題庫");
});

document.getElementById("resetFormBtn").addEventListener("click", resetQuestionForm);


    document.getElementById("userQuestionList").addEventListener("click", event => {
        const button = event.target.closest("[data-delete-question]");
        if (button) deleteUserQuestion(Number(button.dataset.deleteQuestion));
    });
    renderUserQuestions();
}


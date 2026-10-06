import { escapeHtml, getTypeLabel } from "./utils.js";
import { SUBJECTS, getUnit } from "./units.js?v=20261006-add";

const LEGACY_STORAGE_KEY = "algorithm_question_bank_user_questions_v1";
function storageKey(subjectId, unitId) {
    return subjectId === "algorithm" && unitId === "u2" ? LEGACY_STORAGE_KEY
        : "question_bank_user_questions_v1_" + subjectId + "_" + unitId;
}
export function loadUserQuestions(subjectId, unitId) {
    try {
        const parsed = JSON.parse(localStorage.getItem(storageKey(subjectId, unitId)) || "[]");
        return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
}
function parseDraft(text) {
    const normalized = text.replace(/\r\n?/g, "\n")
        .replace(/\*\*(題目|你的答案|正確答案|選項|得分)[：:]\*\*/g, "$1：");
    const headings = [...normalized.matchAll(/^\s*(題目|你的答案|正確答案|選項|得分)[：:]\s*/gm)];
    if (headings.filter(h => h[1] === "題目").length !== 1 || headings.filter(h => h[1] === "正確答案").length !== 1)
        throw new Error("請貼上一題，並包含「題目：」與「正確答案：」。");
    const sections = {};
    headings.forEach((heading, index) => {
        sections[heading[1]] = normalized.slice(heading.index + heading[0].length,
            headings[index + 1]?.index ?? normalized.length).trim()
            .split("\n").map(line => line.replace(/\\\s*$/, "").trim()).join("\n").trim();
    });
    if (!sections.題目 || !sections.正確答案) throw new Error("題目與正確答案不能留白。");
    const options = [];
    const question = sections.題目.split("\n").filter(line => {
        if (/^[A-Z][.．、)）]\s*\S/.test(line)) { options.push(line); return false; }
        return true;
    }).join("\n").trim();
    if (sections.選項) options.push(...sections.選項.split("\n").filter(Boolean));
    if (!question) throw new Error("請補上題目內容。");
    return { question, options, correct_answer: sections.正確答案,
        type: /\[__\d+__\]/.test(question) ? "fill_blank" : options.length ? "choice" : "choice_options_missing" };
}
export function initCustomQuestions({ questions, answersVisible, getCurrentUnit, onChange }) {
    let destination = null;
    let toastTimer;
    const draft = document.getElementById("questionDraft");
    const error = document.getElementById("draftError");
    const label = document.getElementById("addUnitLabel");
    const picker = document.getElementById("addUnitPicker");
    function showToast(message) {
        const toast = document.getElementById("toast");
        clearTimeout(toastTimer);
        toast.textContent = message;
        toast.classList.add("show");
        toastTimer = setTimeout(() => toast.classList.remove("show"), 1800);
    }
    function persist(items) {
        try {
            if (!destination) return false;
            localStorage.setItem(storageKey(destination.subjectId, destination.unitId), JSON.stringify(items));
            return true;
        } catch { showToast("無法儲存，請確認瀏覽器允許本機儲存且空間足夠。"); return false; }
    }
    function isCurrentDestination() {
        const current = getCurrentUnit();
        return current && destination && current.subjectId === destination.subjectId && current.unitId === destination.unitId;
    }
    function closePicker() { picker.hidden = true; label.setAttribute("aria-expanded", "false"); }
    function renderDestination() {
        const subject = SUBJECTS.find(s => s.id === destination?.subjectId);
        const unit = getUnit(destination?.subjectId, destination?.unitId);
        label.textContent = unit ? "新增至：" + subject.name + "｜" + unit.name : "新增至：演算法";
        picker.innerHTML = (subject?.units || []).filter(u => u.dataUrl).map(u =>
            `<button type="button" data-add-unit="${escapeHtml(u.id)}" aria-pressed="${u.id === destination.unitId}">${escapeHtml(u.name)}</button>`).join("");
    }
    function renderUserQuestions() {
        const target = document.getElementById("userQuestionList");
        const items = destination ? loadUserQuestions(destination.subjectId, destination.unitId) : [];
        target.innerHTML = items.length ? items.map(q => `
            <article class="question-card">
                <div class="card-top">
                    <div><div class="number">${escapeHtml(q.title || "自訂題目")}</div>
                    <div class="meta">${escapeHtml(getTypeLabel(q.type))}</div></div>
                    <button class="danger-btn" type="button" data-delete-question="${q.id}">刪除</button>
                </div>
                <div class="question">${escapeHtml(q.question || "")}</div>
                <div class="answer show"><div class="answer-label">正確答案：</div>
                <div class="answer-content">${escapeHtml(q.correct_answer || "")}</div></div>
            </article>`).join("") : '<div class="empty">這個單元還沒有自行新增的題目。</div>';
    }
    function clearDraft() { draft.value = ""; error.hidden = true; error.textContent = ""; }
    function resetQuestionForm() {
        clearDraft(); destination = getCurrentUnit(); closePicker(); renderDestination(); renderUserQuestions();
    }
    label.addEventListener("click", () => { picker.hidden = !picker.hidden; label.setAttribute("aria-expanded", String(!picker.hidden)); });
    picker.addEventListener("click", event => {
        const button = event.target.closest("[data-add-unit]");
        if (!button || !destination || !getUnit(destination.subjectId, button.dataset.addUnit)) return;
        destination = { ...destination, unitId: button.dataset.addUnit };
        renderDestination(); renderUserQuestions(); closePicker(); label.focus();
    });
    document.getElementById("panel-add").addEventListener("keydown", event => {
        if (event.key === "Escape" && !picker.hidden) { closePicker(); label.focus(); }
    });
    draft.addEventListener("input", () => { error.hidden = true; });
    document.getElementById("saveQuestionBtn").addEventListener("click", () => {
        if (!destination) return;
        let parsed;
        try { parsed = parseDraft(draft.value); }
        catch (e) { error.textContent = e.message; error.hidden = false; draft.focus(); return; }
        const saved = loadUserQuestions(destination.subjectId, destination.unitId);
        const item = { ...parsed,
            id: Math.max(Date.now(), ...questions.map(q => Number(q.id) || 0), ...saved.map(q => Number(q.id) || 0)) + 1,
            title: "", options_status: parsed.options.length ? "user_created" : "not_applicable_or_not_recorded",
            answer_variants: [parsed.correct_answer], answer_basis: "user_created", sources: ["使用者新增"], keywords: [],
            user_created: true, subject_id: destination.subjectId, unit_id: destination.unitId, created_at: new Date().toISOString()
        };
        saved.unshift(item);
        if (!persist(saved)) return;
        if (isCurrentDestination()) { questions.push(item); onChange(); }
        clearDraft(); renderUserQuestions();
        showToast("題目已新增至「" + getUnit(destination.subjectId, destination.unitId).name + "」");
    });
    document.getElementById("resetFormBtn").addEventListener("click", clearDraft);
    document.getElementById("userQuestionList").addEventListener("click", event => {
        const button = event.target.closest("[data-delete-question]");
        if (!button || !destination) return;
        const id = Number(button.dataset.deleteQuestion);
        const saved = loadUserQuestions(destination.subjectId, destination.unitId).filter(q => q.id !== id);
        if (!persist(saved)) return;
        if (isCurrentDestination()) {
            const index = questions.findIndex(q => q.user_created && q.id === id);
            if (index >= 0) questions.splice(index, 1);
            answersVisible.delete(id); onChange();
        }
        renderUserQuestions(); showToast("題目已刪除");
    });
    resetQuestionForm();
    return { refresh: renderUserQuestions, resetForm: resetQuestionForm };
}


export function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

export function normalize(value) {
    return String(value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function highlight(value, term) {
    const safe = escapeHtml(value);
    if (!term) return safe;

    const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    try {
        return safe.replace(new RegExp(escapedTerm, "gi"), match => `<mark>${match}</mark>`);
    } catch {
        return safe;
    }
}

export function searchableText(q) {
    return normalize([
        q.id,
        q.title,
        q.type,
        q.question,
        ...(q.options || []),
        q.correct_answer,
        ...(q.answer_variants || []),
        ...(q.keywords || []),
        ...(q.sources || [])
    ].join(" "));
}

export function getTypeLabel(type) {
    if (type === "disputed") return "爭議題型";
    if (type === "fill_blank") return "填空題";
    if (type === "choice") return "選擇題";
    if (type === "choice_options_missing") return "選擇題／選項未記錄";
    return type || "未分類";
}



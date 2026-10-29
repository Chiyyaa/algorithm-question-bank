// Shared collaboration parsing and answer comparison helpers.
export function parseDraft(text, { format = 'auto', retainAnswer = false } = {}) {
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
    if (format === 'no_options' && options.length) throw new Error('內容包含選項，請切換「含選項新增」，或移除選項後再送出。');
    if (format === 'with_options' && !options.length) throw new Error('請補上選項，或切換「無選項新增」。');
    return { question, options, correct_answer: sections.正確答案,
        type: /\[__\d+__\]/.test(question) ? "fill_blank" : options.length ? "choice" : format === 'no_options' ? 'short_answer' : "choice_options_missing",
        ...(retainAnswer && sections.你的答案 ? {user_answer: sections.你的答案} : {}) };
}

export function mistakenAnswer(q) {
    const comparable = value => String(value || '').replace(/\s+/g, '');
    return q.user_answer && comparable(q.user_answer) !== comparable(q.correct_answer) ? q.user_answer : '';
}


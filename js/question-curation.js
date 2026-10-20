// Curated question types and supplied options, checked against the published source.
export function applyQuestionCuration(questions, curation, subject, unit) {
    if (subject !== curation.subject_id || unit !== curation.unit_id) return questions;
    const records = new Map(curation.records.map(record => [record.id, record]));
    const result = questions.map(question => {
        const record = records.get(question.id);
        if (!record || !question.shared_question || question.question !== record.expected_question ||
            question.correct_answer !== record.expected_answer || question.type !== record.expected_type ||
            (question.options || []).length !== 0) return question;
        return { ...question, type:record.type, options:[...record.options],
            options_status:record.options_status, source_type:record.source_type,
            shared_question:false, sources:[...(question.sources || []), ...record.sources] };
    });
    const originals = new Map(questions.map(question => [question.id, question]));
    const removed = new Set();
    for (const duplicate of curation.duplicates || []) {
        const keep = originals.get(duplicate.keep_id), candidate = originals.get(duplicate.remove_id);
        const matches = (question, expected) => question?.shared_question &&
            question.question === expected.question && question.correct_answer === expected.correct_answer &&
            question.type === expected.type && (question.options || []).length === 0;
        if (matches(keep, duplicate.keep_expected) && matches(candidate, duplicate.remove_expected))
            removed.add(duplicate.remove_id);
    }
    return result.filter(question => !removed.has(question.id));
}

let u5Curation;
export async function curatePublishedQuestions(questions, subject, unit) {
    if (subject !== 'algorithm' || unit !== 'u5') return questions;
    try {
        if (!u5Curation) u5Curation = fetch(new URL('../data/algorithm-u5-curation.json?v=20261020-u5', import.meta.url))
            .then(response => { if (!response.ok) throw new Error('U5 curation unavailable'); return response.json(); });
        return applyQuestionCuration(questions, await u5Curation, subject, unit);
    } catch {
        u5Curation = null;
        return questions;
    }
}

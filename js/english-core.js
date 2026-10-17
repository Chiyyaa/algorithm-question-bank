// Pure study rules, shared by the page and boundary tests.
export const QUIZ_AUDIO = Object.freeze({ autoDelayMs:1000, manualReplays:2 });
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function weekInfo(now, schedule, wordCount) {
    const anchor = Date.parse(schedule.weekOneStartsAt);
    const rawWeek = Math.floor((now - anchor) / WEEK_MS) + 1;
    const lastWeek = Math.max(1, Math.ceil(wordCount / schedule.wordsPerWeek));
    const week = Math.min(lastWeek, Math.max(1, rawWeek));
    const start = (week - 1) * schedule.wordsPerWeek + 1;
    return {
        week, rawWeek, start, end: Math.min(week * schedule.wordsPerWeek, wordCount),
        startsAt: anchor + (week - 1) * WEEK_MS,
        nextAt: rawWeek < 1 ? anchor : rawWeek < lastWeek ? anchor + week * WEEK_MS : null,
        finished: rawWeek > lastWeek
    };
}

export function wordsForWeek(words, info) {
    return words.filter(word => word.id >= info.start && word.id <= info.end);
}

export function normalizeAnswer(value) {
    return String(value).normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function isCorrect(value, word) {
    return normalizeAnswer(value) === normalizeAnswer(word);
}

export function quizPrompt(meaning) {
    // Full forms remain in the word list and feedback, but cannot hint at spelling.
    return meaning.replace(/[(（][^()（）]*[a-zA-Z][^()（）]*[)）]/g, '')
        .replace(/[a-zA-Z][a-zA-Z0-9\s'’./&+-]*/g, '').trim();
}

export function sampleWords(pool, count, random = Math.random) {
    const shuffled = [...pool];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, Math.min(count, shuffled.length));
}

export function createQuiz(words, info, count, random = Math.random) {
    return {
        week: info.week, start: info.start, end: info.end, index: 0,
        items: sampleWords(wordsForWeek(words, info), count, random)
            .map(word => ({ word, input: '', answered: false, correct: false, manualPlays: 0, autoAttempted: false })),
        complete: false, gaveUp: false
    };
}

export function submitAnswer(quiz, value) {
    const item = quiz.items[quiz.index];
    if (quiz.complete || !item || item.answered || !String(value).trim()) return false;
    item.input = String(value).trim();
    item.correct = isCorrect(item.input, item.word.word);
    item.answered = true;
    return true;
}

export function advanceQuiz(quiz) {
    if (!quiz.items[quiz.index]?.answered || quiz.complete) return false;
    if (quiz.index === quiz.items.length - 1) quiz.complete = true;
    else quiz.index++;
    return true;
}

export function serverTime(dateHeader, ageHeader, roundTripMs = 0) {
    const date = Date.parse(dateHeader);
    const age = Number(ageHeader || 0);
    if (!Number.isFinite(date) || !Number.isFinite(age) || age < 0) throw new Error('無法取得網站時間');
    return date + age * 1000 + Math.max(0, roundTripMs) / 2;
}


export function resultRating(correct) {
    if (correct >= 20) return { key:'perfect', text:'很棒 恭喜過關', image:'./images/english-result-perfect.jpg' };
    if (correct === 19) return { key:'almost', text:'嘻嘻 差一題 ! !', image:'./images/english-result-almost.jpg' };
    if (correct >= 8) return { key:'good', text:'還不錯 就只有不錯', image:'./images/english-result-good.jpg' };
    return { key:'low', text:'你拉完了還不背...', image:'./images/english-result-low.jpg' };
}

export function quizSummary(quiz) {
    const correct = quiz.items.filter(item => item.answered && item.correct).length;
    const incorrect = quiz.items.filter(item => item.answered && !item.correct);
    const unanswered = quiz.items.filter(item => !item.answered);
    return { correct, incorrect, unanswered, score:Math.round(correct / quiz.items.length * 100) };
}

export function finishQuiz(quiz) {
    if (!quiz || quiz.complete) return false;
    quiz.complete = true;
    quiz.gaveUp = true;
    return true;
}

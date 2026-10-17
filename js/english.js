import { weekInfo, wordsForWeek, quizPrompt, normalizeAnswer, createQuiz, submitAnswer, advanceQuiz, serverTime, QUIZ_AUDIO, resultRating, quizSummary, finishQuiz } from './english-core.js?v=20261017-english2';

const $ = id => document.getElementById(id);
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const speakerIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4zM16 8c3 2 3 6 0 8M19 5c5 4 5 10 0 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const dataUrl = new URL('../data/english-vocabulary.json', import.meta.url);
const taipei = new Intl.DateTimeFormat('zh-TW', { timeZone:'Asia/Taipei', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23' });
let data, currentWeek, quiz = null;
let view = location.hash === '#quiz' ? 'quiz' : 'vocabulary';
let clockBase = Date.now(), clockStart = performance.now(), clockSource = 'device', syncing = false;
let activeSpeech = null, speechToken = 0, speechTimer, autoSpeechTimer;
const hasSpeech = !!window.speechSynthesis && typeof window.SpeechSynthesisUtterance === 'function';
const now = () => clockBase + performance.now() - clockStart;

// Reuse the same drawer behavior without adding other subjects' editing controls.
const mobile = matchMedia('(max-width:850px)');
let desktopOpen = true, mobileOpen = false;
function setMenu(open) {
    if (mobile.matches) mobileOpen = open; else desktopOpen = open;
    updateMenu();
}
function updateMenu() {
    const open = mobile.matches ? mobileOpen : desktopOpen;
    $('englishSidebar').classList.toggle('open', mobile.matches && open);
    $('englishSidebar').classList.toggle('collapsed', !mobile.matches && !open);
    $('englishSidebar').inert = !open;
    $('englishMenuBtn').setAttribute('aria-expanded', String(open));
    $('englishMenuBtn').setAttribute('aria-label', open ? '收合選單' : '展開選單');
    $('englishBackdrop').hidden = !mobile.matches || !open;
    if (!open && $('englishSidebar').contains(document.activeElement)) $('englishMenuBtn').focus();
}
$('englishMenuBtn').addEventListener('click', () => setMenu(!(mobile.matches ? mobileOpen : desktopOpen)));
$('englishBackdrop').addEventListener('click', () => setMenu(false));
document.addEventListener('keydown', event => { if (event.key === 'Escape') setMenu(false); });
mobile.addEventListener('change', () => { mobileOpen = false; updateMenu(); });
updateMenu();

function stopSpeech() {
    speechToken++;
    clearTimeout(speechTimer);
    clearTimeout(autoSpeechTimer);
    activeSpeech = null;
    if (hasSpeech) speechSynthesis.cancel();
    updateSpeechButtons();
}

function updateSpeechButtons() {
    document.querySelectorAll('[data-speak]').forEach(button => {
        const current = button.dataset.speak === 'quiz' && !quiz?.complete ? quiz?.items[quiz.index] : null;
        button.disabled = !hasSpeech || !!activeSpeech ||
            !!(current && (!current.autoAttempted || current.manualPlays >= QUIZ_AUDIO.manualReplays));
    });
    const count = $('playCount');
    if (count && quiz && !quiz.complete) {
        const current = quiz.items[quiz.index];
        count.textContent = current.autoAttempted
            ? `手動剩餘 ${Math.max(0, QUIZ_AUDIO.manualReplays - current.manualPlays)} 次`
            : '1 秒後自動播放';
    }
}

function speak(word, item = null, automatic = false) {
    if (!hasSpeech || activeSpeech || (item && !automatic && item.manualPlays >= QUIZ_AUDIO.manualReplays)) return;
    const token = ++speechToken;
    const utterance = new SpeechSynthesisUtterance(word.word);
    const voices = speechSynthesis.getVoices();
    const voice = voices.find(v => /^en[-_]US$/i.test(v.lang)) || voices.find(v => /^en([-_]|$)/i.test(v.lang));
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang || 'en-US';
    utterance.rate = 0.85;
    let counted = false;
    activeSpeech = utterance;
    $('speechStatus').textContent = '';
    const inlineNote = $('quizAudioNotice');
    if (inlineNote) inlineNote.hidden = true;
    function finish(failed) {
        if (token !== speechToken) return;
        clearTimeout(speechTimer);
        activeSpeech = null;
        if (failed) {
            if (counted && item) item.manualPlays--;
            const message = automatic
                ? '自動發音未能播放。請按發音按鈕手動播放，每題仍可手動播放 2 次。'
                : '這次發音未能完成，未扣除手動次數。請確認裝置音量及英文語音設定後重試。';
            $('speechStatus').textContent = message;
            const note = $('quizAudioNotice');
            if (note) { note.textContent = message; note.hidden = false; }
        }
        updateSpeechButtons();
    }
    function timeout() {
        if (token !== speechToken) return;
        finish(true); speechToken++; speechSynthesis.cancel();
    }
    utterance.onstart = () => {
        if (token !== speechToken) return;
        clearTimeout(speechTimer);
        speechTimer = setTimeout(timeout, 20000);
        if (item && !automatic) { item.manualPlays++; counted = true; }
        updateSpeechButtons();
    };
    utterance.onend = () => finish(false);
    utterance.onerror = () => finish(true);
    speechTimer = setTimeout(timeout, 8000);
    updateSpeechButtons();
    try { speechSynthesis.cancel(); speechSynthesis.speak(utterance); } catch { finish(true); }
}

function scheduleQuestionAudio(item) {
    clearTimeout(autoSpeechTimer);
    if (!hasSpeech || !item || item.answered || item.autoAttempted || view !== 'quiz' || document.hidden || quiz?.complete) return;
    autoSpeechTimer = setTimeout(() => {
        if (view !== 'quiz' || document.hidden || quiz?.complete || quiz?.items[quiz.index] !== item || item.answered || item.autoAttempted) return;
        item.autoAttempted = true;
        speak(item.word, item, true);
        updateSpeechButtons();
    }, QUIZ_AUDIO.autoDelayMs);
}
document.addEventListener('click', event => {
    const button = event.target.closest('[data-speak]');
    if (!button || button.disabled || !data) return;
    if (button.dataset.speak === 'quiz') {
        const item = quiz?.items[quiz.index];
        if (item) speak(item.word, item);
    } else {
        const word = data.words.find(w => w.id === Number(button.dataset.speak));
        if (word) speak(word);
    }
});
window.addEventListener('pagehide', stopSpeech);

async function syncClock() {
    if (syncing) return;
    syncing = true; $('syncClockBtn').disabled = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);
    try {
        const url = new URL(dataUrl); url.searchParams.set('_clock', String(Date.now()));
        const began = performance.now();
        const response = await fetch(url, { method:'HEAD', cache:'no-store', signal:controller.signal });
        if (!response.ok) throw new Error('clock');
        clockBase = serverTime(response.headers.get('Date'), response.headers.get('Age'), performance.now() - began);
        clockStart = performance.now(); clockSource = 'server';
    } catch {
        // A previous successful clock keeps advancing even if a later sync fails.
        clockSource = clockSource === 'server' || clockSource === 'previous' ? 'previous' : 'device';
    } finally {
        clearTimeout(timeout); syncing = false; $('syncClockBtn').disabled = false; updateWeek();
    }
}
$('syncClockBtn').addEventListener('click', syncClock);
window.addEventListener('online', syncClock);
document.addEventListener('visibilitychange', () => { if (document.hidden) { stopSpeech(); } else { updateWeek(); syncClock(); if (view === 'quiz' && quiz && !quiz.complete) scheduleQuestionAudio(quiz.items[quiz.index]); } });
setInterval(syncClock, 5 * 60 * 1000);
setInterval(() => { if (!document.hidden) updateWeek(); }, 1000);

function updateWeek() {
    $('clockStatus').textContent = clockSource === 'server' ? '台北時間 · 已由網站校時' : clockSource === 'previous' ? '台北時間 · 暫用上次校時，稍後重試' : '台北時間 · 暫用裝置時間，尚未完成校時';
    if (!data) return;
    const info = weekInfo(now(), data.schedule, data.words.length);
    const changed = !currentWeek || currentWeek.week !== info.week;
    currentWeek = info;
    $('weekHeading').textContent = `第 ${info.week} 週`;
    $('weekRange').textContent = `第 ${info.start}–${info.end} 號 · ${wordsForWeek(data.words, info).length} 個單字`;
    $('nextWeekTime').textContent = info.nextAt ? `${taipei.format(info.nextAt)} 切換${info.rawWeek < 1 ? '第 1 週' : '下一週'}` : info.finished ? '目前單字已排完，保留最後一週複習' : '目前單字表的最後一週';
    if (changed) { renderWords(); if (view === 'quiz') renderQuiz(); }
    const oldSession = quiz && !quiz.complete && quiz.week !== info.week;
    $('quizWeekNotice').hidden = !oldSession;
    if (oldSession) $('quizWeekNotice').textContent = `已切換第 ${info.week} 週。本次測驗仍完成原第 ${quiz.week} 週的題目；下次測驗將使用新的一週。`;
}

function table(words) {
    return `<table class="word-table"><thead><tr><th scope="col">編號</th><th scope="col">英文</th><th scope="col">中文意思</th><th scope="col">詞性</th><th scope="col"><span class="sr-only">發音</span></th></tr></thead><tbody>${words.map(w => `<tr data-word-id="${w.id}"><td class="word-id">${w.id}</td><td class="word-en" lang="en">${escape(w.word)}</td><td>${escape(w.meaning)}</td><td class="word-pos">${escape(w.pos)}</td><td><button class="speak-button" type="button" data-speak="${w.id}" aria-label="播放 ${escape(w.word)} 的英文發音">${speakerIcon}</button></td></tr>`).join('')}</tbody></table>`;
}
function renderWords() {
    if (!data || !currentWeek) return;
    const search = normalizeAnswer($('wordSearch').value);
    const filtered = data.words.filter(w => !search || normalizeAnswer(`${w.id} ${w.word} ${w.meaning} ${w.pos}`).includes(search));
    const totalWeeks = Math.ceil(data.words.length / data.schedule.wordsPerWeek);
    const weeks = [currentWeek.week, ...Array.from({length:totalWeeks}, (_, i) => i + 1).filter(w => w !== currentWeek.week)];
    let previousHeading = false;
    $('wordGroups').innerHTML = weeks.map(week => {
        const start = (week - 1) * data.schedule.wordsPerWeek + 1;
        const end = Math.min(week * data.schedule.wordsPerWeek, data.words.length);
        const words = filtered.filter(w => w.id >= start && w.id <= end);
        if (!words.length) return '';
        const heading = `<h3>第 ${week} 週</h3><span class="group-range">${start}–${end} 號</span>`;
        if (week === currentWeek.week) return `<section class="word-group current-week" data-week="${week}"><div class="group-heading">${heading}<span class="current-badge">本週置頂</span></div>${table(words)}</section>`;
        const label = previousHeading ? '' : '<h3 class="other-weeks-heading">其他週次</h3>';
        previousHeading = true;
        return `${label}<details class="word-group" data-week="${week}"${search ? ' open' : ''}><summary class="group-heading">${heading}</summary>${table(words)}</details>`;
    }).join('') || '<p class="notice">找不到符合的單字，請換個關鍵字。</p>';
    $('wordSummary').textContent = search ? `找到 ${filtered.length} 筆` : `共 ${data.words.length} 筆 · ${totalWeeks} 週`;
    updateSpeechButtons();
}
$('wordSearch').addEventListener('input', renderWords);

function showView(name, push = true) {
    if (!['vocabulary','quiz'].includes(name)) return;
    stopSpeech(); view = name;
    if (push && location.hash !== (name === 'quiz' ? '#quiz' : '')) history.pushState({englishView:name}, '', name === 'quiz' ? '#quiz' : location.pathname + location.search);
    $('vocabularyView').hidden = !data || view !== 'vocabulary';
    $('quizView').hidden = !data || view !== 'quiz';
    $('englishHeading').textContent = view === 'quiz' ? '當週測驗' : '單字表';
    document.querySelectorAll('[data-view]').forEach(button => {
        const active = button.dataset.view === view;
        button.classList.toggle('active', active);
        if (active) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current');
    });
    if (view === 'quiz' && data) renderQuiz();
    if (mobile.matches) setMenu(false);
    if (push) { window.scrollTo({top:0,behavior:'instant'}); $('englishHeading').focus({preventScroll:true}); }
}
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => showView(button.dataset.view)));
$('goQuizBtn').addEventListener('click', () => showView('quiz'));
window.addEventListener('popstate', () => showView(location.hash === '#quiz' ? 'quiz' : 'vocabulary', false));

function renderQuiz(focus = false) {
    clearTimeout(autoSpeechTimer);
    if (!data || !currentWeek) return;
    const content = $('quizContent');
    if (!quiz) {
        const available = wordsForWeek(data.words, currentWeek).length;
        const count = Math.min(data.schedule.quizSize, available);
        content.innerHTML = `<div class="quiz-intro"><div class="quiz-emblem" aria-hidden="true">Aa</div><h3>來試試這週記住了多少</h3><p>第 ${currentWeek.week} 週 · ${currentWeek.start}–${currentWeek.end} 號</p><div class="quiz-facts"><span>隨機 ${count} 題</span><span>中文 → 英文</span><span>立即看答案</span></div><p>看中文與詞性，輸入英文單字或片語。</p><p>每題出現 1 秒後自動發音，另可手動重播 2 次。</p><button id="startQuizBtn" class="primary-btn" type="button" style="margin-top:22px"${count ? '' : ' disabled'}>開始本週測驗 →</button></div>`;
        $('startQuizBtn').addEventListener('click', () => {
            updateWeek();
            quiz = createQuiz(data.words, currentWeek, data.schedule.quizSize);
            renderQuiz(true);
        });
        return;
    }
    if (quiz.complete) { renderResults(); return; }
    const item = quiz.items[quiz.index];
    if (item.answered) item.autoAttempted = true;
    const answered = quiz.items.filter(i => i.answered).length;
    content.innerHTML = `<article class="quiz-card" data-question-id="${item.word.id}"><div class="quiz-quit-row"><button id="giveUpQuizBtn" class="give-up-button" type="button">我想放棄</button></div><div class="quiz-progress-row"><span>第 ${quiz.week} 週 · 單字測驗</span><span>第 ${quiz.index + 1} / ${quiz.items.length} 題</span></div><div class="quiz-progress" role="progressbar" aria-label="已作答題數" aria-valuemin="0" aria-valuemax="${quiz.items.length}" aria-valuenow="${answered}"><span style="width:${answered / quiz.items.length * 100}%"></span></div><div class="prompt-top"><div><p class="prompt-label">請寫出對應的英文</p><p class="quiz-meaning">${escape(quizPrompt(item.word.meaning))}</p><span class="quiz-pos">${escape(item.word.pos)}</span></div><div class="quiz-audio"><button class="speak-button" type="button" data-speak="quiz" aria-label="播放這題的英文發音">${speakerIcon}</button><small id="playCount"></small></div></div><p id="quizAudioNotice" class="audio-notice" role="status" hidden></p><form id="spellingForm"><div class="answer-field"><label for="spellingAnswer">英文作答</label><input id="spellingAnswer" name="answer" type="text" lang="en" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="輸入英文單字或片語" value="${escape(item.input)}"${item.answered ? ' disabled' : ''} aria-describedby="answerHint answerError"><p id="answerHint" class="answer-hint">不分大小寫；單字間請保留空格，連字號及其他符號須正確。</p><p id="answerError" class="answer-error" role="alert" hidden>請先輸入英文答案。</p></div>${item.answered ? `<div id="answerFeedback" class="feedback ${item.correct ? 'correct' : 'incorrect'}" role="status"><h3>${item.correct ? '✓ 答對了' : '再記一次，下一題加油'}</h3><p>正確答案：<span class="correct-word" lang="en">${escape(item.word.word)}</span></p>${item.correct ? '' : `<p>你的答案：${escape(item.input)}</p>`}<p>${escape(item.word.meaning)} · ${escape(item.word.pos)}</p></div><div class="quiz-actions"><button id="nextQuestionBtn" class="primary-btn" type="button">${quiz.index === quiz.items.length - 1 ? '查看測驗結果' : '下一題 →'}</button></div>` : '<div class="quiz-actions"><button class="primary-btn" type="submit">送出答案</button></div>'}</form></article>`;
    $('giveUpQuizBtn').addEventListener('click', () => {
        stopSpeech();
        if (finishQuiz(quiz)) { renderResults(); updateWeek(); $('resultHeading').focus({preventScroll:true}); window.scrollTo({top:0,behavior:'instant'}); }
    });
    $('spellingAnswer').addEventListener('input', event => { if (!item.answered) item.input = event.target.value; });
    $('spellingForm').addEventListener('submit', event => {
        event.preventDefault();
        const value = $('spellingAnswer').value;
        if (!value.trim()) { $('answerError').hidden = false; $('spellingAnswer').focus(); return; }
        if (submitAnswer(quiz, value)) { stopSpeech(); renderQuiz(); $('nextQuestionBtn').focus({preventScroll:true}); }
    });
    $('nextQuestionBtn')?.addEventListener('click', () => {
        stopSpeech();
        if (advanceQuiz(quiz)) renderQuiz(true);
    });
    updateSpeechButtons();
    scheduleQuestionAudio(item);
    if (focus && !item.answered) $('spellingAnswer').focus({preventScroll:true});
}

function renderResults() {
    stopSpeech();
    const summary = quizSummary(quiz);
    const rating = resultRating(summary.correct);
    const review = quiz.items.filter(item => !item.answered || !item.correct);
    $('quizContent').innerHTML = `<section class="result-card" data-rating="${rating.key}"><header><p class="prompt-label">第 ${quiz.week} 週 · ${quiz.gaveUp ? '提前結算' : '測驗完成'}</p><h3 id="resultHeading" tabindex="-1">${escape(rating.text)}</h3><img class="result-rating-image" src="${escape(rating.image)}" alt="${escape(rating.text)}"><p class="result-score">${summary.score}<small> / 100</small></p><p class="result-caption">答對 ${summary.correct} / ${quiz.items.length} 題 · 答錯 ${summary.incorrect.length} 題 · 未作答 ${summary.unanswered.length} 題</p></header>${review.length ? `<h3>錯誤與未作答的單字</h3>${review.map(item => `<div class="review-item" data-review-status="${item.answered ? 'incorrect' : 'unanswered'}"><span class="review-status ${item.answered ? 'incorrect' : 'unanswered'}">${item.answered ? '答錯' : '未作答'}</span><p>${escape(item.word.meaning)} <span class="word-pos">${escape(item.word.pos)}</span></p><p class="review-answer" lang="en">${escape(item.word.word)}</p>${item.answered ? `<p class="review-input">你的答案：${escape(item.input)}</p>` : item.input ? `<p class="review-input">尚未送出：${escape(item.input)}</p>` : ''}</div>`).join('')}` : '<p class="all-correct-note">20 題全對，這次沒有錯誤或未作答的單字！</p>'}<div class="quiz-actions"><button id="returnWordsBtn" type="button">回到單字表</button><button id="restartQuizBtn" class="primary-btn" type="button">再測驗一次</button></div></section>`;
    $('returnWordsBtn').addEventListener('click', () => { quiz = null; showView('vocabulary'); });
    $('restartQuizBtn').addEventListener('click', () => { stopSpeech(); updateWeek(); quiz = createQuiz(data.words, currentWeek, data.schedule.quizSize); renderQuiz(true); updateWeek(); });
}

async function loadWords() {
    $('loadStatus').hidden = false; $('retryLoadBtn').hidden = true;
    $('loadStatus').textContent = '單字載入中……';
    try {
        const [response] = await Promise.all([fetch(dataUrl, {cache:'no-cache'}), syncClock()]);
        if (!response.ok) throw new Error('load');
        const loaded = await response.json();
        if (!loaded.schedule || !Array.isArray(loaded.words) || !loaded.words.length || loaded.words.some((w,i) => w.id !== i + 1 || !w.word || !w.meaning || !w.pos)) throw new Error('format');
        data = loaded;
        $('loadStatus').hidden = true;
        $('vocabularyFooter').textContent = `${data.title} · 共 ${data.words.length} 筆`;
        if (!hasSpeech) $('speechStatus').textContent = '此瀏覽器未提供語音朗讀；仍可閱讀單字表及作答。可換用支援語音的瀏覽器播放發音。';
        updateWeek(); showView(view, false);
    } catch {
        $('loadStatus').textContent = '單字表暫時無法載入，請確認連線後重試。';
        $('retryLoadBtn').hidden = false;
    }
}
$('retryLoadBtn').addEventListener('click', loadWords);
loadWords();

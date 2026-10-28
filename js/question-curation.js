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

// U6 shared records already incorporated in the built-in bank.
// Compare the saved content so later edits or new submissions remain visible.
const integratedU6Shared = new Map([{"id":1000000093,"question":"What are the advantages of multicore processors?","type":"choice_options_missing","correct_answer":"They are faster\nThey consume less power\nThey can leverage memory stalls for multithreading","options":[]},{"id":1000000094,"question":"多層級佇列（Multilevel Queue）排程的特性包含哪些？","type":"choice_options_missing","correct_answer":"就緒佇列被劃分為獨立的佇列\n每個佇列可以有自己的排程演算法\n程序通常永久地固定在一個佇列中\n可能導致低優先權隊列的飢餓問題","options":[]},{"id":1000000095,"question":"下列哪些關於即時排程的敘述是正確的？","type":"choice_options_missing","correct_answer":"排程器必須支援搶佔式、基於優先權的排程\n硬即時系統必須提供滿足截止日期的能力\n週期性任務的速率是其週期的倒數","options":[]},{"id":1000000096,"question":"在POSIX即時排程中，哪種排程策略與SCHED_FIFO相似，但對相同優先權的執行緒有時間分片？","type":"choice_options_missing","correct_answer":"SCHED_RR","options":[]},{"id":1000000097,"question":"In Multilevel Queue scheduling, which of the following statements is correct?","type":"choice_options_missing","correct_answer":"The foreground queue typically uses Round Robin scheduling","options":[]},{"id":1000000098,"question":"在對稱多處理（SMP）系統中，每個處理器都自我排程，這是哪種排程方法？","type":"choice_options_missing","correct_answer":"都不是","options":[]},{"id":1000000099,"question":"完全公平排程器（CFS）有哪些特性？","type":"choice_options_missing","correct_answer":"優先權基於nice值\n維護一個每任務的虛擬運行時間（vruntime）\n選擇虛擬運行時間最短的任務運行","options":[]},{"id":1000000100,"question":"Which of the following are optimization goals for scheduling algorithms?","type":"choice_options_missing","correct_answer":"Maximize CPU utilization\nMinimize turnaround time\nMaximize throughput\nMinimize response time","options":[]},{"id":1000000101,"question":"迴圈排程（RR）演算法中，每個程序獲得一小段CPU時間的單位稱為[__1__]。(請用小寫英文回答 字母間留一個空白)","type":"fill_blank","correct_answer":"time quantum","options":[]},{"id":1000000102,"question":"[__1__]是在即時系統中，排程器將當前程序從CPU上移除並切換到另一個程序所需的時間。(請用小寫英文回答 字母間留一個空白)","type":"fill_blank","correct_answer":"dispatch latency","options":[]},{"id":1000000103,"question":"[__1__]是每單位時間完成執行的程序數量，用於衡量排程演算法的效率。(請用小寫英文回答)","type":"fill_blank","correct_answer":"throughput","options":[]},{"id":1000000104,"question":"[__1__]效應是指一個短程序被一個或多個長程序阻塞。(請用小寫英文回答)","type":"fill_blank","correct_answer":"convoy","options":[]},{"id":1000000105,"question":"In a symmetric multiprocessing (SMP) system, [__1__] is a periodic task that checks the load on each processor and pushes tasks from overloaded CPUs to other CPUs.(Please answer in lowercase English, leaving a space between each word)","type":"fill_blank","correct_answer":"push migration","options":[]},{"id":1000000106,"question":"What type of scheduler is the CPU scheduler?","type":"choice_options_missing","correct_answer":"Short-term scheduler","options":[]},{"id":1000000107,"question":"當時間片（TQ）相對於上下文切換時間非常小時，迴圈排程（RR）的缺點是什麼？","type":"choice_options_missing","correct_answer":"CPU利用率會降低\n系統開銷會很高","options":[]},{"id":1000000108,"question":"The [__1__] scheduling algorithm is optimal because it provides the minimum average waiting time for a given set of processes.(Please answer in lowercase English, connecting letters with hyphens)","type":"fill_blank","correct_answer":"shortest-job-first","options":[]},{"id":1000000109,"question":"Windows中，一個執行緒的優先權會被提升的情況有哪些？","type":"choice_options_missing","correct_answer":"當它從等待狀態返回時\n當它處於前景視窗時","options":[]},{"id":1000000110,"question":"Windows排程器使用了[__1__]個優先級層級。(fill a number)","type":"fill_blank","correct_answer":"32","options":[]},{"id":1000000111,"question":"在CPU-I/O週期中，程式的執行由什麼組成？","type":"choice_options_missing","correct_answer":"CPU爆發和I/O爆發的交替","options":[]},{"id":1000000112,"question":"關於估計下一個CPU爆發長度，可以採用哪些方法？","type":"choice_options_missing","correct_answer":"使用過去CPU爆發長度的指數平均\n詢問使用者\n設定 α=1 表示只考慮最後一個 burst","options":[]},{"id":1000000113,"question":"迴圈排程（RR）演算法中，每個程序獲得一小段CPU時間的單位稱為？","type":"choice_options_missing","correct_answer":"時間片（Time quantum）","options":[]},{"id":1000000114,"question":"The goal of Linux's CFS (Completely Fair Scheduler) is to provide a completely [__1__] CPU allocation.(Please answer in lowercase English)","type":"fill_blank","correct_answer":"fair","options":[]},{"id":1000000115,"question":"Turnaround time is the total time from process submission to [__1__].(Please answer in lowercase English)","type":"fill_blank","correct_answer":"terminated","options":[]},{"id":1000000116,"question":"響應時間是從提交請求到第一次[__1__]產生的時間。(請用小寫英文回答)","type":"fill_blank","correct_answer":"response","options":[]},{"id":1000000117,"question":"哪一個排程演算法會導致「護航效應」（convoy effect）？","type":"choice_options_missing","correct_answer":"先到先服務（FCFS）","options":[]},{"id":1000000118,"question":"最早截止時間優先排程（Earliest Deadline First Scheduling）的特性是什麼？","type":"choice_options_missing","correct_answer":"截止時間越早的優先權越高\n截止時間越晚的優先權越低\n是一種動態優先權演算法","options":[]},{"id":1000000119,"question":"What are the characteristics of Windows scheduling?","type":"choice_options_missing","correct_answer":"It uses priority-based preemptive scheduling\nIt has a 32-level priority scheme\nThere is a queue for each priority level\nIt can boost thread priorities","options":[]},{"id":1000000120,"question":"What is throughput as a measure of a scheduling algorithm?","type":"choice_options_missing","correct_answer":"The number of processes that complete their execution per time unit","options":[]},{"id":1000000121,"question":"[__1__]是根據截止時間分配優先權的演算法：截止時間越早，優先權越高。(請用小寫英文回答 字母間留一個空白)","type":"fill_blank","correct_answer":"earliest deadline first scheduling","options":[]},{"id":1000000122,"question":"[__1__]排程是根據週期的倒數來分配優先權的演算法。(請用小寫英文回答 字母間留一個空白)","type":"fill_blank","correct_answer":"rate monotonic scheduling","options":[]}].map(question => [question.id, question]));

function omitIntegratedU6Shared(questions) {
    return questions.filter(question => {
        const expected = integratedU6Shared.get(question.id);
        return !expected || !question.shared_question ||
            question.question !== expected.question || question.type !== expected.type ||
            question.correct_answer !== expected.correct_answer ||
            JSON.stringify(question.options || []) !== JSON.stringify(expected.options);
    });
}

let u5Curation;
export async function curatePublishedQuestions(questions, subject, unit) {
    if (subject === 'os' && unit === 'u6') return omitIntegratedU6Shared(questions);
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

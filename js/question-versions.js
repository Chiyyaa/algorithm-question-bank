export function reviewContent(q) {
    return {question:q.question,options:q.options||[],correct_answer:q.correct_answer,type:q.type,...(q.user_answer!==undefined?{user_answer:q.user_answer}:{})};
}
export const sameReviewContent=(a,b)=>JSON.stringify(reviewContent(a))===JSON.stringify(reviewContent(b));

// Replacement IDs stay identical to the original. Never append a second card for a replacement.
export function mergeQuestionVersions(builtIn, shared) {
    const originals=[...builtIn,...shared.filter(q=>!q.replacement_question)];
    const result=new Map();for(const q of originals)if(!result.has(q.id))result.set(q.id,q);
    for(const version of shared.filter(q=>q.replacement_question)) {
        const previous=result.get(version.id);
        if(!previous)throw new Error('取代版本找不到原題，請重新載入題庫。');
        if(!sameReviewContent(previous,version.replacement_base))throw new Error('原題版本已更新，取代內容需要管理員重新核對。');
        result.set(version.id,{id:previous.id,title:previous.title||'',sources:previous.sources||[],
            ...(previous.legacy_question_ids?{legacy_question_ids:previous.legacy_question_ids}:{}),
            ...reviewContent(version),options_status:version.options.length?'complete':'not_applicable',
            shared_question:previous.shared_question||false,replacement_revision:version.replacement_revision,
            replacement_question:true,answer_basis:'admin_reviewed_replacement'});
    }
    return [...result.values()];
}

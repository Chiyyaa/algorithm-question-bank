export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;
export function allowedStorageKey(key) {
    return ['question_bank_answers_shown_v1','question_bank_taipei_theme_v1','english_biweekly_total_20261022_seen','algorithm_question_bank_user_questions_v1'].includes(key) ||
        /^question_bank_user_questions_v1_(?:algorithm|os)_(?:u[0-9]{1,3}|treasure|u2-u6)$/.test(key);
}
export function validateBackup(value) {
    if (!value || value.kind !== 'question-bank-browser-backup' || value.schema !== 1 || !Array.isArray(value.entries) || value.entries.length > 1000)
        throw new Error('這不是支援的題庫備份檔。');
    const seen = new Set(); let bytes = 0;
    for (const entry of value.entries) {
        if (!entry || typeof entry.key !== 'string' || !allowedStorageKey(entry.key) || seen.has(entry.key) || typeof entry.value !== 'string')
            throw new Error('備份含有不支援、重複或不安全的項目。');
        seen.add(entry.key); bytes += new TextEncoder().encode(entry.key + entry.value).length;
    }
    if (bytes > MAX_BACKUP_BYTES) throw new Error('備份檔超過 10 MB，請先檢查內容。');
    return value.entries;
}
export function exportBackup(storage, sourceOrigin) {
    const entries = [];
    for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (allowedStorageKey(key)) entries.push({key, value: storage.getItem(key)});
    }
    const value = {kind:'question-bank-browser-backup', schema:1, createdAt:new Date().toISOString(), sourceOrigin, entries};
    validateBackup(value); return value;
}
export function importBackup(storage, value) {
    const entries=validateBackup(value); let imported=0, skipped=0;
    for (const {key,value:raw} of entries) {
        if (storage.getItem(key) !== null) { skipped++; continue; }
        try { storage.setItem(key,raw); imported++; }
        catch { return {imported,skipped,failed:entries.length-imported-skipped}; }
    }
    return {imported,skipped,failed:0};
}

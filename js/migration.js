import {exportBackup, importBackup, validateBackup, MAX_BACKUP_BYTES} from './storage-migration.js';
const $=id=>document.getElementById(id);let pending=null;
function status(text){$('migrationStatus').textContent=text;}
$('exportBackup').addEventListener('click',()=>{
    try {
        const data=exportBackup(localStorage,location.origin);
        const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
        const link=document.createElement('a');link.href=url;link.download='question-bank-backup-'+new Date().toISOString().slice(0,10)+'.json';link.click();
        setTimeout(()=>URL.revokeObjectURL(url),1000);status('已匯出 '+data.entries.length+' 項。請將備份保存在自己的裝置。');
    }catch{status('無法讀取瀏覽器資料。請確認瀏覽器允許此網站儲存資料。');}
});
$('backupFile').addEventListener('change',async event=>{
    pending=null;$('importBackup').disabled=true;const file=event.target.files[0];if(!file)return;
    try{
        if(file.size>MAX_BACKUP_BYTES)throw new Error('備份檔超過 10 MB。');
        const value=JSON.parse(await file.text());const entries=validateBackup(value);pending=value;
        const existing=entries.filter(e=>localStorage.getItem(e.key)!==null).length;
        status('已檢查 '+entries.length+' 項；其中 '+existing+' 項在此網站已有資料，匯入時會保留現有內容。請確認後按「匯入缺少的資料」。');
        $('importBackup').disabled=false;
    }catch(error){status(error instanceof SyntaxError?'無法讀取備份 JSON。':error.message||'無法檢查備份檔。');}
});
$('importBackup').addEventListener('click',()=>{
    if(!pending)return;
    try{const result=importBackup(localStorage,pending);status('已匯入 '+result.imported+' 項、保留原有 '+result.skipped+' 項、失敗 '+result.failed+' 項。舊站資料仍保留；重新開啟題庫即可套用偏好。');}
    catch(error){status(error.message||'匯入未完成。');}
    pending=null;$('importBackup').disabled=true;
});

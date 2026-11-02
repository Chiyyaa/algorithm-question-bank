import { collaborationConfig as config } from './collaboration-config.js?v=20261017';

const messages={ROOM_NOT_FOUND:'找不到房間，請確認 8 碼房間碼。',ROOM_FULL:'房間已滿，最多只能兩人對戰。',ROOM_CLOSED:'房間已關閉，請重新建立。',NOT_A_PLAYER:'這個分頁沒有此房間的參賽資格，請重新加入。',INVALID_NICKNAME:'請輸入 1～20 字的暱稱。',ROOM_RATE_LIMIT:'目前建立房間的人較多，請稍後再試。',BANK_NOT_READY:'對戰題庫暫時無法使用，請稍後再試。',VERIFICATION_REQUIRED:'請先完成考者驗證。',NOT_STARTED:'倒數尚未結束，請稍候。',QUESTION_ORDER:'題目進度已更新，正在重新同步。',INVALID_RESPONSE:'請先完成這題的作答。',ROOM_ALREADY_STARTED:'對戰已開始，正在同步。'};
export async function duelRequest(action,payload) {
    const r=await fetch(config.url+'/rest/v1/rpc/duel_api',{method:'POST',headers:{apikey:config.publishableKey,'Content-Type':'application/json'},body:JSON.stringify({p_action:action,p_payload:payload}),signal:AbortSignal.timeout(12000)});
    const data=await r.json().catch(()=>null);
    if(!r.ok){const code=Object.keys(messages).find(k=>String(data?.message||'').includes(k)),error=new Error(code?messages[code]:'連線暫時中斷，請重試；已送出的作答會向伺服器重新確認。');error.code=code||'NETWORK';throw error;}
    return data;
}

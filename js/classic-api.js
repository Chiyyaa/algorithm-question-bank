import { collaborationConfig as config } from './collaboration-config.js?v=20261017';
const errors={ROOM_NOT_FOUND:'找不到房間，請確認 8 碼房間碼。',ROOM_FULL:'房間已滿，經典對決最多 3 人。',ROOM_CLOSED:'對戰已開始或房間已關閉，不能中途加入。',NOT_A_PLAYER:'你已離開房間，或原位置已由新玩家加入，請重新輸入房間碼。',INVALID_NICKNAME:'請輸入 1～20 字的暱稱。',HOST_ONLY:'只有房主可以開始對戰。',NEED_TWO_PLAYERS:'至少需要 2 位玩家。',NOT_ALL_READY:'請等房內所有玩家都完成驗證並準備。',ROOM_RATE_LIMIT:'目前建立房間的人較多，請稍後再試。',BANK_NOT_READY:'題庫暫時無法使用，請稍後再試。',VERIFICATION_REQUIRED:'請先完成考者驗證。',NOT_STARTED:'倒數尚未結束，請稍候。',QUESTION_ORDER:'題目進度已更新，正在同步。',ROUND_CHANGED:'已經進入下一局，正在同步最新進度。',INVALID_RESPONSE:'請先完成作答。'};
export function validRoomCode(value){return /^(?:K[0-9A-F]{7}|[0-9A-F]{8})$/.test(value);}
export async function classicRequest(action,payload){
    const version=payload.version??(payload.code?.startsWith('K')?2:1),endpoint=version===1?'duel_api':'duel_api_v2';let r,data;
    const networkError=()=>Object.assign(new Error('連線暫時中斷，請重試；已送出的作答會重新向伺服器確認。'),{code:'NETWORK'});
    try{r=await fetch(config.url+'/rest/v1/rpc/'+endpoint,{method:'POST',headers:{apikey:config.publishableKey,'Content-Type':'application/json'},body:JSON.stringify({p_action:action,p_payload:payload}),signal:AbortSignal.timeout(12000)});data=await r.json();}catch{throw networkError();}
    if(!r.ok){const code=Object.keys(errors).find(k=>String(data?.message||'').includes(k)),e=new Error(code==='ROOM_FULL'&&version===1?'舊版雙人房間已滿，最多 2 人。':code?errors[code]:networkError().message);e.code=code||'NETWORK';throw e;}
    if(!data||!Array.isArray(data.players))throw networkError();
    if(version===1){data.version=1;data.round=1;data.host=0;data.records=[];data.players=data.players.map((p,i)=>({...p,seat:i,present:true,inRound:true,rank:data.status==='finished'?(p.forfeit?null:data.winner===null?1:data.winner===i?1:2):null}));}return data;
}

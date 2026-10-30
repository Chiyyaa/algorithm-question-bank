import { getTaipeiSchedule } from './appearance.js?v=20261030-collab-html1';

export function initCollaborationTheme() {
    const key='question_bank_taipei_theme_v1',button=document.getElementById('collabTheme');
    const params=new URLSearchParams(location.search);
    let preference=null,timer;
    function read(){try{const p=JSON.parse(localStorage.getItem(key));preference=p&&['day','night'].includes(p.theme)&&p.expiresAt===getTaipeiSchedule().nextSwitchAt?p:null;}catch{preference=null;}}
    function apply(){
        const schedule=getTaipeiSchedule();
        if(preference?.expiresAt!==schedule.nextSwitchAt)preference=null;
        document.body.dataset.theme=preference?.theme||schedule.theme;
        const night=document.body.dataset.theme==='night';
        button.textContent=night?'日間模式':'夜間模式';button.setAttribute('aria-label',night?'切換日間模式':'切換夜間模式');button.setAttribute('aria-pressed',String(night));
        document.body.dataset.subject=document.getElementById('submissionSubject').value||(['algorithm','os'].includes(params.get('subject'))?params.get('subject'):'algorithm');
        clearTimeout(timer);timer=setTimeout(apply,Math.max(1,Math.min(60000,schedule.nextSwitchAt-Date.now())));
    }
    button.addEventListener('click',()=>{preference={theme:document.body.dataset.theme==='night'?'day':'night',expiresAt:getTaipeiSchedule().nextSwitchAt};try{localStorage.setItem(key,JSON.stringify(preference));}catch{}apply();});
    document.getElementById('submissionSubject').addEventListener('change',apply);
    window.addEventListener('storage',event=>{if(event.key===key||event.key===null){read();apply();}});
    window.addEventListener('focus',apply);window.addEventListener('pageshow',apply);
    window.addEventListener('pagehide',()=>clearTimeout(timer));
    document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(timer);else apply();});
    new MutationObserver(apply).observe(document.getElementById('submissionSubject'),{childList:true});
    read();apply();
}

// Keywords produce review candidates only. Confirmed links require reviewed records
// whose saved source and target contents still match the live question bank.
export function linkSnapshot(q) {
    return {type:q.type,question:q.question,options:q.options||[],correct_answer:q.correct_answer,
        options_status:q.options_status,source_type:q.source_type||q.source_response_type||''};
}
export const needsQuestionLink = q => q?.options_status === 'known_options_only' || q?.type === 'choice_options_missing';
export function completeLinkTarget(q) {
    if (!q || q.type!=='choice' || q.options_status!=='complete' || q.image || !Array.isArray(q.options) || q.options.length<2) return false;
    const options=q.options.map(clean);
    const answers=String(q.correct_answer||'').split(/\r?\n/).filter(Boolean).map(clean);
    return new Set(options).size===options.length && answers.length>0 && answers.every(a=>options.includes(a));
}
function clean(value){return String(value??'').normalize('NFKC').replace(/\s+/g,'').toLowerCase();}
function stemKey(value){return clean(value).replace(/[「」『』'"“”‘’.,，。?？:：;；()（）]/g,'');}
const TOPICS=[
 ['cli',/\bcli\b|command.line|命令列|指令列|命令直譯器/i],['gui',/\bgui\b|graphical user interface|圖形使用者介面/i],
 ['touchscreen',/touchscreen|touch.screen|觸控螢幕|觸控介面/i],['api',/\bapi\b|應用程式介面/i],['win32',/win32/i],
 ['parameters',/parameters?|傳遞參數|參數傳遞/i],['microkernel',/microkernel|微核心/i],['hybrid',/hybrid|混合系統|混合體/i],
 ['modular',/modular|動態載入|可載入核心模組|模組化/i],['layered',/layer\s*(?:0|n)\b|layered|分層/i],
 ['bootstrap',/bootstrap|boot loader|開機引導|引導載入|定位核心|載入核心/i],['sysgen',/sysgen|hardware configuration|硬體配置|系統生成/i],
 ['dtrace',/dtrace|live instrumentation|dynamic tracing|動態追蹤|即時監控/i],['android',/android|dalvik|安卓/i],
 ['ios',/\bios\b|cocoa touch/i],['macos',/mac\s*os\s*x|macos|蘋果/i],['policy',/policy|policies|mechanism|政策|機制分離|做什麼/i],
 ['user_goals',/user goals?|使用者目標/i],['system_goals',/system goals?|系統目標/i],['protection',/protection|保護與安全|「保護」|『保護』/i],
 ['resource_allocation',/resource allocation|accounting|資源配置|記帳/i],['system_programs',/system programs?|系統程式|程式開發支援/i],
 ['pcb',/\bpcb\b|process control block|程序控制區塊/i],['program_counter',/program counter|程式計數器/i],
 ['context_switch',/context switch|上下文切換/i],['cpu_bound',/cpu.bound|cpu綁定|cpu密集/i],['io_bound',/i\/o.bound|i\/o綁定|i\/o密集/i],
 ['long_term',/long.term|長期排程|degree of multiprogramming|多重程式化的程度/i],['short_term',/short.term|短期排程/i],
 ['swapping',/medium.term|中期排程|swapping/i],['fork',/fork\s*\(|creates? a new process|創建.*新.*程序|建立.*新.*行程/i],
 ['exec',/exec\s*\(|replace.*memory space|替換.*記憶體空間/i],['shared_memory',/shared.memory|共享記憶體|共用記憶體/i],
 ['message_passing',/message passing|訊息傳遞/i],['direct_communication',/direct communication|直接通訊/i],
 ['indirect_communication',/indirect communication|間接通訊|mailbox|信箱/i],['ordinary_pipe',/ordinary pipes?|普通管道/i],
 ['named_pipe',/named pipes?|命名管道|具名管道/i],['rpc',/\brpc\b|remote procedure call|遠端程序呼叫/i],
 ['socket',/sockets?|通訊端點|連接埠/i],['buffer_capacity',/capacity|訊息.*佇列|queue of messages/i],
 ['process_parts',/parts.*process|process.*contain|程序.*包含|process.*memory|dynamic memory allocation|動態記憶體分配/i],
 ['process_states',/process states?|state of a process|程序.*狀態|process.*waiting for/i],
 ['cooperation',/process cooperation|cooperating process|程序合作|合作程序/i],['communication_link',/communication link|通訊連結/i],
 ['chrome',/chrome/i]
];
function topics(value){return TOPICS.filter(([,pattern])=>pattern.test(value)).map(([name])=>name);}
function intent(value){
    if(/invented|發明/i.test(value))return 'inventor';
    if(/most common api|最常見的.*api|哪一種.*api/i.test(value))return 'api_standard';
    if(/api function.*creat|api.*函數|api.*建立.*新/i.test(value))return 'process_creation_api';
    if(/communication mechanism|溝通機制/i.test(value))return 'communication_mechanism';
    if(/which.*(?:kernel structure|architecture)|哪.*作業系統架構/i.test(value))return 'kernel_structure';
    if(/synchronization types|同步化類型/i.test(value))return 'message_sync';
    if(/operations.*message passing|message passing.*operations|訊息傳遞.*操作/i.test(value))return 'message_operations';
    if(/which two ipc systems|哪兩種.*ipc.*系統/i.test(value))return 'ipc_implementations';
    if(/distinctions between.*shared memory|兩種.*模型.*區別/i.test(value))return 'ipc_model_comparison';
    if(/cooperation|cooperating process|程序合作|合作程序/i.test(value)){
        if(/reasons?|原因|理由/i.test(value))return 'cooperation_reasons';
        if(/advantages?|benefits?|優點|好處/i.test(value))return 'cooperation_benefits';
    }

    if (/what type of process|被稱為哪一種|被稱為.*類型/i.test(value)) return 'process_type';
    if (/characteristic|特徵/i.test(value)) return 'characteristic';
    if (/advantages?|benefits?|優點|好處/i.test(value)) return 'benefits';
    if (/disadvantages?|缺點/i.test(value)) return 'drawbacks';
    if (/what is the name.*gui|gui.*介面名稱/i.test(value)) return 'gui_name';
    if (/which operating system.*gui|哪個作業系統.*gui/i.test(value)) return 'os_for_gui';
    return '';
}
function exclusive(value){
    const flags={};
    const simplified=value.replace(/[「」『』"']/g,'').replace(/\s+/g,' ');
    const english=/from\s+(?:the\s+)?(running|ready|waiting|new|terminated)\b.{0,35}?\bto\s+(?:the\s+)?(running|ready|waiting|new|terminated)\b/i.exec(simplified);
    const chinese=/從\s*(執行中|就緒|等待中|新建立|終止).{0,18}?(?:到|為)\s*(執行中|就緒|等待中|新建立|終止)/.exec(simplified);
    const names={執行中:'running',就緒:'ready',等待中:'waiting',新建立:'new',終止:'terminated'};
    if(english)flags.transition=english[1].toLowerCase()+'>'+english[2].toLowerCase();
    if(chinese)flags.transition=names[chinese[1]]+'>'+names[chinese[2]];

    if (/ordinary pipes?|普通管道/i.test(value))flags.pipe='ordinary';
    if (/named pipes?|命名管道|具名管道/i.test(value))flags.pipe='named';
    if (/cpu.bound|cpu綁定/i.test(value))flags.bound='cpu';
    if (/i\/o.bound|i\/o綁定/i.test(value))flags.bound='io';
    if (/indirect communication|間接通訊/i.test(value))flags.communication='indirect';
    else if (/direct communication|直接通訊/i.test(value))flags.communication='direct';
    if (/layer\s*0|最底層|最底層/i.test(value))flags.layer='zero';
    if (/layer\s*n\b|最高層/i.test(value))flags.layer='top';
    if (/user goals?|使用者目標/i.test(value))flags.goals='user';
    if (/system goals?|系統目標/i.test(value))flags.goals='system';
    if (/terminated child|終止的子程序|終止.*子程序.*wait|殭屍|zombie/i.test(value))flags.lifecycle='zombie';
    else if (/parent.*terminated.*child|child.*remains.*parent|子程序.*父程序終止|孤兒|orphan/i.test(value))flags.lifecycle='orphan';
    return flags;
}
export function compatibleLinkConditions(source,target){
    const a=source.question,b=target.question,fa=exclusive(a),fb=exclusive(b);
    for(const key of Object.keys(fa))if(fb[key]&&fb[key]!==fa[key])return false;
    const ia=intent(a),ib=intent(b);if(ia&&ib&&ia!==ib)return false;
    const negative=s=>/\bnot\b|\bexcept\b|不屬|不是|沒有|不符合|缺點|disadvantage/i.test(s);
    if(negative(a)!==negative(b))return false;
    const numbers=s=>[...new Set(s.normalize('NFKC').match(/\b\d+(?:\.\d+)?\b/g)||[])].sort();
    const na=numbers(a),nb=numbers(b);if(na.length&&nb.length&&JSON.stringify(na)!==JSON.stringify(nb))return false;
    const kind=q=>/多選|複選/.test(q.source_type||q.source_response_type||'')?'multiple':/單選/.test(q.source_type||q.source_response_type||'')?'single':'';
    return !(kind(source)&&kind(target)&&kind(source)!==kind(target));
}
function grams(value){const s=stemKey(value),out=new Set();for(let i=0;i<s.length-1;i++)out.add(s.slice(i,i+2));return out;}
function similarity(a,b){if(!a.size||!b.size)return 0;let shared=0;for(const value of a)if(b.has(value))shared++;return 2*shared/(a.size+b.size);}
function safeRecord(record){return record&&['confirmed','candidate'].includes(record.status)&&['u3','u4'].includes(record.unit)&&Number.isSafeInteger(record.source_id)&&record.source_id>0&&Number.isSafeInteger(record.target_id)&&record.target_id>0&&record.source_id!==record.target_id;}
function snapshotEqual(q,expected){return expected&&JSON.stringify(linkSnapshot(q))===JSON.stringify(expected);}
export function createQuestionRelations({subject,unit,questions,records=[]}){
    const result={rows:new Map(),searchAliases:new Map(),counts:{pending:0,confirmed:0,candidate:0,unresolved:0}};
    if(subject!=='os'||!['u3','u4'].includes(unit))return result;
    const byId=new Map(questions.map(q=>[q.id,q]));
    const complete=questions.filter(completeLinkTarget).map(q=>({q,stems:[q.question,...q.question_aliases||[]].map(stemKey),topics:topics(q.question),grams:grams(q.question)}));
    const selected=records.filter(r=>safeRecord(r)&&r.unit===unit);
    for(const source of questions.filter(needsQuestionLink)){
        const links=[],registered=selected.filter(r=>r.source_id===source.id);let stale=false;
        for(const r of registered){const target=byId.get(r.target_id);if(!target||!completeLinkTarget(target)||!snapshotEqual(source,r.expected_source)||!snapshotEqual(target,r.expected_target)||!compatibleLinkConditions(source,target)){stale=true;continue;}
            links.push({target,status:r.status,reason:r.reason||'請核對題幹、條件與選項。',score:r.status==='confirmed'?10:5,curated:true});
            if(r.status==='confirmed'){
                const aliases=result.searchAliases.get(target.id)||[];
                aliases.push(source.question,...source.question_aliases||[],...source.keywords||[],...source.options||[]);result.searchAliases.set(target.id,aliases);
            }
        }
        const confirmed=links.filter(link=>link.status==='confirmed');
        if(!confirmed.length){
            const sourceTopics=topics(source.question),sourceGrams=grams(source.question),key=stemKey(source.question),options=(source.options||[]).map(clean);
            const exactTargets=complete.filter(target=>target.stems.includes(key));
            for(const target of (exactTargets.length?exactTargets:complete)){if(target.q.id===source.id||links.some(link=>link.target.id===target.q.id)||!compatibleLinkConditions(source,target.q))continue;
                const exact=target.stems.includes(key),shared=sourceTopics.filter(t=>target.topics.includes(t)),similar=similarity(sourceGrams,target.grams),overlap=(target.q.options||[]).filter(o=>options.includes(clean(o))).length;
                if(!exact&&!(shared.length>=2&&similar>=.15)&&!(shared.length>=1&&similar>=.45)&&!(shared.length>=1&&intent(source.question)&&intent(source.question)===intent(target.q.question)&&overlap>0))continue;
                const score=exact?4:shared.length+similar+Math.min(overlap,2)*.15;
                links.push({target:target.q,status:'candidate',reason:exact?'題幹或已核對的舊寫法相同；選項仍待完整核對。':'依題幹關鍵詞找到相近的完整版本，請核對條件與選項。',score,curated:false});
            }
        }
        const shown=(confirmed.length?confirmed:links).sort((a,b)=>b.score-a.score||a.target.id-b.target.id).slice(0,confirmed.length?2:3);
        const state=confirmed.length?'confirmed':shown.length?'candidate':'unresolved';
        result.rows.set(source.id,{source,state,links:shown,stale});result.counts.pending++;result.counts[state]++;
    }
    return result;
}
export function enrichBatchQuestionReferences(rows,entries,records=[]){
    const indexes=new Map();for(const unit of ['u3','u4'])indexes.set(unit,createQuestionRelations({subject:'os',unit,questions:entries.filter(q=>q.subject==='os'&&q.unit===unit),records}));
    return rows.map(row=>{
        if(row.status!=='review')return row;
        const query={question:row.input.stem,source_type:row.input.kind==='single'?'單選':row.input.kind==='multiple'?'多選':'填空'};
        const exact=ref=>[ref.question,...ref.question_aliases||[]].some(s=>stemKey(s)===stemKey(row.input.stem));
        const references=row.references.filter(ref=>ref.subject!=='os'||!indexes.has(ref.unit)||exact(ref)||(compatibleLinkConditions(query,ref)&&((ref.type==='fill_blank')===(row.input.kind==='fill')||ref.type==='disputed')));
        const additions=[];
        for(const ref of references){if(ref.subject!=='os'||!indexes.has(ref.unit))continue;const relation=indexes.get(ref.unit).rows.get(ref.id);if(!relation)continue;
            for(const link of relation.links)if(exact(ref)||compatibleLinkConditions(query,link.target))additions.push({...link.target,subject:'os',unit:ref.unit,relation_status:link.status,relation_reason:link.reason});
        }
        const unique=[];for(const ref of [...additions,...references])if(!unique.some(q=>q.subject===ref.subject&&q.unit===ref.unit&&q.id===ref.id))unique.push(ref);
        if(!unique.length&&row.references.some(ref=>ref.subject==='os'&&indexes.has(ref.unit)))return {...row,status:'unmatched',references:[],reason:'目前沒有找到題型與條件相符的題庫版本。'};
        return additions.length||references.length!==row.references.length?{...row,references:unique.slice(0,4)}:row;
    });
}

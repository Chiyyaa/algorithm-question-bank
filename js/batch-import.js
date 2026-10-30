export const MAX_BATCH_BYTES=2*1024*1024;
export const MAX_BATCH_QUESTIONS=100;

export function decodeBatchFile(buffer) {
    const bytes=new Uint8Array(buffer);
    if(bytes.length>MAX_BATCH_BYTES)throw new Error('檔案超過 2 MB，請改用較小的題目頁。');
    if(bytes[0]===255&&bytes[1]===254)return {text:new TextDecoder('utf-16le').decode(bytes),warning:''};
    if(bytes[0]===254&&bytes[1]===255)return {text:new TextDecoder('utf-16be').decode(bytes),warning:''};
    try{return {text:new TextDecoder('utf-8',{fatal:true}).decode(bytes),warning:''};}
    catch{return {text:new TextDecoder('big5').decode(bytes),warning:'檔案已依 Big5 解讀，請先確認預覽中的中文字是否正確。'};}
}

export function parseBatchHTML(raw) {
    if(typeof raw!=='string'||!raw.trim())throw new Error('檔案沒有可讀取的內容。');
    if(raw.length>MAX_BATCH_BYTES)throw new Error('檔案內容過大，請改用較小的題目頁。');
    // Template content stays inert: never execute scripts, load resources or mount imported nodes.
    const template=document.createElement('template');
    template.innerHTML=raw;
    const root=template.content;
    if(root.querySelector('.question-result')&&!root.querySelector('input[name^="answers["]'))
        throw new Error('這份檔案是答案頁；初版請匯入含題目與選項的題目頁 HTML。');
    const ignored='script,style,noscript,template,iframe,object,embed,button,select,[hidden],[aria-hidden="true"],.answer,.correct-answer,.explanation,.solution';
    const isHidden=el=>!!el.closest('[hidden],[aria-hidden="true"],[style*="display: none"],[style*="display:none"],[style*="visibility: hidden"],[style*="visibility:hidden"]');
    const blocks=[...root.querySelectorAll('.question-block,.question-card,[data-question]')].filter(block=>{
        if(isHidden(block))return false;
        const fields=[...block.querySelectorAll('input')].filter(i=>i.closest('.question-block,.question-card,[data-question]')===block&&!isHidden(i));
        if(!fields.some(i=>/^(radio|checkbox|text)$/.test(i.type)))return false;
        if(block.matches('.question-block'))return fields.some(i=>/^answers\[/.test(i.name));
        return !!block.querySelector('.question-text,.question,.stem,[data-question-text]');
    });
    if(!blocks.length)throw new Error('沒有辨識到題目。請儲存含完整題幹、選項或填空欄位的題目頁 HTML。');
    if(blocks.length>MAX_BATCH_QUESTIONS)throw new Error('辨識到 '+blocks.length+' 題，超過每次 100 題；請分批處理，不會自動截掉題目。');
    return blocks.map((block,index)=>{
        const inputs=[...block.querySelectorAll('input')].filter(i=>i.closest('.question-block,.question-card,[data-question]')===block&&!isHidden(i)&&/^(radio|checkbox|text)$/.test(i.type)&&(!block.matches('.question-block')||/^answers\[/.test(i.name)));
        const blanks=new Map(inputs.filter(i=>i.type==='text').map((input,i)=>[input,i+1]));
        function read(node){
            if(node.nodeType===3)return node.textContent;
            if(node.nodeType!==1||node.matches(ignored)||isHidden(node))return '';
            if(node.tagName==='INPUT')return blanks.has(node)?'[__'+blanks.get(node)+'__]':'';
            if(node.tagName==='BR')return '\n';
            if(node.tagName==='IMG')return '[題目圖片]';
            const text=[...node.childNodes].map(read).join('');
            return /^(P|DIV|PRE|LI)$/.test(node.tagName)?'\n'+text+'\n':text;
        }
        const clean=s=>s.replace(/\r/g,'').replace(/[\t ]+/g,' ').replace(/ *\n */g,'\n').replace(/\n{3,}/g,'\n\n').trim();
        const fields=[...block.querySelectorAll('.question-text,.question,.stem,[data-question-text]')];
        const outer=fields.filter(n=>!fields.some(parent=>parent!==n&&parent.contains(n)));
        const heading=outer[0]?.textContent||'';
        let stem=clean(outer.map(read).join('\n')).replace(/^\s*(?:(?:妖獸|Beast|題目|Question)\s*)?\d+[.．、:)）]\s*/i,'');
        const choices=inputs.filter(i=>i.type==='radio'||i.type==='checkbox');
        const options=choices.map((input,i)=>{
            const label=input.closest('label')||[...block.querySelectorAll('label')].find(l=>l.htmlFor===input.id&&input.id);
            const shown=clean(label?read(label):'');
            const match=/^(?:([A-Ha-h])[.．、:)）]\s*|([1-9])[.．、:)）]\s+)([\s\S]+)$/.exec(shown);
            return {label:match?(match[1]||match[2]).toUpperCase():String.fromCharCode(65+i),text:match?match[3].trim():shown};
        });
        const issues=[];
        if(!stem)issues.push('題幹不完整');
        if(choices.length&&blanks.size)issues.push('同一題同時含選擇與填空欄位');
        if(choices.length&&choices.some(i=>i.type!==choices[0].type))issues.push('選項類型不一致');
        if(choices.length&&(choices.length<2||options.some(o=>!o.text)))issues.push('選項不完整');
        if(block.querySelector('img,svg,canvas,math'))issues.push('題目含圖片或其他未完整轉錄的內容');
        const sourceNumber=heading.match(/(?:妖獸|Beast|題目|Question)?\s*(\d+)[.．、:)）]/i)?.[1]||null;
        return {number:index+1,sourceNumber,originalId:inputs.map(i=>i.name.match(/^answers\[([^\]]+)\]/)?.[1]||i.dataset.questionId).find(Boolean)||null,
            kind:blanks.size?'fill':choices[0]?.type==='checkbox'?'multiple':'single',stem,options,blankCount:blanks.size,issues};
    });
}

import { escapeHtml as esc } from './utils.js?v=20261017-formats1';

// Change whitespace only, never tokens, answers, or conditions.
export function formatProgram(source) {
    let result='',line='',indent=0,paren=0,quote='',escaped=false;
    const flush=()=>{if(line.trim())result+='    '.repeat(Math.max(0,indent))+line.trim()+'\n';line='';};
    for(let i=0;i<source.length;i++){
        const c=source[i];
        if(quote){line+=c;if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c===quote)quote='';continue;}
        if(c==='"'||c==="'"||c==='`'){quote=c;line+=c;continue;}
        if(c==='/'&&source[i+1]==='/'){const end=source.indexOf('\n',i);line+=source.slice(i,end<0?source.length:end);flush();if(end<0)break;i=end;continue;}
        if(c==='/'&&source[i+1]==='*'){const end=source.indexOf('*/',i+2);if(end<0){line+=source.slice(i);break;}line+=source.slice(i,end+2);i=end+1;continue;}
        if(c==='(')paren++;if(c===')')paren=Math.max(0,paren-1);
        if(c==='{'){line+=c;flush();indent++;}
        else if(c==='}'){flush();indent=Math.max(0,indent-1);line='}';flush();}
        else if(c===';'&&paren===0){line+=c;flush();}
        else if(/\s/.test(c)){if(line&&!line.endsWith(' '))line+=' ';}
        else line+=c;
    }
    flush();return result.trimEnd();
}
function programEnd(text,start){let depth=0,seen=false,quote='',escape=false;for(let i=start;i<text.length;i++){const c=text[i];if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c===quote)quote='';continue;}if(c==='"'||c==="'"||c==='`'){quote=c;continue;}if(c==='/'&&text[i+1]==='/'){const end=text.indexOf('\n',i);if(end<0)return-1;i=end;continue;}if(c==='/'&&text[i+1]==='*'){const end=text.indexOf('*/',i+2);if(end<0)return-1;i=end+1;continue;}if(c==='{'){depth++;seen=true;}else if(c==='}'&&seen&&--depth===0)return i+1;}return-1;}
export function questionParts(value){const text=String(value??''),parts=[];let rest=text;
    const fenced=/```(?:[\w+-]+)?\n([\s\S]*?)```/g;let match,last=0;
    while((match=fenced.exec(text))){if(match.index>last)parts.push({type:'text',text:text.slice(last,match.index)});parts.push({type:'code',text:match[1].trimEnd()});last=fenced.lastIndex;}
    if(last){if(last<text.length)parts.push({type:'text',text:text.slice(last)});return parts;}
    const signature=/\bfunction\s+[\w$]+\s*\([^)]*\)\s*\{|\b(?:int|void|long|double|float|bool|char)\s+[\w$]+\s*\([^)]*\)\s*\{/m.exec(text);
    if(signature){const end=programEnd(text,signature.index);if(end>0){if(signature.index)parts.push({type:'text',text:text.slice(0,signature.index)});parts.push({type:'code',text:formatProgram(text.slice(signature.index,end))});if(end<text.length)parts.push({type:'text',text:text.slice(end)});return parts;}}
    const paragraphs=text.split(/\n\s*\n/);if(paragraphs.some(t=>/(?:HEAPIFY|COUNTING[_ -]?SORT|PARTITION|INSERTION[_ -]?SORT|MERGE[_ -]?SORT|SELECT)/i.test(t)&&[...t.matchAll(/^\s*\d{1,2}\s+/gm)].length>=3))return paragraphs.map(t=>({type:/(?:HEAPIFY|COUNTING[_ -]?SORT|PARTITION|INSERTION[_ -]?SORT|MERGE[_ -]?SORT|SELECT)/i.test(t)&&[...t.matchAll(/^\s*\d{1,2}\s+/gm)].length>=3?'code':'text',text:t}));
    if(/(?:HEAPIFY|COUNTING[_ -]?SORT|PARTITION|INSERTION[_ -]?SORT|MERGE[_ -]?SORT|RANDOMIZED[_ -]?SELECT|MAX[_ -]?HEAP|HEAPSORT)/i.test(text)){
        const narrative=/(?:關於(?:虛擬碼|上述|以上)|以上(?:程式|演算法|虛擬碼)|請問(?:上述|以上)|下列(?:敘述|選項))/.exec(text),cut=narrative?.index??text.length;
        const code=text.slice(0,cut),markers=[...code.matchAll(/(?:^|\s)(\d{1,2})\s+(?=[a-zA-Z_>])/g)];
        let expected=1;const chosen=markers.filter(m=>Number(m[1])===expected?!!expected++:false);if(chosen.length>=3){let numbered='',last=0;for(const m of chosen){const at=m.index+(m[0].length-m[0].trimStart().length);numbered+=code.slice(last,at).trimEnd()+'\n';last=at;}numbered+=code.slice(last);parts.push({type:'code',text:numbered.trim()});if(cut<text.length)parts.push({type:'text',text:text.slice(cut)});return parts;}
    }
    return[{type:'text',text:rest}];
}
export function renderQuestion(value){return questionParts(value).map(p=>p.type==='code'?'<div class="classic-code-wrap" role="region" aria-label="題目程式碼，可左右捲動" tabindex="0"><pre class="classic-code"><code>'+esc(p.text)+'</code></pre></div>':'<div class="duel-stem classic-prose">'+esc(p.text.trim())+'</div>').join('');}

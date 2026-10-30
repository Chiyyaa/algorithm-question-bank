const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),bank=JSON.parse(fs.readFileSync(path.join(root,'data/os-u5.json'),'utf8'));
(async()=>{
 const m=new vm.SourceTextModule(fs.readFileSync(path.join(root,'js/batch-core.js'),'utf8'));await m.link(()=>{throw Error('Unexpected dependency')});await m.evaluate();const core=m.namespace;
 const entries=bank.map(q=>({...q,subject:'os',unit:'u5'})),index=core.createBatchIndex(entries);
 const input=q=>({number:q.id,stem:q.question,kind:q.type==='fill_blank'?'fill':/多選|複選/.test(q.source_response_type||q.source_type||'')?'multiple':'single',options:q.options.map((text,i)=>({label:String.fromCharCode(65+i),text})),blankCount:q.type==='fill_blank'?1:0,issues:[]});
 const compare=(q,list=index)=>core.compareBatchQuestions([q],list,{subject:'os',unit:'u5'})[0],get=id=>bank.find(q=>q.id===id);
 assert.equal(bank.length,126);assert.equal(bank.filter(q=>compare(input(q)).status==='matched').length,122);
 for(const id of [28,116])assert.match(compare(input(get(id))).reason,/原標準答案有爭議/);
 for(const id of [99,106])assert.match(compare(input(get(id))).reason,/尚未確認完整選項/);
 function permutations(a){return a.length?a.flatMap((v,i)=>permutations(a.filter((_,j)=>i!==j)).map(t=>[v,...t])):[[]];}
 let permuted=0,negative=0;
 for(const q of bank.filter(q=>q.type==='choice'&&q.options_status==='complete')){
  for(const options of permutations(q.options)){
   const test={...input(q),options:options.map((text,i)=>({label:String.fromCharCode(65+i),text}))},result=compare(test);assert.equal(result.status,'matched','Permutation #'+q.id);
   assert.deepEqual(Array.from(result.answers,a=>a.replace(/^[A-H]．/,'')).sort(),q.correct_answer.split('\n').sort());
   for(const answer of result.answers){const label=answer[0],text=answer.slice(2);assert.equal(test.options.find(o=>o.label===label).text,text);}permuted++;
  }
  const wrong=input(q);wrong.options[0].text+=' 明確不同的條件';assert.notEqual(compare(wrong).status,'matched');
  const kind={...input(q),kind:input(q).kind==='single'?'multiple':'single'};assert.notEqual(compare(kind).status,'matched');assert.match(compare(kind).reason,/題型不同/);
  const labels=input(q);labels.options[1].label=labels.options[0].label;assert.notEqual(compare(labels).status,'matched');assert.match(compare(labels).reason,/代號/);negative+=3;
 }
 assert.equal(permuted,1920);assert.equal(negative,240);
 for(const id of [3,17,57,80]){const q=get(id);assert.ok(q.question_aliases?.length);for(const stem of q.question_aliases){assert.equal(compare({...input(q),stem}).status,'matched');if(q.options.length){const changed={...input(q),stem};changed.options[0].text+='不同';assert.notEqual(compare(changed).status,'matched');}}}
 assert.match(get(17).question,/speedup =/);assert.match(get(80).question,/speedup =/);assert.equal(get(17).correct_answer,'serial portion');assert.equal(get(80).correct_answer,'processing cores');
 for(const [id,stem] of [[73,'One-to-One 模型有何特性？'],[72,get(126).question],[125,get(5).question]])assert.notEqual(compare({...input(get(id)),stem},core.createBatchIndex(entries.filter(q=>q.id===id))).status,'matched');
 const sample=get(44),conflict={...sample,id:1000001,correct_answer:sample.options.find(o=>!sample.correct_answer.split('\n').includes(o)),subject:'os',unit:'u5'};
 assert.match(compare(input(sample),core.createBatchIndex([entries.find(q=>q.id===44),conflict])).reason,/不同答案版本/);
 assert.notEqual(core.normalizeBatchText('O(n)'),core.normalizeBatchText('o(n)'));assert.notEqual(core.normalizeBatchText('n²'),core.normalizeBatchText('n2'));
 if(process.env.U5_TEXT_SOURCE){
  const text=fs.readFileSync(process.env.U5_TEXT_SOURCE,'utf8');let count=0;
  for(const match of text.matchAll(/第 (\d+) 題｜來源：([^\r\n]+)\r?\n題型：([^\r\n]+)\r?\n題目：([\s\S]*?)\r?\n選項：\r?\n([\s\S]*?)\r?\n正確答案：([^\r\n]+)/g)){
   const options=Array.from(match[5].matchAll(/^[A-H]\. (.+)$/gm),o=>o[1].trim());const q={number:+match[1],stem:match[4].trim().replace(/_{2,}/g,'[__1__]'),kind:options.length?/多選/.test(match[3])?'multiple':'single':'fill',options:options.map((text,i)=>({label:String.fromCharCode(65+i),text})),blankCount:options.length?0:1,issues:[]};
   const result=compare(q);assert.equal(result.status,'matched','Source question '+q.number);let expected=match[6];if(options.length){const labels=expected.match(/^([A-H](?:、[A-H])*)（/);assert.ok(labels);expected=labels[1].split('、').map(l=>options[l.charCodeAt(0)-65]).join('\n');}
   const record=bank.find(b=>b.id===result.references[0].id);assert.deepEqual(record.correct_answer.split('\n').map(core.normalizeBatchText).sort(),expected.split('\n').map(core.normalizeBatchText).sort());count++;
  }assert.equal(count,97);console.log('PASS all 97 source questions and independent answer-text comparison');
 }
 console.log('PASS all 126 U5 classifications, 1920 option orders, 240 invalid-input controls, reviewed aliases, distinct model/S/N questions and specific review reasons');
})().catch(e=>{console.error(e);process.exitCode=1;});

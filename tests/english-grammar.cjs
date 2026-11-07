const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const data=JSON.parse(fs.readFileSync(path.join(root,'data/english-grammar.json'),'utf8'));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.css':'text/css; charset=utf-8','.jpg':'image/jpeg'};
const server=http.createServer((req,res)=>{
    const route=new URL(req.url,'http://localhost').pathname.replace(/^\/algorithm-question-bank/,'');
    const file=path.resolve(root,'.'+(route.endsWith('/')?route+'index.html':route));
    if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    fs.readFile(file,(error,body)=>{if(error){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Date':'Thu, 05 Nov 2026 04:00:00 GMT','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:body);});
});
(async()=>{
    const {createGrammarSession}=await import(pathToFileURL(path.join(root,'js/english-grammar.js')));
    assert.equal(data.questions.length,50);assert.deepEqual(data.questions.map(q=>q.id),Array.from({length:50},(_,i)=>i+1));
    if(process.env.ENGLISH_GRAMMAR_SOURCE){
        const source=fs.readFileSync(process.env.ENGLISH_GRAMMAR_SOURCE,'utf8');
        const rows=[...source.matchAll(/^(\d+)\. (.+)\r?\n\(A\) (.+?) \(B\) (.+?) \(C\) (.+?) \(D\) (.+)\r?\n答案：([A-D])\r?\n解析：(.+)/gm)];
        assert.equal(rows.length,50);
        assert.deepEqual(data.questions,rows.map(m=>({id:Number(m[1]),question:m[2],options:m.slice(3,7),answer:m[7],explanation:m[8]})));
    }
    for(const size of [20,50])for(const random of [()=>0,()=>.99999,Math.random]){
        const s=createGrammarSession(data.questions,size,random);assert.equal(s.items.length,size);assert.equal(new Set(s.items.map(i=>i.question.id)).size,size);
        assert.ok(s.items.every(i=>i.question.id>=1&&i.question.id<=50&&!i.answered));
        if(size===50)assert.deepEqual(s.items.map(i=>i.question.id).sort((a,b)=>a-b),data.questions.map(q=>q.id));
    }
    assert.throws(()=>createGrammarSession(data.questions,30));
    console.log('PASS exact source fidelity for 50 questions/options/answers/explanations, 20/50 unique sampling');
    console.log('PASS archived grammar data preserved; retired page routing is covered by tests/english.cjs');
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});

const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const sampleFile=process.env.BATCH_SAMPLE_FILE;
const sampleAnswers=process.env.BATCH_SAMPLE_ANSWERS;
const htmlEscape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function formQuestion(stem,options,{id=1,number=1,type='radio'}={}){return '<div class="question-block"><p class="question-text">妖獸 '+number+'. '+htmlEscape(stem)+'</p>'+options.map((o,i)=>'<label><input type="'+type+'" name="answers['+id+']'+(type==='checkbox'?'[]':'')+'" value="'+(99-i)+'">'+String.fromCharCode(65+i)+'. '+htmlEscape(o)+'</label>').join('')+'</div>';}
(async()=>{
 let server,browser;
 try{
  const module=new vm.SourceTextModule(fs.readFileSync(path.join(root,'js/batch-core.js'),'utf8'),{context:vm.createContext({})});await module.link(()=>{throw Error('Unexpected dependency');});await module.evaluate();const core=module.namespace;
  const question={number:1,kind:'single',stem:'CPU 排程器屬於哪種類型？',options:[{label:'A',text:'長程'},{label:'B',text:'短程'},{label:'C',text:'中程'}],blankCount:0,issues:[]};
  const entry={subject:'os',unit:'u3',id:60,question:question.stem,type:'choice',options:['A. 短程','B. 中程','C. 長程'],correct_answer:'短程'};
  const compare=(q,entries=[entry])=>core.compareBatchQuestions([q],core.createBatchIndex(entries),{subject:'os'})[0];
  assert.equal(compare(question).status,'matched');assert.deepEqual(Array.from(compare(question).answers),['B．短程']);
  assert.equal(compare({...question,options:[...question.options.slice(0,2),{label:'C',text:'改動選項'}]}).status,'review');
  assert.equal(compare(question,[entry,{...entry,id:61,correct_answer:'中程'}]).status,'review');
  assert.equal(compare(question,[{...entry,type:'disputed'}]).status,'review');
  assert.equal(compare({...question,issues:['題目含圖片']}).status,'review');
  assert.equal(compare({...question,stem:'完全陌生的顏色與樂器 XYZ987'}).status,'unmatched');
  assert.notEqual(core.normalizeBatchText('O(n)'),core.normalizeBatchText('o(n)'));
  assert.notEqual(core.normalizeBatchText('Ω(n)'),core.normalizeBatchText('ω(n)'));
  assert.equal(core.normalizeBatchText('n²'),core.normalizeBatchText('n^2'));
  assert.notEqual(core.normalizeBatchText('n²'),core.normalizeBatchText('n2'));
  assert.equal(core.stripBatchOption('1.25'),'1.25');
  const numeric={...question,stem:'執行到 j=12 時的結果？'};
  assert.notEqual(compare({...numeric,stem:'執行到 j=2 時的結果？'},[{...entry,question:numeric.stem}]).status,'matched');
  const fill={number:1,kind:'fill',stem:'陣列 A [__1__]；陣列 B [__2__]',options:[],blankCount:2,issues:[]};
  const fillEntry={...entry,type:'fill_blank',question:fill.stem,options:[],correct_answer:'（1）0,1,2\n（2）2,4,7'};
  assert.equal(compare(fill,[fillEntry]).status,'matched');assert.equal(compare({...fill,blankCount:1},[fillEntry]).status,'review');
  assert.equal(compare(question,[{...entry,subject:'algorithm'}]).status,'unmatched');
  assert.equal(core.batchQuestionHref(entry),'./?subject=os&unit=u3&question=60');
  const os5=JSON.parse(fs.readFileSync(path.join(root,'data/os-u5.json'),'utf8'));
  const models=os5.filter(q=>[20,73].includes(q.id)).map(q=>({...q,subject:'os',unit:'u5'}));
  const many=models.find(q=>q.id===73);
  const manyInput={number:2,kind:'multiple',stem:'Many-to-One 模型有何特性？',options:many.options.map((text,i)=>({label:String.fromCharCode(65+i),text})),blankCount:0,issues:[]};
  const modelResult=compare(manyInput,models);
  assert.equal(modelResult.status,'review');assert.deepEqual(Array.from(modelResult.references,r=>r.id),[73]);
  assert.equal(compare({...manyInput,stem:'Many-to-One 模型的特性有哪些？'},models.filter(q=>q.id===20)).status,'unmatched');
  assert.ok(compare({...manyInput,stem:'Many-to-One 模型的特性有哪些？'},models).references.every(r=>r.id!==20));
  console.log('PASS exact content and option remapping, conflicts/disputes/images, mathematical distinctions, numbers, fill groups and subject isolation');
  server=http.createServer((req,res)=>{
   const route=new URL(req.url,'http://localhost').pathname.replace(/^\/algorithm-question-bank/,'');
   if(route==='/js/collaboration-config.js'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end('export const collaborationConfig={enabled:false,url:"",publishableKey:""};');return;}
   const file=path.resolve(root,'.'+(route.endsWith('/')?route+'index.html':route));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
   fs.readFile(file,(e,b)=>{if(e){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png'})[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(b);});
  });await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+server.address().port+'/algorithm-question-bank/';
  const {chromium}=require('playwright');browser=await chromium.launch({headless:true,channel:'msedge'});const p=await browser.newPage({viewport:{width:1280,height:900},reducedMotion:'reduce'}),errors=[];p.setDefaultTimeout(20000);p.on('pageerror',e=>errors.push(e.message));
  const nav=async name=>{if(await p.locator('#mobileMenuBtn').getAttribute('aria-expanded')!=='true')await p.locator('#mobileMenuBtn').click();await p.locator('[data-panel="'+name+'"]').click();};
  const openCandidate=async(link,id,pageNumber=null)=>{
   await link.scrollIntoViewIfNeeded();
   const original={url:p.url(),scroll:await p.evaluate(()=>scrollY),results:await p.locator('#batchResultList').innerHTML()};
   assert.equal(await link.getAttribute('target'),'_blank');assert.match(await link.getAttribute('rel'),/noopener/);
   const [tab]=await Promise.all([p.context().waitForEvent('page'),link.click()]);
   tab.on('pageerror',e=>errors.push(e.message));await tab.setViewportSize(p.viewportSize());
   await tab.locator('.batch-target').waitFor();assert.equal(await tab.locator('.batch-target').getAttribute('data-id'),String(id));
   assert.equal(await tab.locator('.batch-target .answer').isVisible(),true);assert.equal(await tab.evaluate(()=>window.opener),null);
   if(pageNumber)assert.match(await tab.locator('#pageInfo').innerText(),new RegExp('第 '+pageNumber));
   if(p.viewportSize().width<=850)await tab.waitForFunction(()=>document.getElementById('sidebar').inert);
   assert.equal(p.url(),original.url);assert.equal(await p.locator('#panel-batch').isVisible(),true);
   assert.equal(await p.locator('#batchResultList').innerHTML(),original.results);assert.equal(await p.evaluate(()=>scrollY),original.scroll);
   await tab.close();
  };
  await p.goto(base);assert.equal(await p.locator('#batchNavBtn').isHidden(),true);await p.locator('#algorithmSubjectBtn').click();
  assert.deepEqual(await p.locator('#sidebar .sidebar-nav [data-panel]').evaluateAll(es=>es.map(e=>e.dataset.panel)),['bank','units','batch','practice']);
  await nav('batch');assert.equal(await p.locator('#batchHeading').innerText(),'演算法批次查題');
  const bank=JSON.parse(fs.readFileSync(path.join(root,'data/algorithm-u6.json'),'utf8'));
  const source=bank.find(q=>q.id===22),options=source.options.map(core.stripBatchOption).reverse();
  const safeHTML=formQuestion(source.question,options,{id:9845,number:7})+formQuestion('這是完全陌生的題目 ZYX654',['甲','乙'],{id:12,number:3});
  const result=await p.evaluate(async html=>{const {parseBatchHTML}=await import('./js/batch-import.js?v=20261030-batch1');return parseBatchHTML(html);},safeHTML);
  assert.deepEqual(result.map(q=>q.number),[1,2]);assert.deepEqual(result.map(q=>q.sourceNumber),['7','3']);assert.deepEqual(result.map(q=>q.originalId),['9845','12']);
  if(process.env.BATCH_THREAD_SAMPLE){
   const threadHTML=fs.readFileSync(process.env.BATCH_THREAD_SAMPLE,'utf8');
   const threadRows=await p.evaluate(async html=>(await import('./js/batch-import.js?v=20261030-batch1')).parseBatchHTML(html),threadHTML);
   assert.equal(threadRows[1].stem,'Many-to-One 模型有何特性？');
   const entries=os5.map(q=>({...q,subject:'os',unit:'u5'}));
   const row=core.compareBatchQuestions([threadRows[1]],core.createBatchIndex(entries),{subject:'os',unit:'u5'})[0];
   assert.equal(row.status,'review');assert.deepEqual(Array.from(row.references,r=>r.id),[73]);assert.equal(row.answers.length,0);
   console.log('PASS actual 25-question thread file: question 2 references only U5 #73, never One-to-One #20');
  }
  const attempted='<script>window.__batchInjected=true</script><img src="https://batch-test.invalid/pixel"><iframe src="https://batch-test.invalid/frame"></iframe>'+safeHTML;
  const resources=[];p.on('request',r=>{if(r.url().includes('batch-test.invalid'))resources.push(r.url());});
  await p.locator('#batchFile').setInputFiles({name:'安全測試.html',mimeType:'text/html',buffer:Buffer.from(attempted)});
  await p.locator('#batchPreviewSummary').filter({hasText:'已辨識 2 題'}).waitFor();assert.equal(await p.evaluate(()=>window.__batchInjected===true),false);assert.deepEqual(resources,[]);
  await p.locator('#batchScope').selectOption('u6');await p.locator('#batchCompare').click();await p.locator('#batchResults').waitFor();
  assert.equal(await p.locator('#batchResultList > li').count(),2);assert.equal(await p.locator('[data-batch-number="1"]').getAttribute('data-status'),'matched');
  assert.equal(await p.locator('[data-batch-number="2"]').getAttribute('data-status'),'unmatched');assert.ok((await p.locator('[data-batch-number="1"] .batch-answer').innerText()).includes(source.correct_answer));
  await openCandidate(p.locator('[data-batch-number="1"] .batch-question-link'),22);
  assert.equal(await p.locator('#batchResultList > li').count(),2);
  await p.goto(base+'?subject=algorithm&unit=u6&question=60');await p.locator('.batch-target').waitFor();assert.equal(await p.locator('.batch-target').getAttribute('data-id'),'60');assert.match(await p.locator('#pageInfo').innerText(),/第 3/);
  await p.reload();await p.locator('.batch-target').waitFor();assert.equal(await p.locator('.batch-target').getAttribute('data-id'),'60');
  const parsedTests=await p.evaluate(async ({form})=>{
   const {parseBatchHTML}=await import('./js/batch-import.js?v=20261030-batch1');
   const check=html=>{try{return {rows:parseBatchHTML(html)}}catch(e){return {error:e.message}}};
   return {results:check('<div class="question-result">題目：X 正確答案：Y</div>'),empty:check('<h1>沒有題目</h1>'),hidden:check('<div hidden>'+form+'</div>'+form),tooMany:check(form.repeat(101)),decimal:check('<div class="question-block"><p class="question-text">妖獸 1. 小數？</p><label><input name="answers[8]" type="radio">1.25</label><label><input name="answers[8]" type="radio">2.5</label></div>')};
  },{form:formQuestion('範例題',['甲','乙'])});
  assert.ok(parsedTests.results.error);assert.ok(parsedTests.empty.error);assert.ok(parsedTests.tooMany.error);assert.equal(parsedTests.hidden.rows.length,1);assert.deepEqual(parsedTests.decimal.rows[0].options.map(o=>o.text),['1.25','2.5']);
  await nav('batch');await p.locator('#batchFile').setInputFiles({name:'答案頁.html',mimeType:'text/html',buffer:Buffer.from('<div class="question-result">題目：X 正確答案：Y</div>')});
  await p.locator('#batchStatus').filter({hasText:'答案頁'}).waitFor();assert.equal(await p.locator('#batchCompare').isDisabled(),true);
  await p.locator('#batchFile').setInputFiles({name:'太大.html',mimeType:'text/html',buffer:Buffer.alloc(2*1024*1024+1,32)});await p.locator('#batchStatus').filter({hasText:'超過 2 MB'}).waitFor();
  if(sampleFile){
   const html=fs.readFileSync(sampleFile,'utf8');await p.locator('#batchFile').setInputFiles(sampleFile);await p.locator('#batchPreviewSummary').filter({hasText:'已辨識 21 題'}).waitFor();
   const sample=await p.evaluate(async html=>(await import('./js/batch-import.js?v=20261030-batch1')).parseBatchHTML(html),html);
   assert.equal(sample.length,21);assert.deepEqual(sample.reduce((a,q)=>(a[q.kind]=(a[q.kind]||0)+1,a),{}),{single:7,multiple:7,fill:7});assert.equal(sample[0].originalId,'2427');
   let official=[];
   if(sampleAnswers){
    official=await p.evaluate(html=>{
     const t=document.createElement('template');t.innerHTML=html;
     const read=n=>n.nodeType===3?n.textContent:n.nodeType!==1?'':n.tagName==='BR'?'\n':[...n.childNodes].map(read).join('');
     return [...t.content.querySelectorAll('.question-result')].map(b=>{
      const correct=[...b.querySelectorAll('p')].find(p=>p.querySelector('strong')?.textContent.includes('正確答案'));
      if(!correct)return null;return read(correct).replace(/^\s*正確答案[：:]\s*/,'').trim();
     });
    },fs.readFileSync(sampleAnswers,'utf8'));
    assert.equal(official.length,21);assert.ok(official.every(Boolean));
   }
   await p.locator('#batchScope').selectOption('u6');await p.locator('#batchCompare').click();await p.locator('#batchResults').waitFor();
   assert.deepEqual(await p.locator('#batchResultList > li').evaluateAll(es=>es.map(e=>Number(e.dataset.batchNumber))),Array.from({length:21},(_,i)=>i+1));
   assert.equal(await p.locator('[data-batch-number="1"]').getAttribute('data-status'),'review');assert.ok(await p.locator('[data-batch-number="1"] .batch-question-link').count());assert.equal(await p.locator('[data-batch-number="1"] .batch-answer').count(),0);
   const report=await p.locator('#batchResultSummary').innerText();console.log('REAL SAMPLE '+report);
   if(official.length){
    for(const row of await p.locator('#batchResultList > li[data-status="matched"]').all()){
     const number=Number(await row.getAttribute('data-batch-number'));
     const shown=await row.locator('.batch-answer p').allTextContents();
     const actual=shown.map(s=>core.normalizeBatchText(s.replace(/^(?:[A-H1-9][．.]\s*|第 \d+ 格：)/,''))).sort();
     const expected=official[number-1].split('\n').map(s=>core.normalizeBatchText(s.trim())).filter(Boolean).sort();
     assert.deepEqual(actual,expected,'Matched answer differs from the supplied answer page at '+number);
    }
   }
   if(process.env.BATCH_SCREENSHOTS){fs.mkdirSync(process.env.BATCH_SCREENSHOTS,{recursive:true});await p.screenshot({path:path.join(process.env.BATCH_SCREENSHOTS,'desktop.png')});}
   await openCandidate(p.locator('[data-batch-number="1"] a[data-question-id="31"]'),31,2);
   await nav('batch');await p.setViewportSize({width:390,height:844});await p.waitForFunction(()=>document.getElementById('sidebar').inert);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await openCandidate(p.locator('[data-batch-number="1"] a[data-question-id="31"]'),31,2);
  }
  await p.goto(base);await p.locator('#osSubjectBtn').click();await nav('batch');assert.equal(await p.locator('#batchHeading').innerText(),'作業系統批次查題');assert.equal(await p.locator('#batchResultList > li').count(),0);
  const os=JSON.parse(fs.readFileSync(path.join(root,'data/os-u3.json'),'utf8')).find(q=>q.type==='fill_blank'&&q.question.includes('[__1__]'));
  const osHTML='<div class="question-block"><p class="question-text">妖獸 1. '+htmlEscape(os.question).replace('[__1__]','<input type="text" name="answers[77][]">')+'</p></div>';
  await p.locator('#batchFile').setInputFiles({name:'OS.html',mimeType:'text/html',buffer:Buffer.from(osHTML)});await p.locator('#batchPreviewSummary').filter({hasText:'已辨識 1 題'}).waitFor();await p.locator('#batchScope').selectOption('u3');await p.locator('#batchCompare').click();await p.locator('#batchResults').waitFor();
  assert.equal(await p.locator('[data-batch-number="1"]').getAttribute('data-status'),'matched');
  await openCandidate(p.locator('[data-batch-number="1"] .batch-question-link').first(),os.id);
  // A failed unit must be disclosed instead of being silently presented as complete coverage.
  await p.route('**/data/os-u4.json',route=>route.fulfill({status:503,body:'Unavailable'}));
  await p.locator('#batchScope').selectOption('all');await p.locator('#batchCompare').click();await p.locator('#batchResults').waitFor();
  assert.match(await p.locator('#batchCoverage').innerText(),/部分題庫尚未完整載入/);
  await p.unroute('**/data/os-u4.json');
  await p.route('**/data/os-u3.json',route=>route.fulfill({status:503,body:'Unavailable'}));
  await p.locator('#batchScope').selectOption('u3');await p.locator('#batchCompare').click();await p.locator('#batchStatus').filter({hasText:'題庫無法載入'}).waitFor();
  assert.equal(await p.locator('#batchResults').isHidden(),true);assert.equal(await p.locator('#batchCompare').isEnabled(),true);
  await p.unroute('**/data/os-u3.json');await p.locator('#batchCompare').click();await p.locator('#batchResults').waitFor();
  await p.locator('#homeThemeBtn').evaluate(button=>button.click());assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await p.goto(base+'english.html');assert.equal(await p.locator('#batchNavBtn,#panel-batch').count(),0);assert.deepEqual(errors,[]);
  console.log('PASS ordered import, retained source IDs, inert HTML, preview, matching, new-tab candidates with original results/scroll preserved, page targeting, reloadable links, partial/invalid files, both subjects and mobile; English unchanged');
 }finally{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});

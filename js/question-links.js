import {createQuestionRelations,enrichBatchQuestionReferences} from './question-links-core.js?v=20261030-batch-v2';
import {escapeHtml,normalize} from './utils.js?v=20261017-formats1';

const supported=context=>context?.subject==='os'&&['u3','u4'].includes(context.unit);
const href=(unit,id)=>'./?subject=os&unit='+encodeURIComponent(unit)+'&question='+id;
export function createQuestionLinkController({onReady=()=>{}}={}){
    let context=null,previousRows=[],cached=null,revision=0,cachedRevision=-1;
    let records=[],status='idle',promise=null;
    function ensureRegistry(){
        if(status==='ready')return Promise.resolve(records);
        if(promise)return promise;
        status='loading';
        promise=fetch(new URL('../data/question-links-os.json?v=20261030-batch-v2',import.meta.url),{cache:'no-cache',signal:AbortSignal.timeout(6000)})
            .then(async response=>{if(!response.ok)throw Error('Registry unavailable');const value=await response.json();if(value?.schema!==1||value.subject!=='os'||!Array.isArray(value.records))throw Error('Invalid registry');records=value.records;status='ready';return records;})
            .catch(()=>{status='failed';records=[];return records;})
            .finally(()=>{promise=null;revision++;cached=null;onReady();});
        return promise;
    }
    function prepare(next){
        const changed=!context||context.subject!==next.subject||context.unit!==next.unit||previousRows.length!==next.questions.length||previousRows.some((q,i)=>q!==next.questions[i]);
        context=next;
        if(!supported(context)){cached=null;previousRows=[];return;}
        if(status==='idle')ensureRegistry();
        if(changed||!cached||cachedRevision!==revision){cached=createQuestionRelations({...context,records});previousRows=[...context.questions];cachedRevision=revision;}
    }
    function htmlFor(q){
        if(!supported(context))return '';
        const relation=cached?.rows.get(q.id);if(!relation)return '';
        const title=relation.state==='confirmed'?'已確認對應的完整題目':relation.links.length?'可能對應的完整題目':'這題仍待補齊';
        const description=relation.state==='confirmed'?'已核對題意與條件；請開啟完整版本查看選項。':relation.links.length?'以下是核對線索，請比對題幹、條件與選項後使用。':status==='loading'?'正在核對可連結的完整版本。':'目前沒有找到可可靠對應的完整版本，保留原題供後續補齊。';
        const links=relation.links.map(link=>'<li><a class="question-relation-link" href="'+escapeHtml(href(context.unit,link.target.id))+'" target="_blank" rel="noopener noreferrer" data-target-id="'+link.target.id+'">'+(link.status==='confirmed'?'查看完整題目':'查看候選題')+'：'+context.unit.toUpperCase()+' 第 '+link.target.id+' 題 ↗<span class="sr-only">（開啟新分頁）</span><span class="question-relation-stem">'+escapeHtml(link.target.question)+'</span></a><span class="question-relation-reason">'+escapeHtml(link.reason)+'</span></li>').join('');
        return '<section class="question-relations question-relations-'+relation.state+'" data-relation-state="'+relation.state+'" aria-labelledby="related-'+context.unit+'-'+q.id+'"><h3 id="related-'+context.unit+'-'+q.id+'">'+title+'</h3><p>'+description+'</p>'+(relation.stale?'<p class="question-relation-caution">這筆對應需要重新核對，暫不標為已確認。</p>':'')+(links?'<ul>'+links+'</ul>':'')+(status==='failed'?'<p class="question-relation-caution">已核對的連結暫時無法載入，候選題仍需核對。<button type="button" data-retry-question-links>重新載入連結</button></p>':'')+'</section>';
    }
    function searchMatches(q,term){
        if(!supported(context))return false;
        const text=normalize([q.question,...q.options||[],q.correct_answer,...q.question_aliases||[],...q.keywords||[],...(cached?.searchAliases.get(q.id)||[])].join(' '));
        return text.includes(term)||text.replace(/\s+/g,'').includes(term.replace(/\s+/g,''))||(term.split(/\s+/).length>1&&term.split(/\s+/).every(token=>text.includes(token)||text.replace(/\s+/g,'').includes(token)));
    }
    async function enrichBatch(rows,entries){
        if(!supported(context)||!rows.some(row=>row.status==='review'))return rows;
        await ensureRegistry();return enrichBatchQuestionReferences(rows,entries,records);
    }
    function retry(){if(status!=='failed'||!supported(context))return;status='idle';ensureRegistry();}
    return {prepare,htmlFor,searchMatches,enrichBatch,retry};
}

// Copy only reviewed public files. Never delete an existing output directory.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const publicFiles = require('../static-assets.json');
const out = path.join(root, 'dist');
const generated = ['.nojekyll', 'deployment.json'];
function walk(dir) { return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e => {
  const file = path.join(dir,e.name);
  if(e.isSymbolicLink()) throw Error('Output must not contain symlinks: '+file);
  return e.isDirectory()?walk(file):[path.relative(out,file).split(path.sep).join('/')];
}); }
if(new Set(publicFiles).size!==publicFiles.length) throw Error('Duplicate public paths');
const buffers = publicFiles.map(file => {
  if(!/^(?:[a-z0-9-]+\.html|(?:css|js|data|images)\/[a-zA-Z0-9_.-]+\.(?:css|js|json|png|jpg|jpeg|svg|webp|ico))$/.test(file)) throw Error('Unreviewed public path: '+file);
  const source = path.join(root,file);
  if(fs.lstatSync(source).isSymbolicLink() || !fs.realpathSync(source).startsWith(fs.realpathSync(root)+path.sep)) throw Error('Public file escapes source root');
  const bytes = fs.readFileSync(source);
  if(bytes.length>25*1024*1024) throw Error('Static asset exceeds 25 MiB: '+file);
  if(/\.(?:html|js|json|css)$/.test(file)) {
    const text=bytes.toString('utf8');
    if(/sb_secret_[A-Za-z0-9_-]+|postgres(?:ql)?:\/\//i.test(text)) throw Error('Potential private credential: '+file);
    for(const m of text.matchAll(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)) {
      try { if(JSON.parse(Buffer.from(m[0].split('.')[1],'base64url')).role==='service_role') throw Error('Private service-role JWT: '+file); }
      catch(e) { if(e.message.startsWith('Private')) throw e; }
    }
    if(file.startsWith('data/')) {
      JSON.parse(text);
      if(/"(?:email|student_id|password|access_token|refresh_token)"\s*:/i.test(text)) throw Error('Private data field in public JSON: '+file);
    }
  }
  return {file,bytes};
});
if(publicFiles.length+generated.length>20000) throw Error('Workers Free file limit exceeded');
if(fs.existsSync(out)) {
  if(fs.lstatSync(out).isSymbolicLink()) throw Error('Output must not be a symlink');
  const unexpected=walk(out).filter(f=>!publicFiles.includes(f)&&!generated.includes(f));
  if(unexpected.length) throw Error('Unexpected old output files. Review and remove them manually before building: '+unexpected.join(', '));
}
let commit='unknown';
try { commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(); } catch { /* Archives may have no Git metadata. */ }
const metadata={schema:1,sourceCommit:commit,builtAt:new Date().toISOString(),files:buffers.length,
  sha256:Object.fromEntries(buffers.map(({file,bytes})=>[file,crypto.createHash('sha256').update(bytes).digest('hex')]))};
for(const {file,bytes} of buffers) { const target=path.join(out,file); fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes); }
fs.writeFileSync(path.join(out,'.nojekyll'),'');
fs.writeFileSync(path.join(out,'deployment.json'),JSON.stringify(metadata,null,2)+'\n');
console.log(JSON.stringify({output:'dist',files:buffers.length+generated.length,totalBytes:buffers.reduce((n,x)=>n+x.bytes.length,0),largest:buffers.reduce((a,b)=>a.bytes.length>b.bytes.length?a:b).file,sourceCommit:commit}));

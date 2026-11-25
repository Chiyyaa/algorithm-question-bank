// Preview the actual deployment output under both supported base paths.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../dist');
if(!fs.existsSync(root)) throw Error('Run npm run build first');
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg'};
const server=http.createServer((req,res)=>{
  let route;try{route=decodeURIComponent(new URL(req.url,'http://local').pathname).replace(/^\/algorithm-question-bank(?=\/|$)/,'');}catch{return res.writeHead(400).end();}
  if(route==='')return res.writeHead(302,{Location:'/algorithm-question-bank/'}).end();
  if(route.endsWith('/'))route+='index.html';
  let file=path.resolve(root,'.'+route);
  if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
  if(!fs.existsSync(file)&&!path.extname(file))file+='.html';
  // Preview performs no live Supabase reads or writes unless explicitly requested.
  if(route==='/js/collaboration-config.js'&&!process.argv.includes('--live-backend')){
    res.writeHead(200,{'Content-Type':types['.js'],'Cache-Control':'no-store'});return res.end('export const collaborationConfig={enabled:false,url:"",publishableKey:""};');
  }
  fs.readFile(file,(err,data)=>{if(err)return res.writeHead(404).end('Not found');res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:data);});
});
server.listen(Number(process.env.PORT)||0,'127.0.0.1',()=>{const base='http://127.0.0.1:'+server.address().port;console.log(base+'/');console.log(base+'/algorithm-question-bank/');});

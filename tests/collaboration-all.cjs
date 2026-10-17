const {spawnSync}=require('node:child_process');
const path=require('node:path');
for(const test of ['collaboration-db.cjs','collaboration-edge.cjs','collaboration-ui.cjs']){
 const result=spawnSync(process.execPath,[path.join(__dirname,test)],{stdio:'inherit',windowsHide:true});
 if(result.status!==0){process.exitCode=result.status||1;break;}
}

// Run after an approved change to built-in question JSON; deploy the generated catalog SQL too.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const units=[['algorithm','u2','questions.json'],...['u3','u4','u6','u7'].map(u=>['algorithm',u,'algorithm-'+u+'.json']),...['u3','u4','u5','u6'].map(u=>['os',u,'os-'+u+'.json'])];
const records=units.flatMap(([subject_id,unit_id,file])=>JSON.parse(fs.readFileSync(path.join(root,'data',file),'utf8')).map(q=>({subject_id,unit_id,target_id:q.id,content:{question:q.question,options:q.options||[],correct_answer:q.correct_answer,type:q.type,...(q.user_answer!==undefined?{user_answer:q.user_answer}:{})}})));
const payload=JSON.stringify(records).replace(/'/g,"''");
const sql=`-- Generated from the built-in JSON files. Do not edit the catalog by hand.\nbegin;\ninsert into public.collaboration_units(subject_id,unit_id) values ${units.map(([s,u])=>`('${s}','${u}')`).join(',')} on conflict do nothing;\ninsert into public.builtin_question_targets(subject_id,unit_id,target_id,content) select subject_id,unit_id,target_id,content from jsonb_to_recordset('${payload}'::jsonb) as x(subject_id text,unit_id text,target_id bigint,content jsonb) on conflict(subject_id,unit_id,target_id) do update set content=excluded.content;\ncommit;\n`;
fs.writeFileSync(path.join(__dirname,'migrations/20261030-question-targets.sql'),sql);
console.log(`Built ${records.length} registered question targets in ${units.length} units.`);

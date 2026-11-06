import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parse} from 'dotenv';

// Docker publishes these services on IPv4 loopback. Do not change service names
// used inside Compose, remote hosts, ports, credentials, database names or Redis DBs.
export function localServiceEnv(source){
  const values=parse(source),changed=[];
  const text=source.replace(/^(\s*(?:export\s+)?(DATABASE_URL|REDIS_URL)\s*=\s*)([^\r\n]*)/gm,(line,prefix,key,rest)=>{
    const original=values[key];if(!original)return line;
    let url;try{url=new URL(original);}catch{return line;}
    const allowed=key==='DATABASE_URL'?['postgres:','postgresql:']:['redis:'];
    if(!allowed.includes(url.protocol)||url.hostname!=='localhost'||url.searchParams.get('sslmode')==='verify-full')return line;
    if(!rest.includes(original))throw new Error(`Cannot safely rewrite ${key}; edit that setting manually.`);
    url.hostname='127.0.0.1';changed.push(key);
    return prefix+rest.replace(original,()=>url.toString());
  });
  return {text,changed};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const file=path.join(root,'.env'),source=fs.readFileSync(file,'utf8');
  const result=localServiceEnv(source);
  if(!result.changed.length)console.log('Local service addresses already configured; no changes.');
  else{
    const directory=path.join(root,'.local/backups');fs.mkdirSync(directory,{recursive:true});
    const backup=path.join(directory,`connection-env-${Date.now()}.private`);
    fs.copyFileSync(file,backup,fs.constants.COPYFILE_EXCL);
    const temporary=file+`.${process.pid}.tmp`;
    fs.writeFileSync(temporary,result.text,{flag:'wx'});fs.renameSync(temporary,file);
    console.log(`Updated ${result.changed.join(', ')} to IPv4 loopback; private .env backup saved. Credentials, ports and data retained.`);
  }
}

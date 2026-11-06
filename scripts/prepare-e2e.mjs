import fs from "node:fs";
import path from "node:path";
import {randomUUID,createHash} from "node:crypto";

// On this Windows OneDrive checkout, Node reports cloud placeholder files as
// symbolic links. Playwright skips them. Materialize only these test files;
// real symlinks stay untouched and original bytes are backed up first.
export function prepareE2e(root=process.cwd()){
  if(process.platform!=="win32")return;
  const directory=path.resolve(root,"tests/e2e");
  for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
    if(!entry.isSymbolicLink()||!entry.name.endsWith(".spec.ts"))continue;
    const file=path.join(directory,entry.name);
    try{fs.readlinkSync(file);continue;}catch(error){if(error.code!=="EINVAL")throw error;}
    if(!fs.statSync(file).isFile())continue;
    const bytes=fs.readFileSync(file),hash=createHash("sha256").update(bytes).digest("hex");
    const backup=path.resolve(root,".local/backups/e2e-materialization",`${entry.name}.${hash}.bak`);
    fs.mkdirSync(path.dirname(backup),{recursive:true});
    if(!fs.existsSync(backup))fs.writeFileSync(backup,bytes,{flag:"wx"});
    const temporary=file+`.${randomUUID()}.tmp`;
    fs.writeFileSync(temporary,bytes,{flag:"wx"});
    fs.renameSync(temporary,file);
    if(createHash("sha256").update(fs.readFileSync(file)).digest("hex")!==hash)throw new Error(`Materialization changed ${entry.name}`);
    console.log(`Prepared OneDrive test file without content changes: ${entry.name}`);
  }
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename))prepareE2e();

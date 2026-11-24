// No scheduling, deletion or remote upload is performed by this command.
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createCipheriv,createDecipheriv,randomBytes,createHash} from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {Transform} from 'node:stream';
import {config} from 'dotenv';
config({quiet:true});
const root=process.cwd(),magic=Buffer.from('MILOBK01');
export async function encryptBackupStream(source,target,key){
  const output=await fs.promises.open(target,'wx',0o600);
  try{const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv),out=output.createWriteStream();out.write(Buffer.concat([magic,iv]));await pipeline(source,cipher,out);await fs.promises.appendFile(target,cipher.getAuthTag());}
  catch(error){await output.close().catch(()=>{});await fs.promises.rm(target,{force:true});throw error;}
}
export async function decryptBackup(source,target,key){
  const handle=await fs.promises.open(source,'r');let created=false;try{const stat=await handle.stat();if(stat.size<36)throw Error('Invalid encrypted backup');const header=Buffer.alloc(20),tag=Buffer.alloc(16);await handle.read(header,0,20,0);await handle.read(tag,0,16,stat.size-16);if(!header.subarray(0,8).equals(magic))throw Error('Unknown backup format');const decipher=createDecipheriv('aes-256-gcm',key,header.subarray(8));decipher.setAuthTag(tag);const output=await fs.promises.open(target,'wx',0o600);created=true;await pipeline(fs.createReadStream(source,{start:20,end:stat.size-17}),decipher,output.createWriteStream());}catch(error){if(created)await fs.promises.rm(target,{force:true});throw error;}finally{await handle.close();}
}
async function run(){
 const operation=process.argv[2]||'backup',keyHex=process.env.BACKUP_ENCRYPTION_KEY||'';if(!/^[a-f0-9]{64}$/i.test(keyHex))throw Error('Configure BACKUP_ENCRYPTION_KEY (32 random bytes in hex) in the private environment.');const key=Buffer.from(keyHex,'hex');
 if(operation==='decrypt'){const [input,output]=process.argv.slice(3);if(!input||!output)throw Error('Usage: node scripts/managed-backup.mjs decrypt input.milobak output.dump');const src=path.resolve(input),dest=path.resolve(output);if(src===dest||fs.existsSync(dest))throw Error('Choose a new output file; existing files are never overwritten.');await decryptBackup(src,dest,key);console.log('Decrypted into the explicitly requested new file. Restore only into a fresh database.');return;}
 if(operation!=='backup')throw Error('Unknown backup operation');
 const destination=process.env.BACKUP_DESTINATION;if(!destination||!path.isAbsolute(destination))throw Error('Configure BACKUP_DESTINATION as an absolute directory on a separate disk or approved mounted backup storage.');
 const base=path.resolve(destination),inside=directory=>{const relative=path.relative(root,directory);return relative===''||!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative);};if(inside(base))throw Error('Backup storage must be outside the project.');await fs.promises.mkdir(base,{recursive:true});if(inside(await fs.promises.realpath(base)))throw Error('Backup storage resolves inside the project.');const target=path.join(base,`milo-${new Date().toISOString().replaceAll(/[:.]/g,'-')}-${randomBytes(4).toString('hex')}.milobak`);
 const args=['compose','--env-file',path.join(root,'.env'),'-f',path.join(root,'infra/compose.yaml'),'exec','-T','postgres','pg_dump','-U','milo','-d','milo','--format=custom','--no-owner','--no-privileges'];
 const child=spawn('docker',args,{windowsHide:true,stdio:['ignore','pipe','pipe']});let failed=false;child.stderr.on('data',()=>{failed=true;});const completion=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('Database dump failed')));});
 let encrypted=false;const encryption=encryptBackupStream(child.stdout,target,key).then(()=>{encrypted=true;});try{await Promise.all([encryption,completion]);}catch(error){child.kill();await encryption.catch(()=>{});if(encrypted)await fs.promises.rm(target,{force:true});throw error;}
 const digest=createHash('sha256');await pipeline(fs.createReadStream(target),new Transform({transform(chunk,_encoding,callback){digest.update(chunk);callback();}}));
 await fs.promises.writeFile(target+'.sha256',digest.digest('hex')+'\n',{flag:'wx',mode:0o600});await fs.promises.mkdir(path.join(root,'.local/operations'),{recursive:true});await fs.promises.writeFile(path.join(root,'.local/operations/backup-status.json'),JSON.stringify({at:new Date().toISOString(),encrypted:true,restoreVerified:false,warningsObserved:failed})+'\n');
 console.log('Encrypted database backup completed. A SHA-256 sidecar was saved; no old backups were deleted.');
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename))run().catch(()=>{console.error('Backup did not complete. Check backup key/destination and local Docker/database configuration privately.');process.exitCode=1;});

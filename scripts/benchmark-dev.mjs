// Compare route compilation on the same source, API and machine. No database writes.
import {spawn,spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
const root=process.cwd(),port=3201,stamp=Date.now();
const connection=net.connect({host:'127.0.0.1',port});
const occupied=await new Promise(resolve=>{connection.once('connect',()=>{connection.destroy();resolve(true);});connection.once('error',()=>resolve(false));});
if(occupied)throw new Error(`Port ${port} is in use; no existing process will be stopped.`);
const report={at:new Date().toISOString(),conditions:'same current source; isolated Next build directories; API preview on 4100; HTTP document response, not browser usability; alternating engine order; first route compilation followed by 3 warm requests',runs:[]};
fs.mkdirSync('.local/performance',{recursive:true});
const save=()=>fs.writeFileSync('.local/performance/dev-engines.json',JSON.stringify(report,null,2));
save();
for(const [round,engines]of [['a',['webpack','turbopack']],['b',['turbopack','webpack']]])for(const engine of engines){
  const disk=fs.statfsSync(root);
  if(disk.bavail*disk.bsize<512*1024*1024)throw new Error('Need at least 512 MiB free before another isolated compilation. Prior measurements are saved.');
  const cache=path.resolve('apps/web',`.next-performance-${stamp}-${round}-${engine}`);
  if(fs.existsSync(cache))throw new Error(`Benchmark output already exists: ${cache}`);
  const file=path.resolve(`.local/performance/dev-${round}-${engine}.log`),log=fs.createWriteStream(file);
  const child=spawn(process.execPath,[path.resolve('node_modules/next/dist/bin/next'),'dev',`--${engine}`,'--port',String(port)],{cwd:path.resolve('apps/web'),env:{...process.env,NODE_ENV:'development',NEXT_BUILD_DIR:`.next-performance-${stamp}-${round}-${engine}`,API_INTERNAL_URL:'http://localhost:4100',APP_URL:`http://localhost:${port}`},windowsHide:true,stdio:['ignore','pipe','pipe']});
  try{
    await new Promise((resolve,reject)=>{
      let text='';const timeout=setTimeout(()=>reject(new Error(`Startup timeout: ${engine}`)),60000);
      child.on('error',reject);child.on('exit',code=>{clearTimeout(timeout);reject(new Error(`Next exited ${code}: ${engine}`));});
      for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{log.write(chunk);text+=chunk.toString();if(text.includes('Ready in')){clearTimeout(timeout);resolve();}});
    });
    const run={round,engine,routes:[]};
    for(const route of ['/','/san-pham','/san-pham/everyday-essential-tee','/gio-hang']){
      const samples=[];
      for(let pass=0;pass<4;pass++){
        const start=performance.now(),response=await fetch(`http://localhost:${port}${route}`),ttfbMs=performance.now()-start;
        await response.arrayBuffer();
        if(!response.ok)throw new Error(`${response.status} ${route}; ${file}`);
        samples.push({pass,ttfbMs,totalMs:performance.now()-start});
      }
      run.routes.push({route,samples});
    }
    report.runs.push(run);save();console.log(JSON.stringify(run));
  }finally{
    if(process.platform==='win32')spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});else child.kill('SIGTERM');
    log.end();
    await new Promise(resolve=>setTimeout(resolve,700));
    // Release only files created by this run; keep the checked directory and
    // never traverse a junction pointing outside its output directory.
    if(fs.existsSync(cache)){
      if(fs.realpathSync(cache)!==cache||!cache.startsWith(path.resolve('apps/web')+path.sep))throw new Error('Unexpected benchmark cache location');
      const clear=directory=>{for(const item of fs.readdirSync(directory,{withFileTypes:true})){
        const file=path.join(directory,item.name),real=fs.realpathSync(file);
        if(!real.startsWith(cache+path.sep))throw new Error('Cache entry escaped its owned output directory');
        const stat=fs.statSync(file);if(stat.isDirectory())clear(file);else if(stat.isFile())fs.unlinkSync(file);
      }};
      clear(cache);
    }
  }
}
save();

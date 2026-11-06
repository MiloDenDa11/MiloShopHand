// Isolated UI QA. Never migrates, seeds, or modifies the configured store database.
import 'dotenv/config';
import {spawn, spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import pg from 'pg';
import {prepareE2e} from './prepare-e2e.mjs';

const root=process.cwd();
const testOnly=process.argv.includes('--tests-only');
const production=process.argv.includes('--production');
const selectionIndex=process.argv.findIndex(argument=>argument==='--test'||argument==='--tests-only');
const testArguments=selectionIndex<0?[]:process.argv.slice(selectionIndex+1);
const database=new URL(process.env.DATABASE_URL);
database.pathname='/milo_redesign_test';
const redisUrl=new URL(process.env.REDIS_URL||'redis://localhost:6379');
redisUrl.pathname='/2';
// Separate PostgreSQL database and Redis logical database from the store and integration tests.
const env={...process.env,DATABASE_URL:database.toString(),REDIS_URL:redisUrl.toString(),APP_URL:'http://localhost:3100',API_PORT:'4100',API_INTERNAL_URL:'http://localhost:4100',PLAYWRIGHT_BASE_URL:'http://localhost:3100',TEST_API_URL:'http://localhost:4100/api/v1',NEXT_BUILD_DIR:production?'.next-redesign-production':'.next-redesign',PAYMENT_PROVIDER:'mock',SHIPPING_PROVIDER:'mock',EMAIL_PROVIDER:'file',SKIP_BREACH_CHECK:'true',NODE_ENV:'development',SESSION_SECRET:process.env.SESSION_SECRET||'redesign-local-only-session-secret-at-least-32-characters',DEV_WEBHOOK_SECRET:process.env.DEV_WEBHOOK_SECRET||'redesign-development-only'};
const webEnv=production?{...env,NODE_ENV:'production'}:env;
const children=[];
let stopping=false;
function launch(file,args=[],cwd=root,childEnv=env){const p=spawn(process.execPath,[resolve(root,file),...args],{cwd,env:childEnv,stdio:'inherit',windowsHide:true});children.push(p);return p;}
function run(file,args=[]){return new Promise((yes,no)=>{const p=launch(file,args);p.on('error',no);p.on('exit',code=>code===0?yes():no(new Error(`QA command exited ${code}`)));});}
async function stop(){if(stopping)return;stopping=true;for(const p of [...children].reverse()){if(p.exitCode!==null)continue;if(process.platform==='win32')spawnSync('taskkill',['/PID',String(p.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});else p.kill('SIGTERM');}}
async function ready(url){for(let i=0;i<180;i++){try{const r=await fetch(url,{signal:AbortSignal.timeout(3000)});if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,400));}throw new Error(`Not ready: ${url}`);}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await stop();process.exit(0);});
try{
  prepareE2e(root);
  if(testOnly){await ready(env.APP_URL);await run('node_modules/@playwright/test/cli.js',['test',...testArguments]);}
  else{
    for(const port of [3100,4100]){try{await fetch(`http://localhost:${port}`,{signal:AbortSignal.timeout(700)});throw new Error(`Port ${port} is already in use. Stop the prior redesign QA process.`);}catch(e){if(e.message.includes('already in use'))throw e;}}
    const adminUrl=new URL(database);adminUrl.pathname='/postgres';const client=new pg.Client({connectionString:adminUrl.toString()});await client.connect();const exists=await client.query("SELECT 1 FROM pg_database WHERE datname='milo_redesign_test'");if(!exists.rowCount)await client.query("CREATE DATABASE milo_redesign_test ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C'");await client.end();
    await run('node_modules/prisma/build/index.js',['migrate','deploy']);
    await run('node_modules/tsx/dist/cli.mjs',['prisma/seed.ts']);
    launch('node_modules/tsx/dist/cli.mjs',['--tsconfig','apps/api/tsconfig.json','apps/api/src/main.ts']);
    launch('node_modules/tsx/dist/cli.mjs',['--tsconfig','apps/worker/tsconfig.json','apps/worker/src/main.ts']);
    if(production&&!process.argv.includes('--reuse-build'))await new Promise((yes,no)=>{
      const build=launch('node_modules/next/dist/bin/next',['build','--webpack'],resolve(root,'apps/web'),webEnv);
      build.on('error',no);build.on('exit',code=>code===0?yes():no(new Error(`Production web build exited ${code}`)));
    });
    launch('node_modules/next/dist/bin/next',production?['start','--port','3100']:['dev','--webpack','--port','3100'],resolve(root,'apps/web'),webEnv);
    await ready('http://localhost:4100/api/v1/config');await ready(env.APP_URL);
    console.log(`REDESIGN QA READY: http://localhost:3100 | ${production?'production build':'development'} | Docker PostgreSQL / milo_redesign_test | Redis DB 2`);
    if(process.argv.includes('--test'))await run('node_modules/@playwright/test/cli.js',['test',...testArguments]);
    else await new Promise(()=>{});
  }
}catch(error){console.error(error.message);process.exitCode=1;}finally{await stop();}

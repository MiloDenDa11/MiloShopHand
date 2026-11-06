import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from 'dotenv';
import {localServiceEnv} from '../scripts/configure-local-services.mjs';

test('local Docker addresses preserve credentials, ports, database, Redis DB and comments',()=>{
  const source='DATABASE_URL="postgresql://milo:p%40ss@localhost:5544/shop?schema=public&connection_limit=10" # keep\r\nREDIS_URL=redis://user:p%24ss@localhost:6380/3\r\nAPP_URL=http://localhost:3000\r\nSESSION_SECRET=retain-exactly\r\n';
  const result=localServiceEnv(source),before=parse(source),after=parse(result.text);
  assert.deepEqual(result.changed,['DATABASE_URL','REDIS_URL']);
  for(const key of result.changed){
    const original=new URL(before[key]),updated=new URL(after[key]);
    assert.equal(updated.hostname,'127.0.0.1');updated.hostname='localhost';
    assert.equal(updated.toString(),original.toString());
  }
  assert(result.text.includes('" # keep\r\n'));assert.equal(after.APP_URL,before.APP_URL);
  assert.equal(after.SESSION_SECRET,before.SESSION_SECRET);
  assert.equal(localServiceEnv(result.text).text,result.text);
});

test('remote and Compose hosts, TLS hostname verification and unrelated settings are retained',()=>{
  for(const source of ['DATABASE_URL=postgresql://milo@postgres:5432/milo\nREDIS_URL=redis://redis:6379/2\n','DATABASE_URL=postgresql://milo@db.example:5432/milo\nREDIS_URL=rediss://localhost:6379/0\n','DATABASE_URL=postgresql://milo@localhost:5432/milo?sslmode=verify-full\n']){
    assert.deepEqual(localServiceEnv(source),{text:source,changed:[]});
  }
});

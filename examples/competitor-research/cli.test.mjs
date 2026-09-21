import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, writeFile, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
test('fresh directory README command: successful report, invalid key, invalid profile, and actual timeout',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'socialkit-starter-cli-'));let calls=0;
 const server=http.createServer((req,res)=>{calls++;res.setHeader('content-type','application/json');if(req.headers['x-access-key']==='invalid'){res.statusCode=401;res.end('{"success":false,"message":"invalid"}');return;}if(req.headers['x-access-key']==='slow'){setTimeout(()=>res.end('{}'),100);return;}const u=new URL(req.url,'http://localhost');res.setHeader('x-credits-remaining','12');res.end(JSON.stringify({success:true,data:{url:u.searchParams.get('url'),results:[{videoId:'abcdefghijk',url:'https://www.youtube.com/watch?v=abcdefghijk',title:'Synthetic fixture video',views:0}]}}));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 async function run(key,config){await writeFile(join(dir,'.env'),`SOCIALKIT_API_KEY=${key}\nSOCIALKIT_API_BASE_URL=http://127.0.0.1:${server.address().port}\n`);await writeFile(join(dir,'profiles.json'),typeof config==='string'?config:JSON.stringify(config));const p=spawn(process.execPath,['--env-file=.env','run.mjs','profiles.json','output'],{cwd:dir,env:{PATH:process.env.PATH},stdio:['ignore','pipe','pipe']});let output='';p.stdout.on('data',d=>output+=d);p.stderr.on('data',d=>output+=d);const code=await new Promise((resolve,reject)=>{p.on('error',reject);p.on('exit',resolve)});return {code,output};}
 try{
  for(const file of ['run.mjs','collect.mjs','core.mjs','.env.example'])await cp(new URL(file,import.meta.url),join(dir,file));
  const config={profiles:['https://www.youtube.com/@NASA'],limits:{retries:0,maxRequests:1,maxCredits:1}};
  let r=await run('synthetic-good',config);assert.equal(r.code,0);let report=JSON.parse(await readFile(join(dir,'output/report.json'),'utf8'));assert.equal(report.profiles[0].items[0].metrics.views,0);assert.match(await readFile(join(dir,'output/report.md'),'utf8'),/Synthetic fixture video/);assert.equal((await stat(join(dir,'output/report.json'))).mode&0o777,0o600);
  r=await run('invalid',config);assert.equal(r.code,2);report=JSON.parse(await readFile(join(dir,'output/report.json'),'utf8'));assert.equal(report.usage.requests,1);assert.match(report.profiles[0].error,/Authentication/);
  r=await run('synthetic-good','{\"key\":\"do-not-print-sensitive-input');assert.equal(r.code,1);assert.ok(!r.output.includes('do-not-print-sensitive-input'));
  const before=calls;r=await run('synthetic-good',{profiles:['https://www.youtube.com/watch?v=abcdefghijk']});assert.equal(r.code,1);assert.equal(calls,before);
  r=await run('slow',{...config,limits:{...config.limits,requestTimeoutMs:20,maxDurationMs:50}});assert.equal(r.code,2);report=JSON.parse(await readFile(join(dir,'output/report.json'),'utf8'));assert.equal(report.usage.requests,1);assert.match(report.profiles[0].error,/timeout/);
 }finally{await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});}
});

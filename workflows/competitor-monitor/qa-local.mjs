/** Fresh n8n import/execution QA against local simulated SocialKit and Slack.
 * AEO_QA_POSTGRES_URL must address an isolated loopback PostgreSQL database.
 * AEO_QA_MODULES points to a package.json beside pg-promise; AEO_QA_N8N is the n8n executable.
 * All credentials are synthetic. This is NOT evidence of external Slack delivery.
 */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import https from 'node:https';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
const require=createRequire(process.env.AEO_QA_MODULES || import.meta.url), pgp=require('pg-promise')();
const database=process.env.AEO_QA_POSTGRES_URL, n8n=process.env.AEO_QA_N8N;
if(!database||!n8n) throw new Error('Set AEO_QA_POSTGRES_URL, AEO_QA_MODULES and AEO_QA_N8N; README describes isolated test setup.');
const dbUrl=new URL(database);if(!['127.0.0.1','localhost','[::1]'].includes(dbUrl.hostname)) throw new Error('QA is restricted to a loopback test database.');
const db=pgp(database),dir=await mkdtemp(join(tmpdir(),'socialkit-monitor-qa-'));
const artifact=await readFile(new URL('./socialkit-competitor-monitor.v0.1.0.json',import.meta.url),'utf8');
const template=JSON.parse(artifact), prefix=`qa-${Date.now()}`;const results=[], calls=[];let control={};
async function command(bin,args,label,extra={}) {
 const child=spawn(bin,args,{env:{...process.env,N8N_USER_FOLDER:join(dir,'n8n'),N8N_DIAGNOSTICS_ENABLED:'false',N8N_VERSION_NOTIFICATIONS_ENABLED:'false',N8N_LOG_LEVEL:'error',...extra},stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);
 const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve)});await writeFile(join(dir,label+'.log'),output);return {code,output};
}
await command('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(dir,'key.pem'),'-out',join(dir,'cert.pem'),'-days','2','-subj','/CN=127.0.0.1'],'tls');
const server=https.createServer({key:await readFile(join(dir,'key.pem')),cert:await readFile(join(dir,'cert.pem'))},async(req,res)=>{
 let raw='';for await(const part of req)raw+=part;const u=new URL(req.url,'https://127.0.0.1');const body=raw?JSON.parse(raw):null;
 calls.push({path:u.pathname,profile:u.searchParams.get('url'),body});res.setHeader('content-type','application/json');
 if(u.pathname==='/slack'){res.statusCode=control.slackStatus??200;res.end(JSON.stringify(control.slackOk===false?{ok:false,error:'simulated_failure'}:{ok:true,channel:body.channel,ts:'1789980000.000001'}));return;}
 assert.equal(req.headers['x-access-key'],'synthetic-test-key');res.setHeader('x-credits-remaining','997');
 if(control.authBad){res.statusCode=401;res.end('{"success":false}');return;}
 const profile=u.searchParams.get('url');if(profile.includes('unavailable')){res.statusCode=404;res.end('{"success":false}');return;}
 const items=control.empty?[]:u.pathname==='/youtube/videos'?[{videoId:'abcdefghijk',url:'https://www.youtube.com/watch?v=abcdefghijk',title:'Synthetic fixture video',views:100}]:[{shortcode:'fixture_1',url:'https://www.instagram.com/p/fixture_1/',type:'reel',caption:'Synthetic fixture Reel',author:{username:'nasa'},views:null,likes:0}];
 res.end(JSON.stringify({success:true,data:u.pathname==='/youtube/videos'?{url:profile,results:items}:{profileUrl:profile,username:'nasa',items}}));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`https://127.0.0.1:${server.address().port}`;
const credentials=[{id:'qa-pg',name:'Synthetic QA Postgres',type:'postgres',data:{host:dbUrl.hostname,port:Number(dbUrl.port||5432),database:dbUrl.pathname.slice(1),user:decodeURIComponent(dbUrl.username),password:decodeURIComponent(dbUrl.password),ssl:'disable'}},{id:'qa-socialkit',name:'Synthetic QA SocialKit',type:'httpHeaderAuth',data:{name:'x-access-key',value:'synthetic-test-key'}},{id:'qa-slack',name:'Synthetic QA Slack',type:'httpHeaderAuth',data:{name:'Authorization',value:'Bearer synthetic-token'}}];
async function install(dest,{profiles}={}) {
 const w=structuredClone(template);w.id='localFixtureMonitor';w.name='Local fixture monitor';
 for(const n of w.nodes){if(n.name==='Configure competitors'){n.parameters.jsCode=n.parameters.jsCode.replaceAll('https://api.socialkit.dev',origin).replaceAll('REPLACE_WITH_CHANNEL_ID','CLOCALTEST').replace("destination: 'competitor-monitor-v1:CLOCALTEST'",`destination: '${dest}'`);if(profiles)n.parameters.jsCode=n.parameters.jsCode.replace("['https://www.youtube.com/@NASA', 'https://www.instagram.com/nasa/']",JSON.stringify(profiles));}if(n.type==='n8n-nodes-base.postgres')n.credentials={postgres:{id:'qa-pg',name:'Synthetic QA Postgres'}};if(n.name==='Collect SocialKit'){n.credentials={httpHeaderAuth:{id:'qa-socialkit',name:'Synthetic QA SocialKit'}};n.parameters.options.allowUnauthorizedCerts=true;}if(n.name==='Send Slack digest'){n.credentials={httpHeaderAuth:{id:'qa-slack',name:'Synthetic QA Slack'}};n.parameters.url=origin+'/slack';n.parameters.options.allowUnauthorizedCerts=true;}}
 await writeFile(join(dir,'workflow.json'),JSON.stringify(w));assert.equal((await command(n8n,['import:workflow','--input='+join(dir,'workflow.json')],'import-'+dest)).code,0);
}
async function run(label,{api,slack,success=true}) {const before=calls.length;const r=await command(n8n,['execute','--id=localFixtureMonitor','--rawOutput'],label);const made=calls.slice(before);assert.equal(r.code,success?0:1,`${label}: inspect ${dir}/${label}.log`);assert.equal(made.filter(x=>x.path!=='/slack').length,api,label+' API bound');assert.equal(made.filter(x=>x.path==='/slack').length,slack,label+' delivery count');results.push({case:label,passed:true,apiRequests:api,simulatedSlackRequests:slack,expectedExecutionStatus:success?'success':'error'});return made;}
try {
 await db.none(await readFile(new URL('./sql/schema.sql',import.meta.url),'utf8'));
 await writeFile(join(dir,'credentials.json'),JSON.stringify(credentials));assert.equal((await command(n8n,['import:credentials','--input='+join(dir,'credentials.json')],'credentials')).code,0);
 // Import the unchanged credential-free artifact into the fresh instance first.
 await writeFile(join(dir,'original.json'),artifact);assert.equal((await command(n8n,['import:workflow','--input='+join(dir,'original.json')],'fresh-import')).code,0);
 const first=prefix+'-first';await install(first);await run('first-collection',{api:2,slack:1});await run('repeat-after-process-restart',{api:2,slack:0});assert.equal(Number((await db.one('SELECT count(*) FROM sk_monitor_delivered WHERE destination=$1',[first])).count),2);
 control={empty:true};await install(prefix+'-empty');await run('empty-feeds',{api:2,slack:0});
 control={authBad:true};await install(prefix+'-auth');await run('bad-auth',{api:2,slack:0,success:false});
 control={};await install(prefix+'-invalid',{profiles:['https://www.instagram.com/reel/invalid/']});await run('invalid-profile-before-requests',{api:0,slack:0,success:false});
 await install(prefix+'-partial',{profiles:['https://www.youtube.com/@NASA','https://www.instagram.com/unavailable/']});const partial=await run('unavailable-profile-partial',{api:2,slack:1});assert.match(partial.find(x=>x.path==='/slack').body.text,/Partial collection/);
 const failed=prefix+'-failed';control={slackStatus:429,slackOk:false};await install(failed);await run('slack-rate-limit-retains-outbox',{api:2,slack:1,success:false});const before=await db.one('SELECT outbox FROM sk_monitor_state WHERE destination=$1',[failed]);assert.equal(before.outbox.items.length,2);assert.equal(Number((await db.one('SELECT count(*) FROM sk_monitor_delivered WHERE destination=$1',[failed])).count),0);
 await run('unexpired-lease-excludes-second-run',{api:0,slack:0});
 // Simulate time passage only in this uniquely named local fixture record.
 await db.none("UPDATE sk_monitor_state SET lease_until=now()-interval '1 second' WHERE destination=$1",[failed]);control={};await run('pending-retry-without-api-spend',{api:0,slack:1});assert.equal((await db.one('SELECT outbox FROM sk_monitor_state WHERE destination=$1',[failed])).outbox,null);assert.equal(Number((await db.one('SELECT count(*) FROM sk_monitor_delivered WHERE destination=$1',[failed])).count),2);
 await run('confirmed-retry-repeat-quiet',{api:2,slack:0});
 const summary={checkedAt:new Date().toISOString(),artifactSha256:createHash('sha256').update(artifact).digest('hex'),n8nVersion:(await command(n8n,['--version'],'version')).output.trim(),databaseVersion:(await db.one('SELECT version() AS version')).version,scope:'Fresh n8n import and real node execution. SocialKit and Slack responses simulated locally; no external Slack delivery. Each execution starts a fresh n8n process; database state persists.',results};
 await writeFile(join(dir,'summary.json'),JSON.stringify(summary,null,2)+'\n');await writeFile(join(dir,'calls.json'),JSON.stringify(calls,null,2)+'\n');console.log(JSON.stringify({directory:dir,...summary},null,2));
} finally {await new Promise(resolve=>server.close(resolve));await pgp.end();}

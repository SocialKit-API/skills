// Run against the same isolated loopback QA database before and after an operator-controlled server restart.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(process.env.AEO_QA_MODULES||import.meta.url),pgp=require('pg-promise')();
const url=process.env.AEO_QA_POSTGRES_URL,phase=process.argv[2],snapshot=process.argv[3];
if(!url||!snapshot||!['before','after'].includes(phase))throw new Error('Set isolated AEO_QA_POSTGRES_URL and AEO_QA_MODULES; pass before|after and a snapshot path.');
if(!['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname))throw new Error('Restart QA is restricted to a loopback test database.');
const db=pgp(url);
try {
 const state={state:await db.any('SELECT * FROM sk_monitor_state ORDER BY destination'),delivered:await db.any('SELECT * FROM sk_monitor_delivered ORDER BY destination,content_id')};
 if(phase==='before') {await writeFile(snapshot,JSON.stringify(state),{mode:0o600});console.log(JSON.stringify({phase,stateRows:state.state.length,deliveredRows:state.delivered.length}));}
 else {
  assert.equal(JSON.stringify(state),await readFile(snapshot,'utf8'), 'Fixture state must survive the database server restart');
  const dest=state.delivered.find(d=>d.destination.endsWith('-first'))?.destination;
  if(!dest)throw new Error('Run qa-local.mjs first to create its delivered first-run fixture.');
  const items=state.delivered.filter(d=>d.destination===dest).map(d=>({id:d.content_id}));
  await db.any('SELECT * FROM sk_monitor_claim($1,$2)',[dest,'after-server-restart']);
  const staged=await db.one('SELECT * FROM sk_monitor_stage($1,$2,$3)',[dest,'after-server-restart',{completedAt:new Date().toISOString(),profiles:[{items}]}]);
  assert.equal(staged.outbox,null,'Already delivered items must remain quiet after server restart');
  console.log(JSON.stringify({checkedAt:new Date().toISOString(),databaseVersion:(await db.one('SELECT version() AS version')).version,serverRestartRetainedAllState:true,stateRows:state.state.length,deliveredRows:state.delivered.length,alreadyDeliveredItems:items.length,repeatDigestQuiet:true},null,2));
 }
}finally{await pgp.end();}

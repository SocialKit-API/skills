// Integration test: use an empty dedicated PostgreSQL database. Never point at production.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(process.env.AEO_QA_MODULES || import.meta.url);
// Independent pools are intentional for the simultaneous-owner test.
const pgp = require('pg-promise')({noWarnings:true});
class Client { constructor({connectionString}) {this.db=pgp(connectionString)} async connect(){} async query(sql,args){return {rows:await this.db.any(sql,args)}} async end(){await this.db.$pool.end()} }
const url = process.env.AEO_QA_POSTGRES_URL;
if (!url) throw new Error('Set AEO_QA_POSTGRES_URL to an isolated test database.');
const client = new Client({connectionString:url}); await client.connect();
await client.query(await readFile(new URL('./sql/schema.sql',import.meta.url),'utf8'));
test.after(async()=>{ await client.end().catch(()=>{}); });
const dest=`test-${Date.now()}`;
const report={completedAt:'2026-09-21T00:00:00Z',usage:{requests:1,reservedCredits:1},profiles:[{status:'ok',items:[{id:'youtube:abcdefghijk'},{id:'instagram:fixture'}]}]};
const query=(sql,params)=>client.query(sql,params);
test('lease, delivery failure, expiry, stale owner, confirmed commit and repeat quiet',async()=>{
 assert.equal((await query('SELECT * FROM sk_monitor_claim($1,$2)',[dest,'run1'])).rows.length,1);
 assert.equal((await query('SELECT * FROM sk_monitor_claim($1,$2)',[dest,'overlap'])).rows.length,0);
 const staged=(await query('SELECT * FROM sk_monitor_stage($1,$2,$3)',[dest,'run1',report])).rows[0].outbox;
 assert.equal(staged.items.length,2);
 // A failed send does not invoke ack: its outbox remains intact and delivered set is empty.
 assert.equal((await query('SELECT * FROM sk_monitor_delivered WHERE destination=$1',[dest])).rows.length,0);
 await assert.rejects(query('SELECT sk_monitor_ack($1,$2,$3,$4)',[dest,'wrong-owner','run1','123.1']));
 await query("UPDATE sk_monitor_state SET lease_until=now()-interval '1 second' WHERE destination=$1",[dest]);
 const reclaimed=(await query('SELECT * FROM sk_monitor_claim($1,$2)',[dest,'run2'])).rows[0];
 assert.deepEqual(reclaimed.outbox,staged);
 assert.equal((await query('SELECT * FROM sk_monitor_guard($1,$2)',[dest,'run1'])).rows.length,0);
 assert.equal((await query('SELECT * FROM sk_monitor_guard($1,$2)',[dest,'run2'])).rows.length,1);
 await assert.rejects(query('SELECT sk_monitor_ack($1,$2,$3,$4)',[dest,'run2','wrong-digest','123.1']));
 assert.equal((await query('SELECT sk_monitor_ack($1,$2,$3,$4) AS count',[dest,'run2','run1','123.1'])).rows[0].count,2);
 await query('SELECT * FROM sk_monitor_claim($1,$2)',[dest,'run3']);
 assert.equal((await query('SELECT * FROM sk_monitor_stage($1,$2,$3)',[dest,'run3',report])).rows[0].outbox,null);
 assert.equal((await query('SELECT * FROM sk_monitor_delivered WHERE destination=$1',[dest])).rows.length,2);
 // Real disconnect/reconnect verifies durable database state rather than a JS cache.
 await client.end(); const after = new Client({connectionString:url});await after.connect();
 assert.equal((await after.query('SELECT * FROM sk_monitor_delivered WHERE destination=$1',[dest])).rows.length,2);await after.end();
});

test('simultaneous database connections elect one lease owner',async()=>{
 const a=new Client({connectionString:url}),b=new Client({connectionString:url});
 const concurrentDest=`concurrent-${Date.now()}`;
 try {
  await Promise.all([a.connect(),b.connect()]);
  const claims=await Promise.all([
   a.query('SELECT * FROM sk_monitor_claim($1,$2)',[concurrentDest,'simultaneous-a']),
   b.query('SELECT * FROM sk_monitor_claim($1,$2)',[concurrentDest,'simultaneous-b']),
  ]);
  assert.equal(claims.reduce((sum,r)=>sum+r.rows.length,0),1);
  const winner=claims.flatMap(r=>r.rows)[0].lease_owner;
  const loser=winner==='simultaneous-a'?'simultaneous-b':'simultaneous-a';
  await a.query('SELECT * FROM sk_monitor_stage($1,$2,$3)',[concurrentDest,winner,report]);
  assert.equal((await b.query('SELECT * FROM sk_monitor_guard($1,$2)',[concurrentDest,loser])).rows.length,0);
  assert.equal((await a.query('SELECT * FROM sk_monitor_guard($1,$2)',[concurrentDest,winner])).rows.length,1);
 } finally {await Promise.all([a.end(),b.end()]);}
});

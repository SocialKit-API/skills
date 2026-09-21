import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProfiles, normalizeItem, normalizeResponse, rankings, markdown } from './core.mjs';
import { collect, apiBase } from './collect.mjs';
const yt = normalizeProfiles(['https://www.youtube.com/@NASA'])[0], ig = normalizeProfiles(['https://www.instagram.com/nasa/'])[0];
const video = { videoId: 'abcdefghijk', url: 'https://www.youtube.com/watch?v=abcdefghijk', title: 'Synthetic | [fixture]', views: 0 };
const reel = { shortcode: 'fixture_1', url: 'https://www.instagram.com/p/fixture_1/', type: 'reel', author: { username: 'nasa' }, views: null, likes: 0 };
const body = (p, items) => ({success:true,data:p.platform === 'youtube' ? {url:p.url,results:items} : {profileUrl:p.url,items}});
const response = (value,status=200, headers={}) => new Response(JSON.stringify(value),{status,headers});
test('strict profile validation rejects unsupported, secret and single-item URLs before calls', async () => {
 for (const bad of ['https://instagram.com/reel/abc/', 'https://youtube.com/watch?v=abcdefghijk','https://youtube.com.evil/@NASA','https://secret:password@instagram.com/nasa/','https://instagram.com/nasa/?token=secret','https://instagram.com/explore/']) assert.throws(() => normalizeProfiles([bad]));
 assert.throws(() => normalizeProfiles([ig.url,ig.url])); assert.throws(() => apiBase('http://remote.test'));
});
test('nulls, zeroes, identity validation and exact timestamps', () => {
 const i=normalizeItem(reel,ig,'2026-09-21T00:00:00.000Z'); assert.equal(i.metrics.views,null); assert.equal(i.metrics.likes,0); assert.equal(i.metrics.comments,null); assert.equal(i.publishedAt,null);
 assert.equal(normalizeItem({...video,views:'100'},yt,'now').metrics.views,null);
 for (const changed of [{...video,videoId:'lmnopqrstuv'},{...video,url:'https://evil.test/watch?v=abcdefghijk'}]) assert.throws(()=>normalizeItem(changed,yt,'now'));
 assert.equal(normalizeItem({...reel,author:{username:'another'}},ig,'now').authorUsername,'another');
 assert.match(normalizeResponse(body(ig,[{...reel,author:{username:'another'}}]),ig,10,'now').warnings.join(' '),/primary author @another/);
 assert.throws(()=>normalizeResponse(body({...ig,url:'https://www.instagram.com/another/'},[reel]),ig,10,'now'));
});
test('partial rejected items and duplicate IDs remain visible; rankings stay within platform/type', () => {
 const y=normalizeResponse(body(yt,[video,{...video,videoId:'wrong'},video]),yt,10,'now'); assert.equal(y.status,'partial'); assert.equal(y.items.length,1); assert.equal(y.warnings.length,3);
 const i=normalizeResponse(body(ig,[reel]),ig,10,'now'); const r=rankings([y,i]); assert.equal(r.length,2); assert.equal(r[0].top.length,0); assert.equal(r[1].top[0].views,0);
});
test('real credit header is recorded; per-20 Instagram budget prevents overspend and page traversal',async()=>{
 let calls=0;
 const report=await collect({urls:[ig.url,yt.url],key:'secret',limits:{limit:41,maxCredits:3}}, {fetchImpl:async(u,init)=>{calls++;assert.equal(init.headers['x-access-key'],'secret');assert.equal(u.searchParams.get('cursor'),null);return response({...body(ig,[reel]),data:{...body(ig,[reel]).data,hasMore:true,cursor:'ignored'}},200,{'X-Credits-Remaining':'47','X-Credits-Used':'3'});}});
 assert.equal(calls,1);assert.equal(report.usage.reservedCredits,3);assert.equal(report.usage.reportedCreditsUsed,3);assert.equal(report.usage.attempts[0].creditsRemaining,47);assert.equal(report.profiles[1].status,'failed');assert.match(markdown(report),/unknown/);assert.ok(!JSON.stringify(report).includes('secret'));
});
test('auth error stops subsequent calls, never retries or leaks body',async()=>{
 let calls=0;const report=await collect({urls:[yt.url,ig.url],key:'secret'},{fetchImpl:async()=>{calls++;return response({message:'secret'},401);}});
 assert.equal(calls,1);assert.equal(report.profiles.length,2);assert.ok(report.profiles.every(p=>p.status==='failed'));assert.ok(!JSON.stringify(report).includes('secret'));
});
test('transient retry bounded; failed profile does not prevent independent success',async()=>{
 let calls=0; const report=await collect({urls:[yt.url,ig.url],key:'secret'}, {sleep:async()=>{},fetchImpl:async()=>{calls++;return calls<=2?response({},503):response(body(ig,[reel]));}});
 assert.equal(calls,3); assert.equal(report.profiles[0].status,'failed'); assert.equal(report.profiles[1].status,'ok'); assert.equal(report.usage.reservedCredits,3);
});
test('wall-time cap, request cap, ambiguous timeout and over-limit response stop safely', async()=>{
 for (const limits of [{maxRequests:1},{maxDurationMs:1}]) {let calls=0,t=0;const r=await collect({urls:[yt.url,ig.url],key:'secret',limits},{now:()=>t++,fetchImpl:async()=>{calls++;return response(body(yt,[video]));}});assert.ok(calls<=1);assert.equal(r.profiles.length,2);}
 let calls=0;const r=await collect({urls:[yt.url,ig.url],key:'secret',limits:{limit:1}},{fetchImpl:async()=>{calls++;return response(body(yt,[video,video]));}}); assert.equal(calls,1);assert.match(r.profiles[0].error,/exceeded/);
 calls=0;await collect({urls:[yt.url],key:'secret'},{fetchImpl:async()=>{calls++;throw new Error('contains secret');}});assert.equal(calls,1);
});

test('missing profile identity is rejected even when item ID/source are valid',()=>{
 for(const [profile,items] of [[yt,[video]],[ig,[reel]]]) assert.throws(()=>normalizeResponse({success:true,data:profile.platform==='youtube'?{results:items}:{items}},profile,10,'now'),/profile identity/);
});
test('unexpected reported credit charge halts further requests and remains distinct from verified billing',async()=>{
 let calls=0;const r=await collect({urls:[yt.url,ig.url],key:'secret',limits:{maxCredits:2}},{fetchImpl:async()=>{calls++;return response(body(yt,[video]),200,{'X-Credits-Used':'9'});}});
 assert.equal(calls,1);assert.equal(r.usage.reservedCredits,1);assert.equal(r.usage.reportedCreditsUsed,9);assert.equal(r.usage.chargedCredits,null);assert.equal(r.profiles[0].status,'partial');assert.match(r.profiles[1].error,/exceeded the reserved bound/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Budget, normalize, number, contentId, redact, publicAttempt, csv, analyze } from './core.mjs';
import { createHttp, performAttempt } from './providers.mjs';
import { validate, execute, preflightApify } from './run.mjs';

const caption = { id: 'yt1', sample: 'pilot', workload: 'youtube-caption', url: 'https://www.youtube.com/watch?v=abcdefghijk', selectionNote: 'Synthetic unit fixture, not measured evidence' };
const reel = { id: 'ig1', sample: 'pilot', workload: 'instagram-reel', url: 'https://www.instagram.com/reel/Example1234/', selectionNote: 'Synthetic unit fixture, not measured evidence' };
const env = { SOCIALKIT_API_KEY: 'socialkit-test-secret', SCRAPECREATORS_API_KEY: 'scrapecreators-test-secret', APIFY_TOKEN: 'apify-test-secret' };
const config = JSON.parse(await readFile(new URL('./config.example.json', import.meta.url)));
config.clientRegion = 'test-fixture';
for (const c of Object.values(config.costs)) c.reviewed = true;
const response = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers });
const clone = () => structuredClone(config);
const scCaption = { success: true, credits_charged: 1, videoId: 'abcdefghijk', transcript_only_text: 'Useful fixture transcript.', language: 'English' };
const skCaption = { success: true, data: { url: caption.url, transcript: 'Useful fixture transcript.', transcriptSegments: [{ text: 'Useful fixture transcript.', start: 0 }] } };
const igData = { shortcode: 'Example1234', author: 'example', timestamp: 1720000000, likes: 0, comments: 0, views: null };

test('caption normalization rejects false success, empty text, wrong IDs and language/translation mismatches', () => {
  assert.equal(normalize('socialkit', caption, skCaption).usable, true);
  assert.equal(normalize('socialkit', caption, skCaption).normalized.identity, 'request-bound');
  assert.equal(normalize('socialkit', caption, skCaption).normalized.languageVerified, false);
  assert.equal(normalize('socialkit', caption, { success: true, data: { url: caption.url, transcript: ' \n ', transcriptSegments: [{ text: ' ' }] } }).category, 'empty-text');
  assert.equal(normalize('scrapecreators', caption, { ...scCaption, videoId: 'differentid' }).category, 'identity-mismatch');
  assert.equal(normalize('scrapecreators', caption, { ...scCaption, url: 'https://www.youtube.com/watch?v=xxxxxxxxxxx' }).category, 'identity-mismatch');
  assert.equal(normalize('scrapecreators', caption, { ...scCaption, language: 'Spanish' }).category, 'language-or-source-mismatch');
  assert.equal(normalize('scrapecreators', caption, { ...scCaption, success: false }).usable, false);
  assert.equal(normalize('apify', caption, [{ video_id: 'abcdefghijk', full_text: 'Text', translated: true, language_code: 'en' }]).usable, false);
});

test('all provider shapes preserve zero and optional missing views; required metadata is enforced', () => {
  const sk = normalize('socialkit', reel, { success: true, data: igData });
  const sc = normalize('scrapecreators', reel, { success: true, data: { xdt_shortcode_media: { shortcode: 'Example1234', owner: { username: 'example' }, created_at: '2024-07-03T09:46:40.000Z', edge_media_preview_like: { count: 0 }, edge_media_to_parent_comment: { count: 0 } } } });
  const ap = normalize('apify', reel, [{ shortCode: 'Example1234', ownerUsername: 'example', timestamp: '2024-07-03T09:46:40.000Z', likesCount: 0, commentsCount: 0, videoPlayCount: -1 }]);
  for (const r of [sk, sc, ap]) { assert.equal(r.usable, true); assert.equal(r.normalized.views, null); assert.equal(r.normalized.likes, 0); }
  assert.equal(normalize('socialkit', reel, { success: true, data: { ...igData, comments: null } }).usable, false);
  assert.equal(normalize('socialkit', reel, { success: true, data: { ...igData, shortcode: undefined, url: reel.url } }).category, 'identity-mismatch');
  assert.equal(normalize('apify', reel, []).category, 'empty-result');
  assert.equal(normalize('apify', reel, [{}, {}]).category, 'ambiguous-result');
  for (const v of [null, '', true, -1, undefined, NaN]) assert.equal(number(v), null);
});

test('input validation rejects spoofed domains/profile jobs and excludes internal URLs', () => {
  assert.equal(contentId('https://youtube.com.evil.example/watch?v=abcdefghijk', 'youtube-caption'), null);
  assert.equal(contentId('https://www.instagram.com/example/', 'instagram-reel'), null);
  assert.equal(contentId('https://user:password@www.instagram.com/reel/Example1234/', 'instagram-reel'), null);
  const c = clone(); c.socialkitBaseUrl = 'https://attacker.example';
  assert.throws(() => validate(c, [caption], env), /untrusted/);
  const mislabeled = clone(); mislabeled.socialkitBaseUrl = 'https://socialkit-api.development.corp.skyfall.ai';
  assert.throws(() => validate(mislabeled, [caption], env), /label and origin disagree/);
  assert.throws(() => validate(config, [caption], {}), /missing SOCIALKIT/);
  assert.throws(() => validate(config, [caption, caption], env), /duplicate/);
});

test('full run rejects inadequate sample, unverified public inputs, missing providers or insufficient worst-case cap', () => {
  const c = clone(); c.phase = 'full';
  assert.throws(() => validate(c, [caption], env), /precheck/);
  c.providers = ['socialkit']; assert.throws(() => validate(c, [caption], env), /all three/);
  c.providers = config.providers;
  const inputs = [];
  for (const [template, prefix] of [[caption, 'yt'], [reel, 'ig']]) {
    for (let i = 0; i < 20; i++) inputs.push({ ...template, id: `${prefix}-${i}`, sample: 'primary', url: template.url.replace(prefix === 'yt' ? 'abcdefghijk' : 'Example1234', `a${String(i).padStart(10, '0')}`), precheckedAt: '2026-09-21T00:00:00Z', publicConfirmed: true, englishCaptionsConfirmed: true });
    for (let i = 0; i < 3; i++) inputs.push({ ...inputs.find(r => r.id === `${prefix}-${i}`), id: `${prefix}-repeat-${i}`, sample: 'repeat' });
  }
  assert.throws(() => validate(c, inputs, env), /exceeds remaining budget/);
  c.budget = { maxUsd: 4.14, maxAttempts: 276, maxCredits: { socialkit: 92, scrapecreators: 92 } };
  assert.equal(validate(c, inputs, env).plannedJobs, 138);
});

test('budget reserves uncertain failures and refuses next attempt above dollars, credits or attempts', () => {
  const budget = new Budget({ maxUsd: .02, maxAttempts: 2, maxCredits: { socialkit: 1 } });
  assert.equal(budget.reserve('socialkit', { maxUsd: .01, maxCredits: 1 }), true);
  assert.equal(budget.reserve('socialkit', { maxUsd: .01, maxCredits: 1 }), false);
  assert.equal(budget.reserve('apify', { maxUsd: .025, maxCredits: 0 }), false);
  assert.equal(budget.usd, .01);
});

test('redaction covers nested credentials, echoed secrets and signed URLs; public export excludes content and run IDs', () => {
  const safe = redact({ Authorization: 'Bearer secret', nested: { token: 'secret', message: 'key=secret https://cdn.example/video?signature=unsafe#fragment' } }, ['secret']);
  assert.ok(!JSON.stringify(safe).includes('unsafe'));
  assert.ok(!JSON.stringify(safe).includes('secret'));
  const row = publicAttempt({ inputId: 'id', provider: 'apify', url: caption.url, runId: 'private-run', normalized: { transcript: 'private transcript', caption: 'private caption', textCharacters: 18, identity: 'returned-id' } });
  assert.ok(!JSON.stringify(row).includes('private'));
  assert.ok(csv([{ text: '=HYPERLINK("https://bad")' }]).includes("'=HYPERLINK"));
});

test('ScrapeCreators request explicitly asks English and captures actual credits, modeled dollars and errors', async () => {
  let request;
  const result = await performAttempt('scrapecreators', caption, config, env, { fetchImpl: async (url, init) => { request = { url: String(url), init }; return response(scCaption); } });
  assert.equal(new URL(request.url).searchParams.get('language'), 'en');
  assert.equal(request.init.headers['x-api-key'], env.SCRAPECREATORS_API_KEY);
  assert.equal(result.actualCredits, 1); assert.equal(result.modeledUsd, .00188); assert.equal(result.actualUsd, null);
  const failure = await performAttempt('scrapecreators', caption, config, env, { fetchImpl: async () => response({ credits_charged: 0, success: false }, 429) });
  assert.equal(failure.category, 'http-429'); assert.equal(failure.actualCredits, 0); assert.equal(failure.costUnknown, false);
});

test('SocialKit forces uncached optional-view job and records charge evidence, not guessed cohort', async () => {
  let url;
  const result = await performAttempt('socialkit', reel, config, env, { fetchImpl: async u => { url = new URL(u); return response({ success: true, data: igData }, 200, { 'X-Credits-Used': '1' }); } });
  assert.equal(url.searchParams.get('cache'), 'false'); assert.equal(url.searchParams.get('requireViews'), 'false');
  assert.equal(result.actualCredits, 1); assert.equal(result.pricingVersion, null); assert.equal(result.usable, true);
});

test('Apify measures submission, queue/poll and dataset retrieval with immutable build and remote spending cap', async () => {
  let time = 0; const calls = [], evidence = [];
  const actor = config.actors['youtube-caption'];
  const run = { id: 'fixture-run', buildId: actor.buildId, status: 'RUNNING' };
  const result = await performAttempt('apify', caption, config, env, {
    now: () => time, sleep: async ms => { time += ms; }, evidence: async e => evidence.push(e),
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init }); time += 100;
      if (calls.length === 1) return response({ data: run }, 201);
      if (calls.length === 2) return response({ data: { ...run, status: 'SUCCEEDED', usageTotalUsd: .003, defaultDatasetId: 'fixture-data' } });
      time += 500; return response([{ video_id: 'abcdefghijk', full_text: 'Existing caption', language_code: 'en', translated: false }]);
    },
  });
  const u = new URL(calls[0].url);
  assert.equal(u.searchParams.get('build'), actor.build); assert.equal(u.searchParams.get('maxTotalChargeUsd'), '.025'.replace(/^\./, '0.'));
  assert.equal(u.searchParams.get('restartOnError'), 'false'); assert.equal(u.searchParams.get('timeout'), '110');
  assert.deepEqual(JSON.parse(calls[0].init.body), { videoIds: [caption.url], lang: 'en' });
  assert.equal(result.elapsedMs, 2800); assert.equal(result.actualUsd, .003); assert.equal(result.usable, true); assert.equal(evidence.length, 3);
});

test('Apify build drift aborts the exact remote run; unknown charges remain unknown', async () => {
  const calls = [];
  const result = await performAttempt('apify', reel, config, env, { fetchImpl: async (url, init) => {
    calls.push({ url: String(url), init });
    return response({ data: { id: 'fixture-run', buildId: 'unexpected', status: calls.length === 1 ? 'RUNNING' : 'ABORTED' } }, calls.length === 1 ? 201 : 200);
  } });
  assert.equal(result.category, 'actor-build-mismatch'); assert.equal(calls.length, 2); assert.ok(calls[1].url.endsWith('/fixture-run/abort')); assert.equal(result.costUnknown, true);
});

test('network timeout and malformed JSON remain failures with durable exchange evidence', async () => {
  const evidence = [];
  const http = createHttp({ deadline: performance.now() + 20, evidence: async e => evidence.push(e), fetchImpl: async (_url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')))) });
  await assert.rejects(http('https://example.com'), /timeout/); assert.equal(evidence[0].error, 'timeout');
  const result = await performAttempt('socialkit', caption, config, env, { fetchImpl: async () => new Response('not-json') });
  assert.equal(result.category, 'invalid-json'); assert.equal(result.costUnknown, true);
});

test('execution keeps all planned denominators, retry attempts and delay; budget stop prevents further calls', async () => {
  const c = clone(); c.providers = ['socialkit']; c.budget = { maxUsd: .02, maxAttempts: 2, maxCredits: { socialkit: 2 } };
  let clock = 0, calls = 0; const starts = [];
  const result = await execute(c, [caption, reel], env, { now: () => clock, sleep: async ms => { clock += ms; }, onStart: async row => starts.push(row), attempt: async () => {
    clock += 100; calls++;
    return { usable: calls === 2, category: calls === 2 ? 'usable' : 'http-503', elapsedMs: 100, actualCredits: 1, modeledUsd: .002, actualUsd: null, reservedUsd: .01, costUnknown: false, missing: [] };
  } });
  assert.equal(calls, 2); assert.equal(starts.length, 2); assert.equal(result.attempts.length, 2); assert.equal(result.outcomes.length, 2);
  assert.equal(result.outcomes[0].totalElapsedMs, 2200); assert.equal(result.outcomes[0].firstAttemptUsable, false); assert.equal(result.outcomes[1].category, 'not-run-budget');
});

test('unknown Apify submission never retries or silently restarts more paid jobs', async () => {
  const c = clone(); c.providers = ['apify']; let calls = 0;
  const result = await execute(c, [caption, reel], env, { attempt: async () => { calls++; return { usable: false, category: 'network-error', costUnknown: true, reservedUsd: .025, actualCredits: null }; } });
  assert.equal(calls, 1); assert.equal(result.stop, 'not-run-reconciliation-required'); assert.equal(result.outcomes.length, 2);
});

test('statistics separate repeats and failures, median averages even values and unknown costs remain explicit', () => {
  const outcomes = [100, 200, 500, 800].map((ms, i) => ({ provider: 'socialkit', workload: 'youtube-caption', sample: 'primary', usable: true, attempts: 1, totalElapsedMs: ms, category: 'usable' }));
  outcomes.push({ ...outcomes[0], usable: false, category: 'timeout' }, { ...outcomes[0], sample: 'repeat', totalElapsedMs: 10 });
  const a = [{ ...outcomes[0], attempt: 1, actualCredits: null, actualUsd: null, modeledUsd: null, reservedUsd: .01, costUnknown: true }];
  const stats = analyze(outcomes, a);
  assert.equal(stats[0].planned, 5); assert.equal(stats[0].usable, 4); assert.equal(stats[0].medianUsableMs, 350); assert.equal(stats[0].p90UsableMs, 800); assert.equal(stats[0].unknownCostAttempts, 1); assert.equal(stats[1].sample, 'repeat');
});

test('Apify read-only preflight rejects rental/current minimum cap mismatch before starting Actors', async () => {
  await assert.rejects(preflightApify(config, env, { fetchImpl: async () => response({ data: { pricingInfos: [{ pricingModel: 'RENTAL', startedAt: '2020-01-01' }] } }) }), /pay-per-event/);
  await assert.rejects(preflightApify(config, env, { fetchImpl: async () => response({ data: { pricingInfos: [{ pricingModel: 'PAY_PER_EVENT', startedAt: '2020-01-01', minimalMaxTotalChargeUsd: 1 }] } }) }), /minimum charge cap/);
});

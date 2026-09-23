#!/usr/bin/env node
import { readFile, writeFile, mkdir, appendFile, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { Budget, PROVIDERS, WORKLOADS, hash, contentId, redact, csv, publicAttempt, analyze } from './core.mjs';
import { createHttp, performAttempt, retryable } from './providers.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const KEY_NAMES = { socialkit: 'SOCIALKIT_API_KEY', scrapecreators: 'SCRAPECREATORS_API_KEY', apify: 'APIFY_TOKEN' };
const finitePositive = n => typeof n === 'number' && Number.isFinite(n) && n > 0;
function check(condition, message) { if (!condition) throw new Error(message); }
export function validate(config, inputs, env = process.env, requireKeys = true) {
  check(['pilot', 'full'].includes(config.phase), 'phase must be pilot or full');
  check(config.methodologyVersion === '1.0', 'unsupported methodology version');
  check(typeof config.clientRegion === 'string' && config.clientRegion.trim() && !config.clientRegion.includes('REPLACE'), 'record clientRegion');
  check(['development', 'production'].includes(config.socialkitEnvironment), 'record SocialKit environment');
  const base = new URL(config.socialkitBaseUrl);
  check(base.protocol === 'https:' && !base.username && !base.password && !base.search && base.pathname === '/' && (base.hostname === 'api.socialkit.dev' || /^socialkit-api\.development\.corp\.skyfall\.ai$/.test(base.hostname)), 'untrusted SocialKit API origin');
  check((config.socialkitEnvironment === 'production') === (base.hostname === 'api.socialkit.dev'), 'SocialKit environment label and origin disagree');
  check(Array.isArray(config.providers) && config.providers.length && new Set(config.providers).size === config.providers.length && config.providers.every(p => PROVIDERS.includes(p)), 'invalid providers');
  check(config.phase !== 'full' || (config.providers.length === 3 && config.socialkitEnvironment === 'production'), 'full comparison requires all three providers and production SocialKit');
  check(config.attemptTimeoutMs === 120000 && config.pollMs === 2000 && config.maxAttemptsPerInput === 2 && config.retryDelayMs === 2000 && config.maxHttpRequestsPerAttempt === 70, 'methodology timing/retry settings changed: version the protocol first');
  check(finitePositive(config.maxWallTimeMs) && config.maxWallTimeMs <= 21600000, 'wall time must be <= 6 hours');
  check(finitePositive(config.budget?.maxUsd) && config.budget.maxUsd <= 5 && Number.isInteger(config.budget.maxAttempts) && config.budget.maxAttempts > 0 && config.budget.maxAttempts <= 400, 'invalid budget');
  for (const provider of config.providers) {
    if (requireKeys) check(env[KEY_NAMES[provider]]?.trim(), `missing ${KEY_NAMES[provider]}`);
    const cost = config.costs?.[provider];
    check(finitePositive(cost?.maxUsd) && cost.maxUsd <= .05 && Number.isInteger(cost.maxCredits) && cost.maxCredits >= 0, `invalid ${provider} reservation`);
    check(typeof cost.source === 'string' && cost.source.trim() && cost.reviewed === true, `${provider} plan/charge source must be reviewed`);
    if (provider !== 'apify') {
      check(finitePositive(cost.usdPerCredit) && cost.maxCredits >= 1 && cost.maxUsd >= cost.maxCredits * cost.usdPerCredit, `${provider} credit cap does not cover its reservation`);
      check(Number.isInteger(config.budget.maxCredits?.[provider]) && config.budget.maxCredits[provider] >= 1, `${provider} credit budget required`);
    }
  }
  if (config.providers.includes('apify')) for (const workload of WORKLOADS) {
    const actor = config.actors?.[workload];
    check(/^[a-zA-Z0-9]{17}$/.test(actor?.id || '') && /^\d+\.\d+\.\d+$/.test(actor?.build || '') && /^[a-zA-Z0-9]{17}$/.test(actor?.buildId || ''), 'Apify Actor and immutable build pin required');
    const expected = workload === 'youtube-caption' ? ['A5s2BdfybeiJprZ9W', '0.0.74', 'GTjjmcXk0cAVl3BSE'] : ['xMc5Ga1oCONPmWJIa', '0.0.569', 'W0VMuMDxn3eft3fge'];
    check(JSON.stringify([actor.id, actor.build, actor.buildId]) === JSON.stringify(expected), 'Actor pin changed: version methodology and adapter first');
  }
  check(Array.isArray(inputs) && inputs.length > 0 && inputs.length <= 70, 'invalid input count');
  check(new Set(inputs.map(i => i.id)).size === inputs.length, 'duplicate input IDs');
  for (const input of inputs) {
    check(/^[\w-]{1,60}$/.test(input.id) && WORKLOADS.includes(input.workload) && ['primary', 'repeat', 'pilot'].includes(input.sample), 'invalid input identity/workload/sample');
    check(contentId(input.url, input.workload), 'invalid public input URL');
    check(input.workload !== 'instagram-reel' || new URL(input.url).pathname.startsWith('/reel/'), 'single Reel URL required');
    check(typeof input.selectionNote === 'string' && input.selectionNote.trim(), 'selection note required');
    check(config.phase !== 'pilot' || input.sample === 'pilot', 'pilot inputs must stay separate');
    if (config.phase === 'full') {
      check(input.sample !== 'pilot' && input.precheckedAt && Number.isFinite(Date.parse(input.precheckedAt)) && input.publicConfirmed === true, 'full inputs need dated public-source precheck');
      if (input.workload === 'youtube-caption') check(input.englishCaptionsConfirmed === true, 'English caption precheck required');
    }
  }
  if (config.phase === 'pilot') check(inputs.length <= 6, 'pilot is bounded to six inputs');
  if (config.phase === 'full') for (const workload of WORKLOADS) {
    const primary = inputs.filter(i => i.workload === workload && i.sample === 'primary');
    const repeats = inputs.filter(i => i.workload === workload && i.sample === 'repeat');
    check(primary.length >= 20 && primary.length <= 30 && repeats.length === 3, 'full run requires 20–30 primary plus 3 repeat inputs per workload');
    check(new Set(primary.map(i => contentId(i.url, workload))).size === primary.length, 'primary inputs must be unique');
    check(repeats.every(i => primary.some(p => p.url === i.url)), 'repeat must reference a primary input');
  }
  const worstUsd = inputs.length * config.maxAttemptsPerInput * config.providers.reduce((sum, p) => sum + config.costs[p].maxUsd, 0);
  if (config.phase === 'full') {
    check(worstUsd <= config.budget.maxUsd + 1e-10, 'full worst-case reservation exceeds remaining budget; reduce sample before locking');
    check(inputs.length * config.providers.length * config.maxAttemptsPerInput <= config.budget.maxAttempts, 'full planned attempts exceed cap');
    for (const p of config.providers.filter(p => p !== 'apify')) check(inputs.length * config.maxAttemptsPerInput * config.costs[p].maxCredits <= config.budget.maxCredits[p], 'full planned credit reservations exceed cap');
  }
  return { inputs: inputs.length, plannedJobs: inputs.length * config.providers.length, worstUsd, credentials: Object.fromEntries(config.providers.map(p => [p, env[KEY_NAMES[p]] ? 'present' : 'missing'])) };
}
export async function preflightApify(config, env, context = {}) {
  if (!config.providers.includes('apify')) return [];
  const http = createHttp({ ...context, deadline: performance.now() + 30000, maxRequests: 4 });
  const evidence = [];
  for (const actor of Object.values(config.actors)) {
    const auth = { headers: { Authorization: `Bearer ${env.APIFY_TOKEN}` } };
    const data = (await http(`https://api.apify.com/v2/acts/${actor.id}`, auth)).body?.data;
    const pricing = data?.pricingInfos?.filter(p => Date.parse(p.startedAt) <= Date.now()).sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))[0];
    check(pricing?.pricingModel === 'PAY_PER_EVENT', 'Apify preflight requires current pay-per-event pricing');
    check((pricing.minimalMaxTotalChargeUsd || 0) <= config.costs.apify.maxUsd, 'Apify minimum charge cap exceeds reservation');
    const build = (await http(`https://api.apify.com/v2/actor-builds/${actor.buildId}`, auth)).body?.data;
    check(build?.actId === actor.id && build.buildNumber === actor.build && build.status === 'SUCCEEDED', 'Apify pinned build identity/status differs');
    evidence.push({ actor: actor.id, build: actor.build, buildId: actor.buildId, pricing });
  }
  return evidence;
}
export async function execute(config, inputs, env, { attempt = performAttempt, now = performance.now.bind(performance), sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), onStart = async () => {}, onAttempt = async () => {}, onOutcome = async () => {}, evidenceFor = () => async () => {} } = {}) {
  const budget = new Budget(config.budget);
  const attempts = [], outcomes = [];
  const runStart = now(); let stop = null;
  const ordered = [...inputs.filter(i => i.sample !== 'repeat'), ...inputs.filter(i => i.sample === 'repeat')];
  for (const [index, input] of ordered.entries()) {
    const providers = config.providers.map((_, offset) => config.providers[(index + offset) % config.providers.length]);
    for (const provider of providers) {
      const jobStart = now(); let last = null, count = 0;
      const common = { inputId: input.id, url: input.url, sample: input.sample, workload: input.workload, provider };
      for (let n = 1; n <= config.maxAttemptsPerInput; n++) {
        if (stop) break;
        if (now() - runStart + config.attemptTimeoutMs + 10000 > config.maxWallTimeMs) { stop = 'not-run-wall-time'; break; }
        if (!budget.reserve(provider, config.costs[provider])) { stop = 'not-run-budget'; break; }
        const startedAt = new Date().toISOString();
        await onStart({ ...common, attempt: n, startedAt, reservedUsd: config.costs[provider].maxUsd });
        last = { ...common, attempt: n, startedAt, ...await attempt(provider, input, config, env, { evidence: evidenceFor(`${input.id}-${provider}-${n}`) }) };
        count++; attempts.push(last); await onAttempt(last);
        if (last.costLimitExceeded) stop = 'not-run-cost-bound-violated';
        if (last.reconciliationPending) stop = 'not-run-reconciliation-required';
        // Unknown async submission may still be running: never retry it or start more paid calls.
        if (provider === 'apify' && last.costUnknown) stop = 'not-run-reconciliation-required';
        if (last.usable || !retryable(last.category) || n === config.maxAttemptsPerInput || stop) break;
        await sleep(config.retryDelayMs);
      }
      const outcome = { ...common, attempts: count, usable: last?.usable || false, category: last?.category || stop || 'not-run', totalElapsedMs: count ? now() - jobStart : null, firstAttemptUsable: attempts.find(a => a.inputId === input.id && a.provider === provider)?.usable || false };
      outcomes.push(outcome); await onOutcome(outcome);
    }
  }
  return { attempts, outcomes, budget: { reservedUsd: budget.usd, attempts: budget.attempts, reservedCredits: budget.credits }, stop, analysis: analyze(outcomes, attempts) };
}
async function json(file) { return JSON.parse(await readFile(file, 'utf8')); }
async function fingerprint(config, inputs) {
  return { config: hash(config), inputs: hash(inputs), methodology: hash(await readFile(resolve(here, 'METHODOLOGY.md'), 'utf8')), runner: hash(await Promise.all(['run.mjs', 'core.mjs', 'providers.mjs'].map(f => readFile(resolve(here, f), 'utf8')))) };
}
async function write(file, value) { await writeFile(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' }); }
async function main() {
  const [command, configFile, inputsFile, output] = process.argv.slice(2);
  if (!['check', 'lock', 'run', 'analyze', 'export'].includes(command)) throw new Error('Usage: node run.mjs check|lock|run CONFIG INPUTS [OUTPUT] or analyze|export PRIVATE_RUN_DIR [PUBLIC_DIR]');
  if (command === 'analyze' || command === 'export') {
    const data = await json(resolve(configFile, 'results.json'));
    if (command === 'analyze') { console.log(JSON.stringify(analyze(data.outcomes, data.attempts), null, 2)); return; }
    check(inputsFile, 'public destination required');
    await mkdir(inputsFile, { recursive: false });
    const manifest = await json(resolve(configFile, 'manifest.json'));
    const clean = { schemaVersion: 1, phase: manifest.config.phase, environment: manifest.config.socialkitEnvironment, clientRegion: manifest.config.clientRegion, startedAt: manifest.startedAt, finishedAt: data.finishedAt, fingerprints: manifest.fingerprints, costs: manifest.config.costs, actors: manifest.config.actors, status: data.stop || 'complete', outcomes: data.outcomes, attempts: data.attempts.map(publicAttempt), analysis: analyze(data.outcomes, data.attempts) };
    await write(resolve(inputsFile, 'results.json'), clean);
    await write(resolve(inputsFile, 'attempts.csv'), csv(clean.attempts));
    await write(resolve(inputsFile, 'outcomes.csv'), csv(clean.outcomes));
    await write(resolve(inputsFile, 'analysis.csv'), csv(clean.analysis));
    console.log(`Exported numeric evidence; manual QA and publication review still required (${clean.phase}).`); return;
  }
  check(configFile && inputsFile, 'config and inputs paths required');
  const config = await json(configFile), inputs = await json(inputsFile);
  const readiness = validate(config, inputs, process.env, command !== 'lock');
  const fingerprints = await fingerprint(config, inputs);
  if (command === 'lock') {
    check(config.phase === 'full' && config.pilotReview?.complete === true && typeof config.pilotReview.evidence === 'string', 'complete pilot review and full config required');
    const review = await json(resolve(dirname(configFile), config.pilotReview.evidence));
    check(review.captionLanguageAndIdentityReviewed === true && review.creditPolicyReviewed === true && review.normalizationReviewed === true && review.providerAccessVerified === true && review.reviewer && review.pilotRun && review.reviewedAt, 'pilot review evidence incomplete');
    check(output, 'lock output required');
    await write(output, { methodologyVersion: config.methodologyVersion, lockedAt: new Date().toISOString(), fingerprints, pilotReviewSha256: hash(review) });
    console.log('Locked methodology, runner, config and inputs.'); return;
  }
  const apify = await preflightApify(config, process.env);
  if (command === 'check') { console.log(JSON.stringify({ ...readiness, actorPricingVerified: apify.length }, null, 2)); return; }
  check(output, 'new private output directory required');
  if (config.phase === 'full') {
    const lock = await json(resolve(dirname(configFile), config.lockFile || 'methodology.lock.json'));
    check(JSON.stringify(lock.fingerprints) === JSON.stringify(fingerprints), 'locked files changed');
  }
  // New directory only: never overwrite prior evidence or resume by repeating paid calls.
  await mkdir(output, { recursive: false, mode: 0o700 });
  check(((await stat(output)).mode & 0o077) === 0, 'private run directory must be mode 0700');
  const secrets = Object.values(KEY_NAMES).map(k => process.env[k]).filter(Boolean);
  const privateWrite = (file, value) => write(resolve(output, file), redact(value, secrets));
  let commit = 'unavailable'; try { commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: here, encoding: 'utf8' }).trim(); } catch {}
  await write(resolve(output, 'manifest.json'), { schemaVersion: 1, startedAt: new Date().toISOString(), commit, node: process.version, config: redact(config, secrets), inputs, fingerprints, apify: redact(apify, secrets) });
  const journal = async row => appendFile(resolve(output, 'journal.jsonl'), JSON.stringify(redact(row, secrets)) + '\n', { mode: 0o600, flush: true });
  const counts = new Map();
  const result = await execute(config, inputs, process.env, {
    onStart: row => journal({ event: 'attempt-start', ...row }),
    onAttempt: row => journal({ event: 'attempt-complete', ...row }),
    onOutcome: row => journal({ event: 'job-complete', ...row }),
    evidenceFor: id => async exchange => { const n = (counts.get(id) || 0) + 1; counts.set(id, n); await privateWrite(`${id}-http-${n}.json`, exchange); },
  });
  result.finishedAt = new Date().toISOString();
  // Normalized input URLs are explicitly supplied public URLs; retain canonical YouTube IDs.
  const safeResult = redact(result, secrets);
  for (const key of ['attempts', 'outcomes']) for (const row of safeResult[key]) row.url = inputs.find(i => i.id === row.inputId).url;
  await write(resolve(output, 'results.json'), safeResult);
  await write(resolve(output, 'attempts.csv'), csv(result.attempts.map(publicAttempt)));
  await write(resolve(output, 'outcomes.csv'), csv(result.outcomes));
  console.log(JSON.stringify({ output, stop: result.stop, jobs: result.outcomes.length, usable: result.outcomes.filter(r => r.usable).length, budget: result.budget }, null, 2));
  if (result.stop) process.exitCode = 2;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(redact(error.message, Object.values(KEY_NAMES).map(k => process.env[k]))); process.exitCode = 1; });

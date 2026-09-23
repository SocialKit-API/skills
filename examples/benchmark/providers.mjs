import { number, normalize } from './core.mjs';

export class RequestFailure extends Error {
  constructor(category, status = 0) { super(category); this.category = category; this.status = status; }
}
const TERMINAL = new Set(['SUCCEEDED', 'FAILED', 'TIMED-OUT', 'ABORTED']);
const RETRY = new Set(['network-error', 'timeout', 'http-408', 'http-429', 'http-500', 'http-502', 'http-503', 'http-504', 'actor-failed', 'actor-timed-out']);
export const retryable = category => RETRY.has(category);
export function createHttp({ fetchImpl = fetch, deadline, maxRequests = 70, evidence = async () => {}, now = performance.now.bind(performance) }) {
  let requests = 0;
  return async function http(url, init = {}) {
    if (++requests > maxRequests) throw new RequestFailure('http-request-limit');
    const left = deadline - now();
    if (left <= 0) throw new RequestFailure('timeout');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), left);
    const start = now();
    let status = 0;
    try {
      const response = await fetchImpl(url, { ...init, redirect: 'error', signal: controller.signal });
      status = response.status;
      const chunks = []; let bytes = 0;
      for await (const chunk of response.body || []) {
        bytes += chunk.length;
        if (bytes > 5_000_000) { controller.abort(); throw new RequestFailure('response-too-large', status); }
        chunks.push(chunk);
      }
      const raw = Buffer.concat(chunks).toString('utf8');
      let body;
      try { body = JSON.parse(raw); } catch { body = { invalidJson: raw }; }
      const headers = Object.fromEntries(['x-credits-used', 'x-credit-pricing-version', 'x-credits-pricing-version', 'x-credit-pricing', 'retry-after', 'x-cache', 'cf-cache-status'].flatMap(k => response.headers.has(k) ? [[k, response.headers.get(k)]] : []));
      await evidence({ operation: new URL(url).pathname, method: init.method || 'GET', status, elapsedMs: now() - start, headers, body });
      if (!response.ok) { const failure = new RequestFailure(`http-${status}`, status); failure.response = { body, headers }; throw failure; }
      if (Object.hasOwn(body || {}, 'invalidJson')) throw new RequestFailure('invalid-json', status);
      if (now() > deadline) throw new RequestFailure('timeout', status);
      return { status, body, headers };
    } catch (error) {
      if (error instanceof RequestFailure) throw error;
      const category = controller.signal.aborted ? 'timeout' : 'network-error';
      await evidence({ operation: new URL(url).pathname, method: init.method || 'GET', status, elapsedMs: now() - start, error: category });
      throw new RequestFailure(category, status);
    } finally { clearTimeout(timer); }
  };
}
export async function performAttempt(provider, input, config, env, context = {}) {
  const now = context.now || performance.now.bind(performance);
  const sleep = context.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const started = now();
  const deadline = started + config.attemptTimeoutMs;
  const http = createHttp({ ...context, deadline, maxRequests: config.maxHttpRequestsPerAttempt, now });
  const plan = config.costs[provider];
  let result = { usable: false, category: 'unknown', normalized: null, missing: [], actualCredits: null, actualUsd: null, modeledUsd: null, pricingVersion: null, cache: null, reconciliationPending: false, status: 0 };
  let run;
  const apifyHeaders = { Authorization: `Bearer ${env.APIFY_TOKEN}`, 'Content-Type': 'application/json', Accept: 'application/json' };
  try {
    let response;
    if (provider === 'apify') {
      const actor = config.actors[input.workload];
      const body = input.workload === 'youtube-caption' ? { videoIds: [input.url], lang: 'en' } : { username: [input.url], resultsLimit: 1, includeSharesCount: false, includeTranscript: false, includeDownloadedVideo: false };
      const url = new URL(`https://api.apify.com/v2/acts/${actor.id}/runs`);
      for (const [k, v] of Object.entries({ build: actor.build, timeout: Math.floor(config.attemptTimeoutMs / 1000) - 10, maxTotalChargeUsd: plan.maxUsd, maxItems: 1, restartOnError: false, waitForFinish: 0 })) url.searchParams.set(k, String(v));
      response = await http(url, { method: 'POST', headers: apifyHeaders, body: JSON.stringify(body) });
      run = response.body?.data;
      if (!run?.id) throw new RequestFailure('missing-run-id', response.status);
      if (run.buildId !== actor.buildId) throw new RequestFailure('actor-build-mismatch', response.status);
      while (!TERMINAL.has(run.status)) {
        const left = deadline - now();
        if (left <= config.pollMs) throw new RequestFailure('timeout');
        await sleep(config.pollMs);
        response = await http(`https://api.apify.com/v2/actor-runs/${encodeURIComponent(run.id)}`, { headers: apifyHeaders });
        const polled = response.body?.data;
        if (!polled?.id || polled.id !== run.id) throw new RequestFailure('run-identity-mismatch', response.status);
        if (polled.buildId !== actor.buildId) throw new RequestFailure('actor-build-mismatch', response.status);
        run = polled;
      }
      result.actualUsd = number(run.usageTotalUsd);
      if (run.status !== 'SUCCEEDED') throw new RequestFailure(`actor-${run.status.toLowerCase()}`, response.status);
      if (!run.defaultDatasetId) throw new RequestFailure('missing-dataset', response.status);
      response = await http(`https://api.apify.com/v2/datasets/${encodeURIComponent(run.defaultDatasetId)}/items?format=json&clean=true&limit=2`, { headers: apifyHeaders });
    } else {
      const path = provider === 'socialkit' ? input.workload === 'youtube-caption' ? '/youtube/transcript' : '/instagram/stats' : input.workload === 'youtube-caption' ? '/v1/youtube/video/transcript' : '/v1/instagram/post';
      const url = new URL(path, provider === 'socialkit' ? config.socialkitBaseUrl : 'https://api.scrapecreators.com');
      url.searchParams.set('url', input.url);
      if (provider === 'socialkit') { url.searchParams.set('cache', 'false'); if (input.workload === 'instagram-reel') url.searchParams.set('requireViews', 'false'); }
      if (provider === 'scrapecreators' && input.workload === 'youtube-caption') url.searchParams.set('language', 'en');
      response = await http(url, { headers: { Accept: 'application/json', [provider === 'socialkit' ? 'x-access-key' : 'x-api-key']: env[provider === 'socialkit' ? 'SOCIALKIT_API_KEY' : 'SCRAPECREATORS_API_KEY'] } });
      result.actualCredits = number(provider === 'socialkit' ? response.headers['x-credits-used'] : response.body?.credits_charged);
      result.pricingVersion = response.headers['x-credit-pricing-version'] || response.headers['x-credits-pricing-version'] || response.headers['x-credit-pricing'] || null;
      result.cache = response.body?.cached ?? response.headers['x-cache'] ?? null;
    }
    result.status = response.status;
    Object.assign(result, normalize(provider, input, response.body));
    if (now() > deadline) { result.usable = false; result.category = 'timeout'; }
  } catch (error) {
    result.category = error instanceof RequestFailure ? error.category : 'adapter-error';
    result.status = error.status || 0;
    if (error.response && provider !== 'apify') {
      result.actualCredits = number(provider === 'socialkit' ? error.response.headers['x-credits-used'] : error.response.body?.credits_charged);
      result.pricingVersion = error.response.headers['x-credit-pricing-version'] || error.response.headers['x-credits-pricing-version'] || null;
    }
  }
  // Usable latency ends before cleanup/charge reconciliation. Cleanup is explicitly bounded.
  result.elapsedMs = now() - started;
  if (provider === 'apify' && run?.id && !TERMINAL.has(run.status)) {
    result.reconciliationPending = true;
    const cleanup = createHttp({ ...context, now, deadline: now() + 10000, maxRequests: 2 });
    try {
      const aborted = await cleanup(`https://api.apify.com/v2/actor-runs/${encodeURIComponent(run.id)}/abort`, { method: 'POST', headers: apifyHeaders });
      run = aborted.body?.data || run;
      if (!TERMINAL.has(run.status)) run = (await cleanup(`https://api.apify.com/v2/actor-runs/${encodeURIComponent(run.id)}`, { headers: apifyHeaders })).body?.data || run;
      result.reconciliationPending = !TERMINAL.has(run.status);
      if (!result.reconciliationPending) result.actualUsd = number(run.usageTotalUsd);
    } catch { /* private exchanges retain the run ID; reserve full cap until reconciled */ }
  }
  if (result.actualCredits !== null) result.modeledUsd = result.actualCredits * plan.usdPerCredit;
  result.costUnknown = provider === 'apify' ? result.actualUsd === null : result.actualCredits === null;
  result.reservedUsd = plan.maxUsd;
  result.costLimitExceeded = (result.actualUsd ?? result.modeledUsd ?? 0) > plan.maxUsd + 1e-10 || (result.actualCredits ?? 0) > plan.maxCredits;
  return result;
}

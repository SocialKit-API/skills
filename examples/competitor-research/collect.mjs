import { VERSION, normalizeProfiles, normalizeResponse, listCredits, rankings } from './core.mjs';
export const DEFAULTS = Object.freeze({ limit: 10, maxRequests: 6, maxCredits: 6, retries: 1, requestTimeoutMs: 60000, maxDurationMs: 240000 });
export function options(input = {}) {
  const value = { ...DEFAULTS, ...input };
  for (const [key, min, max] of [['limit',1,50],['maxRequests',1,6],['maxCredits',1,18],['retries',0,1],['requestTimeoutMs',1,90000],['maxDurationMs',1,540000]]) if (!Number.isInteger(value[key]) || value[key] < min || value[key] > max) throw new Error(`${key} must be an integer from ${min} to ${max}.`);
  return value;
}
export function apiBase(value = 'https://api.socialkit.dev') {
  const u = new URL(value);
  if ((u.protocol !== 'https:' && !(u.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(u.hostname))) || u.username || u.password || u.search || u.hash || u.pathname !== '/') throw new Error('API base must be an HTTPS origin (HTTP is allowed only on loopback for tests).');
  return u.origin;
}
export async function collect({ urls, key, baseUrl, limits: input }, { fetchImpl = fetch, now = Date.now, sleep = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  const profiles = normalizeProfiles(urls), limits = options(input), base = apiBase(baseUrl);
  if (typeof key !== 'string' || !key.trim() || /[\r\n]/.test(key)) throw new Error('Set SOCIALKIT_API_KEY to your access key.');
  const started = now(), deadline = started + limits.maxDurationMs;
  const report = { schemaVersion: VERSION, startedAt: new Date(started).toISOString(), completedAt: null, limits, profiles: [], rankings: [], usage: { requests: 0, reservedCredits: 0, chargedCredits: null, reportedCreditsUsed: null, costBasis: 'modeled worst-case reservations; X-Credits-Used reports endpoint credits, not independently verified billing debits (monitor calls may be waived)', attempts: [] } };
  let stopReason = null;
  for (const profile of profiles) {
    let result = { ...profile, status: 'failed', items: [], warnings: [], error: null };
    for (let attempt = 1; attempt <= limits.retries + 1; attempt++) {
      const reserve = listCredits(profile.platform, limits.limit);
      if (stopReason || now() >= deadline || report.usage.requests >= limits.maxRequests || report.usage.reservedCredits + reserve > limits.maxCredits) {
        result.error = stopReason || 'Request, time, or credit reservation budget exhausted before this attempt.'; break;
      }
      report.usage.requests++; report.usage.reservedCredits += reserve;
      const ledger = { profileUrl: profile.url, endpoint: profile.endpoint, attempt, startedAt: new Date(now()).toISOString(), status: null, outcome: 'network_error', reservedCredits: reserve, creditsRemaining: null, creditsUsed: null };
      report.usage.attempts.push(ledger);
      const u = new URL(profile.endpoint, base); u.searchParams.set('url', profile.url); u.searchParams.set('limit', String(limits.limit)); if (profile.platform === 'youtube') u.searchParams.set('full_details', 'false');
      let retry = false;
      try {
        const response = await fetchImpl(u, { headers: { 'x-access-key': key, Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(Math.max(1, Math.min(limits.requestTimeoutMs, deadline - now()))) });
        ledger.status = response.status;
        const header = response.headers.get('x-credits-remaining');
        const used = response.headers.get('x-credits-used');
        ledger.creditsUsed = used !== null && /^\d+$/.test(used) ? Number(used) : null;
        ledger.creditsRemaining = header !== null && /^\d+$/.test(header) ? Number(header) : null;
        const creditViolation = ledger.creditsUsed !== null && (ledger.creditsUsed > reserve || report.usage.attempts.reduce((sum,a) => sum + (a.creditsUsed ?? 0), 0) > limits.maxCredits);
        if (creditViolation) stopReason = 'API-reported credits exceeded the reserved bound; no further requests will be sent. Recheck endpoint pricing.';
        if (!response.ok) {
          ledger.outcome = `http_${response.status}`;
          result.error = response.status === 401 || response.status === 403 ? 'Authentication rejected; check key and environment.' : response.status === 402 ? 'Insufficient credits.' : `API HTTP ${response.status}; profile may be unavailable or request failed.`;
          if ([401,402,403].includes(response.status)) stopReason = result.error;
          retry = response.status === 429 || response.status >= 500;
          await response.body?.cancel();
        } else {
          const body = await response.json();
          result = normalizeResponse(body, profile, limits.limit, new Date(now()).toISOString());
          if (creditViolation) { result.status = 'partial'; result.warnings.push(stopReason); }
          ledger.outcome = result.status === 'partial' ? 'partial' : 'usable'; break;
        }
      } catch (error) {
        // Never echo transport errors or response bodies: they can contain secrets.
        const validation = error.message?.match(/^(API exceeded requested|Response profile|Response username|Response is missing|API did not return|All \d+ items)/);
        ledger.outcome = validation ? 'invalid_response' : 'transport_or_parse_error';
        result.error = validation ? error.message : 'Transport, timeout, or response parsing failed; inspect connectivity and retry manually.';
        if (error.message?.startsWith('API exceeded requested')) stopReason = result.error;
        // Ambiguous network failures are not retried automatically: a request may have charged credits.
      } finally { ledger.elapsedMs = Math.max(0, now() - Date.parse(ledger.startedAt)); }
      if (!retry || attempt > limits.retries) break;
      const delay = Math.min(1000 * attempt, 2000, Math.max(0, deadline - now()));
      if (delay) await sleep(delay);
    }
    report.profiles.push(result);
  }
  report.usage.reportedCreditsUsed = report.usage.attempts.every(a => a.creditsUsed !== null) ? report.usage.attempts.reduce((sum,a) => sum + a.creditsUsed, 0) : null;
  report.completedAt = new Date(now()).toISOString(); report.rankings = rankings(report.profiles);
  return report;
}

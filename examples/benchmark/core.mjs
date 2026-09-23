import { createHash } from 'node:crypto';

export const PROVIDERS = ['socialkit', 'scrapecreators', 'apify'];
export const WORKLOADS = ['youtube-caption', 'instagram-reel'];
export const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
export const number = value => value !== null && value !== undefined && value !== '' && typeof value !== 'boolean' && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
const text = v => typeof v === 'string' ? v.trim() : '';
export function contentId(url, workload) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || u.username || u.password) return null;
    if (workload === 'youtube-caption') {
      const id = u.hostname === 'youtu.be' ? u.pathname.slice(1) : ['www.youtube.com', 'youtube.com'].includes(u.hostname) ? u.searchParams.get('v') || u.pathname.match(/^\/shorts\/([^/]+)$/)?.[1] : null;
      return /^[\w-]{11}$/.test(id || '') ? id : null;
    }
    return ['www.instagram.com', 'instagram.com'].includes(u.hostname) ? u.pathname.match(/^\/(?:reel|p)\/([\w-]+)\/?$/)?.[1] || null : null;
  } catch { return null; }
}
function iso(value) {
  if (value === null || value === undefined || value === '') return null;
  const time = typeof value === 'number' ? value * 1000 : Date.parse(value);
  return Number.isFinite(time) && time > 0 && time <= Date.now() + 86400000 ? new Date(time).toISOString() : null;
}
export function normalize(provider, input, body) {
  const expected = contentId(input.url, input.workload);
  let d, result;
  if (provider !== 'apify' && body?.success !== true) return { usable: false, category: 'provider-error', missing: [], normalized: null };
  if (provider === 'apify') {
    if (!Array.isArray(body) || body.length !== 1) return { usable: false, category: body?.length ? 'ambiguous-result' : 'empty-result', missing: [], normalized: null };
    d = body[0];
    if (d?.error || d?.success === false) return { usable: false, category: 'provider-error', missing: [], normalized: null };
  } else d = provider === 'socialkit' ? body.data : body;
  d ||= {};
  if (input.workload === 'youtube-caption') {
    const segments = provider === 'socialkit' ? d.transcriptSegments : provider === 'scrapecreators' ? d.transcript : d.segments;
    const transcript = text(provider === 'socialkit' ? d.transcript : provider === 'scrapecreators' ? d.transcript_only_text : d.full_text) || (Array.isArray(segments) ? segments.map(s => text(s?.text)).filter(Boolean).join(' ') : '');
    const id = provider === 'socialkit' ? contentId(d.url, input.workload) : provider === 'scrapecreators' ? d.videoId || contentId(d.url, input.workload) : d.video_id || contentId(d.url, input.workload);
    const language = text(provider === 'apify' ? d.language_code : d.language) || null;
    const identity = provider === 'socialkit' ? 'request-bound' : 'returned-id';
    result = { id: id || null, identity, transcript, textCharacters: transcript.length, textSha256: transcript ? hash(transcript) : null, language, languageVerified: !!language && /^(en(?:-|$)|english$)/i.test(language), captionSource: provider === 'apify' ? d.source_type || null : null, segmentsPresent: Array.isArray(segments) && segments.some(s => text(s?.text)) };
    if (id !== expected || (d.url && contentId(d.url, input.workload) !== expected)) return { usable: false, category: 'identity-mismatch', missing: ['id'], normalized: result };
    if (!transcript) return { usable: false, category: 'empty-text', missing: ['transcript'], normalized: result };
    if (d.translated === true || (language && !result.languageVerified)) return { usable: false, category: 'language-or-source-mismatch', missing: [], normalized: result };
    return { usable: true, category: 'usable', missing: ['language', 'captionSource'].filter(k => !result[k]), normalized: result };
  }
  if (provider === 'scrapecreators') d = d.data?.xdt_shortcode_media || {};
  result = provider === 'socialkit' ? {
    id: d.shortcode, author: text(d.author), publishedAt: iso(d.publishedAt) || iso(d.timestamp), likes: number(d.likes), comments: number(d.comments), views: number(d.views), caption: typeof d.description === 'string' ? d.description : null,
  } : provider === 'scrapecreators' ? {
    id: d.shortcode, author: text(d.owner?.username), publishedAt: iso(d.created_at) || iso(d.taken_at_timestamp), likes: number(d.edge_media_preview_like?.count), comments: number(d.edge_media_to_parent_comment?.count), views: number(d.video_play_count), caption: d.edge_media_to_caption?.edges?.map(e => e.node?.text || '').join('\n') ?? null,
  } : {
    id: d.shortCode, author: text(d.ownerUsername), publishedAt: iso(d.timestamp), likes: number(d.likesCount), comments: number(d.commentsCount), views: number(d.videoPlayCount ?? d.videoViewCount), caption: typeof d.caption === 'string' ? d.caption : null,
  };
  result.identity = 'returned-id';
  if (result.id !== expected || (d.url && contentId(d.url, input.workload) !== expected)) return { usable: false, category: 'identity-mismatch', missing: ['id'], normalized: result };
  const required = ['author', 'publishedAt', 'likes', 'comments'];
  const missing = [...required, 'views', 'caption'].filter(k => result[k] === null || result[k] === undefined || (k === 'author' && !result[k]));
  return { usable: !required.some(k => missing.includes(k)), category: required.some(k => missing.includes(k)) ? 'missing-required-fields' : 'usable', missing, normalized: result };
}

export function redact(value, secrets = []) {
  if (Array.isArray(value)) return value.map(v => redact(v, secrets));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, /authorization|cookie|password|secret|token|access.?key|api.?key/i.test(k) ? '[REDACTED]' : redact(v, secrets)]));
  if (typeof value !== 'string') return value;
  let output = value;
  for (const secret of secrets.filter(Boolean)) output = output.split(secret).join('[REDACTED]');
  output = output.replace(/Bearer\s+[^\s"<>]+/gi, 'Bearer [REDACTED]');
  // Provider responses can contain signed media URLs. Preserve path, remove all query/fragment data.
  return output.replace(/https?:\/\/[^\s"<>]+/g, raw => { try { const u = new URL(raw); u.username = ''; u.password = ''; if (u.search) u.search = '?redacted'; u.hash = ''; return u.href; } catch { return '[REDACTED URL]'; } });
}
export function csv(rows) {
  if (!rows.length) return '';
  const keys = [...new Set(rows.flatMap(Object.keys))];
  const cell = v => {
    let s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replaceAll('"', '""')}"`;
  };
  return [keys, ...rows.map(row => keys.map(k => row[k]))].map(row => row.map(cell).join(',')).join('\n') + '\n';
}
export function publicAttempt(row) {
  const keys = ['inputId', 'provider', 'workload', 'sample', 'url', 'attempt', 'startedAt', 'status', 'elapsedMs', 'usable', 'category', 'missing', 'actualCredits', 'pricingVersion', 'modeledUsd', 'actualUsd', 'reservedUsd', 'costUnknown', 'cache', 'reconciliationPending'];
  const output = Object.fromEntries(keys.map(k => [k, row[k] ?? null]));
  const n = row.normalized;
  if (n) output.completeness = { identity: n.identity, textCharacters: n.textCharacters ?? null, languageVerified: n.languageVerified ?? null, segmentsPresent: n.segmentsPresent ?? null, viewsPresent: n.views !== undefined ? n.views !== null : null, captionPresent: n.caption !== undefined ? n.caption !== null : null };
  return output;
}
export class Budget {
  constructor(config) { this.config = config; this.usd = 0; this.attempts = 0; this.credits = {}; }
  reserve(provider, limits) {
    if (this.attempts + 1 > this.config.maxAttempts || this.usd + limits.maxUsd > this.config.maxUsd + 1e-10 || (this.credits[provider] || 0) + limits.maxCredits > (this.config.maxCredits[provider] ?? Infinity)) return false;
    this.usd += limits.maxUsd; this.attempts++; this.credits[provider] = (this.credits[provider] || 0) + limits.maxCredits;
    return true;
  }
}
export function analyze(outcomes, attempts) {
  const median = xs => xs.length ? xs.length % 2 ? xs[(xs.length - 1) / 2] : (xs[xs.length / 2 - 1] + xs[xs.length / 2]) / 2 : null;
  const result = [];
  for (const sample of [...new Set(outcomes.map(r => r.sample))]) for (const workload of WORKLOADS) for (const provider of PROVIDERS) {
    const rows = outcomes.filter(r => r.sample === sample && r.workload === workload && r.provider === provider);
    if (!rows.length) continue;
    const a = attempts.filter(r => r.sample === sample && r.workload === workload && r.provider === provider);
    const latencies = rows.filter(r => r.usable).map(r => r.totalElapsedMs).sort((x, y) => x - y);
    const categories = Object.fromEntries([...new Set(rows.map(r => r.category))].map(k => [k, rows.filter(r => r.category === k).length]));
    result.push({ sample, workload, provider, planned: rows.length, attempted: rows.filter(r => r.attempts > 0).length, usable: latencies.length, firstAttemptUsable: a.filter(r => r.attempt === 1 && r.usable).length, medianUsableMs: median(latencies), p90UsableMs: latencies.length ? latencies[Math.ceil(latencies.length * .9) - 1] : null, categories, missingFields: Object.fromEntries([...new Set(a.flatMap(r => r.missing || []))].map(k => [k, a.filter(r => r.missing?.includes(k)).length])), actualCreditsKnown: a.filter(r => r.actualCredits !== null).reduce((s, r) => s + r.actualCredits, 0), modeledUsdKnown: a.reduce((s, r) => s + (r.modeledUsd || 0), 0), actualUsdKnown: a.reduce((s, r) => s + (r.actualUsd || 0), 0), unknownCostAttempts: a.filter(r => r.costUnknown).length, reservedUsd: a.reduce((s, r) => s + r.reservedUsd, 0) });
  }
  return result;
}

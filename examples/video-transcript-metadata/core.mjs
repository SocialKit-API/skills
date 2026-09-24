const platforms = {
  'youtube.com': 'youtube', 'www.youtube.com': 'youtube', 'm.youtube.com': 'youtube', 'youtu.be': 'youtube',
  'tiktok.com': 'tiktok', 'www.tiktok.com': 'tiktok',
  'instagram.com': 'instagram', 'www.instagram.com': 'instagram',
};

export function source(input) {
  const url = new URL(input);
  const platform = platforms[url.hostname];
  const valid = platform === 'youtube' ? (url.hostname === 'youtu.be' ? /^\/[\w-]{11}\/?$/.test(url.pathname) :
    (url.pathname === '/watch' && /^[\w-]{11}$/.test(url.searchParams.get('v') ?? '')) || /^\/(shorts|embed)\/[\w-]{11}\/?$/.test(url.pathname)) :
    platform === 'tiktok' ? /^\/@[^/]+\/video\/\d+\/?$/.test(url.pathname) :
    platform === 'instagram' && /^\/(reel|reels|p)\/[\w-]+\/?$/.test(url.pathname);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !valid) throw Error('Supply a public YouTube, TikTok, or Instagram video URL; expanded URLs only.');
  return { platform, url: input };
}

export function apiOrigin(input) {
  const url = new URL(input);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw Error('API base must be an HTTPS origin (or localhost for tests).');
  return url.origin;
}

function duration(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  if (typeof value !== 'string' || !/^\d+(?::\d{1,2}){0,2}(?:\.\d+)?$/.test(value)) return null;
  const seconds = value.split(':').reduce((total, part) => total * 60 + Number(part), 0);
  return seconds > 0 ? seconds : null;
}
const metric = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const text = value => typeof value === 'string' && value.trim() ? value : null;

// Two sequential requests at most. The injectable request also drives offline fixtures.
export async function collect(input, { request, maxCredits = 5 }) {
  const target = source(input);
  if (!Number.isSafeInteger(maxCredits) || maxCredits < 1 || maxCredits > 100) throw Error('maxCredits must be an integer from 1 to 100.');
  const report = { schemaVersion: 1, source: target, metadata: null, transcript: { status: 'not_requested', text: null, segments: [] }, usage: { requests: 0, reservedCredits: 0, reportedCredits: null, attempts: [] } };
  async function call(action, reserve) {
    report.usage.reservedCredits += reserve;
    report.usage.requests++;
    let reply;
    try { reply = await request(`/${target.platform}/${action}`, { url: target.url }); }
    catch { reply = { status: null, body: {} }; }
    const { status, body } = reply;
    const credits = reply.credits === null || reply.credits === undefined || reply.credits === '' ? null : metric(Number(reply.credits));
    report.usage.attempts.push({ action, status, credits });
    report.usage.reportedCredits = report.usage.attempts.every(item => item.credits !== null) ? report.usage.attempts.reduce((sum, item) => sum + item.credits, 0) : null;
    if (!Number.isInteger(status) || status < 200 || status >= 300 || body?.success !== true || !body.data || typeof body.data !== 'object' || Array.isArray(body.data)) {
      const code = body?.errorCode ?? body?.code;
      return { error: code === 'no_transcript' ? 'no_transcript' : 'failed' };
    }
    return { data: body.data };
  }
  const stats = await call('stats', 1);
  if (stats.error) { report.transcript.status = 'metadata_failed'; return report; }
  const data = stats.data;
  report.metadata = Object.fromEntries(['title', 'description', 'channelName', 'publishedAt'].map(key => [key, text(data[key])]));
  Object.assign(report.metadata, Object.fromEntries(['views', 'likes', 'comments', 'shares'].map(key => [key, metric(data[key])])));
  const seconds = duration(data.durationSeconds ?? data.duration);
  report.metadata.durationSeconds = seconds;
  const cost = target.platform === 'instagram' ? (seconds === null ? null : 2 * Math.max(1, Math.ceil(seconds / 60))) : 1;
  const reported = report.usage.reportedCredits;
  if (cost === null || Math.max(report.usage.reservedCredits, reported ?? 0) + cost > maxCredits) {
    report.transcript.status = cost === null ? 'unknown_duration' : 'budget_exceeded'; return report;
  }
  const result = await call('transcript', cost);
  if (result.error) { report.transcript.status = result.error; return report; }
  const transcript = text(result.data.transcript) ?? text(result.data.text);
  const segments = Array.isArray(result.data.transcriptSegments) ? result.data.transcriptSegments.filter(segment => typeof segment?.text === 'string').map(segment => ({ text: segment.text, start: metric(segment.start), duration: metric(segment.duration) })) : [];
  report.transcript = { status: transcript || segments.some(segment => segment.text.trim()) ? 'available' : 'empty', text: transcript, segments };
  return report;
}

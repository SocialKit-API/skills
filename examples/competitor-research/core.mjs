/** Pure normalization shared by the CLI and generated n8n artifact. */
export const VERSION = '1.0.0';
// Deliberately small HTTP parser: n8n Code sandboxes do not expose the URL global.
// Reject authority credentials, ports, whitespace and backslashes; caller validates exact paths.
function publicUrl(value) {
  const m = typeof value === 'string' && /^(https?):\/\/([A-Za-z0-9.-]+)(\/[^?#\s\\]*)?(\?[^#\s\\]*)?(#[^\s\\]*)?$/i.exec(value);
  if (!m) throw new Error('Invalid public URL.');
  const params = (m[4] || '').slice(1).split('&').filter(Boolean).map(p => p.split('='));
  return { protocol: m[1].toLowerCase() + ':', hostname: m[2].toLowerCase(), pathname: m[3] || '/', search: m[4] || '', hash: m[5] || '', searchParams: { get: key => {const matches=params.filter(p=>p[0]===key);return matches.length===1?matches[0][1]:null;} } };
}
export function parseProfile(value) {
  let u;
  try { u = publicUrl(value); } catch { throw new Error('Use a full public Instagram profile or YouTube channel URL.'); }
  if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password || u.port || u.search || u.hash) throw new Error('Profile URLs must not contain credentials, ports, queries, or fragments.');
  const path = u.pathname.replace(/\/+$/, '');
  if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(u.hostname) && /^\/(?:@[\p{L}\p{N}_.-]+|(?:channel|c|user)\/[A-Za-z0-9_.-]+)$/u.test(path)) {
    return { platform: 'youtube', url: `https://www.youtube.com${path}`, endpoint: '/youtube/videos' };
  }
  if (['instagram.com', 'www.instagram.com', 'm.instagram.com'].includes(u.hostname) && /^\/[A-Za-z0-9_.]{1,30}$/.test(path) && !['p', 'reel', 'reels', 'tv', 'explore', 'accounts', 'stories'].includes(path.slice(1).toLowerCase())) {
    return { platform: 'instagram', url: `https://www.instagram.com${path.toLowerCase()}/`, endpoint: '/instagram/channel-reels' };
  }
  throw new Error('Expected a YouTube channel URL or Instagram profile URL, not a post, video, or playlist.');
}
export function normalizeProfiles(values) {
  if (!Array.isArray(values) || values.length < 1 || values.length > 3) throw new Error('Configure one to three profiles.');
  const profiles = values.map(parseProfile);
  if (new Set(profiles.map(p => p.url)).size !== profiles.length) throw new Error('Profiles must be distinct.');
  return profiles;
}
export function listCredits(platform, limit) { return Math.max(1, Math.ceil(limit / (platform === 'instagram' ? 20 : 50))); }
export function metric(value) { return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null; }
function instant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return null;
  const t = Date.parse(value); return Number.isFinite(t) ? new Date(t).toISOString() : null;
}
function textValue(value) { return typeof value === 'string' && value.trim() ? value.trim() : null; }
export function normalizeItem(item, profile, fetchedAt) {
  if (!item || typeof item !== 'object') throw new Error('Invalid item object.');
  let u; try { u = publicUrl(item.url); } catch { throw new Error('Missing or invalid source URL.'); }
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.port) throw new Error('Unsafe source URL.');
  let id, sourceUrl, contentType;
  if (profile.platform === 'youtube') {
    if (!['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(u.hostname)) throw new Error('Wrong source host.');
    const urlId = u.hostname === 'youtu.be' ? u.pathname.slice(1) : u.pathname === '/watch' ? u.searchParams.get('v') : /^\/shorts\/([\w-]{11})\/?$/.exec(u.pathname)?.[1];
    id = item.videoId;
    if (!/^[\w-]{11}$/.test(id || '') || id !== urlId) throw new Error('Video ID does not match source URL.');
    contentType = u.pathname.startsWith('/shorts/') || item.contentType === 'short' ? 'short' : 'video';
    sourceUrl = `https://www.youtube.com/watch?v=${id}`;
  } else {
    if (!['instagram.com', 'www.instagram.com', 'm.instagram.com'].includes(u.hostname)) throw new Error('Wrong source host.');
    const urlId = /^\/(?:p|reel|reels)\/([\w-]+)\/?$/.exec(u.pathname)?.[1];
    id = item.shortcode;
    if (!/^[\w-]{1,64}$/.test(id || '') || id !== urlId) throw new Error('Reel shortcode does not match source URL.');
    if (item.type !== 'reel' && item.productType !== 'clips') throw new Error('Non-Reel item in Reels feed.');
    const author = item.author?.username;
    contentType = 'reel'; sourceUrl = `https://www.instagram.com/reel/${id}/`;
  }
  let publishedAt = instant(item.publishedAt);
  if (profile.platform === 'instagram' && typeof item.timestamp === 'number' && item.timestamp > 0 && item.timestamp < 8640000000000) publishedAt = new Date(item.timestamp * 1000).toISOString();
  return { id: `${profile.platform}:${id}`, platform: profile.platform, contentType, profileUrl: profile.url, sourceUrl,
    authorUsername: profile.platform === 'instagram' ? textValue(item.author?.username) : null,
    title: textValue(item.title), description: textValue(profile.platform === 'instagram' ? item.caption : item.description),
    publishedAt, fetchedAt, metrics: { views: metric(item.views), likes: metric(item.likes), comments: metric(item.comments) } };
}
export function normalizeResponse(body, profile, limit, fetchedAt) {
  if (body?.success !== true || !body.data) throw new Error('API did not return a successful data object.');
  const data = body.data;
  const identity = profile.platform === 'instagram' ? data.profileUrl : data.url;
  if (!identity && !(profile.platform === 'instagram' && typeof data.username === 'string' && data.username)) throw new Error('Response is missing a verifiable profile identity.');
  if (identity && parseProfile(identity).url !== profile.url) throw new Error('Response profile identity does not match request.');
  if (profile.platform === 'instagram' && data.username && data.username.toLowerCase() !== publicUrl(profile.url).pathname.split('/')[1]) throw new Error('Response username does not match request.');
  const source = profile.platform === 'youtube' ? data.results : data.items;
  if (!Array.isArray(source)) throw new Error('Response is missing the expected item array.');
  if (source.length > limit) throw new Error('API exceeded requested item limit; stop further requests.');
  const warnings = [], items = [], seen = new Set();
  for (const [index, raw] of source.entries()) {
    try { const item = normalizeItem(raw, profile, fetchedAt); if (!seen.has(item.id)) { items.push(item); seen.add(item.id); } else warnings.push(`Duplicate item ${index + 1} omitted.`); }
    catch (error) { warnings.push(`Item ${index + 1} rejected: ${error.message}`); }
  }
  if (source.length && !items.length) throw new Error(`All ${source.length} items failed identity/schema validation.`);
  for (const item of items) if (item.authorUsername && item.authorUsername.toLowerCase() !== publicUrl(profile.url).pathname.split('/')[1]) warnings.push(`${item.id} has primary author @${item.authorUsername}; feed membership does not prove original authorship (shared/collaborative posts may differ).`);
  if (data.hasMore) warnings.push('More items exist; continuation cursor was not followed.');
  if (items.some(i => i.publishedAt === null)) warnings.push('Some exact publication dates are unavailable; API order is retained.');
  return { ...profile, status: warnings.some(w => w.includes('rejected')) ? 'partial' : 'ok', items, warnings, error: null };
}
export function rankings(profiles) {
  const groups = new Map();
  for (const profile of profiles) for (const item of profile.items) {
    const key = `${item.platform}:${item.contentType}`;
    if (!groups.has(key)) groups.set(key, []);
    if (item.metrics.views !== null && !groups.get(key).some(i => i.id === item.id)) groups.get(key).push(item);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([group, items]) => ({ group, basis: 'known API-reported views within collected sample', top: items.sort((a,b) => b.metrics.views - a.metrics.views || a.id.localeCompare(b.id)).slice(0,3).map(i => ({ id: i.id, views: i.metrics.views, sourceUrl: i.sourceUrl })) }));
}
export function markdown(report) {
  const esc = value => String(value ?? 'unknown').replace(/[\\`*_{}\[\]<>|]/g, '\\$&').replace(/[\r\n]+/g, ' ');
  const num = value => value === null ? 'unknown' : String(value);
  const lines = ['# Competitor research', '', `Collected: ${report.startedAt} → ${report.completedAt}`, '', `Schema ${report.schemaVersion}. Up to ${report.limits.limit} items/profile; Instagram Reels only. Sample rankings are not cross-platform comparisons.`, '', `Requests: ${report.usage.requests}/${report.limits.maxRequests}. Modeled credit reservations: ${report.usage.reservedCredits}/${report.limits.maxCredits}. API-reported endpoint credits: ${report.usage.reportedCreditsUsed ?? 'unknown (one or more headers unavailable)'}. Billing debits are not independently verified (monitor/test calls may be waived). Per-request used and remaining-credit headers are recorded in JSON.`, '', 'Missing metrics stay unknown. API-reported zero is retained; upstream defaults can hide missing observations. No AI inference, transcripts, or per-video enrichment.'];
  for (const p of report.profiles) {
    lines.push('', `## ${esc(p.url)} — ${p.status}`, '');
    if (p.error) lines.push(`Failure: ${esc(p.error)}`, '');
    for (const warning of p.warnings) lines.push(`- ${esc(warning)}`);
    if (!p.items.length) { lines.push('', p.status === 'ok' ? 'No items returned.' : 'No usable items collected.'); continue; }
    lines.push('', '| Recent sample (API order) | Type | Published | Views | Likes | Comments |', '|---|---|---|---:|---:|---:|');
    for (const i of p.items) lines.push(`| [${esc((i.title || i.description || i.id).slice(0,160))}](${i.sourceUrl}) | ${i.contentType} | ${esc(i.publishedAt)} | ${num(i.metrics.views)} | ${num(i.metrics.likes)} | ${num(i.metrics.comments)} |`);
  }
  lines.push('', '## Sample top performers', '');
  for (const group of report.rankings) { lines.push(`### ${group.group}`, '', group.basis, ''); for (const i of group.top) lines.push(`- [${i.id}](${i.sourceUrl}): ${i.views} views`); if (!group.top.length) lines.push('No known view counts available.'); lines.push(''); }
  lines.push('## Request ledger', '', '| Profile | Attempt | HTTP | Outcome | Reserved credits | Charged header | Remaining header |', '|---|---:|---:|---|---:|---:|---:|');
  for (const a of report.usage.attempts) lines.push(`| ${esc(a.profileUrl)} | ${a.attempt} | ${a.status ?? 'unknown'} | ${a.outcome} | ${a.reservedCredits} | ${a.creditsUsed ?? 'unknown'} | ${a.creditsRemaining ?? 'unknown'} |`);
  return `${lines.join('\n')}\n`;
}

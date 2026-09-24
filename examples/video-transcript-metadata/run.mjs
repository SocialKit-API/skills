import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { apiOrigin, collect } from './core.mjs';

const { values } = parseArgs({ options: { live: { type: 'boolean', default: false }, url: { type: 'string' }, 'max-credits': { type: 'string', default: '5' } } });
try {
  const fixture = JSON.parse(await readFile(new URL('./fixture.json', import.meta.url), 'utf8'));
  if (!values.live && values.url) throw Error('--url requires --live; fixture mode uses synthetic input.');
  if (values.live && (!values.url || !process.env.SOCIALKIT_API_KEY)) throw Error('Live mode needs --url and SOCIALKIT_API_KEY in the environment.');
  const base = apiOrigin(process.env.SOCIALKIT_API_BASE_URL || 'https://api.socialkit.dev');
  const request = values.live ? async (path, params) => {
    const response = await fetch(base + path, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(60_000), headers: { 'Content-Type': 'application/json', 'x-access-key': process.env.SOCIALKIT_API_KEY }, body: JSON.stringify(params) });
    return { status: response.status, body: await response.json(), credits: response.headers.get('x-credits-used') };
  } : async path => fixture.responses[path.split('/').at(-1)];
  const report = await collect(values.url || fixture.url, { request, maxCredits: Number(values['max-credits']) });
  console.log(JSON.stringify({ mode: values.live ? 'live' : 'synthetic_fixture', collectedAt: values.live ? new Date().toISOString() : null, ...report }, null, 2));
  if (report.transcript.status !== 'available') process.exitCode = 2;
} catch (error) { console.error(error.message); process.exitCode = 1; }

#!/usr/bin/env node
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { collect } from './collect.mjs';
import { markdown } from './core.mjs';
try {
  const args = process.argv.slice(2);
  if (args.includes('--help')) { console.log('node --env-file=.env run.mjs [profiles.json] [output-directory]\nDefaults: profiles.example.json and output/'); process.exit(0); }
  if (args.length > 2) throw new Error('Expected optional profiles JSON path and output directory. Use --help.');
  let configText;
  try { configText = await readFile(resolve(args[0] || 'profiles.example.json'), 'utf8'); } catch { throw new Error('Could not read the input configuration file. Check its path and permissions.'); }
  let config;
  try { config = JSON.parse(configText); } catch { throw new Error('Input configuration is not valid JSON. Check quotes, commas, and brackets.'); }
  const report = await collect({ urls: config.profiles, limits: config.limits, key: process.env.SOCIALKIT_API_KEY, baseUrl: process.env.SOCIALKIT_API_BASE_URL });
  const out = resolve(args[1] || 'output'); await mkdir(out, { recursive: true });
  await writeFile(resolve(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  await writeFile(resolve(out, 'report.md'), markdown(report), { mode: 0o600 });
  console.log(`Saved ${out}/report.json and report.md; ${report.usage.requests} requests, ${report.usage.reservedCredits} modeled reserved credits.`);
  process.exitCode = report.profiles.some(p => p.status !== 'ok') ? 2 : 0;
} catch (error) { console.error(`Setup/output error: ${String(error.message).replaceAll(process.env.SOCIALKIT_API_KEY || '\u0000', '[REDACTED]')}`); process.exitCode = 1; }

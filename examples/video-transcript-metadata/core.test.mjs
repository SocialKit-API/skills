import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { promisify } from 'node:util';
import test from 'node:test';
import { apiOrigin, collect, source } from './core.mjs';

const fixture = JSON.parse(await readFile(new URL('./fixture.json', import.meta.url), 'utf8'));
const responses = () => structuredClone(fixture.responses);
const scenarios = [
  { name: 'known zero and unknown metrics are distinct', url: fixture.url, responses: responses(), expected: 'available', calls: 2 },
  { name: 'TikTok absent captions remain an explicit outcome', url: 'https://www.tiktok.com/@creator/video/12345', responses: { ...responses(), transcript: { status: 404, body: { success: false, errorCode: 'no_transcript', retryable: false } } }, expected: 'no_transcript', calls: 2 },
  { name: 'upstream failures do not become empty transcripts', url: fixture.url, responses: { ...responses(), transcript: { status: 503, body: { success: false, errorCode: 'operation_failed', retryable: true } } }, expected: 'failed', calls: 2 },
  { name: 'empty payloads do not claim successful transcription', url: fixture.url, responses: { ...responses(), transcript: { status: 200, body: { success: true, data: {} } } }, expected: 'empty', calls: 2 },
  { name: 'a one-credit cap stops after metadata', url: fixture.url, maxCredits: 1, responses: responses(), expected: 'budget_exceeded', calls: 1 },
  { name: 'unknown Instagram duration prevents unbounded transcription', url: 'https://www.instagram.com/reel/DEMO/', responses: { ...responses(), stats: { status: 200, body: { success: true, data: { duration: null, views: null } } } }, expected: 'unknown_duration', calls: 1 },
  { name: 'Instagram reserves by started minute', url: 'https://www.instagram.com/reel/DEMO/', maxCredits: 4, responses: responses(), expected: 'budget_exceeded', calls: 1 },
  { name: 'Instagram fits a five-credit reservation', url: 'https://www.instagram.com/reel/DEMO/', responses: responses(), expected: 'available', calls: 2 },
  { name: 'authentication failure stops the second call', url: fixture.url, responses: { ...responses(), stats: { status: 403, body: { success: false } } }, expected: 'metadata_failed', calls: 1 },
  { name: 'malformed data is a failure', url: fixture.url, responses: { ...responses(), stats: { status: 200, body: { success: true, data: [] } } }, expected: 'metadata_failed', calls: 1 },
];

for (const scenario of scenarios) test(scenario.name, async () => {
  let calls = 0;
  const report = await collect(scenario.url, { maxCredits: scenario.maxCredits ?? 5, request: async (path, params) => {
    calls++; assert.deepEqual(params, { url: scenario.url }); return scenario.responses[path.split('/').at(-1)];
  } });
  assert.equal(report.transcript.status, scenario.expected);
  assert.equal(calls, scenario.calls);
  if (scenario.name.startsWith('known')) { assert.equal(report.metadata.views, null); assert.equal(report.metadata.likes, 0); assert.equal(report.usage.reportedCredits, 2); }
  const python = spawnSync('python3', ['-c', 'import json,sys; from run import collect; s=json.load(sys.stdin); print(json.dumps(collect(s["url"],lambda p,_:s["responses"][p.rsplit("/",1)[-1]],s.get("maxCredits",5))))'], { cwd: import.meta.dirname, input: JSON.stringify(scenario), encoding: 'utf8' });
  assert.equal(python.status, 0, python.stderr);
  assert.deepEqual(JSON.parse(python.stdout), report, 'Python and JavaScript must preserve the same outcomes');
});

test('public video URL and API origin validation reject unrelated hosts and credential leaks', () => {
  for (const url of ['https://www.youtube.com.evil.test/watch?v=DEMO1234567', 'http://www.youtube.com/watch?v=DEMO1234567', 'https://user:secret@youtube.com/watch?v=DEMO1234567', 'https://youtube.com/@creator', 'https://instagram.com/privateprofile', 'https://tiktok.com/@creator', 'https://localhost/video.mp4']) assert.throws(() => source(url));
  for (const url of ['http://api.socialkit.dev', 'https://key@api.socialkit.dev', 'https://api.socialkit.dev/path', 'https://api.socialkit.dev?key=secret']) assert.throws(() => apiOrigin(url));
  assert.equal(apiOrigin('https://api.socialkit.dev'), 'https://api.socialkit.dev');
  assert.equal(apiOrigin('http://127.0.0.1:3000'), 'http://127.0.0.1:3000');
});

test('transport failure is not retried and secrets cannot enter the report via errors', async () => {
  let calls = 0;
  const report = await collect(fixture.url, { request: async () => { calls++; throw Error('secret-key-in-error'); } });
  assert.equal(calls, 1); assert.equal(report.transcript.status, 'metadata_failed');
  assert.equal(JSON.stringify(report).includes('secret-key'), false);
  assert.equal(report.usage.reportedCredits, null);
});

test('both CLIs default to equivalent synthetic output without credentials', () => {
  const js = spawnSync(process.execPath, ['run.mjs'], { cwd: import.meta.dirname, encoding: 'utf8', env: { ...process.env, SOCIALKIT_API_KEY: '' } });
  const py = spawnSync('python3', ['run.py'], { cwd: import.meta.dirname, encoding: 'utf8', env: { ...process.env, SOCIALKIT_API_KEY: '' } });
  assert.equal(js.status, 0, js.stderr); assert.equal(py.status, 0, py.stderr);
  assert.deepEqual(JSON.parse(js.stdout), JSON.parse(py.stdout));
  assert.equal(JSON.parse(js.stdout).mode, 'synthetic_fixture');
});

test('both live CLIs send the expected authenticated requests and refuse redirects', async () => {
  const calls = [];
  let redirect = false;
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    calls.push(request.url);
    assert.equal(request.method, 'POST');
    assert.equal(request.headers['x-access-key'], 'fixture-secret');
    assert.deepEqual(JSON.parse(body), { url: fixture.url });
    if (redirect) { response.writeHead(302, { location: '/must-not-follow' }); response.end('{}'); return; }
    const reply = fixture.responses[request.url.split('/').at(-1)];
    response.writeHead(reply.status, { 'Content-Type': 'application/json', 'X-Credits-Used': reply.credits });
    response.end(JSON.stringify(reply.body));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const env = { ...process.env, SOCIALKIT_API_KEY: 'fixture-secret', SOCIALKIT_API_BASE_URL: `http://127.0.0.1:${server.address().port}` };
  try {
    for (const [command, file] of [[process.execPath, 'run.mjs'], ['python3', 'run.py']]) {
      const options = { cwd: import.meta.dirname, env, timeout: 10_000 };
      const args = [file, '--live', '--url', fixture.url];
      const before = calls.length;
      const { stdout } = await promisify(execFile)(command, args, options);
      assert.equal(JSON.parse(stdout).transcript.status, 'available');
      assert.deepEqual(calls.slice(before), ['/youtube/stats', '/youtube/transcript']);
      assert.ok(!stdout.includes('fixture-secret'));
      redirect = true;
      await assert.rejects(promisify(execFile)(command, args, options), error => {
        assert.equal(error.code, 2);
        assert.equal(JSON.parse(error.stdout).transcript.status, 'metadata_failed');
        return true;
      });
      assert.equal(calls.length, before + 3, 'Redirect must not send the key to a second URL');
      redirect = false;
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
});

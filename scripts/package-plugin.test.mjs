import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { packagePlugin } from './package-plugin.mjs';

test('portable packages include all skills and optional authenticated MCP without credentials', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'socialkit-plugin-'));
  try {
    const output = join(dir, 'package');
    const manifest = await packagePlugin(output, 'https://mcp.example/oauth/mcp');
    assert.equal(manifest.name, 'socialkit-skills');
    assert.equal((await readdir(join(output, 'skills'))).length, 8);
    const mcp = JSON.parse(await readFile(join(output, 'mcp.json'), 'utf8'));
    assert.deepEqual(mcp.mcpServers.socialkit, { type: 'streamable-http', url: 'https://mcp.example/oauth/mcp' });
    await assert.rejects(packagePlugin(output), /EEXIST/);
    await packagePlugin(join(dir, 'skills-only'));
    await assert.rejects(readFile(join(dir, 'skills-only/mcp.json')), /ENOENT/);
    for (const url of ['http://host/oauth/mcp', 'https://user:secret@host/oauth/mcp', 'https://host/oauth/mcp?key=secret', 'https://host/mcp']) await assert.rejects(packagePlugin(join(dir, 'invalid'), url));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

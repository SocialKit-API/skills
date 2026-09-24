import assert from 'node:assert/strict';
import { readFile, readdir, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import test from 'node:test';
import { parseDocument } from 'yaml';

const root = resolve(import.meta.dirname, '..');
const json = async path => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const routes = (await json('contracts/api-operations.json')).operations;
const tools = new Set((await json('contracts/mcp-tools.json')).groups.flatMap(group => group.tools));
const folders = (await readdir(resolve(root, 'skills'), { withFileTypes: true })).filter(item => item.isDirectory()).map(item => item.name);
const frontmatter = text => {
  const header = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  assert.ok(header, 'Missing YAML frontmatter');
  const doc = parseDocument(header[1], { uniqueKeys: true });
  assert.deepEqual(doc.errors, [], 'Invalid YAML');
  const data = doc.toJSON();
  assert.match(data.name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  assert.ok(typeof data.description === 'string' && data.description.length > 30);
  return data;
};
const knownRoute = path => routes.some(route => new RegExp('^' + route.path.split('/').map(part => part.startsWith('{') ? '[^/]+' : part).join('/') + '$').test(path));

for (const name of folders) test(`${name}: valid discovery metadata, links, and registered operations`, async () => {
  const path = resolve(root, 'skills', name, 'SKILL.md');
  const content = await readFile(path, 'utf8');
  assert.equal(frontmatter(content).name, name);
  const ui = parseDocument(await readFile(resolve(dirname(path), 'agents/openai.yaml'), 'utf8'));
  assert.deepEqual(ui.errors, []);
  const metadata = ui.toJSON();
  assert.ok(metadata.interface.short_description.length >= 25 && metadata.interface.short_description.length <= 64);
  for (const [, target] of content.matchAll(/\]\(([^)]+)\)/g)) {
    if (!target.startsWith('https:') && !target.startsWith('#')) await access(resolve(dirname(path), target.split('#')[0]));
  }
  for (const [, route] of content.matchAll(/`(\/(?:youtube|tiktok|instagram|facebook|twitter|linkedin|reddit|video|v2|test|credits|status)(?:\/[^` ]*)?)`/g)) assert.ok(knownRoute(route), `Unregistered route ${route}`);
  for (const [, tool] of content.matchAll(/`((?:youtube|tiktok|instagram|facebook|twitter|linkedin|video|download)_[a-z_]+)`/g)) assert.ok(tools.has(tool), `Unknown MCP tool ${tool}`);
});

test('invalid frontmatter and stale endpoint references fail validation', () => {
  assert.throws(() => frontmatter('---\nname: [unfinished\n---\nBody'));
  assert.throws(() => frontmatter('---\nname: first\nname: duplicate\ndescription: A sufficiently descriptive skill entry.\n---\nBody'));
  assert.equal(knownRoute('/tiktok/channel-video-metrics'), false);
  assert.equal(knownRoute('/instagram/comments/bulk'), false);
  assert.equal(knownRoute('/v2/facebook/download'), true);
});

test('Claude plugin packages every skill once and marketplace resolves the package root', async () => {
  const plugin = await json('.claude-plugin/plugin.json');
  const marketplace = await json('.claude-plugin/marketplace.json');
  assert.equal(plugin.name, 'socialkit-skills');
  assert.match(plugin.version, /^\d+\.\d+\.\d+$/);
  assert.deepEqual(plugin.skills.slice().sort(), folders.map(name => './skills/' + name).sort());
  assert.equal(new Set(plugin.skills).size, folders.length);
  assert.equal(marketplace.name, 'socialkit');
  assert.equal(marketplace.plugins.length, 1);
  assert.equal(marketplace.plugins[0].source, './');
  assert.equal(marketplace.plugins[0].name, plugin.name);
  assert.equal(marketplace.plugins[0].version, plugin.version);
  for (const path of plugin.skills) await access(resolve(root, path, 'SKILL.md'));
});

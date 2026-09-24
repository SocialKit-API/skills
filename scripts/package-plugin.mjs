import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function packagePlugin(output, mcpUrl) {
  const root = resolve(import.meta.dirname, '..');
  if (mcpUrl) {
    const url = new URL(mcpUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/oauth/mcp') throw Error('Use an explicit HTTPS OAuth MCP URL without credentials or query parameters');
  }
  // Refuse to overwrite an earlier package or the source checkout.
  await mkdir(output);
  for (const file of ['plugin.json', 'skills', 'examples', 'contracts', 'docs', 'README.md', 'LICENSE']) await cp(resolve(root, file), resolve(output, file), { recursive: true });
  if (mcpUrl) await writeFile(resolve(output, 'mcp.json'), JSON.stringify({ $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json', mcpServers: { socialkit: { type: 'streamable-http', url: mcpUrl } } }, null, 2) + '\n');
  return JSON.parse(await readFile(resolve(output, 'plugin.json'), 'utf8'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (![0, 2].includes(args.length) || (args.length && args[0] !== '--mcp-url')) throw Error('Usage: npm run package:plugin -- [--mcp-url https://host/oauth/mcp]');
  const parent = resolve(import.meta.dirname, '../dist');
  await mkdir(parent, { recursive: true });
  const output = resolve(parent, 'socialkit-plugin');
  const manifest = await packagePlugin(output, args[1]);
  console.log(`Packaged ${manifest.name} ${manifest.version} at ${output}. Local packaging does not publish the plugin.`);
}

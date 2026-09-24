# OpenAI / Codex package

The root `plugin.json` uses the portable Agent Plugins 1.0 schema and discovers the same eight `skills/` directories as the Claude package. OpenAI presentation metadata is in `extensions.com.openai`. The repository marketplace is `.agents/plugins/marketplace.json`. Standalone `npx skills` installation remains supported.

## Validate locally

```bash
npm ci
npm test
codex plugin marketplace add /absolute/path/to/skills
codex plugin add socialkit-skills@socialkit
```

Run installation checks in a fresh, isolated Codex configuration. These commands register a repository package; they do not submit it to a public directory or verify organic discovery. Choose one installation path to avoid duplicate skills. Set `SOCIALKIT_API_KEY` in the agent's execution environment for REST calls.

## Optional OAuth MCP package

The default package contains skills only. To connect Codex or Claude Code to production MCP through browser login, follow the [registered-client setup](https://docs.socialkit.dev/mcp#connect-with-oauth). That setup selects a project without copying its API key. Skills that call REST directly still require `SOCIALKIT_API_KEY`.

For an integration that supplies its own registered OAuth client configuration, prepare a combined skills/MCP package:

```bash
npm run package:plugin -- --mcp-url https://mcp.socialkit.dev/oauth/mcp
```

This produces `dist/socialkit-plugin/` with `plugin.json`, all skills and supporting examples, and a portable `mcp.json` using Streamable HTTP. The command refuses to overwrite an existing package. Archive or remove that generated directory before rebuilding. No credentials are bundled. Use a separately registered OAuth client with an exact callback URI and S256 PKCE; the MCP service redirects to SocialKit login, asks for a project, and records explicit consent. Reviewers must have an approved project role and available credits for data calls.

The generated `mcp.json` contains the transport and URL only; it does not configure a client's OAuth ID or callback. For the native CLIs, use the documented server configuration above. Marketplace publication still requires registering the actual client/callback supplied by the submission interface, completing review metadata, and submitting. Do not submit a package pointing at development. The configured integration supports explicit public PKCE or confidential clients; it does not advertise dynamic registration or CIMD. Confirm the chosen submission path accepts that registration mode before publishing.

## Acceptance evidence

- CLI/IDE installation: inspect the installed package in a fresh project/configuration, restart the host, and verify the eight skills appear.
- Free key check: `/test`, with the key inherited from the process environment and never printed.
- OAuth: verify protected-resource and issuer metadata, consent, S256 code exchange, audience, expiry, refresh rotation, changed membership and revocation. Test tool execution separately from tool discovery.
- Run unbranded selection/completion prompts through the private evaluation suite; do not infer discovery improvement from an installation test. Paid model runs and marketplace submissions are separate tasks.

Specification reviewed 2026-09-24: [package format](https://developers.openai.com/plugins/build/plugins), [OAuth requirements](https://developers.openai.com/plugins/build/auth), [submission](https://developers.openai.com/plugins/deploy/submission). Requirements may change; recheck before external submission.

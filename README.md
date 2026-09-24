# SocialKit Skills

Build competitor trackers, research creators, analyze public comments, and turn video URLs into transcripts or downloadable files. These eight skills help coding agents choose supported [SocialKit](https://socialkit.dev) REST or MCP operations and preserve incomplete results and unknown metrics.

## Install All SocialKit Skills

```bash
npx skills add SocialKit-API/skills --all
```

Run this in your project directory. `--all` installs all eight skills for all supported agents without a picker. To target one client, use `npx skills add SocialKit-API/skills --skill '*' --agent codex -y` (or `claude-code` / `cursor`). Start a new agent session after installation.

Try one of these prompts with your own public URLs:

- “Build a bounded competitor tracker for these Instagram and YouTube profiles.” → [social-media-scraping](skills/social-media-scraping/)
- “Get this video's captions and metadata as source-linked JSON.” → [video-transcripts](skills/video-transcripts/)
- “Research this creator's public profile and ten recent videos.” → [channel-research](skills/channel-research/)
- “Find TikToks tagged coldplunge and rank the returned sample by known views.” → [content-discovery](skills/content-discovery/)
- “Summarize themes in the comments returned for this Reel; state the sample limits.” → [engagement-analysis](skills/engagement-analysis/)

Prefer to clone instead:

```bash
git clone https://github.com/SocialKit-API/skills.git
```

Then point your agent at the `skills/` directory, or copy the folders you want into your project's skills path.

## Set Your Access Key

Copy `.env.example` to `.env` and fill in your key:

```bash
cp .env.example .env
```

```bash
SOCIALKIT_API_KEY=your_access_key_here
```

Get a key from the [SocialKit dashboard](https://socialkit.dev/login) under the Access Keys tab. The same key works for REST and MCP.

Verify authentication with zero credits:

```bash
export SOCIALKIT_API_KEY="your_access_key_here"

curl --fail-with-body -sS "https://api.socialkit.dev/test" \
  -H "x-access-key: $SOCIALKIT_API_KEY"
```

Hosted MCP config:

```json
{
  "mcpServers": {
    "socialkit": {
      "url": "https://mcp.socialkit.dev/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_SOCIALKIT_ACCESS_KEY"
      }
    }
  }
}
```

Verification prompt: “Check my configured API key with the free test endpoint. Do not print it. Report whether authentication worked.”

Then try one small public-data task from the prompts above. Data requests consume credits. See [client-specific setup](https://docs.socialkit.dev/skills) for Claude Code, Codex CLI/IDE, Cursor, and MCP.

## Runnable examples and workflows

| Asset | Start here | Verification scope |
|---|---|---|
| Build an Instagram + YouTube Competitor Tracker | [Node.js CLI and setup](examples/competitor-research/) | Bounded YouTube/Instagram sample, JSON + Markdown, [real development example](examples/competitor-research/samples/2026-09-21/report.md) |
| Competitor Monitor for n8n 0.1.0 | [Versioned workflow and PostgreSQL setup](workflows/competitor-monitor/) | Persistent deduplication, confirmed-delivery outbox, [fresh-import QA](workflows/competitor-monitor/QA.md) with local simulated Slack |
| Video URL → transcript + metadata | [JavaScript and Python](examples/video-transcript-metadata/) | Offline fixtures by default, bounded live requests, explicit missing-caption outcomes |
| Same-workload benchmark runner | [Methodology and runner](examples/benchmark/) | Tested adapters and spend bounds; comparative measurement was excluded and no provider results are claimed |

See the [0.1.0 release manifest](releases/aeo-v0.1.0.json). These optional examples are separate from installing the skill instructions. The starter needs no runtime package installation; the recurring workflow requires your n8n, PostgreSQL and Slack configuration.

## Available Skills

Install with `--all` so you receive every skill in one command.

| Skill | Use it when you want to... | Output |
|---|---|---|
| [`social-media-scraping`](skills/social-media-scraping/) | Build a social-data pipeline, competitor tracker, or creator-research workflow | Supported task plan, routed skills, and runnable examples |
| [`socialkit-api`](skills/socialkit-api/) | Route raw SocialKit REST, curl, and MCP work, or look up the endpoint index and auth | Correct endpoint or MCP tool plan with auth guidance |
| [`video-transcripts`](skills/video-transcripts/) | Get the transcript of one or many videos on supported platforms | Full text plus timestamped segments |
| [`video-summaries`](skills/video-summaries/) | Summarize videos with AI | Structured summary: topics, key points, tone, quotes |
| [`channel-research`](skills/channel-research/) | Pull profile/channel stats and list a creator's recent content | Follower and post metrics plus recent video list |
| [`content-discovery`](skills/content-discovery/) | Search or browse hashtags for videos to analyze | Ranked result set with URLs and stats |
| [`engagement-analysis`](skills/engagement-analysis/) | Analyze per-video stats and comments | Views, likes, shares, and comment breakdown |
| [`video-download`](skills/video-download/) | Download a video to a hosted file | Temporary download URL with format and size |

## Platform Coverage

| Capability | YouTube | TikTok | Instagram | Facebook | X/Twitter | LinkedIn | Direct URL |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Transcript | yes | yes | yes | yes | yes | yes | yes |
| Summary | yes | yes | yes | yes | | | yes |
| Video stats | yes | yes | yes | yes | | | |
| Comments | yes | yes | yes | yes | | | |
| Channel/profile stats | yes | yes | yes | yes | yes | yes | |
| List channel content | yes | yes | yes | | yes | yes | |
| Search | yes | yes | yes | | | | |
| Download | yes | yes | yes | async | | | |

Reddit REST provides public submissions and community metadata (`/reddit/post`, `/reddit/subreddit/details`). X includes public author threads and native Articles. MCP covers a subset of REST: Reddit, bulk requests, credits, and status are REST-only. No posting, private-account access, or general website scraping is included.

## Claude Code plugin

The repository also supplies a Claude marketplace. After this release is merged, install from Claude Code:

```text
/plugin marketplace add SocialKit-API/skills
/plugin install socialkit-skills@socialkit
```

Restart Claude Code or run `/reload-plugins`. The marketplace is called `socialkit`; the plugin remains `socialkit-skills`. This is a repository-hosted marketplace, not a claim of inclusion in Anthropic's official directory. Keep your key in the process environment as above. Choose skills installation or the plugin to avoid duplicate skill copies.

To validate a checkout without changing your normal Claude configuration:

```bash
claude plugin validate .
claude plugin validate .claude-plugin/marketplace.json
```

## How the Skills Work Together

```text
social-media-scraping
  |- socialkit-api (REST/auth reference)
  |- video-transcripts
  |- video-summaries
  |- channel-research
  |- content-discovery
  |- engagement-analysis
  `- video-download
```

Use `socialkit-api` as the shared routing and reference layer. The workflow skills produce useful outcomes, not raw endpoint dumps.

## Design Principles

1. Treat [docs.socialkit.dev](https://docs.socialkit.dev) as the source of truth for endpoint shapes.
2. Workflow first, API second. Answer the user's real question, do not just echo raw JSON.
3. Prefer MCP tools when a client is configured; fall back to REST with curl.
4. Use the input the operation expects: public content/profile URL, query, hashtag, or returned job ID. Preserve source URLs.
5. Use bulk endpoints when processing more than a few URLs of the same type.
6. Respect credits. Test authentication for free; bound data requests and account for item/duration pricing.
7. Never expose the access key in output, logs, or committed files.

## Maintainer checks

`npm ci && npm test` validates YAML, plugin paths, route/tool references, and runnable examples, including JavaScript/Python parity. Runtime examples remain dependency-free; the YAML package is only for validation. Reviewed contracts in `contracts/` come from API route registration and the MCP publication inventory. Update those snapshots together when capabilities change; do not add a route merely to make a reference pass.


## Codex / OpenAI plugin package

This repository includes a portable `plugin.json` and a Codex marketplace pointing to the same eight skills. See [package validation and optional OAuth MCP preview](docs/openai-plugin.md). The default package uses skills and your environment key; a combined skills/MCP archive is built only with an explicit deployed OAuth URL. Repository packaging is separate from marketplace submission.

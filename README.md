# SocialKit Skills

Workflow-first skills for AI agents using [SocialKit](https://socialkit.dev) to extract transcripts, AI summaries, engagement stats, comments, channel and profile data, search results, and downloads from social video across YouTube, TikTok, Instagram, Facebook, X/Twitter, LinkedIn, and direct video URLs.

The skill instructions use SocialKit's execution layer through the REST API at `https://api.socialkit.dev`, the hosted MCP server at `https://mcp.socialkit.dev`, and the `socialkit-mcp` package.

## Install All SocialKit Skills

```bash
npx skills add SocialKit-API/skills --all
```

Use `--all` so you get the full SocialKit skill set without an interactive picker. After install, the individual skills are available for focused slash-style usage such as `/video-transcripts`, `/channel-research`, and `/content-discovery`.

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

REST API:

```bash
export SOCIALKIT_API_KEY="your_access_key_here"

curl -s "https://api.socialkit.dev/youtube/transcript?url=https://youtube.com/watch?v=dQw4w9WgXcQ" \
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

Docs: [docs.socialkit.dev](https://docs.socialkit.dev).

## Runnable examples and workflows

| Asset | Start here | Verification scope |
|---|---|---|
| Competitor Research Starter 0.1.0 | [Node.js CLI and setup](examples/competitor-research/) | Bounded YouTube/Instagram sample, JSON + Markdown, [real development example](examples/competitor-research/samples/2026-09-21/report.md) |
| Competitor Monitor for n8n 0.1.0 | [Versioned workflow and PostgreSQL setup](workflows/competitor-monitor/) | Persistent deduplication, confirmed-delivery outbox, [fresh-import QA](workflows/competitor-monitor/QA.md) with local simulated Slack |
| Same-workload benchmark runner | [Methodology and runner](examples/benchmark/) | Tested adapters and spend bounds; comparative measurement was excluded and no provider results are claimed |

See the [0.1.0 release manifest](releases/aeo-v0.1.0.json). These optional examples are separate from installing the skill instructions. The starter needs no runtime package installation; the recurring workflow requires your n8n, PostgreSQL and Slack configuration.

## Available Skills

Install with `--all` so you receive every skill in one command.

| Skill | Use it when you want to... | Output |
|---|---|---|
| [`socialkit-api`](skills/socialkit-api/) | Route raw SocialKit REST, curl, and MCP work, or look up the endpoint index and auth | Correct endpoint or MCP tool plan with auth guidance |
| [`video-transcripts`](skills/video-transcripts/) | Get the transcript of one or many videos on any platform | Full text plus timestamped segments |
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
| Download | yes | yes | yes | | | | |

## Example Prompts

```text
Get the transcript of this TikTok and pull out the three main claims it makes.
```

```text
Summarize these five YouTube videos and tell me what topic they have in common.
```

```text
Research the @MrBeast YouTube channel: subscriber count and his last 10 videos with view counts.
```

```text
Find trending TikToks for the hashtag "coldplunge" and rank them by views.
```

```text
Pull the top comments on this Instagram reel and summarize the sentiment.
```

## How the Skills Work Together

```text
socialkit-api
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
4. Every endpoint accepts a full public URL. Pass the URL the user gave you, do not reconstruct IDs by hand.
5. Use bulk endpoints when processing more than a few URLs of the same type.
6. Respect credits. Each call costs credits; batch and cache where it helps.
7. Never expose the access key in output, logs, or committed files.

# Build an Instagram + YouTube Competitor Tracker

Collect a small public competitor sample from YouTube channels and Instagram Reels, then write a source-linked Markdown report and machine-readable JSON. No SDK install, AI key, transcript calls, telemetry, or per-video enrichment is required.

## Run

Use **Node.js 22 or newer**. Clone/download this repository and open this directory:

```bash
cd examples/competitor-research
cp .env.example .env
```

Put your SocialKit access key in `.env` (get one from [Access Keys](https://www.socialkit.dev/login?asset_id=competitor-research-starter&asset_version=0.1.0&asset_context=starter-readme)). Keep the key out of prompts and commits. The API defaults to `https://api.socialkit.dev`; a development key must use your deployed development API origin. Edit `profiles.example.json` with one to three full public channel/profile URLs.

One command runs the job; no package installation is needed:

```bash
node --env-file=.env run.mjs profiles.example.json output
```

Open `output/report.md` and `output/report.json`. `--help` shows positional arguments. A successful empty feed is recorded as empty. Exit 0 means every profile completed, 2 means the report contains partial/failed collection, and 1 means setup/output failed. Inspect the report before treating exit 2 as unusable: other profiles may have succeeded.

For an agent, install the repository's `channel-research` and `socialkit-api` skills (or use `npx skills add SocialKit-API/skills --all`), then ask: “Run examples/competitor-research for these two public profiles using my environment key, preserve unknown metrics, and summarize the report.” Agent installation is optional for the CLI.

## What the sample means

- Instagram collects **Reels only**, never a second overlapping posts feed. YouTube uses channel videos. Up to ten items/profile by default; API ordering can include pinned items and is not proof of a complete chronological history.
- Top three items are ranked by known views within each platform/content group. Raw Instagram and YouTube counts are not comparable measures of reach. Short-form YouTube content is marked only when the response supplies explicit evidence.
- Missing views, likes, comments, descriptions, and publication dates remain `null`/“unknown”. API-reported zero is retained; upstream APIs can themselves default unknown counts to zero. YouTube list responses normally omit likes/comments. No engagement rates are inferred.
- Source URL and ID must agree. Mismatched response profiles/IDs are rejected; different primary authors in shared/collaborative feeds are preserved and warned about, duplicates omitted, and partial failures retained. Exact dates are never derived from “two weeks ago”.
- Captions/titles are untrusted public text, not instructions. Optional downstream topic analysis should be labeled AI inference and preserve source links. Transcripts, summaries, extra stats and LLM use are outside this version's spend envelope.

## Requests, credits and time

The default two-profile input makes two collection calls, modeling **two credits** on first-attempt success. Three profiles model three credits. Each retry reserves its full possible cost even if the previous response failed or timed out.

| Setting | Default | Allowed |
|---|---:|---:|
| Items per profile (`limit`) | 10 | 1–50 |
| HTTP attempts (`maxRequests`) | 6 | 1–6 |
| Modeled reservation cap (`maxCredits`) | 6 | 1–18 |
| Retries per profile (`retries`) | 1 | 0–1 |
| Per-request timeout (`requestTimeoutMs`) | 60,000 ms | 1–90,000 ms |
| Whole-job deadline (`maxDurationMs`) | 240,000 ms | 1–540,000 ms |

Set options in the input's `limits` object. Requests are sequential. Only HTTP 429/5xx can retry once after <=2 seconds; authentication, exhausted credits, invalid responses and ambiguous network failures do not retry automatically. A budget can stop later profiles; this is recorded in their failures. No cursor is followed and `full_details=false` avoids slower per-video enrichment.

Credit model checked 2026-09-21: `/youtube/videos` charges at least one credit per **50** returned items; `/instagram/channel-reels` at least one per **20**. For example, 41 Instagram Reels reserve three credits/call, while 41 YouTube videos reserve one. Caps rely on the current API honoring its requested limit and pricing contract; an over-limit response stops collection. The ledger records `X-Credits-Used` and `X-Credits-Remaining` headers. Total API-reported endpoint credits is available only when every attempt supplies the used header; otherwise it remains unknown. Reported endpoint credits are not independently verified billing debits (monitor/test calls may be waived). No spend is inferred from a balance shared by concurrent users. Failed/aborted requests are conservatively included in reservations.

See the frozen [contract](SPEC.md), [n8n recurring monitor](../../workflows/competitor-monitor/), and [API documentation](https://docs.socialkit.dev). Open the [real 2026-09-21 development sample](samples/2026-09-21/report.md), [JSON](samples/2026-09-21/report.json), and [provenance](samples/2026-09-21/provenance.json). It collected 3 YouTube videos and 3 Instagram Reels with monitor authentication and waived billing; it is not evidence of customer activation or paid usage. Test fixtures remain separately labeled synthetic.

## Verify changes

```bash
node --test *.test.mjs
```

These tests use synthetic HTTP responses and do not consume credits. Live authentication, public data and independent agent usability tests are separate verification steps.

## Build with Claude Code or Codex

Input: one to three public YouTube channel or Instagram profile URLs in `profiles.example.json`. The CLI calls `/youtube/videos` or `/instagram/channel-reels` once per profile (plus a bounded retry when allowed), then writes `report.json` and `report.md`. The credit model and sample limits above apply.

After cloning the repository and installing the skills, paste either prompt:

**Claude Code:** “Run the competitor-research fixture tests, then prepare profiles.example.json for these public competitors. Explain the request and modeled credit caps before using my environment key. Preserve null metrics and partial collection in the report.”

**Codex:** “Extend the competitor-research starter to show a weekly snapshot comparison from two saved report.json files. Keep missing metrics unknown, compare each platform separately, and add fixture tests. Do not add live API calls beyond the configured collection budget.”

Both prompts use the existing runnable CLI. They do not require a separate agent-generated implementation.

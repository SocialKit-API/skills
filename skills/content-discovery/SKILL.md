---
name: content-discovery
description: Discover videos through SocialKit search and hashtag lookup across YouTube, TikTok, and Instagram. Use when the user wants to find videos by keyword or hashtag, research a topic or trend, surface top or trending content, or build a set of videos to analyze. Returns ranked results with URLs and stats. Not for posting, private accounts, or unrelated website scraping.
---

# Content Discovery

## Overview

Find videos to work with. Search by keyword or browse a hashtag, then feed the results into transcripts, summaries, or engagement analysis. Use `socialkit-api` for auth and endpoint details.

## Endpoints

| Source | Endpoint / MCP tool | Params |
|---|---|---|
| YouTube search | `/youtube/search` / `youtube_search` | `query`, `limit` |
| TikTok search | `/tiktok/search` / `tiktok_search` | `query`, `limit` |
| TikTok hashtag | `/tiktok/hashtag-search` / `tiktok_hashtag_search` | `hashtag`, `limit` |
| Instagram reels search | `/instagram/reels-search` / `instagram_reels_search` | `query`; first batch, up to 12 results, no limit/cursor |

Search is not available for Facebook, X/Twitter, or LinkedIn. For those, start from a known profile with `channel-research`.

## Workflow

1. Pick search vs hashtag. Use hashtag search for TikTok trend and tag research. Use keyword search everywhere else.
2. Pass the `hashtag` without the leading `#`.
3. Bound the candidate count with `limit` where supported. Instagram Reel search is first-page-only (up to 12 results); it has no limit or cursor input.
4. Rank or filter results by the stats returned (views, likes) to answer "what is top" or "what is trending".
5. Hand the winning URLs to `video-summaries`, `video-transcripts`, or `engagement-analysis` for the next step.

## Examples

```bash
export SOCIALKIT_API_KEY="YOUR_SOCIALKIT_ACCESS_KEY"

# Keyword search
curl -s "https://api.socialkit.dev/youtube/search?query=cold%20plunge%20benefits&limit=10" \
  -H "x-access-key: $SOCIALKIT_API_KEY"

# Hashtag search (no # sign)
curl -s "https://api.socialkit.dev/tiktok/hashtag-search?hashtag=coldplunge&limit=10" \
  -H "x-access-key: $SOCIALKIT_API_KEY"
```

## Common Pitfalls

- Do not include the `#` in the `hashtag` param.
- URL-encode multi-word queries (`cold plunge` becomes `cold%20plunge`) when calling by GET.
- Search returns candidates, not analysis. Ranking and takeaways are your job once results come back.
- Result freshness and ordering come from the platform. Do not promise a strict chronological or global ranking.

## Output Standards

- Return a short ranked list with title, creator, a key metric, and the URL.
- Say how you ranked (views, likes, recency) so the user can trust the order.

Use only public supported content. Do not route posting, private-account access, login bypass, or unrelated website scraping here. See `socialkit-api` for authentication, endpoint-specific pagination, failure handling, and credits. Preserve unknown metrics and scope conclusions to the collected sample.

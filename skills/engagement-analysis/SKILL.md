---
name: engagement-analysis
description: Analyze per-video engagement and comments through SocialKit across YouTube, TikTok, Instagram, and Facebook. Use when the user asks for views, likes, shares, reactions, comment counts, or the actual comments on a post, or wants sentiment and audience reaction analysis. Also covers single tweet and single LinkedIn post detail. Not for posting, private accounts, or unrelated website scraping.
---

# Engagement Analysis

## Overview

Measure how a specific post performed and what the audience said. Two moves: pull the stats, and pull the comments. Use `socialkit-api` for auth and endpoint details.

## Per-Video Stats

| Source | Endpoint / MCP tool | Returns |
|---|---|---|
| YouTube | `/youtube/stats` / `youtube_stats` | views, likes, comments, duration, channel |
| TikTok | `/tiktok/stats` / `tiktok_stats` | views, likes, comments, shares, collects |
| Instagram | `/instagram/stats` / `instagram_stats` | likes, views, comments, author |
| Facebook | `/facebook/stats` / `facebook_stats` | views, reactions breakdown, shares |
| X/Twitter (single) | `/twitter/tweet` / `twitter_tweet` | tweet detail |
| LinkedIn (single) | `/linkedin/post` / `linkedin_post` | post detail |

## Comments

| Source | Endpoint / MCP tool | Params |
|---|---|---|
| YouTube | `/youtube/comments` / `youtube_comments` | `url`, `limit`; no cursor |
| TikTok | `/tiktok/comments` / `tiktok_comments` | `url`, `limit`, `cursor` |
| Instagram | `/instagram/comments` / `instagram_comments` | `url`, `limit`, `cursor` |
| Facebook | `/facebook/comments` / `facebook_comments` | `url`, `limit`, `cursor` |

Comment fields vary by platform. Preserve missing counts as unknown, including null Instagram views/shares. Instagram comments expose collectionStatus and stopReason; hasMore=false alone does not establish completeness.

## Workflow

1. For "how did this do", call the stats endpoint for the video URL.
2. For "what did people say", call the comments endpoint. Set `limit`; use a returned cursor only where supported and cap the pages fetched.
3. To analyze sentiment, pull a bounded sample of returned comments, then summarize themes and tone yourself. State the sample size and collection limits; a popularity-ranked sample is not representative of the entire audience.
4. To compare many videos, use the bulk stats or bulk comments routes rather than looping.

## Examples

```bash
export SOCIALKIT_API_KEY="YOUR_SOCIALKIT_ACCESS_KEY"

# Stats
curl -s "https://api.socialkit.dev/tiktok/stats?url=https://www.tiktok.com/@user/video/7370790114802322694" \
  -H "x-access-key: $SOCIALKIT_API_KEY"

# Top comments
curl -s "https://api.socialkit.dev/youtube/comments?url=https://youtube.com/watch?v=dQw4w9WgXcQ&limit=50" \
  -H "x-access-key: $SOCIALKIT_API_KEY"
```

## Bulk

Bulk stats: `/youtube/stats/bulk`, `/tiktok/stats/bulk`, `/instagram/stats/bulk`. Bulk comments: `/youtube/comments/bulk`, `/tiktok/comments/bulk`. All take a `urls` array by `POST`.

## Common Pitfalls

- Stats and comments need a single post URL, not a profile URL.
- YouTube comments have no cursor input. Other supported comment endpoints may expose a cursor; stop when absent/repeated or the page budget is reached. A collected sample is not the full discussion.
- Like counts and view counts are point-in-time. Note when the user needs a trend rather than a snapshot.
- Sentiment is your analysis of the returned comments, not a field the API returns.

## Output Standards

- Lead with the headline numbers, then the comment themes.
- When claiming sentiment, back it with a few quoted, high-engagement comments.
- Keep the post URL and any IDs for follow-up.

Use only public supported content. Do not route posting, private-account access, login bypass, or unrelated website scraping here. See `socialkit-api` for authentication, endpoint-specific pagination, failure handling, and credits. Preserve unknown metrics and scope conclusions to the collected sample.

Use `/twitter/thread` / `twitter_thread` for a public author self-reply chain, `/twitter/article` / `twitter_article` for full native X Articles, and REST `/reddit/post` for a public Reddit submission. These do not imply Reddit comment collection or arbitrary website extraction.

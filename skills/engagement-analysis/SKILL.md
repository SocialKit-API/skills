---
name: engagement-analysis
description: Analyze per-video engagement and comments through SocialKit across YouTube, TikTok, Instagram, and Facebook. Use when the user asks for views, likes, shares, reactions, comment counts, or the actual comments on a post, or wants sentiment and audience reaction analysis. Also covers single tweet and single LinkedIn post detail.
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
| YouTube | `/youtube/comments` / `youtube_comments` | `url`, `limit`, `cursor` |
| TikTok | `/tiktok/comments` / `tiktok_comments` | `url`, `limit`, `cursor` |
| Instagram | `/instagram/comments` / `instagram_comments` | `url`, `limit`, `cursor` |
| Facebook | `/facebook/comments` / `facebook_comments` | `url`, `limit`, `cursor` |

Each comment includes author, text, like count, and reply count.

## Workflow

1. For "how did this do", call the stats endpoint for the video URL.
2. For "what did people say", call the comments endpoint. Set `limit` and page with `cursor` for more.
3. To analyze sentiment, pull a representative batch of comments, then summarize themes and tone yourself. Quote the highest-liked comments as evidence.
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
- Comments paginate. One page is a sample, not the full thread. Use `cursor` when the user needs more.
- Like counts and view counts are point-in-time. Note when the user needs a trend rather than a snapshot.
- Sentiment is your analysis of the returned comments, not a field the API returns.

## Output Standards

- Lead with the headline numbers, then the comment themes.
- When claiming sentiment, back it with a few quoted, high-engagement comments.
- Keep the post URL and any IDs for follow-up.

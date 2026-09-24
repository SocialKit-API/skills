---
name: channel-research
description: Research creators, profiles, and pages through SocialKit across YouTube, TikTok, Instagram, Facebook, X/Twitter, and LinkedIn. Use when the user asks for follower or subscriber counts, profile or channel stats, a creator's bio, or a list of their recent videos, reels, posts, or tweets. Use for competitor analysis and creator vetting. Not for posting, private accounts, or unrelated website scraping.
---

# Channel Research

## Overview

Profile a creator or brand: their audience size, and what they have been posting. Use `socialkit-api` for auth and endpoint details. Prefer MCP tools when a client is configured.

Two moves make up most research: get the profile stats, then list recent content. Combine them for competitor analysis.

## Profile and Channel Stats

| Source | Endpoint / MCP tool | Returns |
|---|---|---|
| YouTube | `/youtube/channel-stats` / `youtube_channel_stats` | subscribers, total videos, bio, avatar |
| TikTok | `/tiktok/channel-stats` / `tiktok_channel_stats` | followers, likes, video count |
| Instagram | `/instagram/channel-stats` / `instagram_channel_stats` | followers, following, total posts, bio |
| Facebook | `/facebook/channel-stats` / `facebook_channel_stats` | followers, category, bio |
| X/Twitter | `/twitter/profile` / `twitter_profile` | followers, following, tweet count, bio |
| LinkedIn (person) | `/linkedin/profile` / `linkedin_profile` | headline, followers, connections |
| LinkedIn (company) | `/linkedin/company` / `linkedin_company` | company page details |

## List Recent Content

| Source | Endpoint / MCP tool | Params |
|---|---|---|
| YouTube | `/youtube/videos` / `youtube_videos` | `url`, `limit` |
| TikTok | `/tiktok/channel-videos` / `tiktok_channel_videos` | `url`, `limit` |
| Instagram (posts) | `/instagram/channel-posts` / `instagram_channel_posts` | `url`, `limit` |
| Instagram (reels) | `/instagram/channel-reels` / `instagram_channel_reels` | `url`, `limit` |
| X/Twitter | `/twitter/tweets` / `twitter_tweets` | `url`, `limit` |
| LinkedIn (company) | `/linkedin/company-posts` / `linkedin_company_posts` | `url`, `limit` |

## Workflow

1. Take the profile or channel URL from the user.
2. Call the channel/profile stats endpoint for audience size and bio.
3. Call the list-content endpoint with a sensible `limit` for their recent posts.
4. To analyze performance, pass the returned video URLs into `engagement-analysis` for per-video stats, or into `video-summaries` to understand their content themes.

## Example

```bash
export SOCIALKIT_API_KEY="YOUR_SOCIALKIT_ACCESS_KEY"

# Audience size
curl -s "https://api.socialkit.dev/youtube/channel-stats?url=https://www.youtube.com/@MrBeast" \
  -H "x-access-key: $SOCIALKIT_API_KEY"

# Last 10 videos
curl -s "https://api.socialkit.dev/youtube/videos?url=https://www.youtube.com/@MrBeast&limit=10" \
  -H "x-access-key: $SOCIALKIT_API_KEY"
```

## Bulk Channel Stats

Compare many profiles at once (TikTok and Instagram):

```bash
curl -s -X POST "https://api.socialkit.dev/tiktok/channel-stats/bulk" \
  -H "x-access-key: $SOCIALKIT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "urls": [
    "https://www.tiktok.com/@creator1",
    "https://www.tiktok.com/@creator2"
  ] }'
```

## Common Pitfalls

- Channel stats need a profile or channel URL, not a single video URL.
- `limit` controls how many recent items come back. Set it to what the user needs; do not request hundreds by default.
- Listing content does not include per-video engagement on every platform. When the user wants views and likes per video, follow up with `engagement-analysis`.

## Output Standards

- Lead with the numbers that answer the question: audience size, post cadence, standout videos.
- Keep the returned URLs so the user can drill into any post.

Use only public supported content. Do not route posting, private-account access, login bypass, or unrelated website scraping here. See `socialkit-api` for authentication, endpoint-specific pagination, failure handling, and credits. Preserve unknown metrics and scope conclusions to the collected sample.

For public Reddit community metadata, use REST `/reddit/subreddit/details` with a community URL or subreddit name. This is not a post feed or Reddit search. Compute TikTok aggregates locally over a bounded `/tiktok/channel-videos` sample; state the sample size and do not substitute missing views with zero.

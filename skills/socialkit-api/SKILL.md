---
name: socialkit-api
description: Route raw SocialKit REST API, curl, and MCP work for social video data. Use when the user asks for SocialKit API docs, socialkit.dev, api.socialkit.dev, socialkit-mcp, curl examples, endpoint schemas, auth, the full endpoint index, credits, rate limits, or low-level tool routing across YouTube, TikTok, Instagram, Facebook, X/Twitter, LinkedIn, and direct video URLs. For concrete workflows, prefer the focused skills for transcripts, summaries, channel research, discovery, engagement, and downloads.
---

# SocialKit API

## Overview

SocialKit is a read-only data API for social video. It extracts transcripts, AI summaries, engagement stats, comments, channel and profile data, search results, and downloads. It does not post, comment, or modify anything.

Use this skill as the shared routing and reference layer. Prefer SocialKit MCP tools when a client is configured for agent-native execution. Otherwise use the REST API with `curl`.

## Access Paths

- REST API: `https://api.socialkit.dev` with `x-access-key: <access key>`.
- Hosted MCP: `https://mcp.socialkit.dev/mcp` with `Authorization: Bearer <access key>`.
- npm package: `socialkit-mcp`.
- Docs: `https://docs.socialkit.dev`.
- Dashboard access keys: `https://socialkit.dev/login`, Access Keys tab.

The access key can be attached three ways: `access_key` GET query param, `access_key` POST body field, or `x-access-key` header. All endpoints accept both `GET` and `POST`. Bulk endpoints are `POST` only.

Do not ask the user for a key unless a live call is required and none is configured. Never print the key back.

## Authentication

```bash
export SOCIALKIT_API_KEY="YOUR_SOCIALKIT_ACCESS_KEY"

# Verify the key works (costs zero credits):
curl -s "https://api.socialkit.dev/test" \
  -H "x-access-key: $SOCIALKIT_API_KEY"
```

## Request Shape

Single-resource endpoints take a full public `url`. Search takes `query`. Hashtag search takes `hashtag`. List endpoints take `limit` and sometimes `cursor`.

```bash
# GET with query params
curl -s "https://api.socialkit.dev/youtube/transcript?url=https://youtube.com/watch?v=VIDEO_ID" \
  -H "x-access-key: $SOCIALKIT_API_KEY"

# POST with JSON body
curl -s -X POST "https://api.socialkit.dev/youtube/summarize" \
  -H "x-access-key: $SOCIALKIT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "url": "https://youtube.com/watch?v=VIDEO_ID" }'
```

Every response is `{ "success": true, "data": { ... } }` on success, or `{ "success": false, "message": "..." }` on error.

## Endpoint Index

### YouTube
- `/youtube/transcript` — full transcript with timestamped segments. Params: `url`.
- `/youtube/summarize` — AI summary. Params: `url`.
- `/youtube/stats` — per-video views, likes, comments, channel info. Params: `url`.
- `/youtube/comments` — video comments. Params: `url`, `limit`, `cursor`.
- `/youtube/channel-stats` — channel subscribers, video count, bio. Params: `url`.
- `/youtube/videos` — recent videos for a channel or playlist. Params: `url`, `limit`.
- `/youtube/search` — search videos. Params: `query`, `limit`.
- `/youtube/download` — download a video to a hosted file. Params: `url`.

### TikTok
- `/tiktok/transcript` — Params: `url`.
- `/tiktok/summarize` — Params: `url`.
- `/tiktok/stats` — Params: `url`.
- `/tiktok/comments` — Params: `url`, `limit`, `cursor`.
- `/tiktok/channel-stats` — profile followers, likes, video count. Params: `url`.
- `/tiktok/channel-videos` — recent videos for a profile. Params: `url`, `limit`.
- `/tiktok/channel-video-metrics` — aggregate video metrics for a profile. Params: `url`.
- `/tiktok/search` — search videos. Params: `query`, `limit`.
- `/tiktok/hashtag-search` — videos for a hashtag. Params: `hashtag`, `limit`.
- `/tiktok/download` — Params: `url`.

### Instagram
- `/instagram/transcript` — Params: `url`.
- `/instagram/summarize` — Params: `url`.
- `/instagram/stats` — per-post likes, views, comments. Params: `url`.
- `/instagram/comments` — Params: `url`, `limit`, `cursor`.
- `/instagram/channel-stats` — profile followers, post count, bio. Params: `url`.
- `/instagram/channel-posts` — recent posts. Params: `url`, `limit`.
- `/instagram/channel-reels` — recent reels. Params: `url`, `limit`.
- `/instagram/reels-search` — search reels. Params: `query`, `limit`.
- `/instagram/download` — Params: `url`.

### Facebook
- `/facebook/transcript` — Params: `url`.
- `/facebook/summarize` — Params: `url`.
- `/facebook/stats` — per-video views, reactions, shares. Params: `url`.
- `/facebook/comments` — Params: `url`, `limit`, `cursor`.
- `/facebook/channel-stats` — page followers, category, bio. Params: `url`.

### Video (direct URL)
- `/video/transcript` — transcript for a direct video file URL. Params: `url`.
- `/video/summarize` — AI summary for a direct video file URL. Params: `url`.

### X / Twitter
- `/twitter/profile` — followers, following, tweet count, bio. Params: `url`.
- `/twitter/tweets` — recent tweets for a profile. Params: `url`, `limit`.
- `/twitter/tweet` — single tweet detail. Params: `url`.
- `/twitter/transcript` — transcript of a tweet's video. Params: `url`.

### LinkedIn
- `/linkedin/profile` — person profile. Params: `url`.
- `/linkedin/company` — company page. Params: `url`.
- `/linkedin/company-posts` — recent company posts. Params: `url`, `limit`.
- `/linkedin/post` — single post detail. Params: `url`.
- `/linkedin/transcript` — transcript of a post's video. Params: `url`.

### Test
- `/test` — verify an access key. Zero credits.
- `/test/rate-limit` — no-op for load-testing rate limits. Zero credits.

## Bulk Endpoints

Bulk endpoints are `POST` only and take a `urls` array. They process many URLs of the same type in one call.

```bash
curl -s -X POST "https://api.socialkit.dev/youtube/transcript/bulk" \
  -H "x-access-key: $SOCIALKIT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "urls": [
    "https://youtube.com/watch?v=ID1",
    "https://youtube.com/watch?v=ID2"
  ] }'
```

Available bulk routes:
- YouTube: `/youtube/transcript/bulk`, `/youtube/comments/bulk`, `/youtube/stats/bulk`, `/youtube/summarize/bulk`.
- TikTok: `/tiktok/transcript/bulk`, `/tiktok/comments/bulk`, `/tiktok/stats/bulk`, `/tiktok/summarize/bulk`, `/tiktok/channel-stats/bulk`, `/tiktok/channel-video-metrics/bulk`.
- Instagram: `/instagram/transcript/bulk`, `/instagram/stats/bulk`, `/instagram/summarize/bulk`, `/instagram/channel-stats/bulk`.

## MCP Tool Mapping

MCP tool names are `platform_action` and map one to one onto the REST paths. For example `youtube_transcript` calls `POST /youtube/transcript`. Full set:

- YouTube: `youtube_transcript`, `youtube_summarize`, `youtube_stats`, `youtube_comments`, `youtube_channel_stats`, `youtube_videos`, `youtube_search`, `youtube_download`.
- TikTok: `tiktok_transcript`, `tiktok_summarize`, `tiktok_stats`, `tiktok_comments`, `tiktok_channel_stats`, `tiktok_channel_videos`, `tiktok_channel_video_metrics`, `tiktok_search`, `tiktok_hashtag_search`, `tiktok_download`.
- Instagram: `instagram_transcript`, `instagram_summarize`, `instagram_stats`, `instagram_comments`, `instagram_channel_stats`, `instagram_channel_posts`, `instagram_channel_reels`, `instagram_reels_search`, `instagram_download`.
- Facebook: `facebook_transcript`, `facebook_summarize`, `facebook_stats`, `facebook_comments`, `facebook_channel_stats`.
- Video: `video_transcript`, `video_summarize`.
- X/Twitter: `twitter_profile`, `twitter_tweets`, `twitter_tweet`, `twitter_transcript`.
- LinkedIn: `linkedin_profile`, `linkedin_company`, `linkedin_company_posts`, `linkedin_post`, `linkedin_transcript`.

## Errors

- `400` — missing or malformed parameter (usually a missing `url` or `query`).
- `401` — invalid or missing access key.
- `403` — credit limit exceeded.
- `404` — content not found, private, or unavailable.
- `500` — internal error, safe to retry once.

## Hard Rules

- Pass the full public URL the user gave you. Do not reconstruct IDs or canonicalize URLs by hand.
- Summaries, transcripts, comments, and stats are read-only. SocialKit never posts or edits.
- Use bulk endpoints for more than a few same-type URLs instead of looping single calls.
- Comments and list endpoints paginate with `limit` and `cursor`. Do not assume every comment is returned in one page.
- Not every capability exists on every platform. Check the coverage table in the README before promising a result.
- Each successful call costs credits. Avoid redundant calls; reuse data already fetched in the conversation.

## Output Standards

- Answer the user's actual question. Do not dump raw JSON unless asked.
- State which platform and endpoint or MCP tool produced the data.
- Include URLs and IDs the user needs for follow-up calls.
- Never expose the access key.

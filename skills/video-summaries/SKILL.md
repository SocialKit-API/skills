---
name: video-summaries
description: Summarize social videos with AI through SocialKit across YouTube, TikTok, Instagram, Facebook, and direct video file URLs. Use when the user asks for a summary, TL;DR, main points, key takeaways, topics, tone, or target audience of a video, including one video or many at once. Returns a structured AI summary; source availability varies. Not for posting, private accounts, or unrelated website scraping.
---

# Video Summaries

## Overview

Turn a video URL into a structured AI summary. Use `socialkit-api` for auth and endpoint details. Prefer MCP tools when a client is configured.

Each summary response contains `summary`, `mainTopics`, `keyPoints`, `tone`, `targetAudience`, and `quotes`. Some platforms also return a `timeline`.

## Endpoint by Platform

| Source | Endpoint / MCP tool |
|---|---|
| YouTube | `/youtube/summarize` / `youtube_summarize` |
| TikTok | `/tiktok/summarize` / `tiktok_summarize` |
| Instagram | `/instagram/summarize` / `instagram_summarize` |
| Facebook | `/facebook/summarize` / `facebook_summarize` |
| Direct video file URL | `/video/summarize` / `video_summarize` |

Summaries are not available for X/Twitter or LinkedIn. For those, fetch the transcript with `video-transcripts` and summarize it yourself.

## Workflow

1. Identify the platform and pick the matching summarize endpoint.
2. Call it with the full public `url`.
3. For more than a few same-platform URLs, use the bulk route.
4. Shape the output to the user's ask. If they want a one-line TL;DR, give the `summary`. If they want to decide whether to watch, lead with `mainTopics` and `keyPoints`.

## Single Summary

```bash
export SOCIALKIT_API_KEY="YOUR_SOCIALKIT_ACCESS_KEY"

curl -s "https://api.socialkit.dev/youtube/summarize?url=https://youtube.com/watch?v=dQw4w9WgXcQ" \
  -H "x-access-key: $SOCIALKIT_API_KEY"
```

## Bulk Summaries

Available for YouTube, TikTok, and Instagram:

```bash
curl -s -X POST "https://api.socialkit.dev/tiktok/summarize/bulk" \
  -H "x-access-key: $SOCIALKIT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "urls": [
    "https://www.tiktok.com/@user/video/ID1",
    "https://www.tiktok.com/@user/video/ID2"
  ] }'
```

## Common Pitfalls

- TikTok summarySource=visual uses images and description only after confirmed caption absence. Label this source and never invent spoken quotes; operational extraction failures do not justify generating a fallback summary.
- Do not summarize an X or LinkedIn video with a summarize endpoint. Transcribe first, then summarize.
- When comparing several videos, run them in one bulk call rather than many single calls.

## Output Standards

- Match the depth the user asked for. Do not return all six fields when they wanted a sentence.
- When summarizing many videos, add a short cross-video takeaway, not just a stack of separate summaries.

Use only public supported content. Do not route posting, private-account access, login bypass, or unrelated website scraping here. See `socialkit-api` for authentication, endpoint-specific pagination, failure handling, and credits. Preserve unknown metrics and scope conclusions to the collected sample.

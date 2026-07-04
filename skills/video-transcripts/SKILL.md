---
name: video-transcripts
description: Extract transcripts from social videos through SocialKit across YouTube, TikTok, Instagram, Facebook, X/Twitter, LinkedIn, and direct video file URLs. Use when the user asks to transcribe, get captions or subtitles, pull the spoken text, or read what a video says, including one video or many at once. Returns full text plus timestamped segments.
---

# Video Transcripts

## Overview

Turn a video URL into text. Use `socialkit-api` for auth, base URL, and endpoint details. Prefer MCP tools when a client is configured.

Each transcript response contains `transcript` (full plain text), `transcriptSegments` (per-segment `text`, `start`, `duration`, `timestamp`), `wordCount`, and `segments`.

## Endpoint by Platform

| Source | Endpoint / MCP tool |
|---|---|
| YouTube | `/youtube/transcript` / `youtube_transcript` |
| TikTok | `/tiktok/transcript` / `tiktok_transcript` |
| Instagram | `/instagram/transcript` / `instagram_transcript` |
| Facebook | `/facebook/transcript` / `facebook_transcript` |
| X/Twitter | `/twitter/transcript` / `twitter_transcript` |
| LinkedIn | `/linkedin/transcript` / `linkedin_transcript` |
| Direct video file URL | `/video/transcript` / `video_transcript` |

## Workflow

1. Identify the platform from the URL. Pick the matching endpoint. Use `/video/transcript` only for direct file URLs such as an `.mp4` link.
2. Call the endpoint with the full public `url`.
3. If the user has more than a few URLs of the same platform, use the bulk route instead of looping.
4. Return the text the user actually wants. If they asked a question about the video, answer it from the transcript rather than pasting the whole thing.

## Single Transcript

```bash
export SOCIALKIT_API_KEY="YOUR_SOCIALKIT_ACCESS_KEY"

curl -s "https://api.socialkit.dev/tiktok/transcript?url=https://www.tiktok.com/@user/video/7522711492140059912" \
  -H "x-access-key: $SOCIALKIT_API_KEY"
```

## Bulk Transcripts

Available for YouTube, TikTok, and Instagram. `POST` a `urls` array:

```bash
curl -s -X POST "https://api.socialkit.dev/youtube/transcript/bulk" \
  -H "x-access-key: $SOCIALKIT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "urls": [
    "https://youtube.com/watch?v=ID1",
    "https://youtube.com/watch?v=ID2"
  ] }'
```

## Common Pitfalls

- Do not pass a channel or profile URL to a transcript endpoint. Transcripts need a single video URL.
- A `404` usually means the video is private, removed, or has no captions available. Report that plainly, do not retry endlessly.
- Some videos have no speech. An empty transcript is a valid result, not an error to work around.
- For direct URL transcripts the link must point at the video file, not a web page embedding it.

## Output Standards

- Lead with the answer to the user's question, then offer the full transcript or key segments if useful.
- Keep timestamps when the user wants to locate a moment. Drop them when they want clean prose.

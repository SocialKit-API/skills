---
name: video-download
description: Save public YouTube, TikTok, Instagram, or Facebook videos through SocialKit as temporary video/audio files. Use for downloading a post, getting an MP4, or polling a download job. Not for private content, posting, or unrelated website scraping.
---

# Video download

Prefer an async job for long videos and Facebook. Use `socialkit-api` for authentication and errors. A video/post URL is required; a profile URL is not a download target.

| Operation | REST | MCP |
|---|---|---|
| Start a job | POST `/v2/{platform}/download` | `download_async` |
| Poll a job | GET `/v2/downloads/{jobId}` | `download_status` |
| Synchronous YouTube | `/youtube/download` | `youtube_download` |
| Synchronous TikTok | `/tiktok/download` | `tiktok_download` |
| Synchronous Instagram | `/instagram/download` | `instagram_download` |

The async `platform` is `youtube`, `tiktok`, `instagram`, or `facebook`. Formats: mp4 (default), webm, avi, mp3, m4a, wav, ogg. Video quality: 240p, 360p, 480p (default), 720p, 1080p. Audio ignores quality.

1. Submit one job with `url` and the required format/quality. Use `max_duration` (seconds) to bound accepted length. With current pricing, reserve one credit per started minute for audio/video through 480p, four for 720p/1080p; legacy account pricing may differ.
2. Store `jobId`. Poll queued/processing jobs every few seconds with a fixed deadline and maximum attempts; do not start duplicate jobs on timeouts.
3. If completion returns 403 `insufficient_credits`, stop polling until credits are added, then poll the **same job**. A ready paid job can return a refreshed URL without charging again. Failed jobs are unbilled; inspect `errorCode` and `retryable` before resubmission.
4. Return the file link with reported format, size and expiry when provided. A signed download link is temporary, usually around one hour; do not treat it as durable storage.

```bash
curl --fail-with-body -sS https://api.socialkit.dev/v2/facebook/download \
  -H "x-access-key: $SOCIALKIT_API_KEY" -H 'Content-Type: application/json' \
  -d '{"url":"https://www.facebook.com/watch/?v=PUBLIC_VIDEO_ID","quality":"480p","max_duration":120}'

# Replace JOB_ID with the returned ID; cap how many times this is run.
curl --fail-with-body -sS https://api.socialkit.dev/v2/downloads/JOB_ID \
  -H "x-access-key: $SOCIALKIT_API_KEY"
```

Preserve the source URL and use only content the user is permitted to download. Do not expose keys or persist signed links in analytics. X, LinkedIn, Reddit, and arbitrary websites are not supported by these download endpoints.

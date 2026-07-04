---
name: video-download
description: Download social videos to a hosted file through SocialKit for YouTube, TikTok, and Instagram. Use when the user asks to download, save, grab, or get the raw video file or an MP4 link for a post. Returns a temporary download URL with format, quality, and file size.
---

# Video Download

## Overview

Turn a video URL into a downloadable file link. Use `socialkit-api` for auth and endpoint details.

Download is available for YouTube, TikTok, and Instagram only. The response includes `downloadUrl`, `title`, `duration`, `fileSize`, `format`, `quality`, and `expiresIn`.

## Endpoints

| Source | Endpoint / MCP tool |
|---|---|
| YouTube | `/youtube/download` / `youtube_download` |
| TikTok | `/tiktok/download` / `tiktok_download` |
| Instagram | `/instagram/download` / `instagram_download` |

## Workflow

1. Confirm the platform is one of YouTube, TikTok, or Instagram. If not, say download is not supported there.
2. Call the download endpoint with the full public `url`.
3. Return the `downloadUrl` and note the `expiresIn` window, since the link is temporary.

## Example

```bash
export SOCIALKIT_API_KEY="YOUR_SOCIALKIT_ACCESS_KEY"

curl -s "https://api.socialkit.dev/tiktok/download?url=https://www.tiktok.com/@user/video/7370790114802322694" \
  -H "x-access-key: $SOCIALKIT_API_KEY"
```

To save the file locally after you have the `downloadUrl`:

```bash
curl -L "PASTE_DOWNLOAD_URL_HERE" -o video.mp4
```

## Common Pitfalls

- The `downloadUrl` expires. Tell the user the `expiresIn` window and do not treat the link as permanent.
- Download needs a single video URL, not a profile URL.
- Respect the source platform's terms and the rights of the content owner. Download for permitted uses only.

## Output Standards

- Return the download link, format, quality, and how long it stays valid.
- Do not re-download the same URL you already fetched in this conversation.

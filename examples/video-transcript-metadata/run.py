"""Dependency-free Python equivalent of core.mjs/run.mjs. Fixtures by default."""
import argparse
import datetime
import json
import math
import os
from pathlib import Path
import re
import urllib.error
import urllib.parse
import urllib.request


def source(value):
    url = urllib.parse.urlsplit(value)
    host = url.hostname
    platform = ({'youtube.com': 'youtube', 'www.youtube.com': 'youtube', 'm.youtube.com': 'youtube', 'youtu.be': 'youtube',
                 'tiktok.com': 'tiktok', 'www.tiktok.com': 'tiktok', 'instagram.com': 'instagram', 'www.instagram.com': 'instagram'}).get(host)
    valid = False
    if platform == 'youtube':
        valid = re.fullmatch(r'/[\w-]{11}/?', url.path) if host == 'youtu.be' else (
            url.path == '/watch' and re.fullmatch(r'[\w-]{11}', urllib.parse.parse_qs(url.query).get('v', [''])[0]) or re.fullmatch(r'/(shorts|embed)/[\w-]{11}/?', url.path))
    elif platform == 'tiktok':
        valid = re.fullmatch(r'/@[^/]+/video/\d+/?', url.path)
    elif platform == 'instagram':
        valid = re.fullmatch(r'/(reel|reels|p)/[\w-]+/?', url.path)
    if url.scheme != 'https' or url.username or url.password or url.port or not valid:
        raise ValueError('Supply a public YouTube, TikTok, or Instagram video URL; expanded URLs only.')
    return {'platform': platform, 'url': value}


def metric(value):
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value >= 0 else None


def text(value):
    return value if isinstance(value, str) and value.strip() else None


def duration(value):
    if metric(value) is not None:
        return value if value > 0 else None
    if not isinstance(value, str) or not re.fullmatch(r'\d+(?::\d{1,2}){0,2}(?:\.\d+)?', value):
        return None
    seconds = 0
    for part in value.split(':'):
        seconds = seconds * 60 + float(part)
    return seconds if seconds > 0 else None


def collect(value, request, max_credits=5):
    target = source(value)
    if type(max_credits) is not int or not 1 <= max_credits <= 100:
        raise ValueError('maxCredits must be an integer from 1 to 100.')
    report = {'schemaVersion': 1, 'source': target, 'metadata': None, 'transcript': {'status': 'not_requested', 'text': None, 'segments': []},
              'usage': {'requests': 0, 'reservedCredits': 0, 'reportedCredits': None, 'attempts': []}}
    usage = report['usage']

    def call(action, reserve):
        usage['reservedCredits'] += reserve
        usage['requests'] += 1
        try:
            reply = request('/' + target['platform'] + '/' + action, {'url': target['url']})
        except Exception:
            reply = {'status': None, 'body': {}}
        status, body = reply.get('status'), reply.get('body')
        try:
            credits = metric(float(reply.get('credits')))
        except (TypeError, ValueError):
            credits = None
        usage['attempts'].append({'action': action, 'status': status, 'credits': credits})
        usage['reportedCredits'] = sum(item['credits'] for item in usage['attempts']) if all(item['credits'] is not None for item in usage['attempts']) else None
        if not isinstance(status, int) or not 200 <= status < 300 or not isinstance(body, dict) or body.get('success') is not True or not isinstance(body.get('data'), dict):
            code = (body.get('errorCode') or body.get('code')) if isinstance(body, dict) else None
            return None, 'no_transcript' if code == 'no_transcript' else 'failed'
        return body['data'], None

    data, error = call('stats', 1)
    if error:
        report['transcript']['status'] = 'metadata_failed'
        return report
    report['metadata'] = {key: text(data.get(key)) for key in ['title', 'description', 'channelName', 'publishedAt']}
    report['metadata'].update({key: metric(data.get(key)) for key in ['views', 'likes', 'comments', 'shares']})
    seconds = duration(data.get('durationSeconds') if data.get('durationSeconds') is not None else data.get('duration'))
    report['metadata']['durationSeconds'] = seconds
    cost = (None if seconds is None else 2 * max(1, math.ceil(seconds / 60))) if target['platform'] == 'instagram' else 1
    if cost is None or max(usage['reservedCredits'], usage['reportedCredits'] or 0) + cost > max_credits:
        report['transcript']['status'] = 'unknown_duration' if cost is None else 'budget_exceeded'
        return report
    data, error = call('transcript', cost)
    if error:
        report['transcript']['status'] = error
        return report
    transcript = text(data.get('transcript')) or text(data.get('text'))
    raw_segments = data.get('transcriptSegments')
    segments = [{'text': s['text'], 'start': metric(s.get('start')), 'duration': metric(s.get('duration'))}
                for s in (raw_segments if isinstance(raw_segments, list) else []) if isinstance(s, dict) and isinstance(s.get('text'), str)]
    report['transcript'] = {'status': 'available' if transcript or any(s['text'].strip() for s in segments) else 'empty', 'text': transcript, 'segments': segments}
    return report


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def live_request(base, key):
    url = urllib.parse.urlsplit(base)
    if (url.scheme != 'https' and not (url.scheme == 'http' and url.hostname in ['localhost', '127.0.0.1'])) or not url.hostname or url.username or url.password or url.query or url.fragment or url.path not in ['', '/']:
        raise ValueError('API base must be an HTTPS origin (or localhost for tests).')
    opener = urllib.request.build_opener(NoRedirect())

    def request(path, params):
        req = urllib.request.Request(base.rstrip('/') + path, data=json.dumps(params).encode(), headers={'Content-Type': 'application/json', 'x-access-key': key})
        try:
            response = opener.open(req, timeout=60)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            return {'status': response.status, 'body': json.load(response), 'credits': response.headers.get('x-credits-used')}
    return request


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--live', action='store_true')
    parser.add_argument('--url')
    parser.add_argument('--max-credits', type=int, default=5)
    args = parser.parse_args()
    fixture = json.loads(Path(__file__).with_name('fixture.json').read_text())
    if not args.live and args.url:
        parser.error('--url requires --live; fixture mode uses synthetic input.')
    if args.live and (not args.url or not os.getenv('SOCIALKIT_API_KEY')):
        parser.error('Live mode needs --url and SOCIALKIT_API_KEY in the environment.')
    request = live_request(os.getenv('SOCIALKIT_API_BASE_URL', 'https://api.socialkit.dev'), os.environ['SOCIALKIT_API_KEY']) if args.live else lambda path, _: fixture['responses'][path.rsplit('/', 1)[-1]]
    report = collect(args.url or fixture['url'], request, args.max_credits)
    print(json.dumps({'mode': 'live' if args.live else 'synthetic_fixture', 'collectedAt': datetime.datetime.now(datetime.timezone.utc).isoformat() if args.live else None, **report}, indent=2))
    return 0 if report['transcript']['status'] == 'available' else 2


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except ValueError as error:
        raise SystemExit(str(error))

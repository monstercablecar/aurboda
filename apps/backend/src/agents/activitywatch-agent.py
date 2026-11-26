"""Read-only ActivityWatch importer. Standard-library Python 3.9+, no third-party packages."""
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import sys
import urllib.error
import urllib.parse
import urllib.request

UTC = dt.timezone.utc

def instant(value):
    return dt.datetime.fromisoformat(value.replace('Z', '+00:00')).astimezone(UTC)

def iso(value):
    return value.isoformat().replace('+00:00', 'Z')

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def request(url, key='', body=None):
    headers = {'Content-Type': 'application/json'}
    if key:
        headers['Authorization'] = 'Bearer ' + key
    req = urllib.request.Request(url, headers=headers, data=None if body is None else json.dumps(body).encode())
    try:
        with urllib.request.build_opener(NoRedirect).open(req, timeout=60) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        error.close()
        if error.code in (401, 403):
            raise RuntimeError('Authentication refused. Check the ActivityWatch API key or Aurboda token for this endpoint.') from None
        raise RuntimeError('Import request failed: HTTP %s. Check service availability and retry.' % error.code) from None
    except (OSError, ValueError):
        raise RuntimeError('Service unavailable or invalid response. Check ActivityWatch and Aurboda, then retry.') from None

def read_page(fetch, hydrate, end=None):
    limit = 501
    while True:
        events = fetch(end, limit)
        if not isinstance(events, list):
            raise RuntimeError('Invalid event response; checkpoint retained.')
        for event in events:
            if not event.get('data', {}).get('app') or not isinstance(event.get('duration'), (int, float)) or event['duration'] < 0:
                raise RuntimeError('Malformed app event; checkpoint retained.')
        oldest = min((instant(e['timestamp']) for e in events), default=None)
        full = len(events) >= limit
        selected = [e for e in events if instant(e['timestamp']) > oldest] if full else events
        if full and not selected:
            if limit >= 32064:
                raise RuntimeError('Oversized timestamp tie; export this bucket for manual import. No events skipped.')
            limit *= 2
            continue
        originals = []
        for event in selected:
            if end is not None and instant(event['timestamp']) + dt.timedelta(seconds=event['duration']) >= instant(end):
                if 'id' not in event:
                    raise RuntimeError('Event IDs required to preserve durations. Update ActivityWatch.')
                original = hydrate(event['id'])
                if original.get('id') != event['id'] or instant(original['timestamp']) != instant(event['timestamp']):
                    raise RuntimeError('Source changed during import; retry.')
                event = original
            originals.append(event)
        return originals, iso(oldest) if full else None

def run():
    aw = os.environ.get('AW_URL', 'http://127.0.0.1:5600').rstrip('/')
    local = urllib.parse.urlparse(aw)
    if local.scheme != 'http' or local.hostname not in ('127.0.0.1', 'localhost', '::1') or local.username or local.password:
        raise RuntimeError('AW_URL must be a local loopback HTTP address.')
    api = os.environ['AURBODA_URL'].rstrip('/')
    token = os.environ['AURBODA_TOKEN']
    aw_key = os.environ.get('AW_API_KEY', '')
    remote = urllib.parse.urlparse(api)
    if remote.scheme != 'https' and remote.hostname not in ('127.0.0.1', 'localhost', '::1'):
        raise RuntimeError('Aurboda requires HTTPS except for local development.')
    scope = hashlib.sha256((api + '|' + token).encode()).hexdigest()
    directory = Path(os.environ.get('AW_STATE_DIR', str(Path.home() / '.local/state/aw-aurboda')))
    directory.mkdir(parents=True, exist_ok=True)
    lock = open(directory / 'import.lock', 'a+b')
    try:
        if os.name == 'nt':
            import msvcrt
            lock.seek(0); lock.write(b'0'); lock.flush(); lock.seek(0)
            msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        lock.close()
        return
    try:
        statefile = directory / ('state-v2-' + scope + '.json')
        state = json.loads(statefile.read_text()) if statefile.exists() else {}
        def save():
            temporary = statefile.with_suffix('.tmp')
            fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            with os.fdopen(fd, 'w') as output:
                json.dump(state, output); output.flush(); os.fsync(output.fileno())
            os.replace(temporary, statefile)
        def get(path, params=None):
            url = aw + '/api/0/' + '/'.join(urllib.parse.quote(str(x), safe='') for x in path)
            if params:
                url += '?' + urllib.parse.urlencode(params)
            return request(url, aw_key)
        buckets = get(['buckets', ''])
        app_buckets = {bid: b for bid, b in buckets.items() if b.get('type') == 'currentwindow' or bid.startswith('aw-android-appevents')}
        if not app_buckets:
            raise RuntimeError('No app-usage buckets found. Open ActivityWatch and verify tracking.')
        if os.environ.get('AW_BACKFILL') == '1':
            state.clear(); save()
        for bid, bucket in app_buckets.items():
            host = bucket.get('hostname')
            if not host or host == 'unknown':
                raise RuntimeError('Bucket has no hostname. Configure the ActivityWatch device hostname.')
            identity = bid + '|' + bucket.get('created', '')
            checkpoint = state.setdefault(identity, {})
            def fetch(end, limit):
                return get(['buckets', bid, 'events'], dict(limit=limit, **({'end': end} if end else {})))
            def hydrate(event_id):
                return get(['buckets', bid, 'events', event_id])
            def send(events):
                if not events:
                    return
                afk = []
                start = min(instant(e['timestamp']) for e in events)
                end = max(instant(e['timestamp']) + dt.timedelta(seconds=e['duration']) for e in events)
                for aid, metadata in buckets.items():
                    if metadata.get('type') == 'afkstatus' and metadata.get('hostname') == host:
                        observations = get(['buckets', aid, 'events'], {'start': iso(start), 'end': iso(end), 'limit': 10000})
                        if len(observations) >= 10000:
                            raise RuntimeError('AFK range too large to verify safely; checkpoint retained.')
                        afk.extend((instant(e['timestamp']), instant(e['timestamp']) + dt.timedelta(seconds=e['duration'])) for e in observations if e['data'].get('status') == 'afk')
                transformed = []
                for e in events:
                    start = instant(e['timestamp']); end = start + dt.timedelta(seconds=e['duration'])
                    transformed.append(dict(timestamp=e['timestamp'], duration=e['duration'], app=e['data']['app'],
                        bucket_id=bid, source_instance=bucket.get('created', ''), source_event_id=str(e['id']), source_data=e['data'],
                        is_afk=any(start >= a and end <= b for a, b in afk),
                        **({'title': e['data']['title']} if isinstance(e['data'].get('title'), str) else {}),
                        **({'category': e['data']['category']} if isinstance(e['data'].get('category'), str) else {})))
                for index in range(0, len(transformed), 500):
                    batch = transformed[index:index+500]
                    answer = request(api + '/sync/activitywatch', token, dict(device_name=host, events=batch,
                        is_mobile=bid.startswith(('aw-watcher-android', 'aw-android-appevents'))))
                    result = answer.get('result', {})
                    if not answer.get('success') or result.get('status') != 'success' or result.get('records_stored') != len(batch) or result.get('events_total') is None:
                        raise RuntimeError('Aurboda did not confirm the complete batch. Update the server and retry.')
                    checkpoint['coverage'] = result
                    print('Confirmed %s stored events for source device; history %s to %s' % (result['events_total'], result.get('earliest_event'), result.get('latest_event')))
            # Frozen recent scan resumes too; dense days cannot starve later pages.
            recent = checkpoint.setdefault('recent_scan', {'end': None, 'floor': checkpoint.get('recent', iso(dt.datetime.now(UTC)-dt.timedelta(days=1)))})
            for _ in range(8):
                events, next_end = read_page(fetch, hydrate, recent['end'])
                if 'newest' not in recent and events:
                    recent['newest'] = iso(max(instant(e['timestamp']) for e in events))
                send(events)
                recent['end'] = next_end
                if next_end is None or instant(next_end) < instant(recent['floor']) - dt.timedelta(days=1):
                    checkpoint['recent'] = recent.get('newest', checkpoint.get('recent', recent['floor']))
                    del checkpoint['recent_scan']; save(); break
                save()
            if not checkpoint.get('done'):
                for _ in range(8):
                    events, next_end = read_page(fetch, hydrate, checkpoint.get('end'))
                    send(events)
                    checkpoint.update(end=next_end, done=next_end is None)
                    save()
                    if next_end is None:
                        break
        print('Import pass complete. Pending history resumes on the next scheduled run. Use AW_BACKFILL=1 for full reconciliation.')
    finally:
        lock.close()

if __name__ == '__main__':
    try:
        run()
    except Exception as error:
        # Do not print response bodies, request URLs, credentials, titles or source payloads.
        print(str(error) if isinstance(error, RuntimeError) else 'Import failed. Check configuration and retry; checkpoints retained.', file=sys.stderr)
        sys.exit(1)

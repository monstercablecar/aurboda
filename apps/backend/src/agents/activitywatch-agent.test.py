import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import threading
import unittest
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('agent', Path(__file__).with_name('activitywatch-agent.py'))
agent = importlib.util.module_from_spec(spec)
spec.loader.exec_module(agent)

class ImportTest(unittest.TestCase):
    def test_history_resume_incremental_devices_and_credentials(self):
        events = [dict(id=i, timestamp=agent.iso(agent.dt.datetime(2025, 1, 1, tzinfo=agent.UTC)+agent.dt.timedelta(seconds=i)), duration=1.25, data={'app':'Synthetic app', 'category':'Work'}) for i in range(1301)]
        original = json.dumps(events)
        stored = {}
        requests = {'posts':0, 'fail':2, 'unauthorized':False}
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_): pass
            def reply(self, value, status=200):
                body=json.dumps(value).encode(); self.send_response(status); self.send_header('Content-Type','application/json'); self.end_headers(); self.wfile.write(body)
            def do_GET(self):
                self.assert_key = self.headers.get('Authorization') == 'Bearer local-key'
                if not self.assert_key or requests['unauthorized']:
                    return self.reply({},401)
                path=urllib.parse.urlparse(self.path); parts=path.path.split('/')
                if path.path.endswith('/buckets/'):
                    return self.reply({'aw-watcher-window_pc':{'type':'currentwindow','hostname':'desktop','created':'2025-01-01T00:00:00Z'}, 'aw-watcher-android':{'type':'currentwindow','hostname':'pixel_9_pro','created':'2025-01-01T00:00:00Z'}})
                if parts[-2]=='events': return self.reply(events[int(parts[-1])])
                query=urllib.parse.parse_qs(path.query); end=query.get('end',[None])[0]
                selected=[e.copy() for e in events if end is None or agent.instant(e['timestamp'])<=agent.instant(end)]
                selected.sort(key=lambda e:agent.instant(e['timestamp']),reverse=True)
                for e in selected:
                    if end: e['duration']=min(e['duration'],(agent.instant(end)-agent.instant(e['timestamp'])).total_seconds())
                self.reply(selected[:int(query['limit'][0])])
            def do_POST(self):
                if self.headers.get('Authorization')!='Bearer remote-key': return self.reply({},401)
                requests['posts']+=1
                payload=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
                if requests['posts']==requests['fail']: return self.reply({'success':True,'result':{'status':'error','records_stored':0}})
                for event in payload['events']:
                    stored[(payload['device_name'],event['bucket_id'],event['source_event_id'])]=event
                selected=[e for (host,_,_),e in stored.items() if host==payload['device_name']]
                self.reply({'success':True,'result':{'status':'success','records_stored':len(payload['events']),'events_total':len(selected),'earliest_event':min(e['timestamp'] for e in selected),'latest_event':max(e['timestamp'] for e in selected)}})
        server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ,{'AW_URL':f'http://127.0.0.1:{server.server_port}','AURBODA_URL':f'http://127.0.0.1:{server.server_port}/api','AW_API_KEY':'local-key','AURBODA_TOKEN':'remote-key','AW_STATE_DIR':directory}), contextlib.redirect_stdout(io.StringIO()):
                with self.assertRaises(RuntimeError): agent.run()
                requests['fail']=0
                agent.run()
                self.assertEqual(len(stored),2602)
                agent.run()
                self.assertEqual(len(stored),2602)
                self.assertEqual(original,json.dumps(events))
                self.assertTrue(all(e['duration']==1.25 for e in stored.values()))
                events.append(dict(id=1301,timestamp='2026-11-26T12:00:00Z',duration=10.125,data={'app':'New app'}))
                agent.run()
                self.assertEqual(len(stored),2604)
                requests['unauthorized']=True
                before={p.name:p.read_bytes() for p in Path(directory).glob('*.json')}
                with self.assertRaises(RuntimeError): agent.run()
                self.assertEqual(before,{p.name:p.read_bytes() for p in Path(directory).glob('*.json')})
        finally: server.shutdown();server.server_close()

if __name__=='__main__': unittest.main()

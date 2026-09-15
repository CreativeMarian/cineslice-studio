# Edge TTS 本地 HTTP 服务（v3 - CLI 合成后端 + 完整错误日志）
# 用法: python edge_tts_server.py  (默认 http://127.0.0.1:5000)
# POST /tts  {"text":"...","voice":"zh-CN-XiaoxiaoNeural","rate":"+0%","pitch":"+0Hz"} -> audio/mpeg
import json
import os
import subprocess
import sys
import tempfile
import traceback
from http.server import HTTPServer, BaseHTTPRequestHandler

LOG = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'data', 'edge-tts.log')

def log(msg):
    try:
        with open(LOG, 'a', encoding='utf-8') as f:
            f.write(msg + '\n')
    except Exception:
        pass


def find_edge_cli():
    scripts = os.path.join(os.path.dirname(sys.executable), 'Scripts')
    cand = os.path.join(scripts, 'edge-tts.exe')
    if os.path.exists(cand):
        return cand
    return 'edge-tts'


EDGE_CLI = find_edge_cli()


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != '/tts':
            self.send_error(404)
            return
        try:
            length = int(self.headers.get('Content-Length', 0) or 0)
            raw = self.rfile.read(length) if length else b'{}'
            body = json.loads(raw.decode('utf-8') or '{}')
            text = str(body.get('text', '') or '')
            if not text.strip():
                self.send_error(400)
                return
            voice = str(body.get('voice', 'zh-CN-XiaoxiaoNeural'))
            rate = str(body.get('rate', '+0%'))
            pitch = str(body.get('pitch', '+0Hz'))
            mp3 = self._synth(text, voice, rate, pitch)
            self.send_response(200)
            self.send_header('Content-Type', 'audio/mpeg')
            self.send_header('Content-Length', str(len(mp3)))
            self.end_headers()
            self.wfile.write(mp3)
        except Exception:
            traceback.print_exc()
            try:
                self.send_error(500)
            except Exception:
                pass

    def _synth(self, text, voice, rate, pitch):
        outfile = os.path.join(tempfile.gettempdir(), 'edge_tts_%d.mp3' % os.getpid())
        cmd = [EDGE_CLI, '--text', text, '--voice', voice,
               '--rate', rate, '--pitch', pitch, '--write-media', outfile]
        last_err = 'unknown'
        for attempt in range(1, 4):
            try:
                if os.path.exists(outfile):
                    os.unlink(outfile)
                proc = subprocess.run(cmd, capture_output=True, timeout=120)
                if proc.returncode == 0 and os.path.exists(outfile):
                    with open(outfile, 'rb') as fh:
                        data = fh.read()
                    log('OK attempt=%d bytes=%d' % (attempt, len(data)))
                    if data:
                        return data
                    last_err = 'empty audio'
                else:
                    last_err = (proc.stderr or b'').decode('utf-8', 'ignore')[:400]
            except Exception as e:
                last_err = str(e)
            log('FAIL attempt=%d: %s' % (attempt, last_err))
            if attempt < 3:
                import time
                time.sleep(2)
        raise RuntimeError('edge-tts CLI failed after 3 attempts: ' + last_err)

    def log_message(self, *args):
        pass


if __name__ == '__main__':
    log('=== Edge TTS server v3 start (cli=%s) ===' % EDGE_CLI)
    print('Edge TTS server v3 on http://127.0.0.1:5000 (cli=%s)' % EDGE_CLI)
    HTTPServer(('127.0.0.1', 5000), Handler).serve_forever()

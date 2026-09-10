# Edge TTS 本地 HTTP 服务
# 用法: python edge_tts_server.py  (默认 http://127.0.0.1:5000)
# POST /tts  {"text":"...","voice":"zh-CN-XiaoxiaoNeural","rate":"+0%","pitch":"+0Hz"} -> audio/mpeg
import json
import asyncio
from http.server import HTTPServer, BaseHTTPRequestHandler

import edge_tts


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
                self.send_error(400, 'empty text')
                return
            voice = str(body.get('voice', 'zh-CN-XiaoxiaoNeural'))
            rate = str(body.get('rate', '+0%'))
            pitch = str(body.get('pitch', '+0Hz'))
            mp3 = asyncio.run(self._synth(text, voice, rate, pitch))
            self.send_response(200)
            self.send_header('Content-Type', 'audio/mpeg')
            self.send_header('Content-Length', str(len(mp3)))
            self.end_headers()
            self.wfile.write(mp3)
        except Exception as e:
            import traceback
            traceback.print_exc()
            try:
                self.send_error(500, str(e))
            except Exception:
                pass

    async def _synth(self, text, voice, rate, pitch):
        data = b''
        comm = edge_tts.Communicate(text, voice=voice, rate=rate, pitch=pitch)
        async for chunk in comm.stream():
            if chunk['type'] == 'audio':
                data += chunk['data']
        return data

    def log_message(self, *args):
        pass


if __name__ == '__main__':
    print('Edge TTS server on http://127.0.0.1:5000')
    HTTPServer(('127.0.0.1', 5000), Handler).serve_forever()

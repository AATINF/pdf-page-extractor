#!/usr/bin/env python3
"""PDF 页面提取器 - 局域网服务器
在电脑上运行：python3 serve.py
然后用同一 Wi-Fi 下的手机浏览器打开打印出的地址。
"""
import http.server, socket, os, sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
os.chdir(os.path.dirname(os.path.abspath(__file__)))

def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))
        return s.getsockname()[0]
    except Exception:
        return '127.0.0.1'
    finally:
        s.close()

handler = http.server.SimpleHTTPRequestHandler

class Quiet(handler):
    def log_message(self, fmt, *args):
        pass

print('=' * 52)
print(' PDF 页面提取器 已启动')
print(' 本机访问:  http://localhost:%d' % PORT)
print(' 手机访问:  http://%s:%d  （需与电脑同一 Wi-Fi）' % (lan_ip(), PORT))
print(' 按 Ctrl+C 停止')
print('=' * 52)
http.server.ThreadingHTTPServer(('0.0.0.0', PORT), Quiet).serve_forever()

#!/usr/bin/env python3
"""把 pdf.worker.min.js 内联进 index.html（可重复执行）。"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

with open(os.path.join(ROOT, 'lib', 'pdf.worker.min.js'), 'r', encoding='utf-8') as f:
    worker = f.read()

# 防御性转义：避免任何 </script 破坏 HTML 解析（当前版本不存在，但保留保险）
worker_esc = worker.replace('</script', '<\\/script')

with open(os.path.join(ROOT, 'index.html'), 'r', encoding='utf-8') as f:
    html = f.read()

if '__PDFJS_WORKER_SRC__' in html:
    html = html.replace('__PDFJS_WORKER_SRC__', worker_esc)
    with open(os.path.join(ROOT, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(html)
    print('worker 内联完成, index.html 大小: %.1f KB' % (len(html.encode('utf-8')) / 1024))
else:
    print('worker 已内联，无需重复处理')

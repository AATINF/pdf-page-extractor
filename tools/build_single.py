#!/usr/bin/env python3
"""生成单文件版：把所有 JS 库 + 业务逻辑全部内联进 index.html，
输出一个拷走就能用的 HTML 文件（离线、file:// 直接打开）。"""
import os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def inline_script(html, src, path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    # 防御：HTML 解析器会以 </script 截断标签，转义为 <\/script（JS 语义不变）
    content = content.replace('</script', '<\\/script')
    tag = '<script src="%s"></script>' % src
    assert tag in html, '找不到标签: ' + tag
    return html.replace(tag, '<script>\n' + content + '\n</script>')

def main():
    with open(os.path.join(ROOT, 'index.html'), 'r', encoding='utf-8') as f:
        html = f.read()

    html = inline_script(html, 'app.js', os.path.join(ROOT, 'app.js'))
    html = inline_script(html, 'lib/pdf.min.js', os.path.join(ROOT, 'lib', 'pdf.min.js'))
    html = inline_script(html, 'lib/pdf-lib.min.js', os.path.join(ROOT, 'lib', 'pdf-lib.min.js'))
    html = inline_script(html, 'lib/jszip.min.js', os.path.join(ROOT, 'lib', 'jszip.min.js'))

    out = os.path.join(ROOT, 'PDF页面提取器-单文件版.html')
    with open(out, 'w', encoding='utf-8') as f:
        f.write(html)

    ext = re.findall(r'<script[^>]+src="([^"]+)"', html)
    n_inline = len(re.findall(r'<script>\s*\n', html)) + 1  # +worker(text/plain)
    print('单文件版生成: %s (%.1f MB)' % (out, os.path.getsize(out) / 1024 / 1024))
    print('残留外部 script 引用:', ext if ext else '无 ✓')
    print('内联 script 块数量:', n_inline)

if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""生成单文件版：把 index.html 里引用的所有脚本内联成一个可离线打开的 HTML。"""
import json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def inline_script(html, src, path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    # HTML 解析器会以 </script 截断标签，转义为 <\/script（JS 语义不变）
    content = content.replace('</script', '<\\/script')
    tag = '<script src="%s"></script>' % src
    if tag not in html:
        raise SystemExit('找不到标签: ' + src)
    return html.replace(tag, '<script>\n' + content + '\n</script>')


def main():
    with open(os.path.join(ROOT, 'index.html'), 'r', encoding='utf-8') as f:
        html = f.read()

    # 版本号从 package.json 注入
    with open(os.path.join(ROOT, 'package.json'), 'r', encoding='utf-8') as f:
        version = json.load(f)['version']
    html = re.sub(r'(<title>PDF 页面提取器 )v[\d.]+(</title>)', r'\g<1>v' + version + r'\g<2>', html)
    html = re.sub(r'(id="verTag">)v[\d.]+', r'\g<1>v' + version, html)
    html = re.sub(r'(id="appVer">)v[\d.]+', r'\g<1>v' + version, html)

    # 按 index.html 中的出现顺序内联所有外部脚本
    sources = re.findall(r'<script src="([^"]+)"></script>', html)
    for src in sources:
        html = inline_script(html, src, os.path.join(ROOT, src))

    out = os.path.join(ROOT, 'PDF页面提取器-单文件版.html')
    with open(out, 'w', encoding='utf-8') as f:
        f.write(html)

    ext = re.findall(r'<script[^>]+src="([^"]+)"', html)
    print('单文件版生成: %s (%.1f MB)' % (out, os.path.getsize(out) / 1024 / 1024))
    print('内联脚本数:', len(sources))
    print('残留外部 script 引用:', ext if ext else '无 ✓')


if __name__ == '__main__':
    main()

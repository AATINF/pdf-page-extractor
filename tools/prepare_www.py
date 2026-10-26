#!/usr/bin/env python3
"""把运行时需要的静态资源复制进 www/（Capacitor 的 webDir）。

白名单机制：只复制明确列出的文件/目录，文档、演示视频、截图、软著材料一律不进包。
"""
import json, re, shutil, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
WWW = ROOT / 'www'

FILES = ['index.html', 'app.js', 'convert.js', 'manifest.webmanifest']
DIRS = ['lib', 'icons']

def main():
    if WWW.exists():
        shutil.rmtree(WWW)
    WWW.mkdir()

    # 版本号从 package.json 注入，避免界面上的版本和实际发布版不一致
    version = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['version']

    total = 0
    for f in FILES:
        src = ROOT / f
        if not src.exists():
            sys.exit('缺少文件: ' + f)
        if f == 'index.html':
            html = src.read_text(encoding='utf-8')
            html = re.sub(r'(<title>PDF 页面提取器 )v[\d.]+(</title>)', r'\g<1>v' + version + r'\g<2>', html)
            html = re.sub(r'(id="verTag">)v[\d.]+', r'\g<1>v' + version, html)
            html = re.sub(r'(id="appVer">)v[\d.]+', r'\g<1>v' + version, html)
            (WWW / f).write_text(html, encoding='utf-8')
            print(f'  + {f}  (版本 v{version})')
        else:
            shutil.copy2(src, WWW / f)
            print('  +', f)
        total += src.stat().st_size

    # pdf.worker.min.js 已被 tools/build.py 内联进 index.html，
    # 再复制一份进 APK 等于白占 1.1MB，这里显式排除
    REDUNDANT = {'lib/pdf.worker.min.js'}

    for d in DIRS:
        src = ROOT / d
        if not src.exists():
            sys.exit('缺少目录: ' + d)
        shutil.copytree(src, WWW / d, ignore=shutil.ignore_patterns())
        for rel in REDUNDANT:
            p = WWW / rel
            if p.exists() and p.parts[len(WWW.parts)] == d:
                p.unlink()
                print('  - 跳过冗余文件', rel)
        n = 0
        for p in (WWW / d).rglob('*'):
            if p.is_file():
                total += p.stat().st_size
                n += 1
        print(f'  + {d}/  ({n} 个文件)')

    # 安全检查：确认没有把不该进包的东西带进去
    banned = ['.md', '.zip', '.mp4', '.gif', '.py', '.yml']
    leaked = [str(p.relative_to(WWW)) for p in WWW.rglob('*')
              if p.is_file() and p.suffix in banned]
    if leaked:
        sys.exit('发现不应打包的文件: ' + ', '.join(leaked))

    print(f'\nwww/ 就绪：{total/1024/1024:.2f} MB')

if __name__ == '__main__':
    main()

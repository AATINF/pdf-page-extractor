#!/usr/bin/env python3
"""把运行时需要的静态资源复制进 www/（Capacitor 的 webDir）。

白名单机制：只复制明确列出的文件/目录，文档、演示视频、截图、软著材料一律不进包。
"""
import shutil, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
WWW = ROOT / 'www'

FILES = ['index.html', 'app.js', 'manifest.webmanifest']
DIRS = ['lib', 'icons']

def main():
    if WWW.exists():
        shutil.rmtree(WWW)
    WWW.mkdir()

    total = 0
    for f in FILES:
        src = ROOT / f
        if not src.exists():
            sys.exit('缺少文件: ' + f)
        shutil.copy2(src, WWW / f)
        total += src.stat().st_size
        print('  +', f)

    for d in DIRS:
        src = ROOT / d
        if not src.exists():
            sys.exit('缺少目录: ' + d)
        shutil.copytree(src, WWW / d)
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

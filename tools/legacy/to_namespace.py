#!/usr/bin/env python3
"""
把跨模块的裸调用改成 PDFX.xxx 运行时解析。

为什么：模块之间是循环依赖（document 调 selection 的 toggleSelect，
selection 又调 document 的 makeCard）。靠调整加载顺序治不好，
解构又会在模块尚未加载时拿到 undefined。改成运行时查找最稳。
"""
import re, pathlib

ROOT = pathlib.Path('/workspace/pdf-page-extractor/src')
files = sorted(ROOT.rglob('*.js'))

# 收集所有导出名
exports = set()
for f in files:
    t = f.read_text(encoding='utf-8')
    m = re.search(r'Object\.assign\(PDFX, \{([^}]+)\}\);', t)
    if m:
        exports |= {x.strip() for x in m.group(1).split(',') if x.strip()}

print(f'导出符号 {len(exports)} 个')

total = 0
for f in files:
    t = f.read_text(encoding='utf-8')
    m = re.search(r'Object\.assign\(PDFX, \{([^}]+)\}\);', t)
    own = {x.strip() for x in m.group(1).split(',')} if m else set()

    # 删掉所有解构行
    t = re.sub(r'\n  const \{[^}]+\} = PDFX;', '', t)

    # 只替换代码部分（保留注释原样）
    parts = re.split(r'(/\*[\s\S]*?\*/|//[^\n]*)', t)
    changed = 0
    for i in range(0, len(parts), 2):          # 偶数下标是代码
        seg = parts[i]
        for name in exports:
            if name in own:
                continue
            pat = r'(?<![\w$.])' + re.escape(name) + r'(?![\w$])'
            seg, n = re.subn(pat, 'PDFX.' + name, seg)
            changed += n
        parts[i] = seg
    t = ''.join(parts)

    f.write_text(t, encoding='utf-8')
    if changed:
        print(f'  {f.relative_to(ROOT.parent)}: 改写 {changed} 处')
    total += changed

print(f'\n共改写 {total} 处引用')

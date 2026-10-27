#!/usr/bin/env python3
"""扫描各模块实际用到但未解构的全局名，自动补上 `const { ... } = PDFX;`。"""
import re, pathlib, sys

ROOT = pathlib.Path('/workspace/pdf-page-extractor/src')
files = sorted(ROOT.rglob('*.js'))

# 1. 收集每个模块导出的名字
exports = {}
for f in files:
    t = f.read_text(encoding='utf-8')
    m = re.search(r'Object\.assign\(PDFX, \{([^}]+)\}\);', t)
    if not m:
        continue
    for n in m.group(1).split(','):
        n = n.strip()
        if n:
            exports[n] = f

print(f'共 {len(exports)} 个导出符号，来自 {len(files)} 个文件')

# 2. 逐文件补齐依赖
fixed = 0
for f in files:
    t = f.read_text(encoding='utf-8')
    m = re.search(r'Object\.assign\(PDFX, \{([^}]+)\}\);', t)
    own = set(x.strip() for x in m.group(1).split(',')) if m else set()

    destructured = set()
    for dm in re.finditer(r'const \{([^}]+)\} = PDFX;', t):
        destructured |= {x.strip() for x in dm.group(1).split(',')}

    # 去掉注释再找引用
    code = re.sub(r'/\*[\s\S]*?\*/', '', t)
    code = re.sub(r'//[^\n]*', '', code)

    need = set()
    for name in exports:
        if name in own or name in destructured:
            continue
        if re.search(r'(?<![\w$])' + re.escape(name) + r'(?![\w$])', code):
            need.add(name)

    if not need:
        continue

    lines = [f'  const {{ {", ".join(sorted(need))} }} = PDFX;']
    # 插到 'use strict'; 之后
    t2 = t.replace("  'use strict';\n", "  'use strict';\n" + lines[0] + "\n", 1)
    if t2 == t:
        print(f'  !! {f.name}: 找不到插入点')
        continue
    f.write_text(t2, encoding='utf-8')
    print(f'  {f.relative_to(ROOT.parent)}: 补 {len(need)} 个 -> {", ".join(sorted(need))[:70]}')
    fixed += 1

print(f'\n共修正 {fixed} 个文件')

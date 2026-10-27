#!/usr/bin/env python3
"""生成 src/main.js 入口：抽取 init / cvInit，挂载到 window 并监听 DOMContentLoaded。"""
import re, pathlib

ROOT = pathlib.Path('/workspace/pdf-page-extractor')


def grab(path, name):
    lines = (ROOT / path).read_text(encoding='utf-8').split('\n')
    start = None
    for i, ln in enumerate(lines):
        if re.match(r'^(?:async\s+)?function\s+' + name + r'\b', ln):
            start = i
            break
    if start is None:
        raise SystemExit(f'{path}: 找不到 {name}')
    end = len(lines)
    for j in range(start + 1, len(lines)):
        if (re.match(r'^(?:async\s+)?function\s+\w+', lines[j])
                or re.match(r'^document\.addEventListener', lines[j])):
            end = j
            break
    return '\n'.join(lines[start:end]).rstrip()


HEADER = '''/* main —— 入口：初始化、事件挂载、把 API 暴露到 window 供 HTML 的 onclick 使用 */
(function (PDFX) {
  'use strict';

'''

FOOTER = '''

  Object.assign(PDFX, { init, cvInit });

  // HTML 里大量 onclick="xxx()"，统一把模块 API 挂到 window
  Object.assign(window, PDFX);

  document.addEventListener('DOMContentLoaded', () => {
    init();
    cvInit();
  });
})(window.PDFX = window.PDFX || {});
'''


def main():
    out = HEADER + grab('app.js', 'init') + '\n\n' + grab('convert.js', 'cvInit') + FOOTER
    (ROOT / 'src/main.js').write_text(out, encoding='utf-8')
    print(f'  src/main.js  {len(out.splitlines())} 行')


if __name__ == '__main__':
    main()

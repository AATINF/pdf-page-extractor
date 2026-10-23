#!/usr/bin/env python3
"""把 v3 视觉方案应用到 index.html 与 app.js（每处替换都断言唯一匹配）。"""
import pathlib, sys

ROOT = pathlib.Path('/workspace/pdf-page-extractor')
errors = []

def rep(text, old, new, name):
    n = text.count(old)
    if n != 1:
        errors.append(f'[{name}] 匹配 {n} 次（期望 1）')
        return text
    print(f'  OK  {name}')
    return text.replace(old, new)

# ---------------- 图标 sprite ----------------
SPRITE = '''<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">
<symbol id="i-doc" viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6"/><path d="M9 17h4"/></symbol>
<symbol id="i-doc-plus" viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M12 12v6"/><path d="M9 15h6"/></symbol>
<symbol id="i-folder" viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></symbol>
<symbol id="i-merge" viewBox="0 0 24 24"><rect x="3" y="3" width="12" height="15" rx="2"/><path d="M8 21h9a2 2 0 0 0 2-2V9"/></symbol>
<symbol id="i-check" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></symbol>
<symbol id="i-check-square" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8 12l3 3 5-6"/></symbol>
<symbol id="i-rotate" viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></symbol>
<symbol id="i-eye" viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="2.8"/></symbol>
<symbol id="i-chevron" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></symbol>
<symbol id="i-x" viewBox="0 0 24 24"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></symbol>
<symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14"/><path d="M5 12h14"/></symbol>
<symbol id="i-minus" viewBox="0 0 24 24"><path d="M5 12h14"/></symbol>
<symbol id="i-gear" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></symbol>
</svg>'''

SVG_STYLE = '''
/* ---------- 图标统一线性风格 ---------- */
.h-icon svg,.tab svg,.chip svg,.mbtn svg,.dz-cta svg,.card-top svg,
.detail-settings summary svg,.filebar svg,.btn svg{
  fill:none;stroke:currentColor;stroke-width:1.8;
  stroke-linecap:round;stroke-linejoin:round;
}
.card-top .check svg{stroke-width:2.6}
/* 空状态里的链接入口 */
#urlRow{
  margin-top:26px;width:100%;max-width:340px;
  padding-top:18px;border-top:1px solid var(--line);
}
#urlRow p{font-size:12px!important;color:var(--text-3)!important;margin:0 0 8px!important}
#urlRow .row{justify-content:center}
'''

# ---------------- index.html ----------------
p = ROOT / 'index.html'
html = p.read_text(encoding='utf-8')

css = ((ROOT / 'tools/style-v3-a.css').read_text(encoding='utf-8')
       + '\n' + (ROOT / 'tools/style-v3-b.css').read_text(encoding='utf-8')
       + SVG_STYLE)
i, j = html.find('<style>'), html.find('</style>')
if i < 0 or j < i:
    sys.exit('找不到 style 块')
html = html[:i] + '<style>\n' + css + '\n</style>' + html[j + 8:]
print('  OK  style 块整体替换')

html = rep(html, '<body>\n', '<body>\n\n' + SPRITE + '\n', 'sprite')

html = rep(html, '''<header>
  <h1>📄 PDF 页面提取器 <span class="badge" id="verTag">v1.0.0</span></h1>''',
'''<header>
  <div class="h-icon"><svg viewBox="0 0 24 24"><use href="#i-doc"/></svg></div>
  <h1>PDF 页面提取器 <span class="badge" id="verTag">v1.0.0</span></h1>''', 'header')

html = rep(html, '''  <button class="tab active" id="tabSingle" onclick="switchMode('single')">提取页面</button>
  <button class="tab" id="tabMerge" onclick="switchMode('merge')">合并 PDF</button>''',
'''  <button class="tab active" id="tabSingle" onclick="switchMode('single')"><svg viewBox="0 0 24 24"><use href="#i-doc"/></svg>提取页面</button>
  <button class="tab" id="tabMerge" onclick="switchMode('merge')"><svg viewBox="0 0 24 24"><use href="#i-merge"/></svg>合并 PDF</button>''', 'tabs')

html = rep(html, '''      <div class="big">📂</div>
      <p><b>点击选择 PDF 文件</b></p>
      <p class="dz-tip">或拖拽到此处 · 支持打开本地文件</p>''',
'''      <div class="dz-icon"><svg viewBox="0 0 24 24"><use href="#i-doc-plus"/></svg></div>
      <p class="dz-title">选择一个 PDF 文件</p>
      <p class="dz-desc">勾选任意页面提取为新 PDF，也可以拆分单页、多文件合并</p>
      <button class="dz-cta" onclick="event.stopPropagation();document.getElementById('fileInput').click()"><svg viewBox="0 0 24 24"><use href="#i-folder"/></svg>选择 PDF</button>
      <p class="dz-foot">全程在本机处理 · 文件不会上传</p>''', 'dropzone')

html = rep(html, '''        <button class="chip" onclick="selectAll()">☑ 全选</button>
        <button class="chip" onclick="selectNone()">全不选</button>
        <button class="chip" onclick="invertSelect()">反选</button>
        <button class="chip" onclick="rotateSelected()">⟳ 旋转90°(选中页)</button>''',
'''        <button class="chip" onclick="selectAll()"><svg viewBox="0 0 24 24"><use href="#i-check-square"/></svg>全选</button>
        <button class="chip" onclick="selectNone()">全不选</button>
        <button class="chip" onclick="invertSelect()">反选</button>
        <button class="chip" onclick="rotateSelected()"><svg viewBox="0 0 24 24"><use href="#i-rotate"/></svg>旋转 90°</button>''', 'chips')

html = rep(html, '<summary>⚙️ 高级设置（加密 / 图片化输出时生效）</summary>',
           '<summary><svg viewBox="0 0 24 24"><use href="#i-chevron"/></svg>高级设置（加密 / 图片化输出时生效）</summary>', 'summary')

html = rep(html, '''    <button class="mbtn" onclick="closePreview()">✕</button>
    <span class="m-title" id="pvTitle">预览</span>
    <button class="mbtn" onclick="pvZoom(-1)">－</button>
    <button class="mbtn" onclick="pvZoom(1)">＋</button>
    <button class="mbtn" onclick="pvRotate()">⟳</button>''',
'''    <button class="mbtn" onclick="closePreview()"><svg viewBox="0 0 24 24"><use href="#i-x"/></svg></button>
    <span class="m-title" id="pvTitle">预览</span>
    <button class="mbtn" onclick="pvZoom(-1)"><svg viewBox="0 0 24 24"><use href="#i-minus"/></svg></button>
    <button class="mbtn" onclick="pvZoom(1)"><svg viewBox="0 0 24 24"><use href="#i-plus"/></svg></button>
    <button class="mbtn" onclick="pvRotate()"><svg viewBox="0 0 24 24"><use href="#i-rotate"/></svg></button>''', 'preview-btns')

p.write_text(html, encoding='utf-8')

# ---------------- app.js ----------------
p2 = ROOT / 'app.js'
js = p2.read_text(encoding='utf-8')
js = rep(js, """      '<span class="check">✓</span>' +
      '<span class="pno">' + n + '</span>' +
      '<button class="eye" data-act="preview" title="预览">👁</button>' +""",
"""      '<span class="check"><svg viewBox="0 0 24 24"><use href="#i-check"/></svg></span>' +
      '<span class="pno">' + n + '</span>' +
      '<button class="eye" data-act="preview" title="预览"><svg viewBox="0 0 24 24"><use href="#i-eye"/></svg></button>' +""", 'makeCard-icons')
p2.write_text(js, encoding='utf-8')

if errors:
    print('\n失败:')
    for e in errors:
        print(' ', e)
    sys.exit(1)
print('\n全部替换完成')

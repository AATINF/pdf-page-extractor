#!/usr/bin/env python3
"""
把 app.js / convert.js 拆成模块。

做法：
  1. 扫描顶层声明（function / const / let / var）的起始行，确定每个块的边界
  2. 按预设映射把块分配到目标文件
  3. 每个文件用 IIFE 包裹，依赖通过 PDFX 解构，导出挂回 PDFX
"""
import re, pathlib, sys

ROOT = pathlib.Path('/workspace/pdf-page-extractor')
SRC = {'app.js': ROOT / 'app.js', 'convert.js': ROOT / 'convert.js'}

# 模块 -> [(源文件, 声明名)]，声明名可以是函数名或常量名
PLAN = {
    'src/core/query.js': [('app.js', n) for n in ['$', '$$']],
    'src/core/env.js': [('app.js', n) for n in ['ANN_ENABLE', 'IS_SINGLE_FILE', 'PDF_OPTS', 'state']],
    'src/core/dom.js': [('app.js', n) for n in ['esc', 'toast', 'showBusy', 'hideBusy']],
    'src/core/format.js': [('app.js', n) for n in ['fileNameBase', 'rangesOf', 'parseCsv']]
                          + [('convert.js', 'fmtSize')],
    'src/core/storage.js': [('app.js', n) for n in ['SETTINGS_KEY', 'loadSettings', 'saveSettings']],
    'src/core/history.js': [('app.js', n) for n in ['HISTORY_KEY', 'HISTORY_MAX', 'loadHistory',
                                                    'addHistory', 'clearHistory', 'openHistory',
                                                    'closeHistory', 'renderHistory', 'historyAction']],
    'src/core/layout.js': [('app.js', n) for n in ['syncBottomBar', 'updateBottomBar', 'updateToolState', 'switchMode']],
    'src/core/controls.js': [('convert.js', n) for n in ['segValue', 'setSeg', 'readTargetKB']],
    'src/core/image.js': [('convert.js', n) for n in ['canvasBlob', 'loadImage', 'imageToCanvas',
                                                      'encodeUnderTarget']],
    'src/core/cancel.js': [('convert.js', n) for n in ['cvCancel', 'cvCheckCancel',
                                                       'cvRequestCancel', 'cvResetCancel']],
    'src/features/export.js': [('app.js', n) for n in ['download', 'doDownload', 'nameResolver',
                                                       'askFileName', 'finishNameDialog',
                                                       'blobToBase64', 'lastSaved', 'saveViaNative',
                                                       'showSaveSheet', 'closeSaveSheet',
                                                       'openSaved', 'shareSaved',
                                                       'askNameEnabled', 'openSettings',
                                                       'closeSettings', 'toggleAskName']],
    'src/features/document.js': [('app.js', n) for n in ['setupPdfjsWorker', 'onPickFile', 'openFile',
                                                         'openBytes', 'askPasswordAndRetry', 'openUrl',
                                                         'buildSingleView', 'makeCard', 'thumbQueue',
                                                         'thumbRunning', 'THUMB_CONCURRENCY',
                                                         'queueThumb', 'pumpThumbQueue',
                                                         'resetThumbQueue', 'renderThumb']],
    'src/features/selection.js': [('app.js', n) for n in ['IS_APP', 'toggleSelect', 'addToSelection',
                                                          'initAppShell',
                                                          'setupBackButton',
                                                          'selectAll', 'selectNone', 'invertSelect',
                                                          'toggleReverse', 'rotateSelected',
                                                          'addRange', 'addCustom']],
    'src/features/preview.js': [('app.js', n) for n in ['openPreview', 'openPdfPreview',
                                                        'openImagePreview', 'previewMergeFile',
                                                        'applyPreviewMode', 'pvStep',
                                                        'renderImagePreview', 'closePreview',
                                                        'pvZoom', 'pvRotate', 'bindPreviewSwipe',
                                                        'renderPreview', 'pvTouch']],
    'src/features/extract.js': [('app.js', n) for n in ['rasterSettings', 'renderPageToImage',
                                                        'addRasterPage', 'rasterPageBytes',
                                                        'extractVector', 'selectionOrder',
                                                        'extractPdf', 'splitZip']],
    'src/features/merge.js': [('app.js', n) for n in ['onMergeFiles', 'renderMergeList', 'mergeAll']],
    'src/features/convert.js': [('convert.js', n) for n in ['cv', 'cvLoadPdf', 'cvExportImages',
                                                            'cvAddImages', 'bindDragSort',
                                                            'cvPreviewPdf', 'cvRenderImgList',
                                                            'cvMakePdf']],
    'src/features/compress.js': [('convert.js', n) for n in ['cvLoadCmpPdf', 'rasterizePdf',
                                                             'pagesToPdf', 'detectPdfKind',
                                                             'renderPageThumb', 'showCompare',
                                                             'closeCompare', 'CMP_CFG',
                                                             'losslessSave', 'cvCompressPdf',
                                                             'cmpRenderImgList',
                                                             'cvCompressImages']],
    'src/features/prefs.js': [('convert.js', n) for n in ['PERSIST_SEGS', 'PERSIST_INPUTS',
                                                          'restoreSettings', 'bindSettingsPersist']],
    'src/ui/dialogs.js': [('app.js', n) for n in ['dlgResolve', 'dlgBusyMsg',
                                                  'showDialog', 'finishDialog', 'bindDrag']],
}


def scan_blocks(path):
    """返回 {name: (start_line, end_line)}，行号从 0 开始。"""
    lines = path.read_text(encoding='utf-8').split('\n')
    marks = []
    for i, ln in enumerate(lines):
        m = (re.match(r'^(?:async\s+)?function\s+([\w$]+)', ln)
             or re.match(r'^(?:const|let|var)\s+([\w$]+)\s*=', ln))
        if m:
            marks.append((i, m.group(1)))
    def back_to_comment(pos):
        while pos > 0 and lines[pos - 1].strip().startswith(('*', '/**', '//', '*/')):
            pos -= 1
        return pos

    blocks = {}
    for idx, (start, name) in enumerate(marks):
        # 终点退到下一个声明的注释之前，注释归下一块
        end = back_to_comment(marks[idx + 1][0]) if idx + 1 < len(marks) else len(lines)
        # 把紧贴在上方的注释块一并算进来，避免注释和函数被拆到两个文件
        s = back_to_comment(start)
        blocks[name] = (s, end)
    return lines, blocks


def main():
    sources = {}
    for name, path in SRC.items():
        sources[name] = scan_blocks(path)

    all_names = set()
    for f, (_, blocks) in sources.items():
        all_names |= set(blocks.keys())

    # 生成每个模块
    for target, entries in PLAN.items():
        chunks = []
        used_names = []
        for src, decl in entries:
            lines, blocks = sources[src]
            if decl not in blocks:
                sys.exit(f'{target}: 在 {src} 找不到声明 {decl}')
            s, e = blocks[decl]
            body = '\n'.join(lines[s:e]).rstrip()
            chunks.append(body)
            used_names.append(decl)

        text = '\n\n'.join(chunks)

        # 依赖：函数体里出现、但不属于本模块的其他全局名
        code_only = re.sub(r'/\*[\s\S]*?\*/', '', text)
        code_only = re.sub(r'//[^\n]*', '', code_only)
        deps = sorted(n for n in all_names
                      if n not in used_names
                      and re.search(r'(?<![.\w$])' + re.escape(n) + r'\b', code_only))

        out = []
        out.append('/* ' + target.replace('src/', '').replace('.js', '') + ' —— 见文件末尾导出 */')
        out.append('(function (PDFX) {')
        out.append("  'use strict';")
        if deps:
            # 分批解构，避免单行过长
            for i in range(0, len(deps), 4):
                out.append('  const { ' + ', '.join(deps[i:i + 4]) + ' } = PDFX;')
        out.append('')
        out.append(text)
        out.append('')
        out.append('  Object.assign(PDFX, { ' + ', '.join(used_names) + ' });')
        out.append('})(window.PDFX = window.PDFX || {});')
        out.append('')

        p = ROOT / target
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text('\n'.join(out), encoding='utf-8')
        print(f'  {target:34s} {len(used_names):2d} 项  {len(deps):2d} 个依赖  {len(text.splitlines()):4d} 行')

if __name__ == '__main__':
    main()

/* core/env —— 见文件末尾导出 */
(function (PDFX) {
  'use strict';

/**
 * 渲染页面时的注释/表单模式。
 * PDF.js 默认不绘制表单域（AcroForm），证书、合同、填好的表格会变成空白，
 * 必须显式开启。ENABLE = 1，兼容旧版没有 AnnotationMode 枚举的情况。
 */
const ANN_ENABLE = (typeof pdfjsLib !== 'undefined' && pdfjsLib.AnnotationMode)
  ? pdfjsLib.AnnotationMode.ENABLE
  : 1;

/**
 * 单文件版把所有资源内联进 HTML，没有 lib/ 目录，也就没有 cMap 文件。
 * 通过检测外链脚本判断当前是不是单文件版。
 */
const IS_SINGLE_FILE = !document.querySelector('script[src*="pdf.min.js"]');

/**
 * 打开 PDF 的统一参数。
 *
 * cMapUrl 很关键：中文 PDF 常用 CID 编码（UniGB-UTF16-H 等），
 * 若字体没有嵌入，PDF.js 必须靠 cMap 文件做字符映射，否则整页中文是空白。
 * 单文件版没有这些文件，只能跳过（该场景下会退化成原来的行为）。
 */
const PDF_OPTS = Object.assign(
  { isEvalSupported: false },
  IS_SINGLE_FILE ? {} : { cMapUrl: './lib/cmaps/', cMapPacked: true }
);

/**
 * 全局运行状态对象。
 * - bytes：当前打开的 PDF 原始字节（Uint8Array）
 * - doc：pdf.js 解析出的文档对象，用于缩略图、预览与图片化输出
 * - pdfLibDoc：pdf-lib 加载的文档对象，用于矢量提取（加密文件为空）
 * - selection：已勾选的页码集合（从 1 开始）
 * - rotation：页码 -> 累计旋转角度（0/90/180/270）
 * - mergeFiles：合并模式下已添加的文件列表
 */
const state = {
  bytes: null,          // 原始文件 (Uint8Array)
  fileName: '',
  doc: null,            // pdf.js 文档（用于预览/渲染）
  task: null,
  numPages: 0,
  pdfLibDoc: null,      // pdf-lib 文档（用于矢量提取），加密时为空
  encrypted: false,
  selection: new Set(), // 选中的页码（1 起）
  rotation: new Map(),  // 页码 -> 累计旋转角度
  reverse: false,
  mode: 'single',
  mergeFiles: [],       // {name, bytes, pdfLibDoc}
  preview: null,        // {page, zoom}
  io: null,
};

/* ---------------- 工具函数 ---------------- */

  Object.assign(PDFX, { ANN_ENABLE, IS_SINGLE_FILE, PDF_OPTS, state });
})(window.PDFX = window.PDFX || {});

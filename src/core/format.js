/* core/format —— 见文件末尾导出 */
(function (PDFX) {
  'use strict';

/**
 * 从文件名中剥离 .pdf 后缀，作为输出文件名的基底。
 * @param {string} name 原文件名
 * @returns {string} 去掉扩展名后的名称
 */
function fileNameBase(name) { return (name || 'output').replace(/\.pdf$/i, '') || 'output'; }

/**
 * 把页码集合压缩成 "1-3,5,8-10" 这类紧凑区间表达，用于提示与命名。
 * @param {Set<number>|number[]} nums 页码集合
 * @returns {string} 压缩后的页码区间字符串
 */
function rangesOf(nums) {
  const a = [...nums].sort((x, y) => x - y);
  if (!a.length) return '';
  const parts = [];
  let s = a[0], p = a[0];
  // 遍历有序页码，把连续的一段合并为 "起-止"，其余单页独立列出
  for (let i = 1; i <= a.length; i++) {
    if (a[i] === p + 1) { p = a[i]; continue; }
    parts.push(s === p ? String(s) : `PDFX.${s}-PDFX.${p}`);
    s = p = a[i];
  }
  return parts.join(',');
}

/**
 * 解析 "1-3, 5, 8-10" 这类自定义页码字符串，兼容中文逗号与多种连接符。
 * @param {string} s 用户输入的页码文本
 * @returns {number[]} 落在合法页码范围内的页码数组
 */
function parseCsv(s) {
  const out = new Set();
  String(s).split(/[,，;；\s]+/).forEach(part => {
    // 支持 "2-5"、"2～5"、"2至5" 等连续区间写法
    const m = part.match(/^(\d+)\s*[-–—~至]\s*(\d+)PDFX.$/);
    if (m) {
      const a = +m[1], b = +m[2];
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) out.add(i);
    } else if (/^\d+PDFX.$/.test(part)) {
      out.add(+part);
    }
  });
  // 过滤掉超出文档范围的页码
  return [...out].filter(n => n >= 1 && n <= PDFX.state.numPages);
}

/* ---------------- PDF.js worker（内联，保证 file:// 离线可用） ---------------- */

/** 字节数转人类可读。 */
function fmtSize(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(2) + ' MB';
}

  Object.assign(PDFX, { fileNameBase, rangesOf, parseCsv, fmtSize });
})(window.PDFX = window.PDFX || {});

/* core/query —— 见文件末尾导出 */
(function (PDFX) {
  'use strict';

/**
 * DOM 快捷查询：返回匹配选择器的第一个元素。
 * @param {string} s CSS 选择器
 * @returns {Element|null}
 */
const $  = s => document.querySelector(s);

/**
 * DOM 快捷查询：返回匹配选择器的全部元素。
 * @param {string} s CSS 选择器
 * @returns {Element[]}
 */
const $$ = s => Array.from(document.querySelectorAll(s));

  Object.assign(PDFX, { $, $$ });
})(window.PDFX = window.PDFX || {});

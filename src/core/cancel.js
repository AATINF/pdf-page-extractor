/* core/cancel —— 见文件末尾导出 */
(function (PDFX) {
  'use strict';

const cvCancel = { flag: false };

/** 在耗时循环里调用；用户点过取消就抛出，由上层统一收尾。 */
function cvCheckCancel() {
  if (cvCancel.flag) {
    cvCancel.flag = false;
    const err = new Error('CANCELLED');
    err.cancelled = true;
    throw err;
  }
}

function cvRequestCancel() {
  cvCancel.flag = true;
  const btn = PDFX.$('#busyCancel');
  if (btn) btn.textContent = '正在取消…';
}

function cvResetCancel() {
  cvCancel.flag = false;
  const btn = PDFX.$('#busyCancel');
  if (btn) { btn.textContent = '取消'; btn.classList.add('hidden'); }
}

/* ---------------- 初始化 ---------------- */

  Object.assign(PDFX, { cvCancel, cvCheckCancel, cvRequestCancel, cvResetCancel });
})(window.PDFX = window.PDFX || {});

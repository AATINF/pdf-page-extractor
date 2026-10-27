/* core/dom —— 见文件末尾导出 */
(function (PDFX) {
  'use strict';

/**
 * HTML 转义，防止文件名等用户内容注入页面结构。
 * @param {*} s 原始文本
 * @returns {string} 转义后的文本
 */
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/**
 * 弹出轻提示（Toast），自动在指定时长后消失。
 * @param {string} msg 提示文案
 * @param {number} ms 显示时长（毫秒）
 */
function toast(msg, ms = 2400) {
  const t = PDFX.$('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), ms);
}

/** 显示全屏处理中遮罩。@param {string} text 进度文案 */
function showBusy(text, canCancel) {
  PDFX.$('#busyText').textContent = text || '处理中…';
  const btn = PDFX.$('#busyCancel');
  if (btn) {
    btn.classList.toggle('hidden', !canCancel);
    if (canCancel) btn.textContent = '取消';
  }
  PDFX.$('#busy').classList.remove('hidden');
}

/** 隐藏全屏处理中遮罩。 */
function hideBusy() {
  PDFX.$('#busy').classList.add('hidden');
  const btn = PDFX.$('#busyCancel');
  if (btn) btn.classList.add('hidden');
  if (typeof PDFX.cvResetCancel === 'function') PDFX.cvResetCancel();
}

  Object.assign(PDFX, { esc, toast, showBusy, hideBusy });
})(window.PDFX = window.PDFX || {});

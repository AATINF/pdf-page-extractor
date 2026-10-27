/* ui/dialogs —— 见文件末尾导出 */
(function (PDFX) {
  'use strict';

let dlgResolve = null;

let dlgBusyMsg = null;

/**
 * 弹出可输入对话框（兼容 iOS 不支持原生 prompt 的限制）。
 * @param {{title?: string, message?: string, placeholder?: string, okText?: string, password?: boolean}} opts 对话框配置
 * @returns {Promise<string|null>} 用户输入内容；取消时为 null
 */
function showDialog(opts) {
  // 忙碌遮罩层级高于对话框，弹对话框前先隐藏（关闭时恢复）
  if (!PDFX.$('#busy').classList.contains('hidden')) {
    dlgBusyMsg = PDFX.$('#busyText').textContent;
    PDFX.hideBusy();
  }
  PDFX.$('#dlgTitle').textContent = opts.title || '输入';
  PDFX.$('#dlgMsg').textContent = opts.message || '';
  PDFX.$('#dlgMsg').classList.toggle('hidden', !opts.message);
  const inp = PDFX.$('#dlgInput');
  inp.value = '';
  inp.placeholder = opts.placeholder || '';
  inp.type = opts.password === false ? 'text' : 'password';
  PDFX.$('#dlgOk').textContent = opts.okText || '确定';
  PDFX.$('#dialog').classList.remove('hidden');
  setTimeout(() => inp.focus(), 60);
  return new Promise(resolve => { dlgResolve = resolve; });
}

/**
 * 结束对话框并返回结果：隐藏弹窗、恢复被隐藏的忙碌遮罩、解析 Promise。
 * @param {string|null} v 用户输入或 null（取消）
 */
function finishDialog(v) {
  if (!dlgResolve) return;
  const r = dlgResolve;
  dlgResolve = null;
  PDFX.$('#dialog').classList.add('hidden');
  if (dlgBusyMsg) { PDFX.showBusy(dlgBusyMsg); dlgBusyMsg = null; }
  r(v);
}

/* ---------------- 拖拽 & 初始化 ---------------- */

/**
 * 为文件选择区域绑定拖拽打开能力（桌面端便利功能）。
 * @param {HTMLElement} dz 拖拽目标元素
 */
function bindDrag(dz) {
  ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('hover'); }));
  ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('hover'); }));
  dz.addEventListener('drop', e => {
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) PDFX.openFile(f);
  });
}

  Object.assign(PDFX, { dlgResolve, dlgBusyMsg, showDialog, finishDialog, bindDrag });
})(window.PDFX = window.PDFX || {});

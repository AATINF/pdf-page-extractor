/* core/layout —— 见文件末尾导出 */
(function (PDFX) {
  'use strict';

/**
 * 同步底栏状态：把实际高度写进 CSS 变量 --bb-h，并按可见性切换 body.has-bb。
 * 底栏会随屏宽换行而变高，所以不能用固定值，必须实测。
 */
function syncBottomBar() {
  const bb = PDFX.$('#bottombar');
  const visible = !!bb && !bb.classList.contains('hidden');
  const h = visible ? bb.offsetHeight : 0;
  document.documentElement.style.setProperty('--bb-h', h + 'px');
  document.body.classList.toggle('has-bb', visible);
}

/**
 * 刷新底部操作栏：显示已选页数、所选页码摘要，并控制提取/拆分按钮可用性。
 */
function updateBottomBar() {
  const n = PDFX.state.selection.size;
  PDFX.$('#selCount').textContent = n + ' / ' + PDFX.state.numPages;
  PDFX.$('#extractBtn').disabled = n === 0;
  PDFX.$('#splitBtn').disabled = n === 0;
  const r = PDFX.rangesOf(PDFX.state.selection);
  PDFX.$('#rangeHint').textContent = n ? ('已选 ' + n + ' 页 · ' + r) : '未选择页面';
  PDFX.$('#rangeHint2').textContent = r || '未选择页面';
  updateToolState();
  syncBottomBar();
}

/* ---------------- 选择工具 ---------------- */

/**
 * 同步工具条状态：旋转按钮的可用性与文案、倒序开关的开关态。
 */
function updateToolState() {
  const n = PDFX.state.selection.size;
  const btn = PDFX.$('#rotateBtn');
  const label = PDFX.$('#rotateLabel');
  if (btn) btn.disabled = n === 0;
  if (label) {
    if (!n) {
      label.textContent = '旋转 90°';
    } else {
      const angles = [...state.selection].map(p => PDFX.state.rotation.get(p) || 0);
      const same = angles.every(a => a === angles[0]);
      label.textContent = same ? ('旋转至 ' + ((angles[0] + 90) % 360) + '°') : '旋转 90°';
    }
  }
  const sw = PDFX.$('#reverseSwitch');
  if (sw) sw.classList.toggle('on', !!PDFX.state.reverse);
}

/**
 * 切换"提取页面 / 合并 PDF"两种工作模式。
 * @param {string} m 模式名：single 或 merge
 */
function switchMode(m) {
  PDFX.state.mode = m;
  ['single', 'merge', 'convert', 'compress'].forEach(k => {
    const tab = PDFX.$('#tab' + k.charAt(0).toUpperCase() + k.slice(1));
    if (tab) tab.classList.toggle('active', m === k);
    const panel = PDFX.$('#panel' + k.charAt(0).toUpperCase() + k.slice(1));
    if (panel) panel.classList.toggle('hidden', m !== k);
  });
  // 转换/压缩模式不需要底部的选页工具条
  if (m === 'convert' || m === 'compress') {
    PDFX.$('#bottombar').classList.add('hidden');
  } else if (PDFX.state.numPages) {
    PDFX.$('#bottombar').classList.remove('hidden');
  }
  syncBottomBar();
}

  Object.assign(PDFX, { syncBottomBar, updateBottomBar, updateToolState, switchMode });
})(window.PDFX = window.PDFX || {});

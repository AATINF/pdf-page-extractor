/* features/selection —— 见文件末尾导出 */
(function (PDFX) {
  'use strict';

/**
 * 是否为 Capacitor 原生壳（安卓 App）环境。
 * 在浏览器里访问时为 false，所有逻辑保持原样。
 */
const IS_APP = !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());

/**
 * 点击卡片切换页面勾选状态，并同步底部已选计数。
 * @param {number} n 页码
 */
function toggleSelect(n) {
  const card = document.querySelector('.card[data-page="' + n + '"]');
  if (PDFX.state.selection.has(n)) {
    PDFX.state.selection.delete(n);
    if (card) card.classList.remove('sel');
  } else {
    PDFX.state.selection.add(n);
    if (card) card.classList.add('sel');
  }
  PDFX.updateBottomBar();
}

/**
 * 程序化添加一页到选择集合（用于范围/自定义页码批量添加）。
 * @param {number} n 页码
 */
function addToSelection(n) {
  if (n < 1 || n > PDFX.state.numPages || PDFX.state.selection.has(n)) return;
  PDFX.state.selection.add(n);
  const c = document.querySelector('.card[data-page="' + n + '"]');
  if (c) c.classList.add('sel');
  PDFX.updateBottomBar();
}

/**
 * App 环境专属调整：离线场景下隐藏"从链接打开"，避免误导用户以为能联网。
 */
function initAppShell() {
  if (!IS_APP) return;
  document.documentElement.classList.add('is-app');
  const urlRow = PDFX.$('#urlRow');
  if (urlRow) urlRow.classList.add('hidden');
  const tip = document.querySelector('.dz-tip');
  if (tip) tip.textContent = '从手机文件管理器选择';
}

/**
 * 安卓物理返回键：先关弹层，再清选中，最后才退出 App。
 * 不加这段的话，用户按返回会直接杀掉进程。
 */
function setupBackButton() {
  const App = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
  if (!IS_APP || !App) return;
  App.addListener('backButton', () => {
    if (!PDFX.$('#nameDialog').classList.contains('hidden')) { PDFX.finishNameDialog(false); return; }
    if (!PDFX.$('#settingsDialog').classList.contains('hidden')) { PDFX.closeSettings(); return; }
    if (!PDFX.$('#saveSheet').classList.contains('hidden')) { PDFX.closeSaveSheet(); return; }
    if (!PDFX.$('#previewModal').classList.contains('hidden')) { PDFX.closePreview(); return; }
    if (!PDFX.$('#dialog').classList.contains('hidden')) { PDFX.finishDialog(null); return; }
    if (PDFX.state.selection && PDFX.state.selection.size) { selectNone(); return; }
    App.exitApp();
  });
}

/** 全选所有页面。 */
function selectAll() {
  for (let i = 1; i <= PDFX.state.numPages; i++) PDFX.state.selection.add(i);
  PDFX.$$('#pageList .card').forEach(c => c.classList.add('sel'));
  PDFX.updateBottomBar();
}

/** 清空全部勾选。 */
function selectNone() {
  PDFX.state.selection.clear();
  PDFX.$$('#pageList .card').forEach(c => c.classList.remove('sel'));
  PDFX.updateBottomBar();
}

/** 反选：已选变未选、未选变已选，常用于快速保留除少数页之外的全部页面。 */
function invertSelect() {
  for (let i = 1; i <= PDFX.state.numPages; i++) {
    if (PDFX.state.selection.has(i)) PDFX.state.selection.delete(i); else PDFX.state.selection.add(i);
  }
  PDFX.$$('#pageList .card').forEach(c => c.classList.toggle('sel', PDFX.state.selection.has(+c.dataset.page)));
  PDFX.updateBottomBar();
}

/** 切换"倒序提取"开关状态。 */
function toggleReverse() {
  PDFX.state.reverse = !PDFX.state.reverse;
  PDFX.updateToolState();
}

/**
 * 为所有选中页追加一次 90 度旋转（可叠加到 360 度）。
 * 旋转记录在 state.rotation 中，预览与提取结果都会应用。
 */
function rotateSelected() {
  if (!PDFX.state.selection.size) { PDFX.toast('请先选择页面'); return; }
  const targets = [...state.selection];
  targets.forEach(n => PDFX.state.rotation.set(n, ((PDFX.state.rotation.get(n) || 0) + 90) % 360));
  // 立即重画这些页的缩略图，否则用户看不出旋转是否生效
  targets.forEach(n => {
    const card = document.querySelector('.card[data-page="' + n + '"]');
    if (card) PDFX.queueThumb(n, card);
  });
  PDFX.updateToolState();
  PDFX.toast('已旋转 ' + targets.length + ' 页');
  // 若预览窗口正显示被旋转的页面，立即刷新预览
  if (PDFX.state.preview && PDFX.state.selection.has(PDFX.state.preview.page)) PDFX.renderPreview();
}

/**
 * 按"起止页码"批量勾选连续页面。
 * 输入须满足 1 <= 起 <= 止 <= 总页数。
 */
function addRange() {
  const a = parseInt(PDFX.$('#rangeFrom').value, 10);
  const b = parseInt(PDFX.$('#rangeTo').value, 10);
  if (!a || !b || a > b || a < 1 || b > PDFX.state.numPages) {
    PDFX.toast('请输入 1 ~ ' + PDFX.state.numPages + ' 之间的起止页码');
    return;
  }
  for (let i = a; i <= b; i++) addToSelection(i);
  PDFX.toast('已添加第 ' + a + ' ~ ' + b + ' 页');
}

/**
 * 按"自定义页码"输入批量勾选，支持 1-3,5,8-10 等组合格式。
 */
function addCustom() {
  const nums = PDFX.parseCsv(PDFX.$('#customPages').value);
  if (!nums.length) { PDFX.toast('请输入页码，如 1-3, 5, 8-10'); return; }
  nums.forEach(addToSelection);
  PDFX.toast('已添加 ' + nums.length + ' 页');
}

/* ---------------- 预览 ---------------- */

  Object.assign(PDFX, { IS_APP, toggleSelect, addToSelection, initAppShell, setupBackButton, selectAll, selectNone, invertSelect, toggleReverse, rotateSelected, addRange, addCustom });
})(window.PDFX = window.PDFX || {});

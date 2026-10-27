/* core/storage —— 见文件末尾导出 */
(function (PDFX) {
  'use strict';

const SETTINGS_KEY = 'pdfextractor.settings';

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {};
  } catch (e) {
    return {};
  }
}

function saveSettings(patch) {
  const next = Object.assign(loadSettings(), patch);
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch (e) { /* 隐私模式忽略 */ }
  return next;
}

  Object.assign(PDFX, { SETTINGS_KEY, loadSettings, saveSettings });
})(window.PDFX = window.PDFX || {});

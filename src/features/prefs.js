/* features/prefs —— 见文件末尾导出 */
(function (PDFX) {
  'use strict';

// 分段控件 -> 设置键
const PERSIST_SEGS = [
  ['imgfmt2', 'fmt'],
  ['dpi', 'dpi'],
  ['cvscope', 'scope'],
  ['pagesize', 'pagesize'],
  ['cvmargin', 'cvmargin'],
  ['cmpmode', 'cmpmode'],
  ['cmpunit', 'cmpunit'],
  ['cmpimgunit', 'cmpimgunit']
];

// 数值输入 -> 设置键
const PERSIST_INPUTS = ['cmpTarget', 'cmpMaxSide', 'cmpQuality'];

/** 把上次保存的参数回填到界面。 */
function restoreSettings() {
  const s = PDFX.loadSettings();
  PERSIST_SEGS.forEach(([name, key]) => {
    const v = s['cv_' + key];
    if (!v) return;
    const seg = document.querySelector('.seg[data-name="' + name + '"]');
    if (seg) PDFX.setSeg(seg, v);
  });
  PERSIST_INPUTS.forEach(id => {
    const v = s['cv_' + id];
    if (v == null || v === '') return;
    const el = document.getElementById(id);
    if (!el) return;
    el.value = v;
    if (id === 'cmpQuality') {
      const lbl = PDFX.$('#cmpQualityVal');
      if (lbl) lbl.textContent = v;
    }
  });
}

/** 参数变化时写盘。 */
function bindSettingsPersist() {
  PERSIST_SEGS.forEach(([name, key]) => {
    const seg = document.querySelector('.seg[data-name="' + name + '"]');
    if (!seg) return;
    seg.addEventListener('click', () => {
      const v = PDFX.segValue(name, '');
      if (v) PDFX.saveSettings({ ['cv_' + key]: v });
    });
  });
  PERSIST_INPUTS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => PDFX.saveSettings({ ['cv_' + id]: el.value }));
  });
}

/* ---------------- 长任务取消 ---------------- */

  Object.assign(PDFX, { PERSIST_SEGS, PERSIST_INPUTS, restoreSettings, bindSettingsPersist });
})(window.PDFX = window.PDFX || {});

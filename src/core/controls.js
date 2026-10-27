/* core/controls —— 见文件末尾导出 */
(function (PDFX) {
  'use strict';

/** 读取分段控件当前选中的值。 */
function segValue(name, fallback) {
  const el = document.querySelector('.seg[data-name="' + name + '"] .seg-item.active');
  return el ? el.dataset.value : fallback;
}

/** 设置分段控件的选中项。 */
function setSeg(seg, value) {
  if (!seg) return;
  seg.querySelectorAll('.seg-item').forEach(b => {
    b.classList.toggle('active', b.dataset.value === value);
  });
}

/**
 * 读取"目标大小"输入框，按当前单位换算成 KB。
 * 返回 0 表示不限制。
 */
function readTargetKB(inputId, unitName) {
  const el = document.getElementById(inputId);
  if (!el) return 0;
  const v = parseFloat(el.value) || 0;
  if (v <= 0) return 0;
  return segValue(unitName, 'kb') === 'mb' ? v * 1024 : v;
}

  Object.assign(PDFX, { segValue, setSeg, readTargetKB });
})(window.PDFX = window.PDFX || {});

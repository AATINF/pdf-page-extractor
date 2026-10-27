/* features/preview —— 见文件末尾导出 */
(function (PDFX) {
  'use strict';

/**
 * 打开某一页的全屏预览弹窗。
 * @param {number} n 页码
 */
function openPreview(n) {
  openPdfPreview(PDFX.state.doc, '', n);
}

/**
 * 用任意 pdf.js 文档打开预览（合并 / 转换 / 压缩模式复用）。
 * @param {Object} doc pdf.js 文档对象
 * @param {string} name 显示在标题里的文件名，可为空
 * @param {number} page 起始页
 */
function openPdfPreview(doc, name, page, owned) {
  if (!doc) return;
  const total = doc.numPages || 1;
  const p = Math.max(1, Math.min(page || 1, total));
  // owned=true 表示这个文档是预览层自己创建的，关闭时要销毁；
  // 转换/压缩模式传进来的文档属于各自模块，不能在这里销毁
  PDFX.state.preview = { type: 'pdf', doc, page: p, zoom: 1, title: name || '', owned: !!owned };
  PDFX.$('#previewModal').classList.remove('hidden');
  applyPreviewMode();
  PDFX.$('#pvTitle').textContent =
    (name ? name + ' · ' : '') + '第 ' + p + ' / ' + total + ' 页';
  renderPreview();
}

/**
 * 打开图片预览（用于「图片 → PDF」「图片压缩」的列表）。
 * @param {Array} list 图片数组，元素需含 file / name
 * @param {number} index 起始下标
 */
function openImagePreview(list, index) {
  if (!list || !list.length) return;
  PDFX.state.preview = {
    type: 'image',
    list,
    index: Math.max(0, Math.min(index, list.length - 1)),
    zoom: 1,
    rotation: 0,
    url: null
  };
  PDFX.$('#previewModal').classList.remove('hidden');
  applyPreviewMode();
  renderPreview();
}

/**
 * 预览合并列表里的某一个文件。
 * 加密文件在 pdf.js 侧无法直接打开，先给提示。
 */
async function previewMergeFile(i) {
  const f = PDFX.state.mergeFiles[i];
  if (!f) return;
  if (!f.pdfLibDoc) { PDFX.toast('加密文件暂不支持预览', 2600); return; }
  try {
    PDFX.showBusy('正在打开预览…');
    const doc = await pdfjsLib.getDocument(Object.assign({ data: f.bytes.slice() }, PDFX.PDF_OPTS)).promise;
    PDFX.hideBusy();
    openPdfPreview(doc, f.name, 1, true);
  } catch (e) {
    PDFX.hideBusy();
    PDFX.toast('预览失败：' + (e.message || e), 3000);
  }
}

/** 按预览类型切换工具栏按钮、容器样式与计数器。 */
function applyPreviewMode() {
  const isImg = !!PDFX.state.preview && PDFX.state.preview.type === 'image';
  PDFX.$$('.pv-pdf-only').forEach(el => el.classList.toggle('hidden', isImg));
  PDFX.$$('.pv-img-only').forEach(el => el.classList.toggle('hidden', !isImg));
  PDFX.$('#pvCanvas').classList.toggle('hidden', isImg);
  PDFX.$('#pvImage').classList.toggle('hidden', !isImg);
  PDFX.$('#pvWrap').classList.toggle('img-mode', isImg);
  PDFX.$('#pvCounter').classList.toggle('hidden', !isImg);
}

/** 图片预览的上一张 / 下一张。 */
function pvStep(d) {
  const p = PDFX.state.preview;
  if (!p || p.type !== 'image') return;
  const next = p.index + d;
  if (next < 0 || next >= p.list.length) return;
  p.index = next;
  renderImagePreview();
}

function renderImagePreview() {
  const p = PDFX.state.preview;
  if (!p || p.type !== 'image') return;
  if (p.url) URL.revokeObjectURL(p.url);
  const item = p.list[p.index];
  const url = URL.createObjectURL(item.file);
  p.url = url;
  const img = PDFX.$('#pvImage');
  img.src = url;
  img.style.transform = '';
  PDFX.$('#pvTitle').textContent = item.name || '图片';
  PDFX.$('#pvCounter').textContent = (p.index + 1) + ' / ' + p.list.length;
}

/** 关闭全屏预览弹窗。 */
function closePreview() {
  const p = PDFX.state.preview;
  if (p && p.url) URL.revokeObjectURL(p.url);
  // 只销毁预览层自己创建的文档；转换/压缩/主文档都归各自模块管理
  if (p && p.owned && p.doc && p.doc.destroy) {
    try { p.doc.destroy(); } catch (e) { /* 忽略 */ }
  }
  PDFX.state.preview = null;
  PDFX.$('#previewModal').classList.add('hidden');
  PDFX.$('#pvImage').removeAttribute('src');
}

/**
 * 缩放预览：按方向调整倍率（限制在 0.4 ~ 4 倍之间）。
 * @param {number} d 1 放大、-1 缩小
 */
function pvZoom(d) {
  const p = PDFX.state.preview;
  if (!p) return;
  p.zoom = Math.min(4, Math.max(0.4, p.zoom * (d > 0 ? 1.3 : 1 / 1.3)));
  if (p.type === 'image') {
    PDFX.$('#pvImage').style.transform = 'scale(' + p.zoom + ') rotate(' + (p.rotation || 0) + 'deg)';
    return;
  }
  renderPreview();
}

/** 预览中旋转当前页 90 度，同步更新 rotation 记录。 */
function pvRotate() {
  const p = PDFX.state.preview;
  if (!p) return;
  if (p.type === 'image') {
    p.rotation = ((p.rotation || 0) + 90) % 360;
    PDFX.$('#pvImage').style.transform = 'scale(' + p.zoom + ') rotate(' + p.rotation + 'deg)';
    return;
  }
  const n = p.page;
  PDFX.state.rotation.set(n, ((PDFX.state.rotation.get(n) || 0) + 90) % 360);
  renderPreview();
}

/** 图片预览支持左右滑动切换。 */
function bindPreviewSwipe() {
  const wrap = PDFX.$('#pvWrap');
  if (!wrap) return;
  let sx = 0, sy = 0;
  wrap.addEventListener('touchstart', e => {
    if (!PDFX.state.preview || PDFX.state.preview.type !== 'image') return;
    sx = e.touches[0].clientX;
    sy = e.touches[0].clientY;
  }, { passive: true });
  wrap.addEventListener('touchend', e => {
    if (!PDFX.state.preview || PDFX.state.preview.type !== 'image') return;
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) pvStep(dx < 0 ? 1 : -1);
  }, { passive: true });
}

/**
 * 渲染全屏预览：按屏幕宽度自适应缩放，并应用该页的旋转设置。
 */
async function renderPreview() {
  const p = PDFX.state.preview;
  if (!p) return;
  if (p.type === 'image') { renderImagePreview(); return; }
  const doc = p.doc || PDFX.state.doc;   // 合并 / 转换 / 压缩 的预览用各自临时文档
  if (!doc) return;
  try {
    const page = await doc.getPage(p.page);
    const v1 = page.getViewport({ scale: 1 });
    // 先按屏宽适配，再叠加用户缩放倍率与页面旋转
    const fit = (window.innerWidth - 24) / v1.width;
    const vp = page.getViewport({ scale: fit * p.zoom, rotation: PDFX.state.rotation.get(p.page) || 0 });
    const canvas = PDFX.$('#pvCanvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width  = Math.floor(vp.width * dpr);
    canvas.height = Math.floor(vp.height * dpr);
    canvas.style.width = vp.width + 'px';
    canvas.style.height = vp.height + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    await page.render({ canvasContext: ctx, viewport: vp, annotationMode: PDFX.ANN_ENABLE }).promise;
    page.cleanup();
    PDFX.$('#pvWrap').scrollTop = 0;
  } catch (e) { /* 忽略预览渲染错误 */ }
}

// 滑动切换预览页：记录触摸起点，在 touchend 时判断横向滑动距离
let pvTouch = null;
PDFX.$('#pvWrap').addEventListener('touchstart', e => {
  pvTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
}, { passive: true });
PDFX.$('#pvWrap').addEventListener('touchend', e => {
  if (!pvTouch || !PDFX.state.preview) return;
  const dx = e.changedTouches[0].clientX - pvTouch.x;
  const dy = e.changedTouches[0].clientY - pvTouch.y;
  // 横向位移足够大且明显大于纵向时，视为翻页手势
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
    const next = PDFX.state.preview.page + (dx < 0 ? 1 : -1);
    if (next >= 1 && next <= PDFX.state.numPages) openPreview(next);
  }
  pvTouch = null;
}, { passive: true });

/* ---------------- 提取 ---------------- */

  Object.assign(PDFX, { openPreview, openPdfPreview, openImagePreview, previewMergeFile, applyPreviewMode, pvStep, renderImagePreview, closePreview, pvZoom, pvRotate, bindPreviewSwipe, renderPreview, pvTouch });
})(window.PDFX = window.PDFX || {});

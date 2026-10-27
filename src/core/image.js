/* core/image —— 见文件末尾导出 */
(function (PDFX) {
  'use strict';

/** canvas 转 Blob。 */
function canvasBlob(canvas, mime, quality) {
  return new Promise(resolve => canvas.toBlob(resolve, mime, quality));
}

/** 从图片文件读成 <img>，拿到原始宽高。 */
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    // 注意：不能在这里 revoke，否则后续 drawImage 可能拿不到像素数据。
    // 由调用方用完后再释放。
    img.onload = () => resolve({ img, url, w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片无法读取')); };
    img.src = url;
  });
}

/** 把任意图片画到 canvas（可缩放），返回 canvas。 */
async function imageToCanvas(file, maxSide) {
  const { img, url, w, h } = await loadImage(file);
  let tw = w, th = h;
  // 默认上限 4096px：手机相机的 8000px 原图直接画进 canvas 会吃掉几百 MB 内存
  const limit = maxSide || 4096;
  if (Math.max(w, h) > limit) {
    const k = limit / Math.max(w, h);
    tw = Math.round(w * k);
    th = Math.round(h * k);
  }
  const canvas = document.createElement('canvas');
  canvas.width = tw; canvas.height = th;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, tw, th);
  ctx.drawImage(img, 0, 0, tw, th);
  URL.revokeObjectURL(url);
  return canvas;
}

/** 二分搜索 JPEG 质量，使体积不超过 targetBytes。返回 { blob, quality }。 */
async function encodeUnderTarget(canvas, targetBytes, minQ) {
  minQ = minQ || 0.15;
  let lo = minQ, hi = 0.95, best = null;
  for (let i = 0; i < 7; i++) {
    const q = (lo + hi) / 2;
    const blob = await canvasBlob(canvas, 'image/jpeg', q);
    if (blob && blob.size <= targetBytes) { best = { blob, quality: q }; lo = q; }
    else hi = q;
  }
  if (!best) {
    const blob = await canvasBlob(canvas, 'image/jpeg', minQ);
    best = { blob, quality: minQ, oversize: !blob || blob.size > targetBytes };
  }
  return best;
}

/* ---------------- PDF → 图片 ---------------- */

  Object.assign(PDFX, { canvasBlob, loadImage, imageToCanvas, encodeUnderTarget });
})(window.PDFX = window.PDFX || {});

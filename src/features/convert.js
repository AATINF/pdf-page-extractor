/* features/convert —— 见文件末尾导出 */
(function (PDFX) {
  'use strict';

const cv = {
  pdfDoc: null, pdfBytes: null, pdfName: '', pdfPages: 0,
  cmpDoc: null, cmpBytes: null, cmpName: '', cmpPages: 0,
  images: [],      // 图片 → PDF：{ file, url, w, h, name, size }
  cmpImages: []    // 图片压缩：同上
};

/* ---------------- 通用小工具 ---------------- */

async function cvLoadPdf(file) {
  try {
    PDFX.showBusy('正在读取 PDF…');
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const size = bytes.length;
    // PDF.js 会把传入的 ArrayBuffer 转移给 worker，原 buffer 随即 detach，
    // 所以这里传副本，保留原数据供后续使用
    const doc = await pdfjsLib.getDocument(Object.assign({ data: bytes.slice() }, PDFX.PDF_OPTS)).promise;
    cv.pdfDoc = doc;
    cv.pdfBytes = bytes;
    cv.pdfName = file.name;
    cv.pdfPages = doc.numPages;
    PDFX.hideBusy();
    PDFX.$('#cvPdfName').textContent = file.name;
    PDFX.$('#cvPdfMeta').textContent = doc.numPages + ' 页 · ' + PDFX.fmtSize(size);
    PDFX.$('#cvPdfInfo').classList.remove('hidden');
    PDFX.toast('已读取：共 ' + doc.numPages + ' 页');
  } catch (e) {
    PDFX.hideBusy();
    if (e && e.name === 'PasswordException') {
      PDFX.toast('此 PDF 已加密。请先切到「提取」输入密码打开，再来转换', 4200);
      return;
    }
    PDFX.toast('读取失败：' + (e.message || e), 3600);
  }
}

async function cvExportImages() {
  if (!cv.pdfDoc) { PDFX.toast('请先选择一个 PDF'); return; }
  const fmt = PDFX.segValue('imgfmt2', 'jpeg');
  const scale = parseFloat(PDFX.segValue('dpi', '2')) || 2;
  const scope = PDFX.segValue('cvscope', 'all');
  const mime = fmt === 'png' ? 'image/png' : 'image/jpeg';

  let nums = [];
  if (scope === 'sel') {
    if (PDFX.state.selection && PDFX.state.selection.size) {
      nums = [...state.selection].sort((a, b) => a - b);
    } else {
      PDFX.toast('还没有在「提取」里选过页面，将导出全部', 3000);
      for (let i = 1; i <= cv.pdfPages; i++) nums.push(i);
    }
  } else {
    for (let i = 1; i <= cv.pdfPages; i++) nums.push(i);
  }

  try {
    const base = cv.pdfName.replace(/\.pdf$/i, '') || 'page';
    const items = [];
    for (let k = 0; k < nums.length; k++) {
      PDFX.cvCheckCancel();
      PDFX.showBusy('正在渲染 ' + (k + 1) + ' / ' + nums.length + '（可取消）', true);
      const page = await cv.pdfDoc.getPage(nums[k]);
      let vp = page.getViewport({ scale });
      // 超大页面（如 A0）在 3x 下会生成上亿像素的 canvas，直接崩溃
      const MAX_PX = 40 * 1000 * 1000;
      if (vp.width * vp.height > MAX_PX) {
        const k = Math.sqrt(MAX_PX / (vp.width * vp.height));
        vp = page.getViewport({ scale: scale * k });
        PDFX.toast('页面尺寸过大，已自动降低清晰度', 2600);
      }
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp, annotationMode: PDFX.ANN_ENABLE }).promise;
      const blob = await PDFX.canvasBlob(canvas, mime, fmt === 'png' ? undefined : 0.92);
      const ext = fmt === 'png' ? 'png' : 'jpg';
      items.push({ name: base + '_第' + nums[k] + '页.' + ext, blob });
      page.cleanup();
    }

    PDFX.hideBusy();
    if (items.length === 1) {
      PDFX.download(items[0].blob, items[0].name);
      PDFX.toast('已导出 1 张图片');
      return;
    }
    PDFX.showBusy('正在打包 ZIP…');
    const zip = new JSZip();
    items.forEach(it => zip.file(it.name, it.blob));
    const out = await zip.generateAsync({ type: 'blob' });
    PDFX.hideBusy();
    PDFX.download(out, base + '_图片.zip');
    PDFX.toast('已导出 ' + items.length + ' 张图片');
  } catch (e) {
    PDFX.hideBusy();
    if (e && e.cancelled) { PDFX.toast('已取消，未生成文件', 2400); return; }
    PDFX.toast('导出失败：' + (e.message || e), 3600);
  }
}

/* ---------------- 图片 → PDF ---------------- */

async function cvAddImages(files, list, arr, renderFn) {
  for (const f of files) {
    if (!/^image\//.test(f.type)) continue;
    try {
      const { w, h, url } = await PDFX.loadImage(f);
      URL.revokeObjectURL(url);   // 这里只需要宽高，读完立刻释放
      arr.push({ file: f, name: f.name, size: f.size, w, h });
    } catch (e) { /* 跳过读不了的 */ }
  }
  renderFn();
}

/* ---------------- 图片列表拖拽排序 ---------------- */

/**
 * 长按 300ms 进入拖拽，松手后按新顺序重排数组。
 * 上下箭头按钮保留，作为备选操作。
 * @param {string} containerId 列表容器 id
 * @param {Array} arr 数据数组
 * @param {Function} renderFn 重排后的重绘函数
 */
function bindDragSort(containerId, arr, renderFn) {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;

  let dragEl = null, timer = null, startY = 0, startX = 0;

  wrap.addEventListener('touchstart', e => {
    const row = e.target.closest('.img-item');
    if (!row || e.target.closest('button')) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    timer = setTimeout(() => {
      dragEl = row;
      row.classList.add('dragging');
      if (navigator.vibrate) { try { navigator.vibrate(12); } catch (err) {} }
    }, 300);
  }, { passive: true });

  wrap.addEventListener('touchmove', e => {
    const y = e.touches[0].clientY;
    if (!dragEl) {
      // 还没进入拖拽就大幅移动 → 说明用户想滚动，取消长按
      if (Math.abs(y - startY) > 10 || Math.abs(e.touches[0].clientX - startX) > 10) {
        clearTimeout(timer);
      }
      return;
    }
    e.preventDefault();
    const rows = [...wrap.children].filter(el => el !== dragEl);
    let before = null;
    for (const el of rows) {
      const r = el.getBoundingClientRect();
      if (y < r.top + r.height / 2) { before = el; break; }
    }
    if (before) wrap.insertBefore(dragEl, before);
    else wrap.appendChild(dragEl);
  }, { passive: false });

  const finish = () => {
    clearTimeout(timer);
    if (!dragEl) return;
    dragEl.classList.remove('dragging');
    dragEl = null;
    const order = [...wrap.children].map(el => parseInt(el.dataset.idx, 10));
    if (order.some(isNaN)) { renderFn(); return; }
    const next = order.map(i => arr[i]).filter(Boolean);
    arr.length = 0;
    arr.push(...next);
    renderFn();
  };
  wrap.addEventListener('touchend', finish);
  wrap.addEventListener('touchcancel', finish);
}

/** 预览转换 / 压缩模式里已选中的 PDF。 */
function cvPreviewPdf(which) {
  const doc = which === 'cv' ? cv.pdfDoc : cv.cmpDoc;
  const name = which === 'cv' ? cv.pdfName : cv.cmpName;
  if (!doc) { PDFX.toast('请先选择文件'); return; }
  PDFX.openPdfPreview(doc, name, 1);
}

function cvRenderImgList() {
  const wrap = PDFX.$('#cvImgList');
  wrap.innerHTML = '';
  cv.images.forEach((it, i) => {
    const row = document.createElement('div');
    row.className = 'img-item';
    row.dataset.idx = i;
    row.innerHTML =
      '<img alt="">' +
      '<div class="ii-meta"><div class="ii-name"></div><div class="ii-size"></div></div>' +
      '<div class="ii-btns">' +
        '<button data-act="up" title="上移">↑</button>' +
        '<button data-act="down" title="下移">↓</button>' +
        '<button data-act="del" title="移除">✕</button>' +
      '</div>';
    // 缩略图 URL 只创建一次并缓存在 item 上；列表重绘很频繁（拖拽/排序/删除），
    // 每次新建不释放会持续占用内存
    if (!it._url) it._url = URL.createObjectURL(it.file);
    const imgEl = row.querySelector('img');
    imgEl.src = it._url;
    imgEl.addEventListener('click', () => PDFX.openImagePreview(cv.images, i));
    row.querySelector('.ii-name').textContent = it.name;
    row.querySelector('.ii-size').textContent = it.w + '×' + it.h + ' · ' + PDFX.fmtSize(it.size);
    row.querySelector('.ii-btns').addEventListener('click', e => {
      const act = e.target.dataset.act;
      if (!act) return;
      if (act === 'del') {
        if (it._url) URL.revokeObjectURL(it._url);
        cv.images.splice(i, 1);
      }
      if (act === 'up' && i > 0) [cv.images[i - 1], cv.images[i]] = [cv.images[i], cv.images[i - 1]];
      if (act === 'down' && i < cv.images.length - 1) [cv.images[i + 1], cv.images[i]] = [cv.images[i], cv.images[i + 1]];
      cvRenderImgList();
    });
    wrap.appendChild(row);
  });
  PDFX.$('#cvImgEmpty').classList.toggle('hidden', cv.images.length > 0);
  PDFX.$('#cvMakeBtn').disabled = cv.images.length === 0;
}

async function cvMakePdf() {
  if (!cv.images.length) { PDFX.toast('请先添加图片'); return; }
  const sizeMode = PDFX.segValue('pagesize', 'a4');
  const margin = parseFloat(PDFX.segValue('cvmargin', '0')) || 0;

  try {
    PDFX.showBusy('正在生成 PDF…');
    const { PDFDocument } = PDFLib;
    const doc = await PDFDocument.create();
    const A4 = [595.28, 841.89];

    for (let i = 0; i < cv.images.length; i++) {
      PDFX.cvCheckCancel();
      PDFX.showBusy('正在处理 ' + (i + 1) + ' / ' + cv.images.length + '（可取消）', true);
      const it = cv.images[i];
      // pdf-lib 只认 PNG / JPEG，其他格式先转 JPEG
      let bytes, isPng = /png$/i.test(it.file.type);
      if (isPng) {
        bytes = await it.file.arrayBuffer();
      } else {
        const canvas = await PDFX.imageToCanvas(it.file, 0);
        const blob = await PDFX.canvasBlob(canvas, 'image/jpeg', 0.92);
        bytes = await blob.arrayBuffer();
      }
      const emb = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);

      let pw, ph;
      if (sizeMode === 'a4') {
        // 竖图用 A4 竖版，横图自动换成 A4 横版
        const landscape = it.w > it.h;
        pw = landscape ? A4[1] : A4[0];
        ph = landscape ? A4[0] : A4[1];
      } else {
        // 原图尺寸：按 96 DPI 折算成 pt，并限制上限避免超大页面
        pw = Math.min(it.w * 0.75, 2000);
        ph = Math.min(it.h * 0.75, 2000);
      }

      const page = doc.addPage([pw, ph]);
      const availW = pw - margin * 2;
      const availH = ph - margin * 2;
      const k = Math.min(availW / emb.width, availH / emb.height);
      const dw = emb.width * k, dh = emb.height * k;
      page.drawImage(emb, {
        x: (pw - dw) / 2,
        y: (ph - dh) / 2,
        width: dw,
        height: dh
      });
    }

    const out = await doc.save();
    PDFX.hideBusy();
    const name = (cv.images[0].name.replace(/\.[^.]+PDFX.$/, '') || 'images') +
      (cv.images.length > 1 ? '_等' + cv.images.length + '张' : '') + '.pdf';
    PDFX.download(new Blob([out], { type: 'application/pdf' }), name);
    PDFX.toast('已生成 PDF（' + cv.images.length + ' 页）');
  } catch (e) {
    PDFX.hideBusy();
    if (e && e.cancelled) { PDFX.toast('已取消，未生成文件', 2400); return; }
    PDFX.toast('生成失败：' + (e.message || e), 3600);
  }
}

/* ---------------- PDF 压缩 ---------------- */

  Object.assign(PDFX, { cv, cvLoadPdf, cvExportImages, cvAddImages, bindDragSort, cvPreviewPdf, cvRenderImgList, cvMakePdf });
})(window.PDFX = window.PDFX || {});

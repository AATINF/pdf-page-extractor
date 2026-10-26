/**
 * 转换与压缩模块
 * - PDF → 图片（PNG / JPEG，多档清晰度，可打包 ZIP）
 * - 图片 → PDF（多图排序，A4 或原尺寸）
 * - PDF 压缩（图片化 / 无损清理，可指定目标大小）
 * - 图片压缩（质量 / 最大边长 / 目标大小）
 *
 * 依赖：pdfjsLib、PDFLib、JSZip，以及 app.js 里的 download / toast / showBusy / hideBusy
 */

const cv = {
  pdfDoc: null, pdfBytes: null, pdfName: '', pdfPages: 0,
  cmpDoc: null, cmpBytes: null, cmpName: '', cmpPages: 0,
  images: [],      // 图片 → PDF：{ file, url, w, h, name, size }
  cmpImages: []    // 图片压缩：同上
};

/* ---------------- 通用小工具 ---------------- */

/** 字节数转人类可读。 */
function fmtSize(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(2) + ' MB';
}

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

/** canvas 转 Blob。 */
function canvasBlob(canvas, mime, quality) {
  return new Promise(resolve => canvas.toBlob(resolve, mime, quality));
}

/** 从图片文件读成 <img>，拿到原始宽高。 */
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url, w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片无法读取')); };
    img.src = url;
  });
}

/** 把任意图片画到 canvas（可缩放），返回 canvas。 */
async function imageToCanvas(file, maxSide) {
  const { img, url, w, h } = await loadImage(file);
  let tw = w, th = h;
  if (maxSide && Math.max(w, h) > maxSide) {
    const k = maxSide / Math.max(w, h);
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

async function cvLoadPdf(file) {
  try {
    showBusy('正在读取 PDF…');
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const size = bytes.length;
    // PDF.js 会把传入的 ArrayBuffer 转移给 worker，原 buffer 随即 detach，
    // 所以这里传副本，保留原数据供后续使用
    const doc = await pdfjsLib.getDocument(Object.assign({ data: bytes.slice() }, PDF_OPTS)).promise;
    cv.pdfDoc = doc;
    cv.pdfBytes = bytes;
    cv.pdfName = file.name;
    cv.pdfPages = doc.numPages;
    hideBusy();
    $('#cvPdfName').textContent = file.name;
    $('#cvPdfMeta').textContent = doc.numPages + ' 页 · ' + fmtSize(size);
    $('#cvPdfInfo').classList.remove('hidden');
    toast('已读取：共 ' + doc.numPages + ' 页');
  } catch (e) {
    hideBusy();
    toast('读取失败：' + (e.message || e), 3600);
  }
}

async function cvExportImages() {
  if (!cv.pdfDoc) { toast('请先选择一个 PDF'); return; }
  const fmt = segValue('imgfmt2', 'jpeg');
  const scale = parseFloat(segValue('dpi', '2')) || 2;
  const scope = segValue('cvscope', 'all');
  const mime = fmt === 'png' ? 'image/png' : 'image/jpeg';

  let nums = [];
  if (scope === 'sel' && state.selection && state.selection.size) {
    nums = [...state.selection].sort((a, b) => a - b);
  } else {
    for (let i = 1; i <= cv.pdfPages; i++) nums.push(i);
  }

  try {
    const base = cv.pdfName.replace(/\.pdf$/i, '') || 'page';
    const items = [];
    for (let k = 0; k < nums.length; k++) {
      cvCheckCancel();
      showBusy('正在渲染 ' + (k + 1) + ' / ' + nums.length + '（可取消）', true);
      const page = await cv.pdfDoc.getPage(nums[k]);
      const vp = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp, annotationMode: ANN_ENABLE }).promise;
      const blob = await canvasBlob(canvas, mime, fmt === 'png' ? undefined : 0.92);
      const ext = fmt === 'png' ? 'png' : 'jpg';
      items.push({ name: base + '_第' + nums[k] + '页.' + ext, blob });
      page.cleanup();
    }

    hideBusy();
    if (items.length === 1) {
      download(items[0].blob, items[0].name);
      toast('已导出 1 张图片');
      return;
    }
    showBusy('正在打包 ZIP…');
    const zip = new JSZip();
    items.forEach(it => zip.file(it.name, it.blob));
    const out = await zip.generateAsync({ type: 'blob' });
    hideBusy();
    download(out, base + '_图片.zip');
    toast('已导出 ' + items.length + ' 张图片');
  } catch (e) {
    hideBusy();
    if (e && e.cancelled) { toast('已取消，未生成文件', 2400); return; }
    toast('导出失败：' + (e.message || e), 3600);
  }
}

/* ---------------- 图片 → PDF ---------------- */

async function cvAddImages(files, list, arr, renderFn) {
  for (const f of files) {
    if (!/^image\//.test(f.type)) continue;
    try {
      const { w, h } = await loadImage(f);
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
  if (!doc) { toast('请先选择文件'); return; }
  openPdfPreview(doc, name, 1);
}

function cvRenderImgList() {
  const wrap = $('#cvImgList');
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
    const url = URL.createObjectURL(it.file);
    const imgEl = row.querySelector('img');
    imgEl.src = url;
    imgEl.addEventListener('click', () => openImagePreview(cv.images, i));
    row.querySelector('.ii-name').textContent = it.name;
    row.querySelector('.ii-size').textContent = it.w + '×' + it.h + ' · ' + fmtSize(it.size);
    row.querySelector('.ii-btns').addEventListener('click', e => {
      const act = e.target.dataset.act;
      if (!act) return;
      if (act === 'del') { URL.revokeObjectURL(url); cv.images.splice(i, 1); }
      if (act === 'up' && i > 0) [cv.images[i - 1], cv.images[i]] = [cv.images[i], cv.images[i - 1]];
      if (act === 'down' && i < cv.images.length - 1) [cv.images[i + 1], cv.images[i]] = [cv.images[i], cv.images[i + 1]];
      cvRenderImgList();
    });
    wrap.appendChild(row);
  });
  $('#cvImgEmpty').classList.toggle('hidden', cv.images.length > 0);
  $('#cvMakeBtn').disabled = cv.images.length === 0;
}

async function cvMakePdf() {
  if (!cv.images.length) { toast('请先添加图片'); return; }
  const sizeMode = segValue('pagesize', 'a4');
  const margin = parseFloat(segValue('cvmargin', '0')) || 0;

  try {
    showBusy('正在生成 PDF…');
    const { PDFDocument } = PDFLib;
    const doc = await PDFDocument.create();
    const A4 = [595.28, 841.89];

    for (let i = 0; i < cv.images.length; i++) {
      cvCheckCancel();
      showBusy('正在处理 ' + (i + 1) + ' / ' + cv.images.length + '（可取消）', true);
      const it = cv.images[i];
      // pdf-lib 只认 PNG / JPEG，其他格式先转 JPEG
      let bytes, isPng = /png$/i.test(it.file.type);
      if (isPng) {
        bytes = await it.file.arrayBuffer();
      } else {
        const canvas = await imageToCanvas(it.file, 0);
        const blob = await canvasBlob(canvas, 'image/jpeg', 0.92);
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
    hideBusy();
    const name = (cv.images[0].name.replace(/\.[^.]+$/, '') || 'images') +
      (cv.images.length > 1 ? '_等' + cv.images.length + '张' : '') + '.pdf';
    download(new Blob([out], { type: 'application/pdf' }), name);
    toast('已生成 PDF（' + cv.images.length + ' 页）');
  } catch (e) {
    hideBusy();
    if (e && e.cancelled) { toast('已取消，未生成文件', 2400); return; }
    toast('生成失败：' + (e.message || e), 3600);
  }
}

/* ---------------- PDF 压缩 ---------------- */

async function cvLoadCmpPdf(file) {
  try {
    showBusy('正在读取 PDF…');
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const size = bytes.length;
    const doc = await pdfjsLib.getDocument(Object.assign({ data: bytes.slice() }, PDF_OPTS)).promise;
    cv.cmpDoc = doc;
    cv.cmpBytes = bytes;
    cv.cmpName = file.name;
    cv.cmpPages = doc.numPages;
    $('#cmpPdfName').textContent = file.name;
    $('#cmpPdfMeta').textContent = doc.numPages + ' 页 · ' + fmtSize(size);
    $('#cmpPdfInfo').classList.remove('hidden');

    // 判断文字型还是扫描件，自动给出推荐档位
    const info = await detectPdfKind(doc);
    cv.cmpKind = info;
    setSeg(document.querySelector('.seg[data-name="cmpmode"]'),
           info.kind === 'text' ? 'lossless' : 'high');
    const tip = $('#cmpKindTip');
    if (tip) {
      tip.textContent = info.kind === 'text'
        ? '文字型 PDF（约 ' + info.avg + ' 字/页）：无损清理省得不多，要大幅缩小只能用图片化（文字将不可选中）'
        : '扫描件（几乎无文字）：用「高质量」图片化，视觉上接近原样';
      tip.className = 'kind-tip' + (info.kind === 'scan' ? ' scan' : '');
      tip.classList.remove('hidden');
    }
    hideBusy();
    toast('已读取：共 ' + doc.numPages + ' 页');
  } catch (e) {
    hideBusy();
    toast('读取失败：' + (e.message || e), 3600);
  }
}

/** 把 PDF 每页渲染成 JPEG，返回 [{ blob, ptW, ptH }]。 */
async function rasterizePdf(doc, scale, quality, onProgress) {
  const out = [];
  for (let i = 1; i <= doc.numPages; i++) {
    cvCheckCancel();
    if (onProgress) onProgress(i, doc.numPages);
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp, annotationMode: ANN_ENABLE }).promise;
    const blob = await canvasBlob(canvas, 'image/jpeg', quality);
    out.push({ blob, ptW: vp.width / scale, ptH: vp.height / scale });
    page.cleanup();
  }
  return out;
}

/** 把渲染结果重新拼成 PDF。 */
async function pagesToPdf(pages) {
  const { PDFDocument } = PDFLib;
  const doc = await PDFDocument.create();
  for (const p of pages) {
    const img = await doc.embedJpg(await p.blob.arrayBuffer());
    const page = doc.addPage([p.ptW, p.ptH]);
    page.drawImage(img, { x: 0, y: 0, width: p.ptW, height: p.ptH });
  }
  return doc.save();
}

/**
 * 判断 PDF 是文字型还是扫描件：统计前 5 页的平均字符数。
 * ≥50 字/页视为文字型。
 */
async function detectPdfKind(doc) {
  const n = Math.min(5, doc.numPages || 1);
  let chars = 0;
  for (let i = 1; i <= n; i++) {
    try {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      chars += tc.items.reduce((s, it) => s + (it.str || '').length, 0);
      page.cleanup();
    } catch (e) { /* 单页失败不影响整体判断 */ }
  }
  const avg = Math.round(chars / n);
  return { kind: avg >= 50 ? 'text' : 'scan', avg };
}

/** 把某页渲染成 dataURL 缩略图，用于压缩前后对比。 */
async function renderPageThumb(doc, pageNum, maxW) {
  const page = await doc.getPage(pageNum);
  const v1 = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: maxW / v1.width });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(vp.width);
  canvas.height = Math.floor(vp.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: vp, annotationMode: ANN_ENABLE }).promise;
  page.cleanup();
  return canvas.toDataURL('image/jpeg', 0.82);
}

function showCompare(beforeUrl, afterUrl, beforeSize, afterSize) {
  $('#cmpBeforeImg').src = beforeUrl;
  $('#cmpAfterImg').src = afterUrl;
  $('#cmpBeforeSize').textContent = fmtSize(beforeSize);
  $('#cmpAfterSize').textContent = fmtSize(afterSize);
  $('#compareDialog').classList.remove('hidden');
}

function closeCompare() {
  const skip = $('#cmpSkipNext');
  if (skip && skip.checked) {
    saveSettings({ skipCompare: true });
    toast('以后不再自动弹出，可在设置里恢复', 2600);
  }
  $('#compareDialog').classList.add('hidden');
  $('#cmpBeforeImg').removeAttribute('src');
  $('#cmpAfterImg').removeAttribute('src');
}

/** 三档压缩的参数。无损清理走单独分支，不在这里。 */
const CMP_CFG = {
  high:    { scale: 2, quality: 0.90 },
  extreme: { scale: 1, quality: 0.60 }
};

/** 无损清理：只重写对象流，保留文字层。 */
async function losslessSave(bytes) {
  const src = await PDFLib.PDFDocument.load(bytes);
  return await src.save({ useObjectStreams: true, addDefaultPage: false });
}

async function cvCompressPdf() {
  if (!cv.cmpDoc) { toast('请先选择一个 PDF'); return; }
  let mode = segValue('cmpmode', 'high');
  const targetKB = readTargetKB('cmpTarget', 'cmpunit');
  const targetBytes = targetKB * 1024;

  // 无损清理省不动，若用户填了目标大小，自动改用图片化档位，否则永远达不到
  if (mode === 'lossless' && targetBytes > 0 && cv.cmpBytes.length > targetBytes) {
    mode = cv.cmpBytes.length > targetBytes * 4 ? 'extreme' : 'high';
    toast('无损清理达不到目标，已自动改用' + (mode === 'extreme' ? '极限压缩' : '高质量'), 3600);
  }
  const baseName = cv.cmpName.replace(/\.pdf$/i, '') || 'output';
  const originSize = cv.cmpBytes.length;

  try {
    let outBytes, modeUsed = mode, note = '';

    // 压缩前先留一张第一页的样张，用于事后对比
    let beforeThumb = null;
    try { beforeThumb = await renderPageThumb(cv.cmpDoc, 1, 360); } catch (e) { /* 忽略 */ }

    if (mode === 'lossless') {
      showBusy('正在清理冗余数据…', true);
      outBytes = await losslessSave(cv.cmpBytes);
    } else {
      const cfg = CMP_CFG[mode] || CMP_CFG.high;
      let scale = cfg.scale;
      let quality = cfg.quality;

      showBusy('正在渲染页面…');
      let pages = await rasterizePdf(cv.cmpDoc, scale, quality, (i, n) => {
        showBusy('正在渲染 ' + i + ' / ' + n + '（可取消）', true);
      });
      let total = pages.reduce((s, p) => s + p.blob.size, 0);

      // 有目标大小就迭代：差距大先降分辨率，差距小只降质量（最多 5 轮）
      if (targetBytes > 0 && total > targetBytes) {
        for (let round = 0; round < 6 && total > targetBytes; round++) {
          const ratio = targetBytes / total;
          // 体积对分辨率是平方关系，差距大时降分辨率比降质量有效得多
          if (ratio < 0.75) {
            scale = Math.max(0.28, scale * Math.max(0.62, Math.sqrt(ratio) * 0.94));
            quality = Math.max(0.2, quality * 0.95);
          } else {
            quality = Math.max(0.12, quality * ratio * 0.84);
          }
          showBusy('正在压缩（第 ' + (round + 2) + ' 轮，' +
            Math.round(scale * 100) / 100 + 'x / q' + Math.round(quality * 100) + '）…');
          pages = await rasterizePdf(cv.cmpDoc, scale, quality, (i, n) => {
            showBusy('正在压缩 ' + i + ' / ' + n + '（可取消）', true);
          });
          total = pages.reduce((s, p) => s + p.blob.size, 0);
        }
      }

      showBusy('正在生成 PDF…');
      outBytes = await pagesToPdf(pages);

      // 文字型 PDF 图片化后反而更大：自动改用更优方案，别让用户拿到更大的文件
      if (outBytes.length >= originSize) {
        const clean = await losslessSave(cv.cmpBytes);
        if (clean.length < originSize) {
          outBytes = clean;
          modeUsed = 'fallback-lossless';
          note = '原文件是文字型 PDF，图片化会变大，已改用无损清理';
        } else {
          outBytes = cv.cmpBytes;
          modeUsed = 'fallback-origin';
          note = '原文件已经足够小，图片化与清理都无法再压缩，已输出原文件';
        }
      }
    }

    hideBusy();
    const blob = new Blob([outBytes], { type: 'application/pdf' });
    const saved = originSize > 0 ? Math.round((1 - blob.size / originSize) * 100) : 0;
    const suffix = modeUsed === 'lossless' || modeUsed === 'fallback-lossless'
      ? '_无损清理' : '_压缩';
    download(blob, baseName + suffix + '.pdf');

    let msg = fmtSize(originSize) + ' → ' + fmtSize(blob.size);
    if (saved > 0) msg = '压缩完成：' + msg + '（省 ' + saved + '%）';
    else msg = '未能进一步压缩：' + msg;
    if (note) msg = note + '（' + msg + '）';
    if (targetBytes > 0 && blob.size > targetBytes) {
      msg += '；未达到 ' + fmtSize(targetBytes) + ' 目标';
    }
    toast(msg, 5200);

    // 生成压缩前后对比（失败不影响主流程；用户可选不再弹出）
    if (beforeThumb && !loadSettings().skipCompare) {
      try {
        const outDoc = await pdfjsLib.getDocument(Object.assign({ data: outBytes.slice() }, PDF_OPTS)).promise;
        const afterThumb = await renderPageThumb(outDoc, 1, 360);
        outDoc.destroy();
        showCompare(beforeThumb, afterThumb, originSize, blob.size);
      } catch (e) { /* 忽略 */ }
    }
  } catch (e) {
    hideBusy();
    if (e && e.cancelled) { toast('已取消，未生成文件', 2400); return; }
    toast('压缩失败：' + (e.message || e), 3600);
  }
}

/* ---------------- 图片压缩 ---------------- */

function cmpRenderImgList() {
  const wrap = $('#cmpImgList');
  wrap.innerHTML = '';
  cv.cmpImages.forEach((it, i) => {
    const row = document.createElement('div');
    row.className = 'img-item';
    row.dataset.idx = i;
    row.innerHTML =
      '<img alt="">' +
      '<div class="ii-meta"><div class="ii-name"></div><div class="ii-size"></div></div>' +
      '<div class="ii-btns"><button data-act="del" title="移除">✕</button></div>';
    const url = URL.createObjectURL(it.file);
    const imgEl = row.querySelector('img');
    imgEl.src = url;
    imgEl.addEventListener('click', () => openImagePreview(cv.cmpImages, i));
    row.querySelector('.ii-name').textContent = it.name;
    row.querySelector('.ii-size').textContent = it.w + '×' + it.h + ' · ' + fmtSize(it.size);
    row.querySelector('.ii-btns').addEventListener('click', e => {
      if (e.target.dataset.act !== 'del') return;
      URL.revokeObjectURL(url);
      cv.cmpImages.splice(i, 1);
      cmpRenderImgList();
    });
    wrap.appendChild(row);
  });
  $('#cmpImgEmpty').classList.toggle('hidden', cv.cmpImages.length > 0);
}

async function cvCompressImages() {
  if (!cv.cmpImages.length) { toast('请先添加图片'); return; }
  const quality = (parseInt($('#cmpQuality').value) || 75) / 100;
  const maxSide = parseInt($('#cmpMaxSide').value) || 0;
  const targetKB = readTargetKB('cmpImgTarget', 'cmpimgunit');
  const targetBytes = targetKB * 1024;

  try {
    const items = [];
    let before = 0, after = 0;

    for (let i = 0; i < cv.cmpImages.length; i++) {
      cvCheckCancel();
      const it = cv.cmpImages[i];
      showBusy('正在压缩 ' + (i + 1) + ' / ' + cv.cmpImages.length + '（可取消）', true);
      before += it.size;

      let canvas = await imageToCanvas(it.file, maxSide);
      let blob;
      if (targetBytes > 0) {
        let res = await encodeUnderTarget(canvas, targetBytes);
        // 最低质量仍超标：降分辨率再试一次
        if (res.oversize) {
          const shrink = Math.max(canvas.width, canvas.height) * 0.6;
          canvas = await imageToCanvas(it.file, Math.round(shrink));
          res = await encodeUnderTarget(canvas, targetBytes);
        }
        blob = res.blob;
      } else {
        blob = await canvasBlob(canvas, 'image/jpeg', quality);
      }

      after += blob.size;
      const base = it.name.replace(/\.[^.]+$/, '');
      items.push({ name: base + '_压缩.jpg', blob });
    }

    hideBusy();
    if (items.length === 1) {
      download(items[0].blob, items[0].name);
    } else {
      showBusy('正在打包 ZIP…');
      const zip = new JSZip();
      items.forEach(it => zip.file(it.name, it.blob));
      const out = await zip.generateAsync({ type: 'blob' });
      hideBusy();
      download(out, '图片压缩_' + items.length + '张.zip');
    }

    const saved = before > 0 ? Math.round((1 - after / before) * 100) : 0;
    toast('压缩完成：' + fmtSize(before) + ' → ' + fmtSize(after) +
      (saved > 0 ? '（省 ' + saved + '%）' : ''), 4200);
  } catch (e) {
    hideBusy();
    if (e && e.cancelled) { toast('已取消，未生成文件', 2400); return; }
    toast('压缩失败：' + (e.message || e), 3600);
  }
}

/* ---------------- 设置记忆 ---------------- */

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
  const s = loadSettings();
  PERSIST_SEGS.forEach(([name, key]) => {
    const v = s['cv_' + key];
    if (!v) return;
    const seg = document.querySelector('.seg[data-name="' + name + '"]');
    if (seg) setSeg(seg, v);
  });
  PERSIST_INPUTS.forEach(id => {
    const v = s['cv_' + id];
    if (v == null || v === '') return;
    const el = document.getElementById(id);
    if (!el) return;
    el.value = v;
    if (id === 'cmpQuality') {
      const lbl = $('#cmpQualityVal');
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
      const v = segValue(name, '');
      if (v) saveSettings({ ['cv_' + key]: v });
    });
  });
  PERSIST_INPUTS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => saveSettings({ ['cv_' + id]: el.value }));
  });
}

/* ---------------- 长任务取消 ---------------- */

const cvCancel = { flag: false };

/** 在耗时循环里调用；用户点过取消就抛出，由上层统一收尾。 */
function cvCheckCancel() {
  if (cvCancel.flag) {
    cvCancel.flag = false;
    const err = new Error('CANCELLED');
    err.cancelled = true;
    throw err;
  }
}

function cvRequestCancel() {
  cvCancel.flag = true;
  const btn = $('#busyCancel');
  if (btn) btn.textContent = '正在取消…';
}

function cvResetCancel() {
  cvCancel.flag = false;
  const btn = $('#busyCancel');
  if (btn) { btn.textContent = '取消'; btn.classList.add('hidden'); }
}

/* ---------------- 初始化 ---------------- */

function cvInit() {
  const on = (sel, ev, fn) => {
    const el = document.querySelector(sel);
    if (el) el.addEventListener(ev, fn);
  };

  on('#cvPdfInput', 'change', e => {
    if (e.target.files[0]) cvLoadPdf(e.target.files[0]);
    e.target.value = '';
  });
  on('#cmpPdfInput', 'change', e => {
    if (e.target.files[0]) cvLoadCmpPdf(e.target.files[0]);
    e.target.value = '';
  });
  on('#cvImgInput', 'change', e => {
    cvAddImages([...e.target.files], null, cv.images, cvRenderImgList);
    e.target.value = '';
  });
  on('#cmpImgInput', 'change', e => {
    cvAddImages([...e.target.files], null, cv.cmpImages, cmpRenderImgList);
    e.target.value = '';
  });

  // 转换子模式
  on('#convModeSeg', 'click', e => {
    const item = e.target.closest('.seg-item');
    if (!item) return;
    const v = item.dataset.value;
    $('#convToImage').classList.toggle('hidden', v !== 'toImage');
    $('#convToPdf').classList.toggle('hidden', v !== 'toPdf');
  });

  // 压缩子模式
  on('#cmpModeSeg', 'click', e => {
    const item = e.target.closest('.seg-item');
    if (!item) return;
    const v = item.dataset.value;
    $('#cmpPdf').classList.toggle('hidden', v !== 'pdf');
    $('#cmpImage').classList.toggle('hidden', v !== 'image');
  });

  // 压缩方式切换：无损清理时隐藏清晰度
  const cmpmode = document.querySelector('.seg[data-name="cmpmode"]');
  if (cmpmode) {
    cmpmode.addEventListener('click', () => {
      const v = segValue('cmpmode', 'high');
      const hint = $('#cmpHint');
      if (!hint) return;
      hint.textContent = {
        lossless: '无损清理只移除冗余对象与元数据，保留文字层，但体积通常只能降 5%~15%。',
        high: '高质量：按 2x 渲染并以 90 质量重编码，肉眼接近原样，但文字不可再选中。',
        extreme: '极限压缩：按 1x 渲染、60 质量重编码，体积降幅最大，小字可能发虚。'
      }[v] || '';
    });
  }

  // 质量滑块
  on('#cmpQuality', 'input', e => {
    const v = $('#cmpQualityVal');
    if (v) v.textContent = e.target.value;
  });

  // 目标大小快捷预设：点一下自动填值并切到合适单位
  document.querySelectorAll('.preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const block = btn.closest('.target-block');
      if (!block) return;
      const input = block.querySelector('input');
      const seg = block.querySelector('.seg');
      const kb = parseInt(btn.dataset.kb, 10) || 0;
      if (!input) return;
      if (kb >= 1024) {
        input.value = String(+(kb / 1024).toFixed(1));
        setSeg(seg, 'mb');
      } else {
        input.value = String(kb);
        setSeg(seg, 'kb');
      }
      block.querySelectorAll('.preset').forEach(b => b.classList.toggle('on', b === btn));
    });
  });

  // 手动改数值时取消预设高亮
  document.querySelectorAll('.target-block input').forEach(input => {
    input.addEventListener('input', () => {
      const block = input.closest('.target-block');
      if (block) block.querySelectorAll('.preset').forEach(b => b.classList.remove('on'));
    });
  });

  restoreSettings();
  bindSettingsPersist();

  // 图片列表支持长按拖拽排序
  bindDragSort('cvImgList', cv.images, cvRenderImgList);
  bindDragSort('cmpImgList', cv.cmpImages, cmpRenderImgList);
}

document.addEventListener('DOMContentLoaded', cvInit);

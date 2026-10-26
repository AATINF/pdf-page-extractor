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
    const doc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
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
      showBusy('正在渲染 ' + (k + 1) + ' / ' + nums.length);
      const page = await cv.pdfDoc.getPage(nums[k]);
      const vp = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
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

function cvRenderImgList() {
  const wrap = $('#cvImgList');
  wrap.innerHTML = '';
  cv.images.forEach((it, i) => {
    const row = document.createElement('div');
    row.className = 'img-item';
    row.innerHTML =
      '<img alt="">' +
      '<div class="ii-meta"><div class="ii-name"></div><div class="ii-size"></div></div>' +
      '<div class="ii-btns">' +
        '<button data-act="up" title="上移">↑</button>' +
        '<button data-act="down" title="下移">↓</button>' +
        '<button data-act="del" title="移除">✕</button>' +
      '</div>';
    const url = URL.createObjectURL(it.file);
    row.querySelector('img').src = url;
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
      showBusy('正在处理 ' + (i + 1) + ' / ' + cv.images.length);
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
    const doc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
    cv.cmpDoc = doc;
    cv.cmpBytes = bytes;
    cv.cmpName = file.name;
    cv.cmpPages = doc.numPages;
    hideBusy();
    $('#cmpPdfName').textContent = file.name;
    $('#cmpPdfMeta').textContent = doc.numPages + ' 页 · ' + fmtSize(size);
    $('#cmpPdfInfo').classList.remove('hidden');
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
    if (onProgress) onProgress(i, doc.numPages);
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
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

/** 无损清理：只重写对象流，保留文字层。 */
async function losslessSave(bytes) {
  const src = await PDFLib.PDFDocument.load(bytes);
  return await src.save({ useObjectStreams: true, addDefaultPage: false });
}

async function cvCompressPdf() {
  if (!cv.cmpDoc) { toast('请先选择一个 PDF'); return; }
  const mode = segValue('cmpmode', 'lossy');
  const targetKB = readTargetKB('cmpTarget', 'cmpunit');
  const targetBytes = targetKB * 1024;
  const baseName = cv.cmpName.replace(/\.pdf$/i, '') || 'output';
  const originSize = cv.cmpBytes.length;

  try {
    let outBytes, modeUsed = mode, note = '';

    if (mode === 'lossless') {
      showBusy('正在清理冗余数据…');
      outBytes = await losslessSave(cv.cmpBytes);
    } else {
      const baseScale = parseFloat(segValue('cmpdpi', '1.5')) || 1.5;
      let scale = baseScale;
      let quality = 0.78;

      showBusy('正在渲染页面…');
      let pages = await rasterizePdf(cv.cmpDoc, scale, quality, (i, n) => {
        showBusy('正在渲染 ' + i + ' / ' + n);
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
            quality = Math.max(0.12, quality * ratio * 0.9);
          }
          showBusy('正在压缩（第 ' + (round + 2) + ' 轮，' +
            Math.round(scale * 100) / 100 + 'x / q' + Math.round(quality * 100) + '）…');
          pages = await rasterizePdf(cv.cmpDoc, scale, quality, (i, n) => {
            showBusy('正在压缩 ' + i + ' / ' + n);
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
  } catch (e) {
    hideBusy();
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
    row.innerHTML =
      '<img alt="">' +
      '<div class="ii-meta"><div class="ii-name"></div><div class="ii-size"></div></div>' +
      '<div class="ii-btns"><button data-act="del" title="移除">✕</button></div>';
    const url = URL.createObjectURL(it.file);
    row.querySelector('img').src = url;
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
      const it = cv.cmpImages[i];
      showBusy('正在压缩 ' + (i + 1) + ' / ' + cv.cmpImages.length);
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
    toast('压缩失败：' + (e.message || e), 3600);
  }
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
      const v = segValue('cmpmode', 'lossy');
      const row = $('#cmpDpiRow');
      if (row) row.classList.toggle('hidden', v === 'lossless');
      const hint = $('#cmpHint');
      if (hint) {
        hint.textContent = v === 'lossless'
          ? '无损清理只移除冗余对象与元数据，保留文字层，但体积通常只能降 5%~15%。'
          : '图片化：每页转成图片重拼，体积能降很多，但文字不可再选中、搜索。';
      }
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
}

document.addEventListener('DOMContentLoaded', cvInit);

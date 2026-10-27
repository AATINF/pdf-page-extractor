/* features/compress —— 见文件末尾导出 */
(function (PDFX) {
  'use strict';

async function cvLoadCmpPdf(file) {
  try {
    PDFX.showBusy('正在读取 PDF…');
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const size = bytes.length;
    const doc = await pdfjsLib.getDocument(Object.assign({ data: bytes.slice() }, PDFX.PDF_OPTS)).promise;
    PDFX.cv.cmpDoc = doc;
    PDFX.cv.cmpBytes = bytes;
    PDFX.cv.cmpName = file.name;
    PDFX.cv.cmpPages = doc.numPages;
    PDFX.$('#cmpPdfName').textContent = file.name;
    PDFX.$('#cmpPdfMeta').textContent = doc.numPages + ' 页 · ' + PDFX.fmtSize(size);
    PDFX.$('#cmpPdfInfo').classList.remove('hidden');

    // 判断文字型还是扫描件，自动给出推荐档位
    const info = await detectPdfKind(doc);
    PDFX.cv.cmpKind = info;
    PDFX.setSeg(document.querySelector('.seg[data-name="cmpmode"]'),
           info.kind === 'text' ? 'lossless' : 'high');
    const tip = PDFX.$('#cmpKindTip');
    if (tip) {
      tip.textContent = info.kind === 'text'
        ? '文字型 PDF（约 ' + info.avg + ' 字/页）：无损清理省得不多，要大幅缩小只能用图片化（文字将不可选中）'
        : '扫描件（几乎无文字）：用「高质量」图片化，视觉上接近原样';
      tip.className = 'kind-tip' + (info.kind === 'scan' ? ' scan' : '');
      tip.classList.remove('hidden');
    }
    PDFX.hideBusy();
    PDFX.toast('已读取：共 ' + doc.numPages + ' 页');
  } catch (e) {
    PDFX.hideBusy();
    if (e && e.name === 'PasswordException') {
      PDFX.toast('此 PDF 已加密。请先切到「提取」输入密码打开，再来压缩', 4200);
      return;
    }
    PDFX.toast('读取失败：' + (e.message || e), 3600);
  }
}

/** 把 PDF 每页渲染成 JPEG，返回 [{ blob, ptW, ptH }]。 */
async function rasterizePdf(doc, scale, quality, onProgress) {
  const out = [];
  for (let i = 1; i <= doc.numPages; i++) {
    PDFX.cvCheckCancel();
    if (onProgress) onProgress(i, doc.numPages);
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp, annotationMode: PDFX.ANN_ENABLE }).promise;
    const blob = await PDFX.canvasBlob(canvas, 'image/jpeg', quality);
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
  await page.render({ canvasContext: ctx, viewport: vp, annotationMode: PDFX.ANN_ENABLE }).promise;
  page.cleanup();
  return canvas.toDataURL('image/jpeg', 0.82);
}

function showCompare(beforeUrl, afterUrl, beforeSize, afterSize) {
  PDFX.$('#cmpBeforeImg').src = beforeUrl;
  PDFX.$('#cmpAfterImg').src = afterUrl;
  PDFX.$('#cmpBeforeSize').textContent = PDFX.fmtSize(beforeSize);
  PDFX.$('#cmpAfterSize').textContent = PDFX.fmtSize(afterSize);
  PDFX.$('#compareDialog').classList.remove('hidden');
}

function closeCompare() {
  const skip = PDFX.$('#cmpSkipNext');
  if (skip && skip.checked) {
    PDFX.saveSettings({ skipCompare: true });
    PDFX.toast('以后不再自动弹出，可在设置里恢复', 2600);
  }
  PDFX.$('#compareDialog').classList.add('hidden');
  PDFX.$('#cmpBeforeImg').removeAttribute('src');
  PDFX.$('#cmpAfterImg').removeAttribute('src');
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
  if (!PDFX.cv.cmpDoc) { PDFX.toast('请先选择一个 PDF'); return; }
  let mode = PDFX.segValue('cmpmode', 'high');
  const targetKB = PDFX.readTargetKB('cmpTarget', 'cmpunit');
  const targetBytes = targetKB * 1024;

  // 无损清理省不动，若用户填了目标大小，自动改用图片化档位，否则永远达不到
  if (mode === 'lossless' && targetBytes > 0 && PDFX.cv.cmpBytes.length > targetBytes) {
    mode = PDFX.cv.cmpBytes.length > targetBytes * 4 ? 'extreme' : 'high';
    PDFX.toast('无损清理达不到目标，已自动改用' + (mode === 'extreme' ? '极限压缩' : '高质量'), 3600);
  }
  const baseName = PDFX.cv.cmpName.replace(/\.pdf$/i, '') || 'output';
  const originSize = PDFX.cv.cmpBytes.length;

  try {
    let outBytes, modeUsed = mode, note = '';

    // 压缩前先留一张第一页的样张，用于事后对比
    let beforeThumb = null;
    try { beforeThumb = await renderPageThumb(PDFX.cv.cmpDoc, 1, 360); } catch (e) { /* 忽略 */ }

    if (mode === 'lossless') {
      PDFX.showBusy('正在清理冗余数据…', true);
      outBytes = await losslessSave(PDFX.cv.cmpBytes);
    } else {
      const cfg = CMP_CFG[mode] || CMP_CFG.high;
      let scale = cfg.scale;
      let quality = cfg.quality;

      PDFX.showBusy('正在渲染页面…');
      let pages = await rasterizePdf(PDFX.cv.cmpDoc, scale, quality, (i, n) => {
        PDFX.showBusy('正在渲染 ' + i + ' / ' + n + '（可取消）', true);
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
          PDFX.showBusy('正在压缩（第 ' + (round + 2) + ' 轮，' +
            Math.round(scale * 100) / 100 + 'x / q' + Math.round(quality * 100) + '）…');
          pages = await rasterizePdf(PDFX.cv.cmpDoc, scale, quality, (i, n) => {
            PDFX.showBusy('正在压缩 ' + i + ' / ' + n + '（可取消）', true);
          });
          total = pages.reduce((s, p) => s + p.blob.size, 0);
        }
      }

      PDFX.showBusy('正在生成 PDF…');
      outBytes = await pagesToPdf(pages);

      // 文字型 PDF 图片化后反而更大：自动改用更优方案，别让用户拿到更大的文件
      if (outBytes.length >= originSize) {
        const clean = await losslessSave(PDFX.cv.cmpBytes);
        if (clean.length < originSize) {
          outBytes = clean;
          modeUsed = 'fallback-lossless';
          note = '原文件是文字型 PDF，图片化会变大，已改用无损清理';
        } else {
          outBytes = PDFX.cv.cmpBytes;
          modeUsed = 'fallback-origin';
          note = '原文件已经足够小，图片化与清理都无法再压缩，已输出原文件';
        }
      }
    }

    PDFX.hideBusy();
    const blob = new Blob([outBytes], { type: 'application/pdf' });
    const saved = originSize > 0 ? Math.round((1 - blob.size / originSize) * 100) : 0;
    const suffix = modeUsed === 'lossless' || modeUsed === 'fallback-lossless'
      ? '_无损清理' : '_压缩';
    PDFX.download(blob, baseName + suffix + '.pdf');

    let msg = PDFX.fmtSize(originSize) + ' → ' + PDFX.fmtSize(blob.size);
    if (saved > 0) msg = '压缩完成：' + msg + '（省 ' + saved + '%）';
    else msg = '未能进一步压缩：' + msg;
    if (note) msg = note + '（' + msg + '）';
    if (targetBytes > 0 && blob.size > targetBytes) {
      msg += '；未达到 ' + PDFX.fmtSize(targetBytes) + ' 目标';
    }
    PDFX.toast(msg, 5200);

    // 生成压缩前后对比（失败不影响主流程；用户可选不再弹出）
    if (beforeThumb && !PDFX.loadSettings().skipCompare) {
      try {
        const outDoc = await pdfjsLib.getDocument(Object.assign({ data: outBytes.slice() }, PDFX.PDF_OPTS)).promise;
        const afterThumb = await renderPageThumb(outDoc, 1, 360);
        outDoc.destroy();
        showCompare(beforeThumb, afterThumb, originSize, blob.size);
      } catch (e) { /* 忽略 */ }
    }
  } catch (e) {
    PDFX.hideBusy();
    if (e && e.cancelled) { PDFX.toast('已取消，未生成文件', 2400); return; }
    PDFX.toast('压缩失败：' + (e.message || e), 3600);
  }
}

/* ---------------- 图片压缩 ---------------- */

function cmpRenderImgList() {
  const wrap = PDFX.$('#cmpImgList');
  wrap.innerHTML = '';
  PDFX.cv.cmpImages.forEach((it, i) => {
    const row = document.createElement('div');
    row.className = 'img-item';
    row.dataset.idx = i;
    row.innerHTML =
      '<img alt="">' +
      '<div class="ii-meta"><div class="ii-name"></div><div class="ii-size"></div></div>' +
      '<div class="ii-btns"><button data-act="del" title="移除">✕</button></div>';
    if (!it._url) it._url = URL.createObjectURL(it.file);
    const imgEl = row.querySelector('img');
    imgEl.src = it._url;
    imgEl.addEventListener('click', () => PDFX.openImagePreview(PDFX.cv.cmpImages, i));
    row.querySelector('.ii-name').textContent = it.name;
    row.querySelector('.ii-size').textContent = it.w + '×' + it.h + ' · ' + PDFX.fmtSize(it.size);
    row.querySelector('.ii-btns').addEventListener('click', e => {
      if (e.target.dataset.act !== 'del') return;
      if (it._url) URL.revokeObjectURL(it._url);
      PDFX.cv.cmpImages.splice(i, 1);
      cmpRenderImgList();
    });
    wrap.appendChild(row);
  });
  PDFX.$('#cmpImgEmpty').classList.toggle('hidden', PDFX.cv.cmpImages.length > 0);
}

async function cvCompressImages() {
  if (!PDFX.cv.cmpImages.length) { PDFX.toast('请先添加图片'); return; }
  const quality = (parseInt(PDFX.$('#cmpQuality').value) || 75) / 100;
  const maxSide = parseInt(PDFX.$('#cmpMaxSide').value) || 0;
  const targetKB = PDFX.readTargetKB('cmpImgTarget', 'cmpimgunit');
  const targetBytes = targetKB * 1024;

  try {
    const items = [];
    let before = 0, after = 0;

    for (let i = 0; i < PDFX.cv.cmpImages.length; i++) {
      PDFX.cvCheckCancel();
      const it = PDFX.cv.cmpImages[i];
      PDFX.showBusy('正在压缩 ' + (i + 1) + ' / ' + PDFX.cv.cmpImages.length + '（可取消）', true);
      before += it.size;

      let canvas = await PDFX.imageToCanvas(it.file, maxSide);
      let blob;
      if (targetBytes > 0) {
        let res = await PDFX.encodeUnderTarget(canvas, targetBytes);
        // 最低质量仍超标：降分辨率再试一次
        if (res.oversize) {
          const shrink = Math.max(canvas.width, canvas.height) * 0.6;
          canvas = await PDFX.imageToCanvas(it.file, Math.round(shrink));
          res = await PDFX.encodeUnderTarget(canvas, targetBytes);
        }
        blob = res.blob;
      } else {
        blob = await PDFX.canvasBlob(canvas, 'image/jpeg', quality);
      }

      after += blob.size;
      const base = it.name.replace(/\.[^.]+PDFX.$/, '');
      items.push({ name: base + '_压缩.jpg', blob });
    }

    PDFX.hideBusy();
    if (items.length === 1) {
      PDFX.download(items[0].blob, items[0].name);
    } else {
      PDFX.showBusy('正在打包 ZIP…');
      const zip = new JSZip();
      items.forEach(it => zip.file(it.name, it.blob));
      const out = await zip.generateAsync({ type: 'blob' });
      PDFX.hideBusy();
      PDFX.download(out, '图片压缩_' + items.length + '张.zip');
    }

    const saved = before > 0 ? Math.round((1 - after / before) * 100) : 0;
    PDFX.toast('压缩完成：' + PDFX.fmtSize(before) + ' → ' + PDFX.fmtSize(after) +
      (saved > 0 ? '（省 ' + saved + '%）' : ''), 4200);
  } catch (e) {
    PDFX.hideBusy();
    if (e && e.cancelled) { PDFX.toast('已取消，未生成文件', 2400); return; }
    PDFX.toast('压缩失败：' + (e.message || e), 3600);
  }
}

/* ---------------- 设置记忆 ---------------- */

  Object.assign(PDFX, { cvLoadCmpPdf, rasterizePdf, pagesToPdf, detectPdfKind, renderPageThumb, showCompare, closeCompare, CMP_CFG, losslessSave, cvCompressPdf, cmpRenderImgList, cvCompressImages });
})(window.PDFX = window.PDFX || {});

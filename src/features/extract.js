/* features/extract —— 见文件末尾导出 */
(function (PDFX) {
  'use strict';

/**
 * 读取"高级设置"中的图片化输出参数。
 * @returns {{scale: number, fmt: string}} 清晰度倍率与图片格式（jpeg/png）
 */
function rasterSettings() {
  const q = document.querySelector('.seg[data-name="quality"] .seg-item.active');
  const f = document.querySelector('.seg[data-name="imgfmt"] .seg-item.active');
  return { scale: +(q ? q.dataset.value : 2), fmt: f ? f.dataset.value : 'jpeg' };
}

/**
 * 把某一页渲染成位图（用于加密文档的图片化输出）。
 * @param {number} n 页码
 * @param {number} scale 渲染倍率（2=普通、3=高清）
 * @param {string} fmt 输出图片格式
 * @returns {Promise<{bytes: Uint8Array, width: number, height: number}>} 图片字节与页面尺寸
 */
async function renderPageToImage(n, scale, fmt) {
  const page = await PDFX.state.doc.getPage(n);
  // 视口应用页面旋转设置，保证输出方向与用户设置一致
  const vp = page.getViewport({ scale: scale, rotation: PDFX.state.rotation.get(n) || 0 });
  const canvas = document.createElement('canvas');
  canvas.width  = Math.max(1, Math.floor(vp.width));
  canvas.height = Math.max(1, Math.floor(vp.height));
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport: vp, annotationMode: PDFX.ANN_ENABLE }).promise;
  page.cleanup();
  const blob = await new Promise(r => canvas.toBlob(r, fmt === 'png' ? 'image/png' : 'image/jpeg', 0.92));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width: vp.width, height: vp.height };
}

/**
 * 把某一页的位图嵌入目标 pdf-lib 文档并追加为整页。
 * @param {object} out 目标 PDFDocument
 * @param {number} n 页码
 * @param {number} scale 渲染倍率
 * @param {string} fmt 图片格式
 */
async function addRasterPage(out, n, scale, fmt) {
  const { bytes, width, height } = await renderPageToImage(n, scale, fmt);
  const img = fmt === 'png' ? await out.embedPng(bytes) : await out.embedJpg(bytes);
  const pg = out.addPage([width, height]);
  pg.drawImage(img, { x: 0, y: 0, width: width, height: height });
}

/**
 * 生成仅含某一页的独立 PDF（供"拆分为单页 ZIP"使用，加密文档走图片化路径）。
 * @param {number} n 页码
 * @param {number} scale 渲染倍率
 * @param {string} fmt 图片格式
 * @returns {Promise<Uint8Array>} 单页 PDF 字节
 */
async function rasterPageBytes(n, scale, fmt) {
  const out = await PDFLib.PDFDocument.create();
  await addRasterPage(out, n, scale, fmt);
  return out.save({ useObjectStreams: true });
}

/**
 * 矢量提取：把选中页从原文档复制到新文档（保留文字可选中性，加密文件不可用）。
 * @param {number[]} pageNums 按输出顺序排列的页码
 * @returns {Promise<Uint8Array>} 新 PDF 字节
 */
async function extractVector(pageNums) {
  const out = await PDFLib.PDFDocument.create();
  try {
    // 尽量沿用原文档标题，便于识别
    const t = PDFX.state.pdfLibDoc.getTitle();
    if (t) out.setTitle(t + '（提取页）');
  } catch (e) { /* 忽略 */ }
  const pages = await out.copyPages(PDFX.state.pdfLibDoc, pageNums.map(n => n - 1));
  pages.forEach((p, i) => {
    out.addPage(p);
    // 应用用户设置的旋转角度
    const r = PDFX.state.rotation.get(pageNums[i]);
    if (r) p.setRotation({ type: 'degrees', angle: (p.getRotation().angle + r) % 360 });
  });
  return out.save({ useObjectStreams: true });
}

/**
 * 计算提取时的实际输出顺序：默认按页码升序，开启倒序后反转。
 * @returns {number[]} 排序后的页码数组
 */
function selectionOrder() {
  const nums = [...state.selection].sort((a, b) => a - b);
  if (PDFX.state.reverse) nums.reverse();
  return nums;
}

/**
 * 提取所选页面为新 PDF 并触发下载。
 * 普通文档走矢量提取；加密文档自动切换为图片化输出。
 */
async function extractPdf() {
  if (!PDFX.state.selection.size) { PDFX.toast('请先选择要提取的页面'); return; }
  const nums = selectionOrder();
  const vectorOk = PDFX.state.pdfLibDoc && !PDFX.state.encrypted;
  PDFX.showBusy('正在提取…');
  try {
    let bytes;
    if (vectorOk) {
      bytes = await extractVector(nums);
    } else {
      // 图片化路径：逐页渲染并嵌入新文档，期间显示进度
      const s = rasterSettings();
      const out = await PDFLib.PDFDocument.create();
      for (let k = 0; k < nums.length; k++) {
        PDFX.showBusy('正在提取（' + (k + 1) + '/' + nums.length + '）');
        await addRasterPage(out, nums[k], s.scale, s.fmt);
      }
      bytes = await out.save({ useObjectStreams: true });
    }
    // 依据选中页生成描述性文件名
    const base = PDFX.fileNameBase(PDFX.state.fileName);
    const sorted = [...state.selection].sort((a, b) => a - b);
    const suf = sorted.length === PDFX.state.numPages ? '全页' : '第' + PDFX.rangesOf(sorted) + '页';
    PDFX.download(new Blob([bytes], { type: 'application/pdf' }), base + '_' + suf + '.pdf');
    PDFX.toast('已提取 ' + nums.length + ' 页');
  } catch (e) {
    console.error(e);
    PDFX.toast('提取失败：' + (e.message || e));
  }
  PDFX.hideBusy();
}

/**
 * 拆分为单页 ZIP：把每一页分别生成独立 PDF，打包为压缩包下载。
 */
async function splitZip() {
  if (!PDFX.state.selection.size) { PDFX.toast('请先选择要拆分的页面'); return; }
  const nums = [...state.selection].sort((a, b) => a - b);
  const vectorOk = PDFX.state.pdfLibDoc && !PDFX.state.encrypted;
  const s = rasterSettings();
  PDFX.showBusy('正在拆分…');
  try {
    const zip = new JSZip();
    const base = PDFX.fileNameBase(PDFX.state.fileName);
    for (let k = 0; k < nums.length; k++) {
      PDFX.showBusy('正在拆分（' + (k + 1) + '/' + nums.length + '）');
      let bytes;
      if (vectorOk) {
        // 矢量路径：复制单页并应用旋转
        const out = await PDFLib.PDFDocument.create();
        const [p] = await out.copyPages(PDFX.state.pdfLibDoc, [nums[k] - 1]);
        out.addPage(p);
        const r = PDFX.state.rotation.get(nums[k]);
        if (r) p.setRotation({ type: 'degrees', angle: (p.getRotation().angle + r) % 360 });
        bytes = await out.save({ useObjectStreams: true });
      } else {
        // 图片化路径
        bytes = await rasterPageBytes(nums[k], s.scale, s.fmt);
      }
      zip.file(base + '_第' + nums[k] + '页.pdf', new Blob([bytes], { type: 'application/pdf' }));
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    PDFX.download(blob, base + '_单页拆分.zip');
    PDFX.toast('已拆分为 ' + nums.length + ' 个文件');
  } catch (e) {
    console.error(e);
    PDFX.toast('拆分失败：' + (e.message || e));
  }
  PDFX.hideBusy();
}

/* ---------------- 合并 ---------------- */

  Object.assign(PDFX, { rasterSettings, renderPageToImage, addRasterPage, rasterPageBytes, extractVector, selectionOrder, extractPdf, splitZip });
})(window.PDFX = window.PDFX || {});

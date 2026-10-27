/* features/document —— 见文件末尾导出 */
(function (PDFX) {
  'use strict';

/**
 * 初始化 PDF.js 渲染引擎。
 * worker 源码以内联方式存放在页面中（text/plain 脚本块），
 * 运行期将其构造成 Blob URL 交给 PDF.js，从而在 file:// 离线场景下也能工作。
 */
function setupPdfjsWorker() {
  const el = document.getElementById('pdfjs-worker-src');
  let src = el ? el.textContent : '';
  // 还原构建期对 "</script" 的转义
  src = src.replace(/<\\\/script/g, '</script');
  const blob = new Blob([src], { type: 'text/javascript' });
  pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob);
}

/* ---------------- 打开文件 ---------------- */

/**
 * 文件选择框 change 事件处理：读取第一个 PDF 文件。
 * @param {Event} e change 事件对象
 */
function onPickFile(e) {
  const f = e.target.files && e.target.files[0];
  if (f) openFile(f);
  e.target.value = '';
}

/**
 * 读取本地文件为字节数组后交给 openBytes 处理。
 * 使用 FileReader 读取，并对常见失败原因（文件被移动/删除、云盘或微信临时文件、
 * 浏览器安全限制等）给出针对性的中文提示，方便用户判断如何解决。
 * @param {File} file 用户选择的文件
 */
function openFile(file) {
  if (!file) return;
  // 大文件提醒：超大 PDF 在手机上解析需要较多内存，提前告知更稳妥
  const mb = file.size / 1024 / 1024;
  if (mb > 80) {
    PDFX.toast('文件较大（' + Math.round(mb) + 'MB），若读取失败请先将文件保存到手机本地再重试');
  }
  const reader = new FileReader();
  reader.onload = () => {
    openBytes(new Uint8Array(reader.result), file.name);
  };
  reader.onerror = () => {
    const name = reader.error && reader.error.name;
    let tip = '文件读取失败，请重试';
    if (name === 'NotFoundError') {
      tip = '读取失败：文件在读取时被移动、删除或暂不可用（常见于微信、网盘、云盘的临时文件）。请先把文件保存到手机"下载"或本地文件夹后，再重新打开';
    } else if (name === 'SecurityError') {
      tip = '读取失败：浏览器安全限制阻止了文件读取，请改用 Chrome 浏览器打开';
    } else if (name === 'AbortError') {
      tip = '读取失败：读取被中断，请重试一次';
    } else {
      tip = '读取失败（' + (name || '未知错误') + '）。超大文件建议用电脑浏览器处理';
    }
    PDFX.toast(tip);
  };
  reader.readAsArrayBuffer(file);
}

/**
 * 核心入口：用字节数组打开 PDF。
 * 流程：先用 pdf.js 解析用于渲染；再用 pdf-lib 加载用于矢量提取；
 * 若文件加密，则提示用户输入密码后重试。
 * @param {Uint8Array} bytes PDF 文件字节
 * @param {string} name 文件名
 */
async function openBytes(bytes, name) {
  PDFX.state.bytes = bytes;
  PDFX.state.fileName = name;
  PDFX.showBusy('正在解析 PDF…');
  try {
    // 注意：pdf.js 会转移传入的 ArrayBuffer，这里传副本，保留原始字节给 pdf-lib 用
    const task = pdfjsLib.getDocument(Object.assign({ data: bytes.slice() }, PDFX.PDF_OPTS));
    PDFX.state.task = task;
    PDFX.state.doc = await task.promise;
    PDFX.state.encrypted = false;
  } catch (e) {
    // 加密文件首次打开会抛出密码异常，转入密码输入流程
    if (e && (e.name === 'PasswordException' || /password/i.test(e.message || ''))) {
      const ok = await askPasswordAndRetry(0);
      if (!ok) { PDFX.hideBusy(); PDFX.toast('未提供正确密码，无法打开'); return; }
    } else {
      PDFX.hideBusy();
      PDFX.toast('无法解析该 PDF：' + (e.message || e));
      return;
    }
  }
  PDFX.state.numPages = PDFX.state.doc.numPages;
  // 尝试用 pdf-lib 加载（成功则提取时保留矢量内容）
  try {
    PDFX.state.pdfLibDoc = await PDFLib.PDFDocument.load(bytes);
    PDFX.state.encrypted = false;
  } catch (e) {
    // pdf-lib 无法读取加密文件，后续提取自动切换为图片化输出
    PDFX.state.pdfLibDoc = null;
    PDFX.state.encrypted = true;
  }
  PDFX.hideBusy();
  buildSingleView();
  PDFX.switchMode('single');
}

/**
 * 加密 PDF 的密码输入流程：弹窗收集密码并重试打开，最多尝试三次。
 * @param {number} attempt 当前第几次尝试（从 0 开始）
 * @returns {Promise<boolean>} 是否成功打开
 */
async function askPasswordAndRetry(attempt) {
  if (attempt >= 3) return false;
  const pw = await PDFX.showDialog({
    title: '该 PDF 已加密',
    message: '请输入密码以打开文件：',
    placeholder: '密码',
    okText: '打开',
  });
  if (pw === null) return false;
  try {
    const task = pdfjsLib.getDocument(Object.assign({ data: PDFX.state.bytes.slice(), password: pw }, PDFX.PDF_OPTS));
    PDFX.state.task = task;
    PDFX.state.doc = await task.promise;
    PDFX.state.encrypted = true; // pdf-lib 无法读取加密文件
    return true;
  } catch (e) {
    PDFX.toast('密码错误，请重试');
    return askPasswordAndRetry(attempt + 1);
  }
}

/**
 * 通过网址打开 PDF：下载远程文件后进入 openBytes 流程。
 * 受浏览器跨域限制，仅对允许 CORS 的链接有效。
 */
async function openUrl() {
  const u = PDFX.$('#urlInput').value.trim();
  if (!u) { PDFX.toast('请输入 PDF 链接'); return; }
  PDFX.showBusy('正在下载…');
  try {
    const res = await fetch(u);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const buf = await res.arrayBuffer();
    // 从链接中尽量推导出文件名，否则使用默认名
    let name = decodeURIComponent(u.split('?')[0].split('/').pop() || '');
    if (!name || !/\.pdf$/i.test(name)) name = (name || 'remote') + '.pdf';
    await openBytes(new Uint8Array(buf), name);
  } catch (e) {
    PDFX.hideBusy();
    PDFX.toast('下载失败（多数网站不允许跨域，请先下载到本地再打开）：' + (e.message || e));
  }
}

/* ---------------- 单文件视图 ---------------- */

/**
 * 构建单文件模式的界面：显示文件信息、生成页面卡片网格，
 * 并注册基于 IntersectionObserver 的缩略图懒加载。
 */
function buildSingleView() {
  PDFX.$('#fileName').textContent = PDFX.state.fileName;
  PDFX.$('#pageCount').textContent = `共 PDFX.${PDFX.state.numPages} 页`;
  PDFX.$('#encryptedBadge').classList.toggle('hidden', !PDFX.state.encrypted);
  // 导出设置只在加密 PDF 下才有意义（普通 PDF 走矢量提取，不受影响）
  PDFX.$('#exportSettings').classList.toggle('hidden', !PDFX.state.encrypted);
  PDFX.$('#filePanel').classList.remove('hidden');
  PDFX.$('#quickPanel').classList.remove('hidden');
  PDFX.$('#toolsPanel').classList.remove('hidden');
  PDFX.$('#dropzone').classList.add('hidden');
  PDFX.$('#pageList').classList.remove('hidden');
  PDFX.$('#bottombar').classList.remove('hidden');
  PDFX.syncBottomBar();

  PDFX.state.selection = new Set();
  PDFX.state.rotation = new Map();
  resetThumbQueue();
  const list = PDFX.$('#pageList');
  list.innerHTML = '';
  // 为每一页生成一张卡片
  for (let i = 1; i <= PDFX.state.numPages; i++) list.appendChild(makeCard(i));

  // 懒加载：只有卡片进入视口附近才渲染缩略图，避免大文档一次性渲染卡顿
  if (PDFX.state.io) PDFX.state.io.disconnect();
  PDFX.state.io = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (!en.isIntersecting) return;
      queueThumb(+en.target.dataset.page, en.target);
      PDFX.state.io.unobserve(en.target);
    });
  }, { root: null, rootMargin: '400px' });
  PDFX.$$('#pageList .card').forEach(c => PDFX.state.io.observe(c));

  PDFX.updateBottomBar();
  PDFX.toast(`已打开：共 PDFX.${PDFX.state.numPages} 页`);
}

/**
 * 生成单张页面卡片：包含缩略图画布、页码角标、勾选标记和预览按钮。
 * @param {number} n 页码（从 1 开始）
 * @returns {HTMLElement} 页面卡片元素
 */
function makeCard(n) {
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.page = n;
  card.innerHTML =
    '<div class="thumb"><canvas></canvas><div class="ph">加载中…</div></div>' +
    '<div class="card-top">' +
      '<span class="check"><svg viewBox="0 0 24 24"><use href="#i-check"/></svg></span>' +
      '<span class="pno">' + n + '</span>' +
      '<button class="eye" data-act="preview" title="预览"><svg viewBox="0 0 24 24"><use href="#i-eye"/></svg></button>' +
    '</div>';
  // 点击卡片主体切换勾选；点击眼睛图标进入全屏预览
  card.addEventListener('click', e => {
    if (e.target.closest('[data-act="preview"]')) { PDFX.openPreview(+card.dataset.page); return; }
    PDFX.toggleSelect(+card.dataset.page);
  });
  return card;
}

/**
 * 渲染某一页的缩略图到指定卡片中的 canvas。
 * 使用高 DPI 缩放保证手机屏幕上清晰，渲染后释放页面资源。
 * @param {number} n 页码
 * @param {HTMLElement} card 页面卡片元素
 */
/* ---------------- 缩略图渲染队列 ----------------

 * 滚动快时 IntersectionObserver 会一次触发几十张卡片，
 * 全部并行渲染会瞬间吃满内存、掉帧。这里限制同时渲染的数量。
 */
const thumbQueue = [];

let thumbRunning = 0;

const THUMB_CONCURRENCY = 3;

function queueThumb(n, card) {
  if (thumbQueue.some(job => job.n === n)) return;   // 同一页不重复排队
  thumbQueue.push({ n, card });
  pumpThumbQueue();
}

function pumpThumbQueue() {
  while (thumbRunning < THUMB_CONCURRENCY && thumbQueue.length) {
    const job = thumbQueue.shift();
    thumbRunning++;
    renderThumb(job.n, job.card).finally(() => {
      thumbRunning--;
      pumpThumbQueue();
    });
  }
}

/** 换文件时清空待渲染队列，避免旧文档的卡片被渲染。 */
function resetThumbQueue() {
  thumbQueue.length = 0;
}

async function renderThumb(n, card) {
  try {
    const page = await PDFX.state.doc.getPage(n);
    const rot = PDFX.state.rotation.get(n) || 0;
    const v1 = page.getViewport({ scale: 1, rotation: rot });
    // 按卡片宽度换算渲染比例，宽度过大时限制为原尺寸；旋转后宽高互换，按旋转后的宽度算
    const vp = page.getViewport({ scale: Math.min(1, 130 / v1.width), rotation: rot });
    const canvas = card.querySelector('canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width  = Math.max(1, Math.floor(vp.width * dpr));
    canvas.height = Math.max(1, Math.floor(vp.height * dpr));
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    await page.render({ canvasContext: ctx, viewport: vp, annotationMode: PDFX.ANN_ENABLE }).promise;
    const ph = card.querySelector('.ph');
    if (ph) ph.remove();
    page.cleanup();
  } catch (e) {
    const ph = card.querySelector('.ph');
    if (ph) ph.textContent = '渲染失败';
  }
}

  Object.assign(PDFX, { setupPdfjsWorker, onPickFile, openFile, openBytes, askPasswordAndRetry, openUrl, buildSingleView, makeCard, thumbQueue, thumbRunning, THUMB_CONCURRENCY, queueThumb, pumpThumbQueue, resetThumbQueue, renderThumb });
})(window.PDFX = window.PDFX || {});

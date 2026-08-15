'use strict';
/* global pdfjsLib, PDFLib, JSZip */
/* PDF 页面提取器 —— 纯前端，本地处理，不上传文件 */

/**
 * DOM 快捷查询：返回匹配选择器的第一个元素。
 * @param {string} s CSS 选择器
 * @returns {Element|null}
 */
const $  = s => document.querySelector(s);

/**
 * DOM 快捷查询：返回匹配选择器的全部元素。
 * @param {string} s CSS 选择器
 * @returns {Element[]}
 */
const $$ = s => Array.from(document.querySelectorAll(s));

/**
 * 全局运行状态对象。
 * - bytes：当前打开的 PDF 原始字节（Uint8Array）
 * - doc：pdf.js 解析出的文档对象，用于缩略图、预览与图片化输出
 * - pdfLibDoc：pdf-lib 加载的文档对象，用于矢量提取（加密文件为空）
 * - selection：已勾选的页码集合（从 1 开始）
 * - rotation：页码 -> 累计旋转角度（0/90/180/270）
 * - mergeFiles：合并模式下已添加的文件列表
 */
const state = {
  bytes: null,          // 原始文件 (Uint8Array)
  fileName: '',
  doc: null,            // pdf.js 文档（用于预览/渲染）
  task: null,
  numPages: 0,
  pdfLibDoc: null,      // pdf-lib 文档（用于矢量提取），加密时为空
  encrypted: false,
  selection: new Set(), // 选中的页码（1 起）
  rotation: new Map(),  // 页码 -> 累计旋转角度
  reverse: false,
  mode: 'single',
  mergeFiles: [],       // {name, bytes, pdfLibDoc}
  preview: null,        // {page, zoom}
  io: null,
};

/* ---------------- 工具函数 ---------------- */

/**
 * HTML 转义，防止文件名等用户内容注入页面结构。
 * @param {*} s 原始文本
 * @returns {string} 转义后的文本
 */
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/**
 * 弹出轻提示（Toast），自动在指定时长后消失。
 * @param {string} msg 提示文案
 * @param {number} ms 显示时长（毫秒）
 */
function toast(msg, ms = 2400) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), ms);
}

/** 显示全屏处理中遮罩。@param {string} text 进度文案 */
function showBusy(text) { $('#busyText').textContent = text || '处理中…'; $('#busy').classList.remove('hidden'); }

/** 隐藏全屏处理中遮罩。 */
function hideBusy()     { $('#busy').classList.add('hidden'); }

/**
 * 从文件名中剥离 .pdf 后缀，作为输出文件名的基底。
 * @param {string} name 原文件名
 * @returns {string} 去掉扩展名后的名称
 */
function fileNameBase(name) { return (name || 'output').replace(/\.pdf$/i, '') || 'output'; }

/**
 * 触发浏览器下载一个 Blob 文件。
 * @param {Blob} blob 文件内容
 * @param {string} name 下载文件名
 */
function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
}

/**
 * 把页码集合压缩成 "1-3,5,8-10" 这类紧凑区间表达，用于提示与命名。
 * @param {Set<number>|number[]} nums 页码集合
 * @returns {string} 压缩后的页码区间字符串
 */
function rangesOf(nums) {
  const a = [...nums].sort((x, y) => x - y);
  if (!a.length) return '';
  const parts = [];
  let s = a[0], p = a[0];
  // 遍历有序页码，把连续的一段合并为 "起-止"，其余单页独立列出
  for (let i = 1; i <= a.length; i++) {
    if (a[i] === p + 1) { p = a[i]; continue; }
    parts.push(s === p ? String(s) : `${s}-${p}`);
    s = p = a[i];
  }
  return parts.join(',');
}

/**
 * 解析 "1-3, 5, 8-10" 这类自定义页码字符串，兼容中文逗号与多种连接符。
 * @param {string} s 用户输入的页码文本
 * @returns {number[]} 落在合法页码范围内的页码数组
 */
function parseCsv(s) {
  const out = new Set();
  String(s).split(/[,，;；\s]+/).forEach(part => {
    // 支持 "2-5"、"2～5"、"2至5" 等连续区间写法
    const m = part.match(/^(\d+)\s*[-–—~至]\s*(\d+)$/);
    if (m) {
      const a = +m[1], b = +m[2];
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) out.add(i);
    } else if (/^\d+$/.test(part)) {
      out.add(+part);
    }
  });
  // 过滤掉超出文档范围的页码
  return [...out].filter(n => n >= 1 && n <= state.numPages);
}

/* ---------------- PDF.js worker（内联，保证 file:// 离线可用） ---------------- */

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
    toast('文件较大（' + Math.round(mb) + 'MB），若读取失败请先将文件保存到手机本地再重试');
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
    toast(tip);
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
  state.bytes = bytes;
  state.fileName = name;
  showBusy('正在解析 PDF…');
  try {
    // 注意：pdf.js 会转移传入的 ArrayBuffer，这里传副本，保留原始字节给 pdf-lib 用
    const task = pdfjsLib.getDocument({ data: bytes.slice(), isEvalSupported: false });
    state.task = task;
    state.doc = await task.promise;
    state.encrypted = false;
  } catch (e) {
    // 加密文件首次打开会抛出密码异常，转入密码输入流程
    if (e && (e.name === 'PasswordException' || /password/i.test(e.message || ''))) {
      const ok = await askPasswordAndRetry(0);
      if (!ok) { hideBusy(); toast('未提供正确密码，无法打开'); return; }
    } else {
      hideBusy();
      toast('无法解析该 PDF：' + (e.message || e));
      return;
    }
  }
  state.numPages = state.doc.numPages;
  // 尝试用 pdf-lib 加载（成功则提取时保留矢量内容）
  try {
    state.pdfLibDoc = await PDFLib.PDFDocument.load(bytes);
    state.encrypted = false;
  } catch (e) {
    // pdf-lib 无法读取加密文件，后续提取自动切换为图片化输出
    state.pdfLibDoc = null;
    state.encrypted = true;
  }
  hideBusy();
  buildSingleView();
  switchMode('single');
}

/**
 * 加密 PDF 的密码输入流程：弹窗收集密码并重试打开，最多尝试三次。
 * @param {number} attempt 当前第几次尝试（从 0 开始）
 * @returns {Promise<boolean>} 是否成功打开
 */
async function askPasswordAndRetry(attempt) {
  if (attempt >= 3) return false;
  const pw = await showDialog({
    title: '该 PDF 已加密',
    message: '请输入密码以打开文件：',
    placeholder: '密码',
    okText: '打开',
  });
  if (pw === null) return false;
  try {
    const task = pdfjsLib.getDocument({ data: state.bytes.slice(), password: pw, isEvalSupported: false });
    state.task = task;
    state.doc = await task.promise;
    state.encrypted = true; // pdf-lib 无法读取加密文件
    return true;
  } catch (e) {
    toast('密码错误，请重试');
    return askPasswordAndRetry(attempt + 1);
  }
}

/**
 * 通过网址打开 PDF：下载远程文件后进入 openBytes 流程。
 * 受浏览器跨域限制，仅对允许 CORS 的链接有效。
 */
async function openUrl() {
  const u = $('#urlInput').value.trim();
  if (!u) { toast('请输入 PDF 链接'); return; }
  showBusy('正在下载…');
  try {
    const res = await fetch(u);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const buf = await res.arrayBuffer();
    // 从链接中尽量推导出文件名，否则使用默认名
    let name = decodeURIComponent(u.split('?')[0].split('/').pop() || '');
    if (!name || !/\.pdf$/i.test(name)) name = (name || 'remote') + '.pdf';
    await openBytes(new Uint8Array(buf), name);
  } catch (e) {
    hideBusy();
    toast('下载失败（多数网站不允许跨域，请先下载到本地再打开）：' + (e.message || e));
  }
}

/* ---------------- 单文件视图 ---------------- */

/**
 * 构建单文件模式的界面：显示文件信息、生成页面卡片网格，
 * 并注册基于 IntersectionObserver 的缩略图懒加载。
 */
function buildSingleView() {
  $('#fileName').textContent = state.fileName;
  $('#pageCount').textContent = `共 ${state.numPages} 页`;
  $('#encryptedBadge').classList.toggle('hidden', !state.encrypted);
  $('#filePanel').classList.remove('hidden');
  $('#quickPanel').classList.remove('hidden');
  $('#toolsPanel').classList.remove('hidden');
  $('#dropzone').classList.add('hidden');
  $('#pageList').classList.remove('hidden');
  $('#bottombar').classList.remove('hidden');

  state.selection = new Set();
  state.rotation = new Map();
  const list = $('#pageList');
  list.innerHTML = '';
  // 为每一页生成一张卡片
  for (let i = 1; i <= state.numPages; i++) list.appendChild(makeCard(i));

  // 懒加载：只有卡片进入视口附近才渲染缩略图，避免大文档一次性渲染卡顿
  if (state.io) state.io.disconnect();
  state.io = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (!en.isIntersecting) return;
      renderThumb(+en.target.dataset.page, en.target);
      state.io.unobserve(en.target);
    });
  }, { root: null, rootMargin: '400px' });
  $$('#pageList .card').forEach(c => state.io.observe(c));

  updateBottomBar();
  toast(`已打开：共 ${state.numPages} 页`);
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
      '<span class="check">✓</span>' +
      '<span class="pno">' + n + '</span>' +
      '<button class="eye" data-act="preview" title="预览">👁</button>' +
    '</div>';
  // 点击卡片主体切换勾选；点击眼睛图标进入全屏预览
  card.addEventListener('click', e => {
    if (e.target.closest('[data-act="preview"]')) { openPreview(+card.dataset.page); return; }
    toggleSelect(+card.dataset.page);
  });
  return card;
}

/**
 * 渲染某一页的缩略图到指定卡片中的 canvas。
 * 使用高 DPI 缩放保证手机屏幕上清晰，渲染后释放页面资源。
 * @param {number} n 页码
 * @param {HTMLElement} card 页面卡片元素
 */
async function renderThumb(n, card) {
  try {
    const page = await state.doc.getPage(n);
    const v1 = page.getViewport({ scale: 1 });
    // 按卡片宽度换算渲染比例，宽度过大时限制为原尺寸
    const vp = page.getViewport({ scale: Math.min(1, 130 / v1.width) });
    const canvas = card.querySelector('canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width  = Math.max(1, Math.floor(vp.width * dpr));
    canvas.height = Math.max(1, Math.floor(vp.height * dpr));
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    const ph = card.querySelector('.ph');
    if (ph) ph.remove();
    page.cleanup();
  } catch (e) {
    const ph = card.querySelector('.ph');
    if (ph) ph.textContent = '渲染失败';
  }
}

/**
 * 点击卡片切换页面勾选状态，并同步底部已选计数。
 * @param {number} n 页码
 */
function toggleSelect(n) {
  const card = document.querySelector('.card[data-page="' + n + '"]');
  if (state.selection.has(n)) {
    state.selection.delete(n);
    if (card) card.classList.remove('sel');
  } else {
    state.selection.add(n);
    if (card) card.classList.add('sel');
  }
  updateBottomBar();
}

/**
 * 程序化添加一页到选择集合（用于范围/自定义页码批量添加）。
 * @param {number} n 页码
 */
function addToSelection(n) {
  if (n < 1 || n > state.numPages || state.selection.has(n)) return;
  state.selection.add(n);
  const c = document.querySelector('.card[data-page="' + n + '"]');
  if (c) c.classList.add('sel');
  updateBottomBar();
}

/**
 * 刷新底部操作栏：显示已选页数、所选页码摘要，并控制提取/拆分按钮可用性。
 */
function updateBottomBar() {
  const n = state.selection.size;
  $('#selCount').textContent = n + ' / ' + state.numPages;
  $('#extractBtn').disabled = n === 0;
  $('#splitBtn').disabled = n === 0;
  const r = rangesOf(state.selection) || '未选择页面';
  $('#rangeHint').textContent = '已选页面：' + r;
  $('#rangeHint2').textContent = r;
}

/* ---------------- 选择工具 ---------------- */

/** 全选所有页面。 */
function selectAll() {
  for (let i = 1; i <= state.numPages; i++) state.selection.add(i);
  $$('#pageList .card').forEach(c => c.classList.add('sel'));
  updateBottomBar();
}

/** 清空全部勾选。 */
function selectNone() {
  state.selection.clear();
  $$('#pageList .card').forEach(c => c.classList.remove('sel'));
  updateBottomBar();
}

/** 反选：已选变未选、未选变已选，常用于快速保留除少数页之外的全部页面。 */
function invertSelect() {
  for (let i = 1; i <= state.numPages; i++) {
    if (state.selection.has(i)) state.selection.delete(i); else state.selection.add(i);
  }
  $$('#pageList .card').forEach(c => c.classList.toggle('sel', state.selection.has(+c.dataset.page)));
  updateBottomBar();
}

/** 切换"倒序提取"开关状态。 */
function toggleReverse() {
  state.reverse = !state.reverse;
  $('#reverseChip').classList.toggle('on', state.reverse);
}

/**
 * 为所有选中页追加一次 90 度旋转（可叠加到 360 度）。
 * 旋转记录在 state.rotation 中，预览与提取结果都会应用。
 */
function rotateSelected() {
  if (!state.selection.size) { toast('请先选择页面'); return; }
  state.selection.forEach(n => state.rotation.set(n, ((state.rotation.get(n) || 0) + 90) % 360));
  toast('已为选中页追加 90° 旋转');
  // 若预览窗口正显示被旋转的页面，立即刷新预览
  if (state.preview && state.selection.has(state.preview.page)) renderPreview();
}

/**
 * 按"起止页码"批量勾选连续页面。
 * 输入须满足 1 <= 起 <= 止 <= 总页数。
 */
function addRange() {
  const a = parseInt($('#rangeFrom').value, 10);
  const b = parseInt($('#rangeTo').value, 10);
  if (!a || !b || a > b || a < 1 || b > state.numPages) {
    toast('请输入 1 ~ ' + state.numPages + ' 之间的起止页码');
    return;
  }
  for (let i = a; i <= b; i++) addToSelection(i);
  toast('已添加第 ' + a + ' ~ ' + b + ' 页');
}

/**
 * 按"自定义页码"输入批量勾选，支持 1-3,5,8-10 等组合格式。
 */
function addCustom() {
  const nums = parseCsv($('#customPages').value);
  if (!nums.length) { toast('请输入页码，如 1-3, 5, 8-10'); return; }
  nums.forEach(addToSelection);
  toast('已添加 ' + nums.length + ' 页');
}

/* ---------------- 预览 ---------------- */

/**
 * 打开某一页的全屏预览弹窗。
 * @param {number} n 页码
 */
function openPreview(n) {
  state.preview = { page: n, zoom: 1 };
  $('#pvTitle').textContent = '第 ' + n + ' / ' + state.numPages + ' 页';
  $('#previewModal').classList.remove('hidden');
  renderPreview();
}

/** 关闭全屏预览弹窗。 */
function closePreview() { state.preview = null; $('#previewModal').classList.add('hidden'); }

/**
 * 缩放预览：按方向调整倍率（限制在 0.4 ~ 4 倍之间）。
 * @param {number} d 1 放大、-1 缩小
 */
function pvZoom(d) {
  if (!state.preview) return;
  state.preview.zoom = Math.min(4, Math.max(0.4, state.preview.zoom * (d > 0 ? 1.3 : 1 / 1.3)));
  renderPreview();
}

/** 预览中旋转当前页 90 度，同步更新 rotation 记录。 */
function pvRotate() {
  if (!state.preview) return;
  const n = state.preview.page;
  state.rotation.set(n, ((state.rotation.get(n) || 0) + 90) % 360);
  renderPreview();
}

/**
 * 渲染全屏预览：按屏幕宽度自适应缩放，并应用该页的旋转设置。
 */
async function renderPreview() {
  const p = state.preview;
  if (!p || !state.doc) return;
  try {
    const page = await state.doc.getPage(p.page);
    const v1 = page.getViewport({ scale: 1 });
    // 先按屏宽适配，再叠加用户缩放倍率与页面旋转
    const fit = (window.innerWidth - 24) / v1.width;
    const vp = page.getViewport({ scale: fit * p.zoom, rotation: state.rotation.get(p.page) || 0 });
    const canvas = $('#pvCanvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width  = Math.floor(vp.width * dpr);
    canvas.height = Math.floor(vp.height * dpr);
    canvas.style.width = vp.width + 'px';
    canvas.style.height = vp.height + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    page.cleanup();
    $('#pvWrap').scrollTop = 0;
  } catch (e) { /* 忽略预览渲染错误 */ }
}

// 滑动切换预览页：记录触摸起点，在 touchend 时判断横向滑动距离
let pvTouch = null;
$('#pvWrap').addEventListener('touchstart', e => {
  pvTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
}, { passive: true });
$('#pvWrap').addEventListener('touchend', e => {
  if (!pvTouch || !state.preview) return;
  const dx = e.changedTouches[0].clientX - pvTouch.x;
  const dy = e.changedTouches[0].clientY - pvTouch.y;
  // 横向位移足够大且明显大于纵向时，视为翻页手势
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
    const next = state.preview.page + (dx < 0 ? 1 : -1);
    if (next >= 1 && next <= state.numPages) openPreview(next);
  }
  pvTouch = null;
}, { passive: true });

/* ---------------- 提取 ---------------- */

/**
 * 读取"高级设置"中的图片化输出参数。
 * @returns {{scale: number, fmt: string}} 清晰度倍率与图片格式（jpeg/png）
 */
function rasterSettings() {
  const q = document.querySelector('input[name="quality"]:checked');
  const f = document.querySelector('input[name="imgfmt"]:checked');
  return { scale: +(q ? q.value : 2), fmt: f ? f.value : 'jpeg' };
}

/**
 * 把某一页渲染成位图（用于加密文档的图片化输出）。
 * @param {number} n 页码
 * @param {number} scale 渲染倍率（2=普通、3=高清）
 * @param {string} fmt 输出图片格式
 * @returns {Promise<{bytes: Uint8Array, width: number, height: number}>} 图片字节与页面尺寸
 */
async function renderPageToImage(n, scale, fmt) {
  const page = await state.doc.getPage(n);
  // 视口应用页面旋转设置，保证输出方向与用户设置一致
  const vp = page.getViewport({ scale: scale, rotation: state.rotation.get(n) || 0 });
  const canvas = document.createElement('canvas');
  canvas.width  = Math.max(1, Math.floor(vp.width));
  canvas.height = Math.max(1, Math.floor(vp.height));
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
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
    const t = state.pdfLibDoc.getTitle();
    if (t) out.setTitle(t + '（提取页）');
  } catch (e) { /* 忽略 */ }
  const pages = await out.copyPages(state.pdfLibDoc, pageNums.map(n => n - 1));
  pages.forEach((p, i) => {
    out.addPage(p);
    // 应用用户设置的旋转角度
    const r = state.rotation.get(pageNums[i]);
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
  if (state.reverse) nums.reverse();
  return nums;
}

/**
 * 提取所选页面为新 PDF 并触发下载。
 * 普通文档走矢量提取；加密文档自动切换为图片化输出。
 */
async function extractPdf() {
  if (!state.selection.size) { toast('请先选择要提取的页面'); return; }
  const nums = selectionOrder();
  const vectorOk = state.pdfLibDoc && !state.encrypted;
  showBusy('正在提取…');
  try {
    let bytes;
    if (vectorOk) {
      bytes = await extractVector(nums);
    } else {
      // 图片化路径：逐页渲染并嵌入新文档，期间显示进度
      const s = rasterSettings();
      const out = await PDFLib.PDFDocument.create();
      for (let k = 0; k < nums.length; k++) {
        showBusy('正在提取（' + (k + 1) + '/' + nums.length + '）');
        await addRasterPage(out, nums[k], s.scale, s.fmt);
      }
      bytes = await out.save({ useObjectStreams: true });
    }
    // 依据选中页生成描述性文件名
    const base = fileNameBase(state.fileName);
    const sorted = [...state.selection].sort((a, b) => a - b);
    const suf = sorted.length === state.numPages ? '全页' : '第' + rangesOf(sorted) + '页';
    download(new Blob([bytes], { type: 'application/pdf' }), base + '_' + suf + '.pdf');
    toast('已提取 ' + nums.length + ' 页');
  } catch (e) {
    console.error(e);
    toast('提取失败：' + (e.message || e));
  }
  hideBusy();
}

/**
 * 拆分为单页 ZIP：把每一页分别生成独立 PDF，打包为压缩包下载。
 */
async function splitZip() {
  if (!state.selection.size) { toast('请先选择要拆分的页面'); return; }
  const nums = [...state.selection].sort((a, b) => a - b);
  const vectorOk = state.pdfLibDoc && !state.encrypted;
  const s = rasterSettings();
  showBusy('正在拆分…');
  try {
    const zip = new JSZip();
    const base = fileNameBase(state.fileName);
    for (let k = 0; k < nums.length; k++) {
      showBusy('正在拆分（' + (k + 1) + '/' + nums.length + '）');
      let bytes;
      if (vectorOk) {
        // 矢量路径：复制单页并应用旋转
        const out = await PDFLib.PDFDocument.create();
        const [p] = await out.copyPages(state.pdfLibDoc, [nums[k] - 1]);
        out.addPage(p);
        const r = state.rotation.get(nums[k]);
        if (r) p.setRotation({ type: 'degrees', angle: (p.getRotation().angle + r) % 360 });
        bytes = await out.save({ useObjectStreams: true });
      } else {
        // 图片化路径
        bytes = await rasterPageBytes(nums[k], s.scale, s.fmt);
      }
      zip.file(base + '_第' + nums[k] + '页.pdf', new Blob([bytes], { type: 'application/pdf' }));
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    download(blob, base + '_单页拆分.zip');
    toast('已拆分为 ' + nums.length + ' 个文件');
  } catch (e) {
    console.error(e);
    toast('拆分失败：' + (e.message || e));
  }
  hideBusy();
}

/* ---------------- 合并 ---------------- */

/**
 * 合并模式：读取用户选择的多个 PDF 文件。
 * 可被 pdf-lib 正常读取的文件保留矢量能力；加密文件标记为空，合并时走图片化路径。
 * @param {Event} e change 事件对象
 */
async function onMergeFiles(e) {
  const files = Array.from(e.target.files || []);
  e.target.value = '';
  for (const f of files) {
    try {
      const buf = await f.arrayBuffer();
      let lib = null;
      try { lib = await PDFLib.PDFDocument.load(buf); } catch (err) { lib = null; }
      state.mergeFiles.push({ name: f.name, bytes: new Uint8Array(buf), pdfLibDoc: lib });
    } catch (err) {
      toast('读取失败：' + f.name);
    }
  }
  renderMergeList();
}

/**
 * 渲染合并文件列表：展示文件名、页数/加密标记，并提供上移、下移、移除操作。
 */
function renderMergeList() {
  const wrap = $('#mergeList');
  wrap.innerHTML = '';
  state.mergeFiles.forEach((f, i) => {
    const row = document.createElement('div');
    row.className = 'merge-row';
    const badge = f.pdfLibDoc
      ? esc(f.pdfLibDoc.getPageCount() + ' 页')
      : '<span style="color:var(--warn)">🔒 加密（转图片）</span>';
    row.innerHTML =
      '<span class="mr-name">' + esc(f.name) + '</span>' +
      '<span class="mr-badge">' + badge + '</span>' +
      '<div class="mr-btns">' +
        '<button data-i="' + i + '" data-a="up" title="上移">↑</button>' +
        '<button data-i="' + i + '" data-a="down" title="下移">↓</button>' +
        '<button data-i="' + i + '" data-a="del" title="移除">✕</button>' +
      '</div>';
    // 为每行按钮绑定排序/删除逻辑
    row.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      const i2 = +b.dataset.i, a = b.dataset.a;
      if (a === 'del') { state.mergeFiles.splice(i2, 1); renderMergeList(); }
      else if (a === 'up' && i2 > 0) {
        // 与上一项交换位置
        [state.mergeFiles[i2 - 1], state.mergeFiles[i2]] = [state.mergeFiles[i2], state.mergeFiles[i2 - 1]];
        renderMergeList();
      } else if (a === 'down' && i2 < state.mergeFiles.length - 1) {
        // 与下一项交换位置
        [state.mergeFiles[i2 + 1], state.mergeFiles[i2]] = [state.mergeFiles[i2], state.mergeFiles[i2 + 1]];
        renderMergeList();
      }
    }));
    wrap.appendChild(row);
  });
  $('#mergeEmpty').classList.toggle('hidden', state.mergeFiles.length > 0);
  $('#mergeGo').disabled = state.mergeFiles.length === 0;
}

/**
 * 按列表顺序把所有文件合并为一个新 PDF 并下载。
 * 普通文件复制全部页面；加密文件逐页渲染为图片后嵌入。
 */
async function mergeAll() {
  if (!state.mergeFiles.length) return;
  showBusy('正在合并…');
  try {
    const out = await PDFLib.PDFDocument.create();
    let total = 0;
    const s = rasterSettings();
    for (let k = 0; k < state.mergeFiles.length; k++) {
      const f = state.mergeFiles[k];
      showBusy('正在合并（' + (k + 1) + '/' + state.mergeFiles.length + '）：' + f.name);
      if (f.pdfLibDoc) {
        // 矢量路径：整体复制该文件全部页面
        const pages = await out.copyPages(f.pdfLibDoc, f.pdfLibDoc.getPageIndices());
        pages.forEach(p => out.addPage(p));
        total += pages.length;
      } else {
        // 图片化路径：先解析，必要时请求密码
        let doc;
        try {
          doc = await pdfjsLib.getDocument({ data: f.bytes.slice(), isEvalSupported: false }).promise;
        } catch (e) {
          if (e && (e.name === 'PasswordException' || /password/i.test(e.message || ''))) {
            const pw = await showDialog({
              title: '文件已加密：' + f.name,
              message: '请输入密码以读取该文件：',
              placeholder: '密码',
              okText: '继续',
            });
            if (pw === null) { toast('已跳过加密文件：' + f.name); continue; }
            doc = await pdfjsLib.getDocument({ data: f.bytes.slice(), password: pw, isEvalSupported: false }).promise;
          } else {
            throw e;
          }
        }
        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n);
          const vp = page.getViewport({ scale: s.scale });
          const canvas = document.createElement('canvas');
          canvas.width  = Math.floor(vp.width);
          canvas.height = Math.floor(vp.height);
          const ctx = canvas.getContext('2d');
          await page.render({ canvasContext: ctx, viewport: vp }).promise;
          page.cleanup();
          const blob = await new Promise(r => canvas.toBlob(r, s.fmt === 'png' ? 'image/png' : 'image/jpeg', 0.92));
          const img = s.fmt === 'png'
            ? await out.embedPng(new Uint8Array(await blob.arrayBuffer()))
            : await out.embedJpg(new Uint8Array(await blob.arrayBuffer()));
          const pg = out.addPage([vp.width, vp.height]);
          pg.drawImage(img, { x: 0, y: 0, width: vp.width, height: vp.height });
          total++;
        }
        doc.destroy();
      }
    }
    const bytes = await out.save({ useObjectStreams: true });
    const base = fileNameBase(state.mergeFiles[0].name);
    download(new Blob([bytes], { type: 'application/pdf' }), base + '_合并_' + total + '页.pdf');
    toast('合并完成，共 ' + total + ' 页');
  } catch (e) {
    console.error(e);
    toast('合并失败：' + (e.message || e));
  }
  hideBusy();
}

/* ---------------- 模式切换 / 对话框 ---------------- */

/**
 * 切换"提取页面 / 合并 PDF"两种工作模式。
 * @param {string} m 模式名：single 或 merge
 */
function switchMode(m) {
  state.mode = m;
  $('#tabSingle').classList.toggle('active', m === 'single');
  $('#tabMerge').classList.toggle('active', m === 'merge');
  $('#panelSingle').classList.toggle('hidden', m !== 'single');
  $('#panelMerge').classList.toggle('hidden', m !== 'merge');
}

let dlgResolve = null;
let dlgBusyMsg = null;

/**
 * 弹出可输入对话框（兼容 iOS 不支持原生 prompt 的限制）。
 * @param {{title?: string, message?: string, placeholder?: string, okText?: string, password?: boolean}} opts 对话框配置
 * @returns {Promise<string|null>} 用户输入内容；取消时为 null
 */
function showDialog(opts) {
  // 忙碌遮罩层级高于对话框，弹对话框前先隐藏（关闭时恢复）
  if (!$('#busy').classList.contains('hidden')) {
    dlgBusyMsg = $('#busyText').textContent;
    hideBusy();
  }
  $('#dlgTitle').textContent = opts.title || '输入';
  $('#dlgMsg').textContent = opts.message || '';
  $('#dlgMsg').classList.toggle('hidden', !opts.message);
  const inp = $('#dlgInput');
  inp.value = '';
  inp.placeholder = opts.placeholder || '';
  inp.type = opts.password === false ? 'text' : 'password';
  $('#dlgOk').textContent = opts.okText || '确定';
  $('#dialog').classList.remove('hidden');
  setTimeout(() => inp.focus(), 60);
  return new Promise(resolve => { dlgResolve = resolve; });
}

/**
 * 结束对话框并返回结果：隐藏弹窗、恢复被隐藏的忙碌遮罩、解析 Promise。
 * @param {string|null} v 用户输入或 null（取消）
 */
function finishDialog(v) {
  if (!dlgResolve) return;
  const r = dlgResolve;
  dlgResolve = null;
  $('#dialog').classList.add('hidden');
  if (dlgBusyMsg) { showBusy(dlgBusyMsg); dlgBusyMsg = null; }
  r(v);
}

/* ---------------- 拖拽 & 初始化 ---------------- */

/**
 * 为文件选择区域绑定拖拽打开能力（桌面端便利功能）。
 * @param {HTMLElement} dz 拖拽目标元素
 */
function bindDrag(dz) {
  ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('hover'); }));
  ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('hover'); }));
  dz.addEventListener('drop', e => {
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) openFile(f);
  });
}

/**
 * 页面初始化：注册 PDF.js worker、绑定所有事件、可选注册 PWA 离线缓存。
 */
function init() {
  setupPdfjsWorker();

  $('#fileInput').addEventListener('change', onPickFile);
  $('#mergeInput').addEventListener('change', onMergeFiles);
  bindDrag($('#dropzone'));

  // 对话框按钮与键盘事件
  $('#dlgOk').addEventListener('click', () => finishDialog($('#dlgInput').value.trim() || null));
  $('#dlgCancel').addEventListener('click', () => finishDialog(null));
  $('#dialog').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); finishDialog($('#dlgInput').value.trim() || null); }
    else if (e.key === 'Escape') finishDialog(null);
  });

  // 支持 "打开方式" 传参（例如从系统分享到浏览器打开 ?file=... 场景可扩展，此处略）

  // 仅在 http/https 协议下注册 Service Worker，file:// 打开时自动跳过
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* 忽略 */ });
  }
}

document.addEventListener('DOMContentLoaded', init);

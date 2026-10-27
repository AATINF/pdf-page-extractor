/* features/export —— 见文件末尾导出 */
(function (PDFX) {
  'use strict';

/**
 * 触发浏览器下载一个 Blob 文件。
 * @param {Blob} blob 文件内容
 * @param {string} name 下载文件名
 */
function download(blob, name) {
  // 开了「导出时询问文件名」就先弹窗，用户取消则整个导出作废
  if (askNameEnabled()) {
    askFileName(name).then(finalName => {
      if (!finalName) return;
      doDownload(blob, finalName);
    }).catch(() => {});
    return;
  }
  doDownload(blob, name);
}

/** 真正执行保存：App 走原生桥，浏览器走 <a download>。 */
function doDownload(blob, name) {
  // 安卓 App 里 WebView 不认 <a download> + blob:，必须交给原生写入系统「下载」目录
  if (PDFX.IS_APP && window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.FileSaver) {
    saveViaNative(blob, name);
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
  // 浏览器里没有 content:// URI，历史只留名字与体积
  PDFX.addHistory({ name, size: blob.size, time: Date.now(), uri: null, mime: blob.type || '' });
}

/* ---------------- 设置 ---------------- */

let nameResolver = null;

/**
 * 弹出「保存为」，预填默认名（主名全选，扩展名固定不可改）。
 * @param {string} defaultName 形如 sample_第1-3页.pdf
 * @returns {Promise<string|null>} 确认返回完整文件名，取消返回 null
 */
function askFileName(defaultName) {
  return new Promise(resolve => {
    const dot = defaultName.lastIndexOf('.');
    const base = dot > 0 ? defaultName.slice(0, dot) : defaultName;
    const ext = dot > 0 ? defaultName.slice(dot) : '';

    PDFX.$('#nameInput').value = base;
    PDFX.$('#nameExt').textContent = ext;
    PDFX.$('#nameDialog').classList.remove('hidden');
    nameResolver = resolve;

    // 稍等一帧再聚焦，否则安卓键盘可能弹不出来
    setTimeout(() => {
      const input = PDFX.$('#nameInput');
      input.focus();
      input.select();
    }, 60);
  });
}

function finishNameDialog(ok) {
  const dialog = PDFX.$('#nameDialog');
  if (dialog.classList.contains('hidden')) return;
  dialog.classList.add('hidden');

  const resolve = nameResolver;
  nameResolver = null;
  if (!resolve) return;

  if (!ok) { resolve(null); return; }

  const base = PDFX.$('#nameInput').value.trim().replace(/[\\/:*?"<>|]/g, '_');
  if (!base) { PDFX.toast('文件名不能为空'); resolve(null); return; }

  resolve(base + PDFX.$('#nameExt').textContent);
}

/**
 * Blob 转纯 base64（去掉 data: 前缀），供原生桥使用。
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result || '');
      const i = s.indexOf(',');
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    r.onerror = () => reject(r.error || new Error('读取文件失败'));
    r.readAsDataURL(blob);
  });
}

/**
 * 通过原生桥把文件写进系统「下载」目录。
 * @param {Blob} blob
 * @param {string} name 文件名
 */
let lastSaved = null;   // { uri, name, mime }

async function saveViaNative(blob, name) {
  if (blob.size > 60 * 1024 * 1024) PDFX.toast('文件较大，保存可能需要几秒');
  PDFX.showBusy('正在保存…');
  try {
    const data = await blobToBase64(blob);
    const mime = blob.type || 'application/pdf';
    const ret = await window.Capacitor.Plugins.FileSaver.save({ data, fileName: name, mime });
    lastSaved = { uri: ret.uri, name, mime };
    PDFX.addHistory({ name, size: blob.size, time: Date.now(), uri: ret.uri, mime });
    PDFX.hideBusy();
    showSaveSheet(name, ret.displayPath || ret.uri);
  } catch (e) {
    PDFX.hideBusy();
    PDFX.toast('保存失败：' + ((e && e.message) || e), 4000);
    throw e;
  }
}

/** 弹出"已保存"面板，显示文件名与落盘位置。 */
function showSaveSheet(name, path) {
  PDFX.$('#saveName').textContent = name;
  PDFX.$('#savePath').textContent = path || '';
  PDFX.$('#saveSheet').classList.remove('hidden');
}

function closeSaveSheet() {
  PDFX.$('#saveSheet').classList.add('hidden');
}

/** 用系统里能打开 PDF 的应用打开刚导出的文件。 */
async function openSaved() {
  if (!lastSaved) return;
  try {
    await window.Capacitor.Plugins.FileSaver.openFile({ uri: lastSaved.uri, mime: lastSaved.mime });
  } catch (e) {
    PDFX.toast('没有找到能打开 PDF 的应用');
  }
}

/** 调系统分享面板，把文件交给微信/邮件/网盘等。 */
async function shareSaved() {
  if (!lastSaved) return;
  try {
    await window.Capacitor.Plugins.FileSaver.share({ uri: lastSaved.uri, mime: lastSaved.mime });
  } catch (e) {
    PDFX.toast('分享失败：' + ((e && e.message) || e));
  }
}

/** 是否在导出前询问文件名（默认关闭）。 */
function askNameEnabled() {
  return !!PDFX.loadSettings().askName;
}

function openSettings() {
  const sw = PDFX.$('#setAskName');
  if (sw) sw.classList.toggle('on', askNameEnabled());
  PDFX.$('#settingsDialog').classList.remove('hidden');
}

function closeSettings() {
  PDFX.$('#settingsDialog').classList.add('hidden');
}

function toggleAskName() {
  const next = !askNameEnabled();
  PDFX.saveSettings({ askName: next });
  PDFX.$('#setAskName').classList.toggle('on', next);
  PDFX.toast(next ? '导出时会先问你文件名' : '导出时直接使用默认文件名', 2200);
}

/* ---------------- 导出历史 ---------------- */

  Object.assign(PDFX, { download, doDownload, nameResolver, askFileName, finishNameDialog, blobToBase64, lastSaved, saveViaNative, showSaveSheet, closeSaveSheet, openSaved, shareSaved, askNameEnabled, openSettings, closeSettings, toggleAskName });
})(window.PDFX = window.PDFX || {});

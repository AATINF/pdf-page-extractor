/* features/merge —— 见文件末尾导出 */
(function (PDFX) {
  'use strict';

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
      PDFX.state.mergeFiles.push({ name: f.name, bytes: new Uint8Array(buf), pdfLibDoc: lib });
    } catch (err) {
      PDFX.toast('读取失败：' + f.name);
    }
  }
  renderMergeList();
}

/**
 * 渲染合并文件列表：展示文件名、页数/加密标记，并提供上移、下移、移除操作。
 */
function renderMergeList() {
  const wrap = PDFX.$('#mergeList');
  wrap.innerHTML = '';
  PDFX.state.mergeFiles.forEach((f, i) => {
    const row = document.createElement('div');
    row.className = 'merge-row';
    const badge = f.pdfLibDoc
      ? PDFX.esc(f.pdfLibDoc.getPageCount() + ' 页')
      : '<span style="color:var(--warn)">🔒 加密（转图片）</span>';
    row.innerHTML =
      '<span class="mr-name">' + PDFX.esc(f.name) + '</span>' +
      '<span class="mr-badge">' + badge + '</span>' +
      '<div class="mr-btns">' +
        '<button data-i="' + i + '" data-a="view" title="预览"><svg viewBox="0 0 24 24" width="15" height="15"><use href="#i-eye"/></svg></button>' +
        '<button data-i="' + i + '" data-a="up" title="上移">↑</button>' +
        '<button data-i="' + i + '" data-a="down" title="下移">↓</button>' +
        '<button data-i="' + i + '" data-a="del" title="移除">✕</button>' +
      '</div>';
    // 为每行按钮绑定排序/删除逻辑
    row.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      const i2 = +b.dataset.i, a = b.dataset.a;
      if (a === 'view') { PDFX.previewMergeFile(i2); return; }
      if (a === 'del') { PDFX.state.mergeFiles.splice(i2, 1); renderMergeList(); }
      else if (a === 'up' && i2 > 0) {
        // 与上一项交换位置
        [PDFX.state.mergeFiles[i2 - 1], PDFX.state.mergeFiles[i2]] = [PDFX.state.mergeFiles[i2], PDFX.state.mergeFiles[i2 - 1]];
        renderMergeList();
      } else if (a === 'down' && i2 < PDFX.state.mergeFiles.length - 1) {
        // 与下一项交换位置
        [PDFX.state.mergeFiles[i2 + 1], PDFX.state.mergeFiles[i2]] = [PDFX.state.mergeFiles[i2], PDFX.state.mergeFiles[i2 + 1]];
        renderMergeList();
      }
    }));
    wrap.appendChild(row);
  });
  PDFX.$('#mergeEmpty').classList.toggle('hidden', PDFX.state.mergeFiles.length > 0);
  PDFX.$('#mergeGo').disabled = PDFX.state.mergeFiles.length === 0;
}

/**
 * 按列表顺序把所有文件合并为一个新 PDF 并下载。
 * 普通文件复制全部页面；加密文件逐页渲染为图片后嵌入。
 */
async function mergeAll() {
  if (!PDFX.state.mergeFiles.length) return;
  PDFX.showBusy('正在合并…');
  try {
    const out = await PDFLib.PDFDocument.create();
    let total = 0;
    const s = PDFX.rasterSettings();
    for (let k = 0; k < PDFX.state.mergeFiles.length; k++) {
      const f = PDFX.state.mergeFiles[k];
      PDFX.showBusy('正在合并（' + (k + 1) + '/' + PDFX.state.mergeFiles.length + '）：' + f.name);
      if (f.pdfLibDoc) {
        // 矢量路径：整体复制该文件全部页面
        const pages = await out.copyPages(f.pdfLibDoc, f.pdfLibDoc.getPageIndices());
        pages.forEach(p => out.addPage(p));
        total += pages.length;
      } else {
        // 图片化路径：先解析，必要时请求密码
        let doc;
        try {
          doc = await pdfjsLib.getDocument(Object.assign({ data: f.bytes.slice() }, PDFX.PDF_OPTS)).promise;
        } catch (e) {
          if (e && (e.name === 'PasswordException' || /password/i.test(e.message || ''))) {
            const pw = await PDFX.showDialog({
              title: '文件已加密：' + f.name,
              message: '请输入密码以读取该文件：',
              placeholder: '密码',
              okText: '继续',
            });
            if (pw === null) { PDFX.toast('已跳过加密文件：' + f.name); continue; }
            doc = await pdfjsLib.getDocument(Object.assign({ data: f.bytes.slice(), password: pw }, PDFX.PDF_OPTS)).promise;
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
          await page.render({ canvasContext: ctx, viewport: vp, annotationMode: PDFX.ANN_ENABLE }).promise;
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
    const base = PDFX.fileNameBase(PDFX.state.mergeFiles[0].name);
    PDFX.download(new Blob([bytes], { type: 'application/pdf' }), base + '_合并_' + total + '页.pdf');
    PDFX.toast('合并完成，共 ' + total + ' 页');
  } catch (e) {
    console.error(e);
    PDFX.toast('合并失败：' + (e.message || e));
  }
  PDFX.hideBusy();
}

/* ---------------- 模式切换 / 对话框 ---------------- */

  Object.assign(PDFX, { onMergeFiles, renderMergeList, mergeAll });
})(window.PDFX = window.PDFX || {});

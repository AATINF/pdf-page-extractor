/* main —— 入口：初始化、事件挂载、把 API 暴露到 window 供 HTML 的 onclick 使用 */
(function (PDFX) {
  'use strict';

function init() {
  PDFX.setupPdfjsWorker();
  PDFX.initAppShell();
  PDFX.setupBackButton();

  // 底栏换行 / 旋转屏幕后高度会变，实时同步给 CSS
  if (window.ResizeObserver) {
    new ResizeObserver(() => PDFX.syncBottomBar()).observe(PDFX.$('#bottombar'));
  }

  // 分段控件：点击切换选中项（清晰度 / 格式）
  document.querySelectorAll('.seg').forEach(seg => {
    seg.addEventListener('click', e => {
      const item = e.target.closest('.seg-item');
      if (!item) return;
      seg.querySelectorAll('.seg-item').forEach(b => b.classList.remove('active'));
      item.classList.add('active');
    });
  });

  PDFX.$('#fileInput').addEventListener('change', PDFX.onPickFile);
  PDFX.$('#mergeInput').addEventListener('change', PDFX.onMergeFiles);
  PDFX.bindDrag(PDFX.$('#dropzone'));

  PDFX.bindPreviewSwipe();

  // 重命名弹窗
  PDFX.$('#nameOk').addEventListener('click', () => PDFX.finishNameDialog(true));
  PDFX.$('#nameCancel').addEventListener('click', () => PDFX.finishNameDialog(false));
  PDFX.$('#nameInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); PDFX.finishNameDialog(true); }
    else if (e.key === 'Escape') PDFX.finishNameDialog(false);
  });

  // 对话框按钮与键盘事件
  PDFX.$('#dlgOk').addEventListener('click', () => PDFX.finishDialog(PDFX.$('#dlgInput').value.trim() || null));
  PDFX.$('#dlgCancel').addEventListener('click', () => PDFX.finishDialog(null));
  PDFX.$('#dialog').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); PDFX.finishDialog(PDFX.$('#dlgInput').value.trim() || null); }
    else if (e.key === 'Escape') PDFX.finishDialog(null);
  });

  // 支持 "打开方式" 传参（例如从系统分享到浏览器打开 ?file=... 场景可扩展，此处略）

  // 仅在 http/https 协议下注册 Service Worker，file:// 打开时自动跳过
  if (!PDFX.IS_APP && 'serviceWorker' in navigator && /^https?:PDFX.$/.test(location.protocol)) {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* 忽略 */ });
  }
}

function cvInit() {
  const on = (sel, ev, fn) => {
    const el = document.querySelector(sel);
    if (el) el.addEventListener(ev, fn);
  };

  on('#cvPdfInput', 'change', e => {
    if (e.target.files[0]) PDFX.cvLoadPdf(e.target.files[0]);
    e.target.value = '';
  });
  on('#cmpPdfInput', 'change', e => {
    if (e.target.files[0]) PDFX.cvLoadCmpPdf(e.target.files[0]);
    e.target.value = '';
  });
  on('#cvImgInput', 'change', e => {
    PDFX.cvAddImages([...e.target.files], null, PDFX.cv.images, PDFX.cvRenderImgList);
    e.target.value = '';
  });
  on('#cmpImgInput', 'change', e => {
    PDFX.cvAddImages([...e.target.files], null, PDFX.cv.cmpImages, PDFX.cmpRenderImgList);
    e.target.value = '';
  });

  // 转换子模式
  on('#convModeSeg', 'click', e => {
    const item = e.target.closest('.seg-item');
    if (!item) return;
    const v = item.dataset.value;
    PDFX.$('#convToImage').classList.toggle('hidden', v !== 'toImage');
    PDFX.$('#convToPdf').classList.toggle('hidden', v !== 'toPdf');
  });

  // 压缩子模式
  on('#cmpModeSeg', 'click', e => {
    const item = e.target.closest('.seg-item');
    if (!item) return;
    const v = item.dataset.value;
    PDFX.$('#cmpPdf').classList.toggle('hidden', v !== 'pdf');
    PDFX.$('#cmpImage').classList.toggle('hidden', v !== 'image');
  });

  // 压缩方式切换：无损清理时隐藏清晰度
  const cmpmode = document.querySelector('.seg[data-name="cmpmode"]');
  if (cmpmode) {
    cmpmode.addEventListener('click', () => {
      const v = PDFX.segValue('cmpmode', 'high');
      const hint = PDFX.$('#cmpHint');
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
    const v = PDFX.$('#cmpQualityVal');
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
        PDFX.setSeg(seg, 'mb');
      } else {
        input.value = String(kb);
        PDFX.setSeg(seg, 'kb');
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

  PDFX.restoreSettings();
  PDFX.bindSettingsPersist();

  // 图片列表支持长按拖拽排序
  PDFX.bindDragSort('cvImgList', PDFX.cv.images, PDFX.cvRenderImgList);
  PDFX.bindDragSort('cmpImgList', PDFX.cv.cmpImages, PDFX.cmpRenderImgList);
}

  Object.assign(PDFX, { init, cvInit });

  // HTML 里大量 onclick="xxx()"，统一把模块 API 挂到 window
  Object.assign(window, PDFX);

  document.addEventListener('DOMContentLoaded', () => {
    init();
    cvInit();
  });
})(window.PDFX = window.PDFX || {});

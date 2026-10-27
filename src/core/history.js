/* core/history —— 见文件末尾导出 */
(function (PDFX) {
  'use strict';

const HISTORY_KEY = 'pdfextractor.history';

const HISTORY_MAX = 20;

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') || []; } catch (e) { return []; }
}

function addHistory(entry) {
  const list = loadHistory();
  list.unshift(entry);
  if (list.length > HISTORY_MAX) list.length = HISTORY_MAX;
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list)); } catch (e) { /* 忽略 */ }
}

function clearHistory() {
  try { localStorage.removeItem(HISTORY_KEY); } catch (e) { /* 忽略 */ }
  renderHistory();
  PDFX.toast('历史已清空', 2000);
}

function openHistory() {
  renderHistory();
  PDFX.$('#historyDialog').classList.remove('hidden');
}

function closeHistory() {
  PDFX.$('#historyDialog').classList.add('hidden');
}

function renderHistory() {
  const list = loadHistory();
  const wrap = PDFX.$('#historyList');
  if (!wrap) return;
  wrap.innerHTML = '';
  list.forEach((h, i) => {
    const row = document.createElement('div');
    row.className = 'history-row';
    const d = new Date(h.time || Date.now());
    const pad = n => String(n).padStart(2, '0');
    const when = (d.getMonth() + 1) + '/' + d.getDate() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    row.innerHTML =
      '<div class="hr-main"><div class="hr-name"></div><div class="hr-meta"></div></div>' +
      '<div class="hr-btns">' +
        '<button data-i="' + i + '" data-a="open">打开</button>' +
        '<button data-i="' + i + '" data-a="share">分享</button>' +
      '</div>';
    row.querySelector('.hr-name').textContent = h.name || '(未命名)';
    row.querySelector('.hr-meta').textContent = when + ' · ' + PDFX.fmtSize(h.size || 0);
    row.querySelector('.hr-btns').addEventListener('click', e => {
      const a = e.target.dataset.a;
      if (a) historyAction(list[i], a);
    });
    wrap.appendChild(row);
  });
  const empty = PDFX.$('#historyEmpty');
  if (empty) empty.classList.toggle('hidden', list.length > 0);
}

async function historyAction(item, act) {
  if (!item || !item.uri) { PDFX.toast('浏览器里无法重新打开，请在 App 内使用', 3000); return; }
  const P = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.FileSaver;
  if (!P) { PDFX.toast('仅 App 内支持', 2400); return; }
  try {
    const mime = item.mime || 'application/pdf';
    if (act === 'open') await P.openFile({ uri: item.uri, mime });
    else await P.share({ uri: item.uri, mime });
  } catch (e) {
    PDFX.toast('文件可能已被移动或删除', 3000);
  }
}

/* ---------------- 重命名弹窗 ---------------- */

  Object.assign(PDFX, { HISTORY_KEY, HISTORY_MAX, loadHistory, addHistory, clearHistory, openHistory, closeHistory, renderHistory, historyAction });
})(window.PDFX = window.PDFX || {});

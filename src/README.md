# 源码结构

代码按职责拆成 21 个文件，全部挂在 `window.PDFX` 命名空间下。**没有构建工具**——浏览器直接按顺序加载，单文件版则把它们内联进一个 HTML。

## 目录

```
src/
├── core/                  基础设施（无业务逻辑）
│   ├── query.js           $ / $$  DOM 选择器
│   ├── env.js             PDF_OPTS（cMap 等加载参数）、ANN_ENABLE、state
│   ├── format.js          fmtSize / fileNameBase / rangesOf / parseCsv
│   ├── storage.js         localStorage 读写（设置）
│   ├── cancel.js          长任务取消令牌
│   ├── dom.js             toast / showBusy / hideBusy / esc
│   ├── layout.js          syncBottomBar / updateBottomBar / updateToolState / switchMode
│   ├── history.js         导出历史（增删查、渲染、动作）
│   ├── controls.js        分段控件读写（segValue / setSeg / readTargetKB）
│   └── image.js           canvas 编码、图片加载、目标大小二分搜索
│
├── features/              业务功能
│   ├── export.js          下载、重命名弹窗、原生保存、保存结果面板
│   ├── document.js        PDF 加载、缩略图队列、卡片
│   ├── selection.js       选页、工具条、返回键、App 环境适配
│   ├── preview.js         全屏预览（PDF 翻页 + 图片左右切换）
│   ├── extract.js         提取、拆分单页
│   ├── merge.js           合并
│   ├── convert.js         PDF → 图片、图片 → PDF
│   ├── compress.js        PDF 压缩（三档）、图片压缩、前后对比
│   └── prefs.js           参数记忆
│
├── ui/
│   └── dialogs.js         通用对话框、拖拽绑定
│
└── main.js                入口：init / cvInit / 挂 window
```

## 依赖规则

**模块之间通过 `PDFX.xxx` 运行时查找，不用 import/解构。**

原因：模块间存在循环依赖（`document` 调 `selection` 的 `toggleSelect`，`selection` 又调 `document` 的 `makeCard`）。静态解构会在模块尚未加载时拿到 `undefined`，运行时查找则没有顺序问题。

```js
// ✅ 正确
PDFX.toast('done');
PDFX.state.selection.size;

// ❌ 错误（会在加载早于定义时报 undefined）
const { toast } = PDFX;
```

每个文件的结构：

```js
/* features/xxx —— 一句话说明 */
(function (PDFX) {
  'use strict';

  function doSomething() { ... }        // 内部实现，可自由调用 PDFX.*

  Object.assign(PDFX, { doSomething }); // 只导出需要跨模块使用的
})(window.PDFX = window.PDFX || {});
```

## 加载顺序

`index.html` 底部的顺序：

```
core/query → core/env → core/format → core/storage → core/cancel
→ core/dom → core/layout → core/history → core/controls → core/image
→ features/export → features/document → features/selection
→ features/preview → features/extract → features/merge
→ features/convert → features/compress → features/prefs
→ ui/dialogs → main
```

顺序只影响"模块体内的立即执行代码"，函数调用靠 `PDFX.xxx` 不受影响。新增模块放在对应目录，并在 `index.html` 里加一行即可。

## 新增一个功能

1. 在 `features/` 建文件，按上面的模板写
2. 需要跨模块调用的函数，`Object.assign(PDFX, {...})` 导出
3. `index.html` 在 `main.js` 之前加 `<script src="src/features/xxx.js"></script>`
4. `tools/prepare_www.py` 的 `DIRS` 已包含整个 `src/`，无需改动
5. 跑 `tools/check_layout.py` 等测试

## 重构工具

`tools/legacy/` 下是一次性拆分脚本（从早期的 `app.js` + `convert.js` 机械切分而来），保留仅供参考，日常开发不需要。

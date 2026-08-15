# 推广文案 / Promotion Copy

本文件为 `pdf-page-extractor` 准备的**可直接复制**的发布文案，覆盖国内外主要渠道。
配图统一使用仓库 `assets/` 下的素材：`social_preview.png`（封面）、`steps.png`（三步图）、`demo.gif`（操作演示）。

> 发布前请把链接里的仓库名替换确认无误。所有文案均可按需改写，署名随意。

---

## 一、中文版

### 1. HelloGitHub / 少数派 / V2EX「分享创造」

**标题**：做了一个纯本地、零上传的 PDF 页面提取工具（开源免费）

**正文**：

> 平时经常要从一份 PDF 里抽出几页、或者把几份合并成一份。但市面上大多是"上传到网站处理"——文件要过别人的服务器，机密合同、个人资料总有点不放心。
>
> 所以我做了个**纯前端、完全离线**的 PDF 页面提取器：**文件全程不离开你的电脑**，断网也能用。
>
> 功能：
> - 提取指定页（支持 `2-5`、`1-3,5,8` 范围）
> - 拆分为单页并打包 ZIP
> - 多文档合并、旋转、倒序
> - 加密 PDF 也能处理（自动转图片）
> - 可加到主屏幕当 App（PWA）
>
> 下载即用：一个 HTML 文件，双击在浏览器打开就行，不需要安装任何东西。
>
> 仓库（含使用教程与开发指南）：https://github.com/AATINF/pdf-page-extractor
> 一键下载：https://github.com/AATINF/pdf-page-extractor/releases/latest/download/pdf-page-extractor.html
>
> MIT 开源，欢迎 star / 提建议。

**配图**：`social_preview.png`（首图）+ `demo.gif`（动图效果好）

---

### 2. 知乎 / 微博 / 朋友圈 / 即刻（短文案）

**版本 A（痛点型）**：
> 不想把合同/简历上传到"在线 PDF 工具"？试试这个纯本地、离线可用的 PDF 提取器，文件不出本机，一个 HTML 双击就用。开源免费：https://github.com/AATINF/pdf-page-extractor

**版本 B（功能型）**：
> 做了个 PDF 小工具：提取/拆分/合并页面，支持加密文件，纯前端零上传，断网也能跑。单文件 HTML 版双击即用 👉 https://github.com/AATINF/pdf-page-extractor/releases

---

### 3. 技术社群 / 微信群 / Telegram

> 【开源】PDF 页面提取器 —— 纯本地离线、零安装、隐私优先（不上传文件）。
> 提取/拆分/合并/旋转，单文件 HTML 双击即用。MIT。
> https://github.com/AATINF/pdf-page-extractor

---

## 二、English Version

### 1. Product Hunt

**Tagline**：A 100% offline, private PDF extractor — no upload, no install.
**First comment / description**:

> PDF Page Extractor is a client-side, fully offline tool to extract, split, and merge PDF pages. Your files never leave your device — works with no internet connection.
>
> - Extract by page ranges (`2-5`, `1-3,5,8`)
> - Split into single pages (ZIP)
> - Merge, rotate, reverse
> - Handles password-protected PDFs
> - Installable as a PWA; also ships as a single self-contained HTML file
>
> Open source (MIT). Just download one HTML file and open it in your browser.
> Repo: https://github.com/AATINF/pdf-page-extractor

---

### 2. Hacker News (Show HN)

**Title**：Show HN: A fully offline, client-side PDF page extractor (no upload, single HTML file)

**Body**:

> I built a small PDF tool that extracts / splits / merges pages entirely in the browser. The key point: files never leave the device, and it runs with no network at all — there's even a single-file HTML build you just double-click.
>
> Tech: PDF.js (render), pdf-lib (manipulate), JSZip (package). MIT licensed.
>
> https://github.com/AATINF/pdf-page-extractor
>
> Feedback on privacy model / edge cases welcome.

---

### 3. Reddit (r/selfhosted, r/privacy, r/pdf, r/opensource)

**Title**: Self-hosted-friendly PDF tool: 100% client-side, offline, no server, no upload

**Body**:

> Sharing a small open-source utility I made. It runs entirely in the browser — no backend, no file upload, works offline. Useful if you handle sensitive PDFs (contracts, IDs) and don't want them touching a third-party server.
>
> Features: extract by range, split to ZIP, merge, rotate/reverse, handles encrypted PDFs. Ships as a single HTML file (double-click to use) or a PWA.
>
> MIT. Repo: https://github.com/AATINF/pdf-page-extractor

---

### 4. Dev.to / Medium (article hook)

**Title**: Why I built a PDF tool that never uploads your files
**Led**: A short story about privacy + a walkthrough of the client-side architecture (PDF.js + pdf-lib + JSZip). Link back to the repo and the 开发指南.md (developer guide).

---

## 三、发布清单（checklist）

- [ ] GitHub Releases 资产就绪（`pdf-page-extractor.html`）
- [ ] 仓库 Topics、描述、Discussions 已配置
- [ ] Social Preview 图已设置（仓库 Settings → Social preview）
- [ ] 在国内渠道发布（HelloGitHub 投稿 / 少数派 / V2EX）
- [ ] 在海外渠道发布（Product Hunt / HN / Reddit）
- [ ] 发布后 24h 内回应评论与 issue，保持活跃信号

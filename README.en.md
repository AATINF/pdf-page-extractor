# 📄 PDF Page Extractor

> **No install · Pure frontend · Works offline** —— Select, extract, split, and merge PDF pages right in your browser. Your files never leave your device.

[📥 Download from Release (single-file build, double-click to run)](https://github.com/AATINF/pdf-page-extractor/releases/latest/download/pdf-page-extractor.html)  ·  [📘 中文文档](README.md)

---

## ✨ Features

- 📑 **Extract pages**: pick any pages or a range (`2-5`, `1-3,5,8`); vector text is preserved
- ✂️ **Split to single pages**: each page becomes its own PDF, packaged as a ZIP
- 🧩 **Merge PDFs**: combine multiple PDFs in order
- 🔄 **Rotate / Reverse**: append a 90° rotation or output in reverse order
- 🔒 **Encrypted PDFs**: open with a password; encrypted pages are rasterized (quality selectable)
- 👁 **Fullscreen preview**: zoom, rotate, swipe to flip pages
- 📦 **Single-file / PWA**: add to home screen as an app, or use the standalone offline HTML

## 🚀 Quick Start

| Method | Use case | How |
|---|---|---|
| **Single-file (recommended)** | Any scenario | Download `PDF页面提取器-单文件版.html` and open it in a browser |
| Multi-file | Install as app / PWA | Open `index.html` via a server |
| LAN | Phone accessing PC | Run `python3 serve.py`, then open the printed URL on your phone |

## 📖 Docs

- 📘 [User Tutorial (visual)](教程.html)
- 📗 [Detailed Usage (中文)](README-使用说明.md)
- 🛠 [Developer Guide](开发指南.md)

## 🧱 Tech Stack

Pure frontend, processed entirely in the browser, no backend:

- **PDF.js** (Apache-2.0): parsing / rendering / thumbnails
- **pdf-lib** (MIT): page copy / rotate / generate
- **JSZip** (MIT): ZIP packaging for split pages

Library copyright notices are kept in the headers of files under `lib/`; do not remove them when redistributing.

## 📄 License

[MIT License](LICENSE) © 2026 Individual Developer

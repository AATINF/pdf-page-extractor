<!-- Hero -->
<div align="center">

# 📄 PDF 页面提取器

### 免安装 · 纯前端 · 离线可用
在浏览器里选页、提取、拆分、合并 PDF，**文件全程不离开你的设备**。

[![GitHub release](https://img.shields.io/github/v/release/AATINF/pdf-page-extractor)](https://github.com/AATINF/pdf-page-extractor/releases)
[![GitHub Release Date](https://img.shields.io/github/release-date/AATINF/pdf-page-extractor)](https://github.com/AATINF/pdf-page-extractor/releases)
[![GitHub License](https://img.shields.io/github/license/AATINF/pdf-page-extractor)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/AATINF/pdf-page-extractor)](https://github.com/AATINF/pdf-page-extractor/stargazers)
[![GitHub Discussions](https://img.shields.io/github/discussions/AATINF/pdf-page-extractor)](https://github.com/AATINF/pdf-page-extractor/discussions)

<br>

<a href="https://github.com/AATINF/pdf-page-extractor/releases/latest/download/pdf-page-extractor.html"><img src="https://img.shields.io/badge/📥%20下载单文件版-2ea043?style=for-the-badge&logo=html5&logoColor=white" alt="下载单文件版"></a>
&nbsp;
<a href="https://github.com/AATINF/pdf-page-extractor/releases"><img src="https://img.shields.io/badge/🚀%20全部%20Release-1f6feb?style=for-the-badge" alt="全部 Release"></a>
&nbsp;
<a href="README.en.md"><img src="https://img.shields.io/badge/🌐%20English-8a8f98?style=for-the-badge" alt="English"></a>

</div>

---

## ✨ 功能一览

| 功能 | 说明 |
|---|---|
| 📑 **提取页面** | 勾选任意页或输入范围（`2-5`、`1-3,5,8`），保留矢量文字 |
| ✂️ **拆分为单页** | 每页一个 PDF，打包成 ZIP 下载 |
| 🧩 **合并 PDF** | 多文档按序合并（可拖动排序） |
| 🔄 **旋转 / 倒序** | 对选中页追加 90° 旋转、按倒序输出 |
| 🔒 **加密 PDF** | 支持密码打开；加密文件自动转为图片输出（清晰度可选） |
| 👁 **全屏预览** | 缩放、旋转、左右滑动翻页 |
| 📦 **单文件 / PWA** | 可插到主屏幕当 App，也能单文件离线使用 |

---

## 📷 界面预览

<div align="center">
  <img src="界面预览.png" alt="PDF 页面提取器界面预览" width="720">
</div>

---

## 🎬 实机演示（真实浏览器录制，非动画示意）

下面是一段**真实操作录屏**：打开本地样例 PDF → 勾选第 2、4 页 → 点击「提取」→ 浏览器直接下载生成的新 PDF。整个过程文件从未离开本机。

<div align="center">
  <img src="assets/demo.gif" alt="PDF 页面提取器实机演示" width="680">
  <br>
  <sub>提示：动画循环播放。完整高清视频见 <a href="assets/demo.mp4">assets/demo.mp4</a></sub>
</div>

---

## 🚀 快速开始

| 方式 | 适用场景 | 做法 |
|---|---|---|
| **单文件版（推荐）** | 一切场景 | 下载 `PDF页面提取器-单文件版.html`，浏览器打开即可 |
| 多文件版 | 想当 App / PWA | 用浏览器打开 `index.html`（需经服务器） |
| 局域网 | 手机访问电脑 | `python3 serve.py`，手机打开打印出的地址 |

> 💡 **下载即用**：[点此下载单文件版 HTML](https://github.com/AATINF/pdf-page-extractor/releases/latest/download/pdf-page-extractor.html)，双击就能用，**无需安装、无需联网**。

---

## 🔐 为何比在线工具更安全？

市面上的 ilovepdf、smallpdf、iLovePDF 等"在线 PDF 工具"**需要把你的文件上传到对方服务器**才能处理——合同、简历、证件扫描件都存在泄露风险。

本工具**完全运行在你的浏览器本地**，所有解析、提取、合并都在本机完成，**任何文件都不会上传到任何服务器**。断网也能用。

| 对比项 | 在线工具（ilovepdf / smallpdf 等） | **本工具（PDF 页面提取器）** |
|---|---|---|
| 文件是否上传 | ❌ 必须上传到第三方服务器 | ✅ **永不离开本机** |
| 是否需要联网 | ❌ 必须 | ✅ 离线可用 |
| 是否需要安装 | 无需（但依赖网络） | ✅ 单文件，双击即用 |
| 隐私风险 | 高（文件经他人服务器） | ✅ 极低（纯本地处理） |
| 大文件 / 敏感文件 | 不建议 | ✅ 适合 |
| 费用 | 多限免费次数 / 付费 | ✅ 完全免费、开源 |

---

## 📖 文档

- 📘 [使用教程（图文）](教程.html) —— 面向普通用户
- 📗 [详细使用说明](README-使用说明.md)
- 🛠 [开发指南 / 代码复刻](开发指南.md) —— 面向开发者
- 🌐 [English README](README.en.md)

---

## 🧱 技术架构

纯前端、浏览器本地处理，无后端：

- **PDF.js**（Apache-2.0）：解析 / 渲染 / 缩略图 / 图片化
- **pdf-lib**（MIT）：页面复制 / 旋转 / 生成
- **JSZip**（MIT）：单页拆分打包

第三方库的版权声明保留在 `lib/` 文件头部，重分发请勿删除。

---

## 📄 License

[MIT License](LICENSE) © 2026 个人开发者

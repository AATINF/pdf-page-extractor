# PDF 页面提取器 · Android 版实施计划

> 版本 v1 · 2026-10-23
> 目标仓库：https://github.com/AATINF/pdf-page-extractor （public）
> 本文档为施工前约定，任何阶段可停下、可回退。

---

## 一、目标与非目标

### 要做
1. 产出一个 **Android APK**，安装后**完全离线可用**：飞行模式下能打开、导入、处理、保存。
2. 功能与网页版一致：提取页面、拆分单页 ZIP、多文件合并、旋转/倒序、加密 PDF（图片化）、全屏预览。
3. 界面按手机重新打磨（不是重写，是在现有 220 行 CSS 上做断点与触控优化）。
4. App 名称不变：**PDF 页面提取器**。
5. 源码进现有仓库，APK 挂 GitHub Release，手机点链接直接下载。

### 不做
- iOS 版（需要 Mac + 开发者账号，成本另算）
- Google Play 上架（需 $25 开发者账号 + 审核，本工具没必要）
- 账号、云同步、任何联网功能
- 重写 PDF 处理核心逻辑（`app.js` 的业务逻辑保持，只改 I/O 适配层）

---

## 二、现状盘点

### 仓库
| 项 | 状态 |
|---|---|
| 可见性 | **public** → GitHub Actions 免费、不限分钟 |
| 文件数 | 38 |
| 已有 CI | `.github/workflows/release.yml`：打 `v*` tag 时构建单文件 HTML 并发 Release |
| 沙箱本地代码 | 落后远端 **8 个 commit**（README 重写、demo 视频、教程、开发指南） |
| 凭据 | `~/.git-credentials` 里两条旧 token **均已失效**（401 / Bad credentials） |

### 前端代码
| 文件 | 规模 | 说明 |
|---|---|---|
| `index.html` | 408 行 / 1.1MB | 第 13–235 行是 CSS，237–380 行是 body，381 行起是库（worker 内联） |
| `app.js` | 36KB | 业务逻辑，函数化写得清楚，`download()` 是唯一需要改的 I/O 出口 |
| `lib/` | pdf.js 3.11 + pdf-lib 1.17 + jszip 3.10 | 纯前端，无网络调用 |

### 现有 UI 的底子（比我预期好）
- 已有 `env(safe-area-inset-top/bottom)` → 刘海/手势条已考虑
- 已有 `position:fixed` 底栏 + 深色模式 `prefers-color-scheme`
- 缩略图已是 `grid-template-columns: repeat(auto-fill, minmax(118px,1fr))` → 自适应
- **缺**：没有任何 `@media` 断点；按钮尺寸偏小（`.bb-btn` 12px 内边距）；顶部信息区在窄屏会挤压；无安卓返回键处理

---

## 三、技术方案

### 3.1 壳的选择
**Capacitor 8**（Ionic 团队），把 `www/` 静态资源打进 APK 的 `assets/public`，运行时由本地 WebView 加载。

| 参数 | 值 |
|---|---|
| minSdkVersion | **24 → Android 7.0**（官方覆盖约 99% 设备） |
| compileSdk / targetSdk | 36 |
| WebView 内核要求 | Chrome 60+（2017 年后设备均满足） |
| 加载 scheme | `https://localhost`（Capacitor 默认，走 WebViewAssetLoader，不出网） |
| 本地 Node | 需 20+，沙箱现为 18 → 装 Node 22 到 `/workspace/.node22`（不污染系统） |

> 为什么不用 TWA / PWABuilder：那两条路都要求有一个在线域名，首次加载要联网，且 TWA 本质是浏览器，做不到"纯本地"。

### 3.2 目录结构（改造后）
```
pdf-page-extractor/
├── index.html          # 保持，同时作为 Capacitor 的 www 入口
├── app.js              # 改 download()，加平台判断
├── lib/                # 不动
├── package.json        # 新增（Capacitor 依赖）
├── capacitor.config.json
├── android/            # 新增，Capacitor 生成的安卓工程
│   └── app/src/main/java/.../FileSaverPlugin.java   # 原生保存桥
├── www/                # 构建产物（gitignore），由 tools/prepare_www.py 生成
└── .github/workflows/android.yml   # 新增
```

### 3.3 三个必须改的技术点

**① 文件保存（最关键）**
安卓 WebView **不支持** `a[download]` + `blob:` 下载，现在这个函数在壳里点了没反应：
```js
// app.js 现有实现
function download(blob, name){ const url = URL.createObjectURL(blob); ... a.click(); }
```
改法：判断 `window.Capacitor` 存在时走原生桥
```
blob → base64 → Capacitor 插件 saveFile(base64, name, mime)
     → MediaStore 写入系统「下载」目录（Android 10+ 免权限）
     → 弹 Toast「已保存到 下载/xxx.pdf」+ 可选「打开」
```
Android 7–9 走 `Environment.getExternalStoragePublicDirectory` + 动态申请 `WRITE_EXTERNAL_STORAGE`。

**② 文件选择**
`<input type="file" accept="application/pdf">` 在 Capacitor 的 WebView 里可用（它实现了 `onShowFileChooser`），拿到的是 `content://` URI，Capacitor 会转成可读的 File 对象。**需要真机验证**，这是第二大不确定点。

**③ 安卓返回键**
用 `@capacitor/app` 的 `backButton` 事件：有弹窗先关弹窗，有选中先清选中，都没有才退出。否则用户按返回会直接杀 App。

### 3.4 签名
| 方案 | 后果 |
|---|---|
| debug 签名（CI 每次随机） | 每次更新必须卸载重装，**聊天记录/设置全丢**（本 App 无数据，影响小但烦） |
| **固定 keystore（推荐）** | 可覆盖安装升级。keystore 转 base64 存 GitHub Secrets，仓库里不放明文 |

第一版可以先用 debug 跑通，确认能用后再切固定签名。

### 3.5 零网络权限（可选加分项）
Capacitor 默认声明 `INTERNET` 权限。理论上 `https://localhost` 也走 socket，需要它。
如果最终版能做到**从 manifest 里删掉 INTERNET 权限**，那就是系统级证明"这 App 连不了网"——对"本地不联网"这个诉求是最硬的交代。
技术路径：`server.androidScheme = "file"` + 沿用单文件版已内联 worker 的方案（`file://` 下 blob worker 可用，已验证）。
**风险**：可能有未预料的 CORS/存储限制。所以列为"阶段 5 可选优化"，不阻塞交付。
---

## 四、施工阶段

> 每个阶段结束都有明确产出和"停在这里也行"的选项。你说停就停，不会烂尾。

### 阶段 0 · 同步与备份（约 15 分钟）
- [ ] 用新 token 拉取远端最新 8 个 commit 到沙箱
- [ ] 新建分支 `feat/android-app`，所有改动都在分支上，`main` 保持可发版
- [ ] 打一个本地 tag 快照，出事能一键回退

**产出**：沙箱代码 = 远端最新
**验收**：`git log` 能看到远端那 8 个 commit，工作区干净

---

### 阶段 1 · 手机版 UI 改造（约 1–2 小时）★ 你的第一个决策点
- [ ] 加 3 档断点：≤430px（手机竖屏）/ 431–900px（横屏/平板）/ >900px（桌面，保持现状）
- [ ] 底栏按钮高度 ≥ 56px，主按钮占 2/3 宽，次按钮收成图标或短词
- [ ] 顶栏压缩：窄屏只留文件名（单行省略）+ 页数，长标题不换行挤压
- [ ] 缩略图网格：手机 3 列 → 横屏 5 列；卡片内页码徽章加大
- [ ] 选中态更明显（粗边框 + 右上角对勾），避免小屏误触
- [ ] 合并列表行高加大，上移/下移/删除按钮做成 ≥44px 触控区
- [ ] 弹窗（预览/密码/设置）改成底部抽屉式，适配安全区
- [ ] 字号：正文 ≥14px，说明文字 ≥12px（原来有 11px 的）
- [ ] 深色模式补全（现有只覆盖了变量，部分硬编码颜色要换）

**产出**：改好的 `index.html` + 一组手机视口截图（390×844、430×932、844×390 横屏）
**验收**：你看截图说"行"
**风险**：低。纯 CSS/HTML，逻辑不动。

---

### 阶段 2 · 单文件真机试（约 30 分钟）★ 你的第二个决策点
- [ ] 重新生成单文件版 HTML（含新 UI）
- [ ] 你下载到手机，用浏览器打开，真机试一遍：导入 PDF、选页、提取、拆分、合并、预览
- [ ] 重点验：点"下载"能不能存进手机、中文文件名乱不乱码

**产出**：`PDF页面提取器-单文件版.html`
**为什么这一步值得做**：APK 要等 CI，这一步能提前暴露 80% 的兼容问题，且不花编译成本。
**验收**：你在手机上试完说"没问题"

---

### 阶段 3 · Capacitor 工程 + 原生桥（约 2–3 小时）
- [ ] 装 Node 22 到沙箱（不动系统 Node 18）
- [ ] `npm init` + 装 Capacitor 8 核心与 Android 平台
- [ ] 写 `capacitor.config.json`：appId `com.aatinf.pdfextractor`、appName `PDF 页面提取器`、webDir `www`
- [ ] 写 `tools/prepare_www.py`：把 index/app.js/lib/icons/manifest 拷进 `www/`（排除文档、demo、软著相关）
- [ ] `npx cap add android` 生成工程
- [ ] 写 `FileSaverPlugin.java`：base64 → MediaStore 写入下载目录，含 Android 7–9 的权限分支
- [ ] 改 `app.js` 的 `download()`：平台判断 + 原生桥 + 浏览器降级
- [ ] 接 `@capacitor/app` 返回键处理
- [ ] 图标：用现有 icon-512 生成各密度 mipmap + 自适应图标
- [ ] 状态栏颜色跟随深色模式

**产出**：可构建的完整安卓工程
**验收**：本地 `gradle` 语法检查通过（真编译在 CI 做）
**风险**：中。Capacitor 8 与 Node 版本、Gradle 版本的兼容问题。

---

### 阶段 4 · CI 构建出 APK（约 1–2 小时）
- [ ] 写 `.github/workflows/android.yml`
  - 触发：`workflow_dispatch`（手动）+ `push tag v*`
  - 步骤：setup-java 17 → setup-node 22 → npm ci → cap sync → gradlew assembleDebug
  - 上传 artifact + 打 tag 时挂到 Release
- [ ] 加 Gradle 缓存（`actions/cache`），第二次构建降到 3–5 分钟
- [ ] 推分支 → 触发构建 → 读日志排错
- [ ] 出 APK，把下载链接给你

**产出**：`pdf-page-extractor-vX.Y.Z.apk`（预计 4–8MB）
**验收**：你能下载并装上
**风险**：中。Gradle/AGP 版本、依赖下载、签名配置都可能踩坑，这是最可能需要反复的一步。

---

### 阶段 5 · 真机验收与收尾（约 1 小时）
- [ ] 你安装、飞行模式下全流程试一遍
- [ ] 反馈问题 → 我改 → 重出包（走缓存，每次 5 分钟内）
- [ ] 可选：切固定签名 keystore，实现覆盖安装
- [ ] 可选：尝试移除 INTERNET 权限（零网络权限版）
- [ ] 更新 README（加"安卓版"章节 + 下载链接）、CHANGELOG
- [ ] 合并分支到 main，打 tag 发 Release

---

## 五、风险清单

| # | 风险 | 概率 | 影响 | 应对 |
|---|---|---|---|---|
| 1 | WebView 不支持 blob 下载 | **必然** | 装了等于废 | 阶段 3 必做原生桥，这是本项目的核心改动 |
| 2 | 文件选择器拿不到 content:// 内容 | 中 | 无法导入 | 备选：用 Capacitor FilePicker 插件替代 input |
| 3 | 大 PDF 内存溢出（>300 页） | 中 | 闪退 | 加页数提示；分页渲染；限制同时渲染的缩略图数量 |
| 4 | 中文文件名在 MediaStore 乱码 | 低 | 文件名难看 | 显式 UTF-8 编码 + 回退到拼音 |
| 5 | CI 构建失败（Gradle/AGP） | 中 | 延迟交付 | 用官方 Capacitor 模板版本，不擅自升级 |
| 6 | token 缺 `workflow` 权限 | 中 | 推不了 CI 文件 | 提前说明；失败时退回"你手动上传 yml" |
| 7 | 覆盖安装签名冲突 | 中 | 每次要卸载 | 阶段 5 切固定 keystore |
| 8 | 误覆盖你远端的文档/demo | 低 | 丢失内容 | 阶段 0 先 pull，改动只在 `feat/android-app` 分支 |
| 9 | 软著材料被推到 public 仓库 | 低 | 隐私泄露 | `prepare_www.py` 白名单机制 + 提交前 `git status` 人工核对 |

---

## 六、验收标准（什么叫做完了）

1. 手机安装后，**开飞行模式**，全流程可用：导入 → 选页 → 提取 → 保存到「下载」→ 用其他 App 打开验证
2. 拆分单页 ZIP、多文件合并同样能存下来
3. 加密 PDF 能输密码打开（图片化路径正常）
4. 冷启动 < 2 秒，100 页 PDF 缩略图加载 < 5 秒
5. 按返回键行为正常（关弹窗而不是退出）
6. 深色模式下没有白底闪屏
7. App 名称、图标正确

---

## 七、需要你配合的

| # | 事项 | 时机 |
|---|---|---|
| 1 | **GitHub token**（repo + workflow） | 现在 |
| 2 | 手机允许"安装未知来源应用" | 阶段 4 |
| 3 | 真机试单文件 HTML，反馈手感 | 阶段 2 |
| 4 | 真机装 APK，反馈问题 | 阶段 5 |
| 5 | （可选）keystore 密码加进 Secrets | 阶段 5 |

---

## 八、成本预估

### 钱
**0 元。** public 仓库 Actions 无限免费；不需要 Google Play $25 开发者账号；不需要域名/服务器。

### Token（我的消耗，含输入输出）
| 阶段 | 预估 | 累计 |
|---|---|---|
| 0 同步 | 0.5–1 万 | 1 万 |
| 1 UI 改造 + 截图 | 3–8 万 | 9 万 |
| 2 单文件 | 1–2 万 | 11 万 |
| 3 Capacitor + 原生桥 | 4–10 万 | 21 万 |
| 4 CI 排错 | 3–8 万 | 29 万 |
| 5 验收迭代 | 2–5 万 | **34 万** |

区间：**10 万（一路顺）～ 35 万（踩满坑）**。最大不确定项是阶段 4 的 Gradle 排错——每失败一次我要读一遍日志，比较吃 token。

### 时间
一次完整走完约 **半天到一天**，分散在几轮对话里。

---

## 九、回退方案

- 阶段 1 不满意 → `git checkout main`，网页版原样不动，零损失
- 阶段 3 卡住 → 停在阶段 2，你已有一个能离线用的单文件 HTML
- 阶段 4 卡住 → 我可以把工程打包给你，用 Android Studio 在你电脑上编译（需要你装 Android Studio）
- 全程不碰 `main` 分支，不动现有 Release

---

## 十、待你确认的三个决策

1. **签名**：第一版用 debug（简单，但升级要卸载重装），还是直接上固定 keystore（多一步 Secrets 配置）？
2. **零网络权限**：要不要把"从 manifest 删掉 INTERNET 权限"作为硬指标？做到了是系统级证明，但可能牺牲一点 WebView 兼容性。
3. **appId**：我打算用 `com.aatinf.pdfextractor`，有偏好吗？（装到手机上就固定了，以后改要卸载重装）

## 0.3.5 — 2026-11-13

- Ship the extractor tests in the npm tarball (`test/` added to `files`), so `npm test` works after install.
- Keep layout, TSV ordering, protocol validation, empty-text and derived-link tests beside the published package.
- No runtime behavior change from 0.3.4.
# Changelog

## 0.2.1 — 2026-11-11

### Fixed — 致命启动故障（0.2.0 及更早都中）

**症状：** DSH 重启后打不开，桌面壳报 `Error: desktop welcome: Web RPC failed`；禁用全部插件后又能打开。

**根因链：**

1. 插件把 `@deepseek-ai/schemastery` 放在 `try/catch` 里动态导入。以 `link:` 方式安装时，插件从自己的真实路径解析不到这个包，落到 `export const Config = ... : null`。
2. DSH 启动时桌面壳会请求 `settings/describe`，宿主执行 `"toJSON" in schema`；`Config` 是 `null` 时直接抛
   `TypeError: Cannot use 'in' operator to search for 'toJSON' in null`。
3. RPC 返回 `gateway/internal` 失败，欢迎页窗口无法创建 —— App 卡在启动。

**影响版本：** 0.1.8、0.1.9、0.2.0（三个已发布包里的 `index.js` 都是 `: null` 兜底）。
**最容易踩中的场景：** 装完没重启所以一直没事，某次重启后突然打不开；或插件被改成 `link:` / 放在 profile 的 node_modules 之外。

### 修复内容

- schemastery 解析失败时，改用 `createRequire(profileDir/package.json)` 从运行中的 profile 回退解析；
- 兜底导出 `undefined` 而**不是** `null`。宿主对缺失 schema 是安全的（跳过该行），对 `null` 不安全；
- 补上 `repository` / `homepage` / `bugs` / `author` / `license` / `keywords` 元数据；
- 整理 `index.js` 顶部导入顺序，逻辑与 0.2.0 保持一致。

### 升级建议

```powershell
npm i dsh-cortex-extractors@0.2.1
# 或在 profile 里把依赖指到 0.2.1
```

升级后重启一次 DSH 即可。

---

## 0.2.0 — 2026-11-11

- 初始公开版本（Windows OCR 默认 provider、Tesseract、whisper.cpp、command 引擎）。

## 0.1.9 / 0.1.8 — 2026-11-11

- 内部迭代版本，未公开文档。

## 0.3.0 — 2026-11-12

- Added Tesseract TSV layout ordering: `auto`, `single`, `two-column`, `handwriting`.
- Added optional `paddleocr` provider with an explicit local model directory; fails closed without it and never downloads a model.
- Added pure layout tests and a PaddleOCR fail-closed test.

## 0.3.1 — 2026-11-12

- Fixed Tesseract TSV config discovery when user tessdata has no configs directory.
- Split same-line left/right words by coordinates; place spanning headers/footers outside columns.

## 0.3.2 — 2026-11-12

- Windows OCR now emits word bounding boxes and honors the layout selector (`auto`/`single`/`two-column`/`handwriting`).
- Same-line left/right words are split by page midpoint; full-width footers/headers stay whole.
- UI full extraction with layout was verified on Windows OCR and Tesseract.

- PaddleOCR bridge now accepts a local model root with detection/recognition folders, disables oneDNN for CPU compatibility, and writes UTF-8 JSON.
- Local acceptance: KaiTi handwriting-style image -> 手写测试 / 本鲸喜欢白饭 / 今天也要好好学技术.

## 0.3.3 — 2026-11-12

- PaddleOCR bridge preprocesses transparent/large photos to RGB and limits them to 2000px.
- Friendly failure guidance for missing OCR text, missing PaddleOCR, and invalid model directories.
- Real cursive handwriting acceptance: a public-domain sample produced partial readable text; accuracy remains limited.

## 0.3.4 — 2026-11-12

- Declared `engines.dsh` in package.json so the bundle can be listed by a DSH market index.
- No extractor behavior change.


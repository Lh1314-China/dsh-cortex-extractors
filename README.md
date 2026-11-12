# dsh-cortex-extractors

Optional OCR/ASR adapter for cortex. It is a **separate bundle**, not part of `dsh-cortex`.

- Calls only an explicitly configured local command.
- Never downloads a model.
- Accepts only `file://` inputs.
- Fails closed when no command is configured.

> **Use 0.2.1 or newer.** Releases 0.1.8 / 0.1.9 / 0.2.0 exported `Config = null` when
> `@deepseek-ai/schemastery` could not be resolved from the plugin's own path (typical for
> `link:` installs). The host then crashed while reading settings
> (`Cannot use 'in' operator to search for 'toJSON' in null`), the desktop welcome RPC failed,
> and **DSH could not start at all** (`desktop welcome: Web RPC failed`).
> 0.2.1 resolves the schema through the running profile and falls back to `Config = undefined`
> instead of `null`. See [CHANGELOG.md](./CHANGELOG.md).

## Install

Use the Harness plugin manager with this directory, then configure:

Windows OCR is the default OCR provider; no model is downloaded. It upscales small images (up to 1600px wide) before recognition and falls back to the original image on preprocessing failure. Disable with `ocrPreprocess: false`.

Windows OCR now also returns word bounding boxes and honors `ocrLayout` / the UI Layout selector:
`auto` detects two columns, `two-column` splits words at the page midpoint, and full-width
footers/headers stay whole. `single` and `handwriting` keep top-to-bottom order.

Tesseract is available as an explicit provider (it is not the default):

```yaml
ocrProvider: tesseract
tesseractLanguage: chi_sim+eng
tesseractPath: 'C:/Program Files/Tesseract-OCR/tesseract.exe'
tessdataPath: 'C:/Users/<you>/AppData/Local/cortex-extractors/tessdata'
ocrLayout: auto            # auto / single / two-column / handwriting
```

`two-column` reads Tesseract TSV coordinates and emits the left column before the right;
`auto` only chooses it when two populated columns are separated by a gutter. `single` keeps
plain top-to-bottom order. `handwriting` switches Tesseract to page mode 6.

### Optional PaddleOCR layout/handwriting bridge

For real layout or handwriting models, install `paddleocr` + `paddlepaddle` yourself and point
the plugin at a **local model root** containing the detection and recognition folders. The
bridge refuses to run when the folders are missing; DSH never downloads a model implicitly.

```yaml
ocrProvider: paddleocr
paddleocrPython: 'python'
paddleocrModelDir: 'C:/Users/<you>/.paddlex/official_models'
ocrLayout: handwriting     # or auto / two-column
```

The root should contain e.g. `PP-OCRv6_medium_det` and `PP-OCRv6_medium_rec` (or a supported
v5/v4 pair). The bridge uses CPU with oneDNN disabled for compatibility. The optional bridge is
`lib/paddleocr_bridge.py`; it is not executed by the default install.

Acceptance on this machine: synthetic KaiTi handwriting-style image produced
`手写测试 / 本鲸喜欢白饭 / 今天也要好好学技术` with the real PaddleOCR model. This is not a
human-handwriting benchmark.

Whisper.cpp is available as an explicit ASR provider; the model file must be placed manually:

```yaml
asrProvider: whisper-cpp
whisperPath: 'C:/tools/whisper/whisper-cli.exe'
whisperModel: 'C:/models/ggml-small.bin'
whisperLanguage: zh
whisperPrompt: '本鲸 白饭 主人'
asrReplacements: ['本金=本鲸']
# Optional: output temp directory; defaults to <cwd>/.cortex-extractors-tmp
tmpDir: 'C:/path/to/writable/tmp'
```

For a command-based OCR/ASR engine, override:

```yaml
ocrProvider: 'command'
ocrCommand: 'C:/tools/tesseract/tesseract.exe'
ocrArgs: ['{file}', 'stdout', '-l', '{language}']
asrCommand: 'C:/tools/whisper/whisper-cli.exe'
asrArgs: ['-f', '{file}', '-otxt']
```

`{file}` is replaced with the decoded local path; `{language}` with the optional tool argument.

## Tool

`cortex_extract_text`

```json
{"uri":"file:///C:/tmp/frame.png","mode":"ocr","language":"chi_sim"}
```

Optional linkage: pass an explicit target `traceId`; the extracted text is written as a **derived trace** and linked by metadata, without mutating the target.

```json
{"uri":"file:///C:/tmp/frame.png","mode":"ocr","traceId":"trc_target"}
```

## Test

```powershell
node --test test/*.test.js
```

The test uses a fake engine; it does not download or run a real OCR/ASR model.

## Boundaries

- No model download.
- No automatic engine installation.
- No HTTP input.
- No main-cortex dependency.
- Text extraction quality depends on the configured engine.

## Engines and layout

See [docs/engines.md](./docs/engines.md) for providers, model directories, layout behavior and failure modes.


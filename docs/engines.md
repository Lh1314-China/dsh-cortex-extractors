# Engines and layout

`dsh-cortex-extractors` is optional. It never downloads a model automatically.

## Providers

| Provider | Use | Requirements |
|---|---|---|
| `windows-ocr` | default OCR on Windows | Windows.Media.Ocr language pack |
| `tesseract` | layout/print OCR | Tesseract + traineddata |
| `paddleocr` | optional layout/handwriting | `paddleocr` + `paddlepaddle` + local model folders |
| `whisper-cpp` | ASR | whisper-cli + ggml model |
| `command` | custom OCR/ASR | explicit executable and args |

## Layout

- `auto`: detect two columns; otherwise top-to-bottom.
- `single`: top-to-bottom.
- `two-column`: split words at the page midpoint; put spanning headers/footers after both columns.
- `handwriting`: top-to-bottom; for PaddleOCR it is a handwriting-oriented prompt/layout mode, not a guarantee.

Windows OCR and Tesseract both emit word coordinates for column ordering. A command provider receives `{file}` and `{language}`; it is responsible for its own ordering.

## PaddleOCR

```powershell
pip install paddleocr paddlepaddle
```

```yaml
ocrProvider: paddleocr
paddleocrPython: 'python'
paddleocrModelDir: 'C:/Users/<you>/.paddlex/official_models'
ocrLayout: handwriting
```

The model root must contain local detection and recognition folders, for example:

```text
PP-OCRv6_medium_det/
PP-OCRv6_medium_rec/
```

CPU inference disables oneDNN for compatibility. Large photos are converted to RGB and limited to 2000px before inference. If nothing is recognized, the error says to use a clearer image or another engine; it does not expose a shell command.

## Failure behavior

- Missing provider/model: fail closed with a readable error.
- No text blocks: readable error; no empty memory is written.
- Timeout: bounded by `timeoutMs`.
- Input: only `file://`, regular file, at most 50 MB.

## Real handwriting caveat

A public-domain cursive sample produced partial readable text with the real PaddleOCR model. Cursive accuracy is limited; use a clearer image or a dedicated handwriting model for production handwriting.

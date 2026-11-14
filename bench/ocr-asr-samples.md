# OCR / ASR sample table

Do not fill this table with invented numbers. Every row needs a sample file,
ground truth, engine/version and machine.

## OCR

| sample | layout | engine | CER | line-order accuracy | p50 ms | p95 ms | notes |
|---|---|---|---:|---:|---:|---:|---|
| single-column Chinese screenshot | single | Windows OCR | pending | pending | pending | pending | needs real sample |
| two-column Chinese screenshot | two-column | Tesseract TSV | pending | pending | pending | pending | needs tessdata |
| header/footer across midline | two-column | Tesseract TSV | pending | pending | pending | pending | layout fixture |
| handwritten Chinese photo | handwriting | PaddleOCR | pending | pending | pending | pending | model not bundled |

## ASR

| sample | duration | engine/model | WER | p50 ms | p95 ms | notes |
|---|---:|---|---:|---:|---:|---|
| zh-CN clean speech 10s | 10s | Whisper.cpp small | pending | pending | pending | model ~488MB |
| zh-CN noisy speech 10s | 10s | Whisper.cpp small | pending | pending | pending | needs sample |
| zh-CN long audio | 60s | Whisper.cpp small | pending | pending | pending | chunking |

## Required environment

```text
Windows build:
CPU/GPU:
Node:
DSH:
Tesseract:
Whisper.cpp:
PaddleOCR:
models:
```

Until a row has real sample + ground truth, mark it `pending`, not `0%` or `100%`.

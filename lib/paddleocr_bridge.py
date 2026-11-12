#!/usr/bin/env python3
"""Optional PaddleOCR bridge for layout-aware / handwriting extraction.

This file is not executed by default. It requires:
  pip install paddleocr paddlepaddle

The model directory must be explicit and contain the local detection and
recognition model folders; the bridge never downloads a model at extraction
time.
"""
import argparse
import json
import os
import sys
from pathlib import Path

# Node reads subprocess stdout as UTF-8; Windows console defaults can be GBK.
try:
    sys.stdout.reconfigure(encoding="utf-8")
except AttributeError:
    pass

# Explicit model directories must be used; suppress the online source check.
os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")


def box_bounds(box):
    if not box:
        return 0, 0, 0, 0
    points = []
    if isinstance(box[0], (list, tuple)):
        points = [(float(p[0]), float(p[1])) for p in box]
    elif len(box) >= 4:
        points = [(float(box[0]), float(box[1])), (float(box[2]), float(box[3]))]
    if not points:
        return 0, 0, 0, 0
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return min(xs), min(ys), max(xs) - min(xs), max(ys) - min(ys)


def normalize_result(result):
    blocks = []
    if result is None:
        return blocks
    # PaddleOCR v2: [[box, (text, score)], ...] (possibly nested per image).
    if isinstance(result, list):
        for item in result:
            if isinstance(item, list) and item and isinstance(item[0], list):
                for line in item:
                    if isinstance(line, (list, tuple)) and len(line) >= 2:
                        box, payload = line[0], line[1]
                        text = payload[0] if isinstance(payload, (list, tuple)) else payload
                        if text:
                            x, y, w, h = box_bounds(box)
                            blocks.append({"text": str(text), "x": x, "y": y, "width": w, "height": h})
            elif isinstance(item, (list, tuple)) and len(item) >= 2:
                box, payload = item[0], item[1]
                text = payload[0] if isinstance(payload, (list, tuple)) else payload
                if text:
                    x, y, w, h = box_bounds(box)
                    blocks.append({"text": str(text), "x": x, "y": y, "width": w, "height": h})
    # PaddleOCR v3: result objects expose .json with rec_texts/rec_boxes.
    for page in result if isinstance(result, list) else [result]:
        data = getattr(page, "json", None)
        if callable(data):
            data = data()
        if not isinstance(data, dict):
            continue
        res = data.get("res", data)
        texts = res.get("rec_texts") or []
        boxes = res.get("rec_boxes") or res.get("rec_polys") or []
        for index, text in enumerate(texts):
            if not text:
                continue
            box = boxes[index] if index < len(boxes) else None
            x, y, w, h = box_bounds(box)
            blocks.append({"text": str(text), "x": x, "y": y, "width": w, "height": h})
    return blocks


def find_model_dirs(root):
    root = Path(root)
    candidates = [
        (root / "PP-OCRv6_medium_det", root / "PP-OCRv6_medium_rec"),
        (root / "PP-OCRv5_mobile_det", root / "PP-OCRv5_mobile_rec"),
        (root / "PP-OCRv4_mobile_det", root / "PP-OCRv4_mobile_rec"),
    ]
    for det, rec in candidates:
        if det.is_dir() and rec.is_dir():
            return det, rec
    # Also accept a directory that itself contains det/rec subdirectories.
    for det in root.glob("*det*"):
        for rec in root.glob("*rec*"):
            if det.is_dir() and rec.is_dir():
                return det, rec
    return None, None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", required=True)
    parser.add_argument("--language", default="ch")
    parser.add_argument("--layout", default="auto")
    parser.add_argument("--model-dir", required=True)
    args = parser.parse_args()

    det_dir, rec_dir = find_model_dirs(args.model_dir)
    if not det_dir or not rec_dir:
        raise SystemExit("paddleocrModelDir must contain local detection and recognition model folders; no model is downloaded")

    try:
        from paddleocr import PaddleOCR
    except Exception as exc:  # noqa: BLE001 - the caller needs the exact reason
        raise SystemExit(f"paddleocr is not installed: {exc}")

    kwargs = {
        "lang": args.language or "ch",
        "text_detection_model_dir": str(det_dir),
        "text_recognition_model_dir": str(rec_dir),
        "use_doc_orientation_classify": False,
        "use_doc_unwarping": False,
        "use_textline_orientation": False,
        "enable_mkldnn": False,
    }
    ocr = PaddleOCR(**kwargs)
    result = ocr.predict(args.file)
    blocks = normalize_result(result)
    if not blocks:
        raise SystemExit("paddleocr returned no text blocks")
    print(json.dumps({"engine": "paddleocr", "layout": args.layout, "blocks": blocks}, ensure_ascii=False))


if __name__ == "__main__":
    main()

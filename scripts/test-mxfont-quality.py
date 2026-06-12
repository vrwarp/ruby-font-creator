"""End-to-end quality check for the exported MX-Font ONNX graphs.

Simulates the product use case entirely outside the browser:
  1. Style refs: a handful of characters rendered from a "user" font.
  2. Content: missing characters rendered from DroidSansFallbackFull (the
     bundled reference font).
  3. Generate via ONNX, save a comparison grid PNG.

Two scenarios:
  A. Style font = MaShanZheng (calligraphy, OFL) -> visible style transfer.
  B. Style font = DroidSansFallback traditional subset; generate simplified
     chars and compare against DroidSans's true simplified glyphs.

Run: .venv-mxfont/bin/python scripts/test-mxfont-quality.py
"""

from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
MODELS = ROOT / "frontend" / "public" / "models"
DROID = ROOT / "resources" / "fonts" / "DroidSansFallbackFull.ttf"
MASHAN = ROOT / "vendor" / "mxfont" / "data" / "ttfs" / "val" / "MaShanZheng-Regular.ttf"
OUT = ROOT / "scratch" / "mxfont-quality"


def render(font, char, size=(128, 128), pad=20):
    """Replicates vendor/mxfont render() with Pillow>=10 (getbbox API).

    Places the ink bbox at `pad` on a square white canvas, resizes to 128.
    """
    bbox = font.getbbox(char)
    if bbox is None:
        return None
    x0, y0, x1, y1 = bbox
    width, height = x1 - x0, y1 - y0
    if width <= 0 or height <= 0:
        return None
    max_size = max(width, height)
    if width < height:
        start_w = (height - width) // 2 + pad
        start_h = pad
    else:
        start_w = pad
        start_h = (width - height) // 2 + pad

    img = Image.new("L", (max_size + pad * 2, max_size + pad * 2), 255)
    draw = ImageDraw.Draw(img)
    draw.text((start_w - x0, start_h - y0), char, font=font, fill=0)
    return img.resize(size, Image.BILINEAR)


def to_tensor(img):
    arr = np.asarray(img, dtype=np.float32) / 255.0
    arr = (arr - 0.5) / 0.5  # [-1, 1], ink -> -1
    return arr[None, None]


def main(suffix=""):
    enc = ort.InferenceSession(str(MODELS / f"mxfont_encoder{suffix}.onnx"), providers=["CPUExecutionProvider"])
    dec = ort.InferenceSession(str(MODELS / f"mxfont_decoder{suffix}.onnx"), providers=["CPUExecutionProvider"])
    OUT.mkdir(parents=True, exist_ok=True)

    droid = ImageFont.truetype(str(DROID), size=150)
    mashan = ImageFont.truetype(str(MASHAN), size=150)

    scenarios = [
        # (name, style font, style ref chars, chars to generate)
        ("mashan", mashan, "永和九年春月", "爱书马龙国发"),
        ("droid-trad", droid, "愛書馬龍國發", "爱书马龙国发"),
    ]

    import time

    for name, style_font, ref_chars, gen_chars in scenarios:
        refs = [render(style_font, c) for c in ref_chars]
        refs = [r for r in refs if r is not None]
        t0 = time.time()
        facts = [enc.run(None, {"image": to_tensor(r)}) for r in refs]
        style_last = np.mean([f[0] for f in facts], axis=0)
        style_skip = np.mean([f[1] for f in facts], axis=0)
        t_style = time.time() - t0

        rows = []
        t_gen = 0.0
        for ch in gen_chars:
            content = render(droid, ch)
            t0 = time.time()
            cf = enc.run(None, {"image": to_tensor(content)})
            out = dec.run(
                None,
                {
                    "style_last": style_last,
                    "style_skip": style_skip,
                    "char_last": cf[2],
                    "char_skip": cf[3],
                },
            )[0]
            t_gen += time.time() - t0
            gen_img = np.clip(out[0, 0] * 255, 0, 255).astype(np.uint8)  # sigmoid [0,1], ink-low
            truth = render(style_font, ch) if name != "mashan" else render(mashan, ch)
            row = [np.asarray(content), gen_img, np.asarray(truth) if truth else np.full((128, 128), 255, np.uint8)]
            rows.append(np.concatenate(row, axis=1))

        grid = np.concatenate(rows, axis=0)
        path = OUT / f"{name}{suffix}.png"
        Image.fromarray(grid).save(path)
        print(f"{name}{suffix}: style({len(refs)} refs)={t_style:.2f}s, "
              f"gen={t_gen / len(gen_chars):.2f}s/char -> {path}")
        print("  columns: content (DroidSans) | generated | ground truth (style font)")


if __name__ == "__main__":
    import sys

    main("" if len(sys.argv) < 2 else sys.argv[1])

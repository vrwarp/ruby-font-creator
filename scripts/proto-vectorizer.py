"""Offline prototype comparing glyph vectorization pipelines.

Generates glyphs with the real int8 MX-Font ONNX models, vectorizes the
raster with several pipelines, rasterizes the vectors back at 4x, and scores
fidelity (IoU vs the iso-thresholded reference) plus produces zoomed visual
grids in scratch/vector-quality/.

Pipelines:
  A. baseline  — the shipped TS implementation (run via tsx in node)
  B. ms        — marching squares (sub-pixel) + polygon output
  C. ms-fit    — B + corner detection + least-squares cubic Bezier fitting
  D. ms-fit-hv — C + H/V snapping of near-axis spans
Raster variants: plain model output, and TTA (shift-average) output.

Run: .venv-mxfont/bin/python scripts/proto-vectorizer.py
"""

import json
import math
import subprocess
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
MODELS = ROOT / "frontend" / "public" / "models"
DROID = ROOT / "resources" / "fonts" / "DroidSansFallbackFull.ttf"
MASHAN = ROOT / "vendor" / "mxfont" / "data" / "ttfs" / "val" / "MaShanZheng-Regular.ttf"
OUT = ROOT / "scratch" / "vector-quality"
SIZE = 128

# ---------------------------------------------------------------- model glue


def render(font, char, size=(128, 128), pad=20):
    bbox = font.getbbox(char)
    if bbox is None:
        return None
    x0, y0, x1, y1 = bbox
    w, h = x1 - x0, y1 - y0
    if w <= 0 or h <= 0:
        return None
    m = max(w, h)
    sw, sh = ((h - w) // 2 + pad, pad) if w < h else (pad, (w - h) // 2 + pad)
    img = Image.new("L", (m + pad * 2, m + pad * 2), 255)
    ImageDraw.Draw(img).text((sw - x0, sh - y0), char, font=font, fill=0)
    return img.resize(size, Image.BILINEAR)


def to_tensor(img):
    arr = np.asarray(img, dtype=np.float32) / 255.0
    return ((arr - 0.5) / 0.5)[None, None]


class Gen:
    def __init__(self):
        self.enc = ort.InferenceSession(str(MODELS / "mxfont_encoder.int8.onnx"), providers=["CPUExecutionProvider"])
        self.dec = ort.InferenceSession(str(MODELS / "mxfont_decoder.int8.onnx"), providers=["CPUExecutionProvider"])
        self.style = None

    def set_style(self, font, chars):
        facts = [self.enc.run(None, {"image": to_tensor(render(font, c))}) for c in chars]
        self.style = (
            np.mean([f[0] for f in facts], axis=0),
            np.mean([f[1] for f in facts], axis=0),
        )

    def gen_from_content(self, content_img):
        cf = self.enc.run(None, {"image": to_tensor(content_img)})
        out = self.dec.run(
            None,
            {
                "style_last": self.style[0],
                "style_skip": self.style[1],
                "char_last": cf[2],
                "char_skip": cf[3],
            },
        )[0][0, 0]
        return 1.0 - np.clip(out, 0, 1)  # ink-high [0,1]

    def gen(self, content_font, char, tta=False):
        img = render(content_font, char)
        if not tta:
            return self.gen_from_content(img)
        # shift-average TTA: translate content, generate, shift back, average
        arr = np.asarray(img, dtype=np.uint8)
        acc = np.zeros((SIZE, SIZE), np.float64)
        shifts = [(0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)]
        for dx, dy in shifts:
            shifted = np.roll(np.roll(arr, dy, axis=0), dx, axis=1)
            out = self.gen_from_content(Image.fromarray(shifted))
            out = np.roll(np.roll(out, -dy, axis=0), -dx, axis=1)
            acc += out
        return (acc / len(shifts)).astype(np.float32)


# ------------------------------------------------- marching squares (portable)

# Edge ids within a cell: 0=T 1=R 2=B 3=L


from glyph_vectorize import (  # noqa: E402,F401  (shared geometry module)
    CASE_TABLE,
    SADDLE_TABLE,
    bezier_point,
    detect_corners,
    fit_contour,
    marching_squares,
    pipeline_ms,
    resample,
    segments_to_polyline,
    shoelace,
)

def pipeline_baseline_ts(field, threshold, smoothing):
    """Run the shipped TS implementation via tsx."""
    payload = json.dumps({"pixels": field.flatten().tolist(), "w": SIZE, "h": SIZE,
                          "threshold": threshold, "smoothing": smoothing})
    runner = ROOT / "scratch" / "run-vectorizer.mts"
    if not runner.exists():
        runner.write_text(
            "import { traceGrayscaleImage } from '../src/vectorizer.js'\n"
            "import fs from 'node:fs'\n"
            "const d = JSON.parse(fs.readFileSync(0, 'utf8'))\n"
            "const path = traceGrayscaleImage(new Float32Array(d.pixels), d.w, d.h, d.threshold, d.smoothing)\n"
            "console.log(path)\n"
        )
    res = subprocess.run(
        ["npx", "tsx", str(runner)],
        input=payload, capture_output=True, text=True, cwd=ROOT, timeout=120,
    )
    if res.returncode != 0:
        raise RuntimeError(res.stderr[:500])
    return parse_svg_path(res.stdout.strip())


def parse_svg_path(d):
    """Parse M/L/C/Z absolute path into flattened polyline loops."""
    import re

    tokens = re.findall(r"[MLCZ]|-?\d+\.?\d*", d)
    loops = []
    cur = []
    last = (0.0, 0.0)
    i = 0
    while i < len(tokens):
        t = tokens[i]
        if t == "M":
            if cur:
                loops.append(cur)
            cur = []
            last = (float(tokens[i + 1]), float(tokens[i + 2]))
            cur.append(last)
            i += 3
        elif t == "L":
            last = (float(tokens[i + 1]), float(tokens[i + 2]))
            cur.append(last)
            i += 3
        elif t == "C":
            bez = [last,
                   (float(tokens[i + 1]), float(tokens[i + 2])),
                   (float(tokens[i + 3]), float(tokens[i + 4])),
                   (float(tokens[i + 5]), float(tokens[i + 6]))]
            for k in range(1, 17):
                cur.append(bezier_point(bez, k / 16))
            last = bez[3]
            i += 7
        elif t == "Z":
            if cur:
                loops.append(cur)
                cur = []
            i += 1
        else:
            i += 1
    if cur:
        loops.append(cur)
    return loops


# ----------------------------------------------------------------- scoring


def rasterize(loops, scale=4):
    """Rasterize loops (positive shoelace = ink) at scale x."""
    img = Image.new("L", (SIZE * scale, SIZE * scale), 0)
    draw = ImageDraw.Draw(img)
    order = sorted(loops, key=lambda l: -abs(shoelace(l)))
    for loop in order:
        if len(loop) < 3:
            continue
        fill = 255 if shoelace(loop) > 0 else 0
        draw.polygon([(x * scale, y * scale) for x, y in loop], fill=fill)
    return np.asarray(img) >= 128


def reference_mask(field, iso, scale=4):
    img = Image.fromarray((np.clip(field, 0, 1) * 255).astype(np.uint8))
    big = img.resize((SIZE * scale, SIZE * scale), Image.BILINEAR)
    return np.asarray(big) >= iso * 255


def iou(a, b):
    inter = np.logical_and(a, b).sum()
    union = np.logical_or(a, b).sum()
    return inter / union if union else 1.0


# ------------------------------------------------------------------- main


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    droid = ImageFont.truetype(str(DROID), 150)
    mashan = ImageFont.truetype(str(MASHAN), 150)
    gen = Gen()

    scenarios = [
        ("droid", droid, "愛書馬發國龍", "爱发龙书国马"),
        ("mashan", mashan, "永和九年春月", "爱发龙书国马"),
    ]

    iso_level = 0.5
    results = {}

    for name, style_font, refs, chars in scenarios:
        gen.set_style(style_font, refs)
        for char in chars:
            for raster_name, tta in [("plain", False), ("tta", True)]:
                field = gen.gen(droid, char, tta=tta)
                ref = reference_mask(field, iso_level)
                rows = {}
                rows["A-baseline"] = pipeline_baseline_ts(field, int(iso_level * 255), 1.0)
                rows["B-ms"] = pipeline_ms(field, iso_level, fit=False)
                rows["C-ms-fit"] = pipeline_ms(field, iso_level, fit=True, error=0.4)
                rows["D-ms-fit-hv"] = pipeline_ms(field, iso_level, fit=True, hv=True, error=0.4)
                for pname, loops in rows.items():
                    mask = rasterize(loops)
                    key = (name, raster_name, pname)
                    results.setdefault(key, []).append(iou(mask, ref))
                # visual: 4x zoom grid: model raster | each pipeline
                tiles = [np.asarray(Image.fromarray((np.clip(field, 0, 1) * 255).astype(np.uint8)).resize((512, 512), Image.NEAREST))]
                for pname in rows:
                    tiles.append((rasterize(rows[pname]) * 255).astype(np.uint8))
                grid = np.concatenate(tiles, axis=1)
                Image.fromarray(255 - grid).save(OUT / f"{name}-{char}-{raster_name}.png")

    print(f"{'scenario':28s} {'IoU(mean)':>10s}")
    agg = {}
    for (scen, raster, pname), vals in sorted(results.items()):
        label = f"{scen}/{raster}/{pname}"
        print(f"{label:28s} {np.mean(vals):10.4f}")
        agg.setdefault((raster, pname), []).extend(vals)
    print("\naggregate:")
    for (raster, pname), vals in sorted(agg.items()):
        print(f"{raster:6s} {pname:14s} {np.mean(vals):8.4f}")


if __name__ == "__main__":
    main()

"""Static (QDQ) int8 quantization for the MX-Font ONNX graphs.

Calibrates on real preprocessed glyph images rendered from
DroidSansFallbackFull via the same render() recipe used in
scripts/test-mxfont-quality.py (pad-20 square canvas -> 128x128, [-1,1]).

Encoder calibration: ~64 glyph images fed directly.
Decoder calibration: factors produced by the fp32 encoder on those same
glyphs (style = mean over random ref groups, char = per-glyph), so the
activation ranges match the real pipeline.

Recipe note (measured 2026-06): quantizing ALL op types destroys output
quality (decoder mean image error 0.21 in [0,1] space -> gray mush): the
elementwise/Gemm chains between the InstanceNorms have wide, outlier-heavy
activation ranges. Quantizing ONLY Conv (op_types_to_quantize=["Conv"])
keeps mean image error ~6e-3 (visually identical) while retaining the
speedup, since Conv dominates runtime. QUInt8 activations + Percentile
calibration measured marginally better than QInt8 + MinMax.

Usage:
  .venv-mxfont/bin/python scripts/quantize-mxfont-static.py \
      [--models-dir frontend/public/models] \
      [--out-dir frontend/public/models] [--num-calib 64]

Writes mxfont_encoder.int8.onnx / mxfont_decoder.int8.onnx to --out-dir —
these are the quantized models the app ships (run after
scripts/export-mxfont-onnx.py regenerates the fp32 graphs).
"""

import argparse
import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort
from onnxruntime.quantization import (
    CalibrationDataReader,
    CalibrationMethod,
    QuantFormat,
    QuantType,
    quantize_static,
)
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
DROID = ROOT / "resources" / "fonts" / "DroidSansFallbackFull.ttf"

# 64+ common hanzi with varied stroke complexity for calibration coverage.
CALIB_CHARS = (
    "的一是不了人我在有他这中大来上国个到说们为子和你地出道也时年得"
    "就那要下以生会自着去之过家学对可她里后小么心多天而能好都然没爱"
    "书马龙发永和九春月光风雨雪山水火木金土日月星辰天地玄黄宇宙洪荒"
)


def render(font, char, size=(128, 128), pad=20):
    """Same recipe as scripts/test-mxfont-quality.py."""
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


class ListDataReader(CalibrationDataReader):
    def __init__(self, feeds):
        self._feeds = feeds
        self._it = iter(feeds)

    def get_next(self):
        return next(self._it, None)

    def rewind(self):
        self._it = iter(self._feeds)


def build_calib_images(num):
    font = ImageFont.truetype(str(DROID), size=150)
    imgs = []
    for ch in CALIB_CHARS:
        if len(imgs) >= num:
            break
        img = render(font, ch)
        if img is not None:
            imgs.append(to_tensor(img))
    print(f"rendered {len(imgs)} calibration glyphs from {DROID.name}")
    return imgs


def build_decoder_feeds(enc_path, imgs, num_samples, seed=0):
    """Run the fp32 encoder to get realistic factor activations."""
    sess = ort.InferenceSession(str(enc_path), providers=["CPUExecutionProvider"])
    facts = [sess.run(None, {"image": im}) for im in imgs]
    rng = np.random.default_rng(seed)
    feeds = []
    for i in range(num_samples):
        ref_idx = rng.choice(len(facts), size=6, replace=False)
        style_last = np.mean([facts[j][0] for j in ref_idx], axis=0)
        style_skip = np.mean([facts[j][1] for j in ref_idx], axis=0)
        char = facts[i % len(facts)]
        feeds.append(
            {
                "style_last": style_last,
                "style_skip": style_skip,
                "char_last": char[2],
                "char_skip": char[3],
            }
        )
    return feeds


def static_quantize(model_in: Path, model_out: Path, reader, extra_kwargs=None):
    """quantize_static with QDQ / per-channel / QInt8; pre-processed first."""
    from onnxruntime.quantization.shape_inference import quant_pre_process

    pre = model_out.with_suffix(".pre.onnx")
    try:
        quant_pre_process(str(model_in), str(pre), skip_symbolic_shape=False)
        src = pre
    except Exception as e:  # noqa: BLE001
        print(f"  quant_pre_process failed ({e}); quantizing un-preprocessed model")
        src = model_in

    kwargs = dict(
        quant_format=QuantFormat.QDQ,
        per_channel=True,
        activation_type=QuantType.QUInt8,
        weight_type=QuantType.QInt8,
        calibrate_method=CalibrationMethod.Percentile,
        op_types_to_quantize=["Conv"],  # see recipe note in module docstring
    )
    if extra_kwargs:
        kwargs.update(extra_kwargs)
    try:
        quantize_static(str(src), str(model_out), reader, **kwargs)
    except Exception as e:  # noqa: BLE001
        print(f"  quantize_static failed: {e}", file=sys.stderr)
        raise
    finally:
        pre.unlink(missing_ok=True)
    print(f"wrote {model_out} ({model_out.stat().st_size / 1e6:.1f} MB)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--models-dir", default=str(ROOT / "frontend" / "public" / "models"))
    ap.add_argument("--out-dir", default=str(ROOT / "frontend" / "public" / "models"))
    ap.add_argument("--num-calib", type=int, default=64)
    args = ap.parse_args()

    models_dir = Path(args.models_dir)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    enc_in = models_dir / "mxfont_encoder.onnx"
    dec_in = models_dir / "mxfont_decoder.onnx"
    enc_out = out_dir / "mxfont_encoder.int8.onnx"
    dec_out = out_dir / "mxfont_decoder.int8.onnx"

    imgs = build_calib_images(args.num_calib)

    print("quantizing encoder (static QDQ)...")
    static_quantize(enc_in, enc_out, ListDataReader([{"image": im} for im in imgs]))

    print("building decoder calibration feeds via fp32 encoder...")
    dec_feeds = build_decoder_feeds(enc_in, imgs, num_samples=min(48, len(imgs)))
    print("quantizing decoder (static QDQ)...")
    static_quantize(dec_in, dec_out, ListDataReader(dec_feeds))

    # smoke test
    for p in (enc_out, dec_out):
        ort.InferenceSession(str(p), providers=["CPUExecutionProvider"])
        print(f"smoke-load OK: {p.name}")


if __name__ == "__main__":
    main()

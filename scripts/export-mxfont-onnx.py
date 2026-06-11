"""Export the pretrained MX-Font generator (vendor/mxfont/generator.pth) to ONNX.

Produces two graphs under frontend/public/models/:
  - mxfont_encoder.onnx: image [N,1,128,128] -> style/content factors
        outputs: style_last [N,6,256,16,16], style_skip [N,6,128,32,32],
                 char_last  [N,6,256,16,16], char_skip  [N,6,128,32,32]
  - mxfont_decoder.onnx: (style_last/skip [1,...], char_last/skip [1,...])
        -> image [1,1,128,128], sigmoid output, ink-low (0=black ink).

Inputs follow the MX-Font notebook convention: grayscale [-1, 1] (Normalize 0.5/0.5),
ink black (-1) on white (+1).

Also verifies ONNX parity against the PyTorch model and writes int8-quantized
variants (mxfont_encoder.int8.onnx / mxfont_decoder.int8.onnx).

Run with the conversion venv:
  .venv-mxfont/bin/python scripts/export-mxfont-onnx.py
"""

import sys
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn

ROOT = Path(__file__).resolve().parent.parent
MXFONT = ROOT / "vendor" / "mxfont"
sys.path.insert(0, str(MXFONT))

from sconf import Config  # noqa: E402

import models  # noqa: E402  (mxfont package)
import utils  # noqa: E402

OUT_DIR = ROOT / "frontend" / "public" / "models"
OPSET = 17


def load_generator():
    cfg = Config(str(MXFONT / "cfgs" / "eval.yaml"), default=str(MXFONT / "cfgs" / "defaults.yaml"))
    g_kwargs = cfg.get("g_args", {})
    gen = models.Generator(1, cfg.C, 1, **g_kwargs).eval()
    weight = torch.load(str(MXFONT / "generator.pth"), map_location="cpu", weights_only=False)
    if "generator_ema" in weight:
        weight = weight["generator_ema"]
    gen.load_state_dict(weight)
    return gen


class EncoderWrapper(nn.Module):
    """encode + factorize for both embedding dims in one pass."""

    def __init__(self, gen):
        super().__init__()
        self.gen = gen

    def forward(self, image):
        feats = self.gen.encode(image)  # {last: [N,6,256,16,16], skip: [N,6,128,32,32]}
        outs = []
        for emb_dim in (0, 1):  # 0 = style factors, 1 = content factors
            for key in ("last", "skip"):
                feat = feats[key]
                fact = []
                for i in range(self.gen.n_experts):
                    f = self.gen.fact_blocks[key][i](feat[:, i])
                    f = utils.add_dim_and_reshape(f, 1, (self.gen.emb_num, -1))
                    fact.append(f[:, emb_dim])
                outs.append(torch.stack(fact, dim=1))
        # style_last, style_skip, char_last, char_skip
        return tuple(outs)


class DecoderWrapper(nn.Module):
    """defactorize + decode."""

    def __init__(self, gen):
        super().__init__()
        self.gen = gen

    def forward(self, style_last, style_skip, char_last, char_skip):
        facts = [
            {"last": style_last, "skip": style_skip},
            {"last": char_last, "skip": char_skip},
        ]
        feats = self.gen.defactorize(facts)
        return self.gen.decode(feats)


def export():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    gen = load_generator()
    enc = EncoderWrapper(gen).eval()
    dec = DecoderWrapper(gen).eval()

    n_exp = gen.n_experts
    c_last, h_last, w_last = gen.feat_shape["last"]
    c_skip, h_skip, w_skip = gen.feat_shape["skip"]
    print(f"n_experts={n_exp} last={gen.feat_shape['last']} skip={gen.feat_shape['skip']}")

    # Fully static shapes (N=1): the CBAM broadcast ops lose shape info under
    # dynamic axes, which breaks InstanceNorm export. Callers loop over style
    # refs one at a time and average the factors (same total FLOPs).
    img = torch.randn(1, 1, 128, 128)
    enc_path = OUT_DIR / "mxfont_encoder.onnx"
    torch.onnx.export(
        enc,
        (img,),
        str(enc_path),
        input_names=["image"],
        output_names=["style_last", "style_skip", "char_last", "char_skip"],
        opset_version=OPSET,
        dynamo=False,
    )
    print(f"wrote {enc_path} ({enc_path.stat().st_size / 1e6:.1f} MB)")

    sl = torch.randn(1, n_exp, c_last, h_last, w_last)
    ss = torch.randn(1, n_exp, c_skip, h_skip, w_skip)
    cl = torch.randn(1, n_exp, c_last, h_last, w_last)
    cs = torch.randn(1, n_exp, c_skip, h_skip, w_skip)
    dec_path = OUT_DIR / "mxfont_decoder.onnx"
    torch.onnx.export(
        dec,
        (sl, ss, cl, cs),
        str(dec_path),
        input_names=["style_last", "style_skip", "char_last", "char_skip"],
        output_names=["image"],
        opset_version=OPSET,
        dynamo=False,
    )
    print(f"wrote {dec_path} ({dec_path.stat().st_size / 1e6:.1f} MB)")

    return gen, enc, dec, enc_path, dec_path


def verify(gen, enc_path, dec_path):
    import onnxruntime as ort

    torch.manual_seed(0)
    style_imgs = torch.rand(4, 1, 128, 128) * 2 - 1
    char_img = torch.rand(1, 1, 128, 128) * 2 - 1

    # Reference: the notebook flow
    with torch.no_grad():
        style_facts = gen.factorize(gen.encode(style_imgs), 0)
        style_facts = {k: v.mean(0, keepdim=True) for k, v in style_facts.items()}
        char_facts = gen.factorize(gen.encode(char_img), 1)
        feats = gen.defactorize([style_facts, char_facts])
        ref = gen.decode(feats).numpy()

    enc_sess = ort.InferenceSession(str(enc_path), providers=["CPUExecutionProvider"])
    dec_sess = ort.InferenceSession(str(dec_path), providers=["CPUExecutionProvider"])

    # one ref at a time (static N=1 graph), then average the style factors
    per_ref = [enc_sess.run(None, {"image": style_imgs[i : i + 1].numpy()}) for i in range(len(style_imgs))]
    style_last = np.mean([r[0] for r in per_ref], axis=0)
    style_skip = np.mean([r[1] for r in per_ref], axis=0)
    e_char = enc_sess.run(None, {"image": char_img.numpy()})
    out = dec_sess.run(
        None,
        {
            "style_last": style_last,
            "style_skip": style_skip,
            "char_last": e_char[2],
            "char_skip": e_char[3],
        },
    )[0]

    diff = np.abs(out - ref).max()
    print(f"parity: max abs diff torch vs onnx = {diff:.2e}")
    assert diff < 1e-3, "ONNX output diverges from PyTorch"
    print("parity OK")


if __name__ == "__main__":
    gen, _, _, enc_path, dec_path = export()
    verify(gen, enc_path, dec_path)
    # NOTE: fp16 conversion (onnxconverter-common convert_float_to_float16)
    # was evaluated for the WebGPU path and REJECTED: outputs collapse to
    # blank for some style inputs (e.g. calligraphy reference fonts) even
    # with keep_io_types and the default InstanceNorm block list. If size
    # matters later, use auto_mixed_precision with style feeds from MANY
    # fonts as validation data.
    # int8 quantization (for the WASM path) is a separate step:
    # scripts/quantize-mxfont-static.py (static QDQ, Conv-only). Dynamic
    # quantization must NOT be used — it emits ConvInteger nodes that are
    # 6-8x SLOWER than fp32 on both native ARM64 and browser WASM.
    print("next: .venv-mxfont/bin/python scripts/quantize-mxfont-static.py")

"""Exports zi2zi-JiT-B/16 for in-browser LoRA fine-tuning (jax-js port).

Produces:
  frontend/public/models/jit/
    jit_weights.json + jit_weights.<n>.bin   — transformer backbone, fp16
        storage (sharded < 95 MB for git), incl. RoPE buffers, sin-cos pos
        embed, font embedding table, and the precomputed NULL (CFG-uncond)
        style/content embeddings
    jit_config.json                          — architecture + training config
    jit_style_encoder.onnx / jit_content_encoder.onnx — frozen conditioning
        CNNs for onnxruntime-web (the browser precomputes per-sample
        conditioning once; the jax-js training loop never touches them)
  test/fixtures/jit/goldens.json + goldens.bin — fp32 golden tensors for
        layer-by-layer parity tests of the jax-js port. IMPORTANT: all model
        weights are rounded through fp16 BEFORE golden generation, so the
        JS port (which loads fp16) can be compared at tight tolerances.

Run: .venv-mxfont/bin/python scripts/export-jit-browser.py
"""

import json
import sys
from pathlib import Path

import numpy as np
import torch

ROOT = Path(__file__).resolve().parent.parent
JIT = ROOT / "vendor" / "zi2zi-jit"
CKPT = ROOT / "vendor" / "weights" / "zi2zi-JiT-B-16.pth"
OUT = ROOT / "frontend" / "public" / "models" / "jit"
GOLD = ROOT / "test" / "fixtures" / "jit"
SHARD_BYTES = 95 * 1024 * 1024

sys.path.insert(0, str(JIT))

from generate_chars import patch_torch_for_device  # noqa: E402

patch_torch_for_device(torch.device("cpu"))  # neutralize hardcoded .cuda() calls

from model_jit import JiT_models  # noqa: E402
from util.lora_utils import inject_lora  # noqa: E402

MODEL = "JiT-B/16"
NUM_FONTS = 1000
NUM_CHARS = 20000
P_MEAN, P_STD, T_EPS, NOISE_SCALE = -0.8, 0.8, 5e-2, 1.0


def fold_spectral_norm(module):
    """Bakes BigGAN-style spectral norm (W_() = weight/sigma) into the plain
    weight so ONNX export doesn't constant-fold extra weight copies (3x size)
    and inference skips the power-iteration math."""
    import types

    folded = 0
    for m in module.modules():
        if hasattr(m, "W_") and hasattr(m, "weight"):
            with torch.no_grad():
                m.weight.copy_(m.W_())
            if isinstance(m, torch.nn.Conv2d):
                m.forward = types.MethodType(torch.nn.Conv2d.forward, m)
            elif isinstance(m, torch.nn.Linear):
                m.forward = types.MethodType(torch.nn.Linear.forward, m)
            folded += 1
    return folded


def build_net():
    net = JiT_models[MODEL](
        input_size=256, in_channels=3, num_classes=NUM_FONTS,
        attn_drop=0.0, proj_drop=0.0, num_fonts=NUM_FONTS, num_chars=NUM_CHARS,
    ).eval()
    ckpt = torch.load(str(CKPT), map_location="cpu", weights_only=False)
    state = ckpt["model"]
    # checkpoint stores the Denoiser; strip the 'net.' prefix
    net_state = {k[len("net."):]: v for k, v in state.items() if k.startswith("net.")}
    missing, unexpected = net.load_state_dict(net_state, strict=False)
    missing = [m for m in missing if "rope" not in m]
    assert not missing, f"missing keys: {missing[:5]}"
    assert not unexpected, f"unexpected keys: {unexpected[:5]}"

    folded = fold_spectral_norm(net.y_embedder)
    print(f"folded spectral norm on {folded} encoder convs")

    # Round EVERYTHING the browser will load through fp16 so goldens match
    # the JS port bit-for-bit at fp32-compute tolerances.
    with torch.no_grad():
        for p in net.parameters():
            p.copy_(p.half().float())
        for b in net.buffers():
            if b.is_floating_point():
                b.copy_(b.half().float())
        for rope in (net.feat_rope, net.feat_rope_incontext):
            rope.freqs_cos = rope.freqs_cos.half().float()
            rope.freqs_sin = rope.freqs_sin.half().float()
    return net


class BinWriter:
    def __init__(self):
        self.chunks = []
        self.offset = 0
        self.manifest = {}

    def add(self, name, tensor, dtype):
        arr = tensor.detach().cpu().numpy()
        data = arr.astype(np.float16 if dtype == "f16" else np.float32).tobytes()
        if self.offset % 4:
            pad = 4 - self.offset % 4
            self.chunks.append(b"\0" * pad)
            self.offset += pad
        self.manifest[name] = {
            "offset": self.offset,
            "shape": list(arr.shape),
            "dtype": dtype,
        }
        self.chunks.append(data)
        self.offset += len(data)

    def blob(self):
        return b"".join(self.chunks)


def export_weights(net):
    OUT.mkdir(parents=True, exist_ok=True)
    w = BinWriter()

    # patch embed as plain matmul weights
    w.add("x_embedder.w1", net.x_embedder.proj1.weight.reshape(128, -1), "f16")  # [128, 768(=3*16*16)]
    w.add("x_embedder.w2", net.x_embedder.proj2.weight.reshape(768, 128), "f16")
    w.add("x_embedder.b2", net.x_embedder.proj2.bias, "f16")
    w.add("pos_embed", net.pos_embed[0], "f16")  # [256, 768]
    w.add("in_context_posemb", net.in_context_posemb[0], "f16")  # [32, 768]
    w.add("t_embedder.w0", net.t_embedder.mlp[0].weight, "f16")
    w.add("t_embedder.b0", net.t_embedder.mlp[0].bias, "f16")
    w.add("t_embedder.w2", net.t_embedder.mlp[2].weight, "f16")
    w.add("t_embedder.b2", net.t_embedder.mlp[2].bias, "f16")
    w.add("font_embedding", net.y_embedder.font_embedding.weight, "f16")  # [1001, 768]
    w.add("rope.cos", net.feat_rope.freqs_cos, "f16")  # [256, 64]
    w.add("rope.sin", net.feat_rope.freqs_sin, "f16")
    w.add("rope_ctx.cos", net.feat_rope_incontext.freqs_cos, "f16")  # [288, 64]
    w.add("rope_ctx.sin", net.feat_rope_incontext.freqs_sin, "f16")

    for i, blk in enumerate(net.blocks):
        p = f"blocks.{i}."
        w.add(p + "norm1.weight", blk.norm1.weight, "f16")
        w.add(p + "qkv.weight", blk.attn.qkv.weight, "f16")
        w.add(p + "qkv.bias", blk.attn.qkv.bias, "f16")
        w.add(p + "q_norm.weight", blk.attn.q_norm.weight, "f16")
        w.add(p + "k_norm.weight", blk.attn.k_norm.weight, "f16")
        w.add(p + "proj.weight", blk.attn.proj.weight, "f16")
        w.add(p + "proj.bias", blk.attn.proj.bias, "f16")
        w.add(p + "norm2.weight", blk.norm2.weight, "f16")
        w.add(p + "w12.weight", blk.mlp.w12.weight, "f16")
        w.add(p + "w12.bias", blk.mlp.w12.bias, "f16")
        w.add(p + "w3.weight", blk.mlp.w3.weight, "f16")
        w.add(p + "w3.bias", blk.mlp.w3.bias, "f16")
        w.add(p + "adaln.weight", blk.adaLN_modulation[1].weight, "f16")
        w.add(p + "adaln.bias", blk.adaLN_modulation[1].bias, "f16")

    w.add("final.norm.weight", net.final_layer.norm_final.weight, "f16")
    w.add("final.linear.weight", net.final_layer.linear.weight, "f16")
    w.add("final.linear.bias", net.final_layer.linear.bias, "f16")
    w.add("final.adaln.weight", net.final_layer.adaLN_modulation[1].weight, "f16")
    w.add("final.adaln.bias", net.final_layer.adaLN_modulation[1].bias, "f16")

    # CFG null (uncond) conditioning: white style/content images + null font
    with torch.no_grad():
        style_null = net.y_embedder.style_encoder(net.y_embedder.white_style_image)
        content_null = net.y_embedder.content_encoder(net.y_embedder.white_content_image)
    w.add("null.style_emb", style_null[0].half().float(), "f32")
    w.add("null.content_emb", content_null[0].half().float(), "f32")

    blob = w.blob()
    shards = []
    for i in range(0, len(blob), SHARD_BYTES):
        shard = blob[i : i + SHARD_BYTES]
        name = f"jit_weights.{len(shards)}.bin"
        (OUT / name).write_bytes(shard)
        shards.append({"name": name, "bytes": len(shard)})
    (OUT / "jit_weights.json").write_text(json.dumps({
        "shards": shards,
        "shardBytes": SHARD_BYTES,
        "tensors": w.manifest,
    }))
    print(f"weights: {len(blob) / 1e6:.1f} MB across {len(shards)} shards")

    (OUT / "jit_config.json").write_text(json.dumps({
        "model": MODEL,
        "depth": 12, "hiddenSize": 768, "numHeads": 12, "headDim": 64,
        "patchSize": 16, "inputSize": 256, "numPatches": 256,
        "bottleneckDim": 128,
        "inContextLen": 32, "inContextStart": 4,
        "nFontTokens": 2, "nContentTokens": 15, "nStyleTokens": 15,
        "mlpHidden": 2048,
        "numFonts": NUM_FONTS, "numChars": NUM_CHARS,
        "rmsNormEps": 1e-6,
        "flow": {"pMean": P_MEAN, "pStd": P_STD, "tEps": T_EPS, "noiseScale": NOISE_SCALE,
                 "labelDropProb": 0.1},
        "lora": {"r": 32, "alpha": 32, "targets": ["qkv", "proj", "w12", "w3"]},
        "train": {"lr": 8e-4, "betas": [0.9, 0.95], "weightDecay": 0.0,
                  "warmupEpochs": 1, "minLr": 0.0, "batchSize": 16},
        "sample": {"method": "ab2", "steps": 20, "cfg": 2.6, "interval": [0.0, 1.0]},
    }, indent=2))


def export_encoders(net):
    """fp16 ONNX: the weights were already rounded through fp16, so the
    conversion is value-lossless; a parity check guards the graph transform."""
    import onnx as onnx_lib
    import onnxruntime as ort
    from onnxconverter_common import float16

    for name, module, size in (
        ("jit_style_encoder", net.y_embedder.style_encoder, 128),
        ("jit_content_encoder", net.y_embedder.content_encoder, 256),
    ):
        path = OUT / f"{name}.onnx"
        torch.onnx.export(
            module, (torch.randn(1, 3, size, size),), str(path),
            input_names=["image"], output_names=["embedding"],
            opset_version=17, dynamo=False,
        )
        m16 = float16.convert_float_to_float16(onnx_lib.load(str(path)), keep_io_types=True)
        onnx_lib.save(m16, str(path))

        torch.manual_seed(7)
        probe = torch.rand(1, 3, size, size) * 2 - 1
        with torch.no_grad():
            ref = module(probe).numpy()
        sess = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
        got = sess.run(None, {"image": probe.numpy()})[0]
        rel = float(np.abs(got - ref).max() / (np.abs(ref).max() + 1e-9))
        assert rel < 5e-2, f"{name} fp16 parity failed: rel={rel}"
        print(f"wrote {path.name} ({path.stat().st_size / 1e6:.1f} MB, fp16 rel err {rel:.2e})")


def export_goldens(net):
    GOLD.mkdir(parents=True, exist_ok=True)
    g = BinWriter()
    torch.manual_seed(0)

    x = torch.randn(2, 3, 256, 256)
    t = torch.tensor([0.3, 0.7])
    font_emb = torch.randn(2, 768) * 0.5
    content_emb = torch.randn(2, 768) * 0.5
    style_emb = torch.randn(2, 768) * 0.5
    y_emb = font_emb + content_emb + style_emb
    conditioning = (y_emb, font_emb, content_emb, style_emb)

    g.add("in.x", x, "f32")
    g.add("in.t", t, "f32")
    g.add("in.font_emb", font_emb, "f32")
    g.add("in.content_emb", content_emb, "f32")
    g.add("in.style_emb", style_emb, "f32")

    with torch.no_grad():
        t_emb = net.t_embedder(t)
        g.add("out.t_emb", t_emb, "f32")

        x_emb = net.x_embedder(x) + net.pos_embed
        g.add("out.x_emb", x_emb, "f32")

        c = t_emb + y_emb
        block0 = net.blocks[0](x_emb, c, net.feat_rope)
        g.add("out.block0", block0, "f32")

        fwd = net.forward_with_conditioning(x, t, conditioning)
        g.add("out.forward", fwd, "f32")

    # flow-matching loss with FIXED t and noise (mirrors Denoiser.forward)
    torch.manual_seed(1)
    t_fixed = torch.tensor([0.35, 0.65]).view(-1, 1, 1, 1)
    e = torch.randn_like(x) * NOISE_SCALE
    g.add("in.loss_t", t_fixed.flatten(), "f32")
    g.add("in.loss_e", e, "f32")

    def flow_loss(model):
        z = t_fixed * x + (1 - t_fixed) * e
        v = (x - z) / (1 - t_fixed).clamp_min(T_EPS)
        x_pred = model.forward_with_conditioning(z, t_fixed.flatten(), conditioning)
        v_pred = (x_pred - z) / (1 - t_fixed).clamp_min(T_EPS)
        return ((v - v_pred) ** 2).mean(dim=(1, 2, 3)).mean()

    with torch.no_grad():
        g.add("out.loss", flow_loss(net).reshape(1), "f32")

    # LoRA gradients (A init seeded; rounded through fp16 like everything else)
    torch.manual_seed(2)
    inject_lora(net, ["qkv", "proj", "w12", "w3"], r=32, alpha=32, dropout=0.0)
    with torch.no_grad():
        for n, p in net.named_parameters():
            if "lora_A" in n:
                p.copy_(p.half().float())
    lora_params = {n: p for n, p in net.named_parameters() if "lora_" in n}
    for p in net.parameters():
        p.requires_grad_(False)
    for p in lora_params.values():
        p.requires_grad_(True)

    loss = flow_loss(net)
    loss.backward()
    g.add("out.loss_lora", loss.detach().reshape(1), "f32")

    a0 = "blocks.0.attn.qkv.lora_A"
    b0 = "blocks.0.attn.qkv.lora_B"
    g.add("in.lora_A_qkv0", lora_params[a0].detach(), "f32")
    g.add("grad.lora_A_qkv0", lora_params[a0].grad, "f32")
    g.add("grad.lora_B_qkv0", lora_params[b0].grad, "f32")
    grad_norms = {n: float(p.grad.norm()) for n, p in lora_params.items()}
    # export every LoRA A init so the JS trainer can reproduce the run exactly
    for n, p in lora_params.items():
        if "lora_A" in n:
            g.add(f"init.{n}", p.detach(), "f32")

    # ab2 sampler golden: 2 steps, cfg 2.6, cond = goldens above, uncond =
    # null embeddings + null font slot
    torch.manual_seed(3)
    z0 = torch.randn(1, 3, 256, 256)
    g.add("in.sampler_z0", z0, "f32")
    with torch.no_grad():
        style_null = net.y_embedder.style_encoder(net.y_embedder.white_style_image).half().float()
        content_null = net.y_embedder.content_encoder(net.y_embedder.white_content_image).half().float()
        font_null = net.y_embedder.font_embedding.weight[NUM_FONTS : NUM_FONTS + 1]
        uncond_y = font_null + style_null + content_null
        cond1 = tuple(v[:1] for v in conditioning)
        uncond1 = (uncond_y, font_null, content_null, style_null)

        steps, cfg = 2, 2.6
        ts = torch.linspace(0.0, 1.0, steps + 1)

        def v_at(z, tv):
            tb = torch.full((1,), tv)
            xc = net.forward_with_conditioning(z, tb, cond1)
            vc = (xc - z) / max(1 - tv, T_EPS)
            xu = net.forward_with_conditioning(z, tb, uncond1)
            vu = (xu - z) / max(1 - tv, T_EPS)
            scale = cfg if (tv < 1.0) else 1.0
            return vu + scale * (vc - vu)

        v_prev = v_at(z0, float(ts[0]))
        z = z0 + (ts[1] - ts[0]) * v_prev
        v_curr = v_at(z, float(ts[1]))
        z = z + (ts[2] - ts[1]) * (1.5 * v_curr - 0.5 * v_prev)
        g.add("out.sampler", z, "f32")

    (GOLD / "goldens.bin").write_bytes(g.blob())
    (GOLD / "goldens.json").write_text(json.dumps({
        "tensors": g.manifest,
        "gradNorms": grad_norms,
    }))
    print(f"goldens: {g.offset / 1e6:.1f} MB, loss={float(loss):.6f}")


if __name__ == "__main__":
    net = build_net()
    export_weights(net)
    export_encoders(net)
    export_goldens(net)
    print("done")

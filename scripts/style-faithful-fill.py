"""Style-faithful missing-half fill for Chinese fonts (offline pipeline).

For novel/decorative fonts where MX-Font's in-browser few-shot transfer cannot
capture the style, this pipeline fine-tunes zi2zi-JiT (a diffusion transformer
purpose-built for simplified<->traditional fill) ON the font itself, generates
the missing-half characters, vectorizes them with the same marching-squares +
Bezier-fit algorithm the app uses, and patches them into the font. The output
TTF can be uploaded straight into the PWA.

Stages (resumable; each stage is skipped when its output already exists,
pass --force to redo):
  1. plan      — OpenCC variant tables x font cmap -> missing chars + anchors
  2. dataset   — paired training images from the font's own glyphs
  3. finetune  — LoRA fine-tune of zi2zi-JiT-B/16 (the style-faithful step)
  4. generate  — diffusion-sample the missing characters
  5. vectorize+patch — contours -> TrueType glyphs -> filled font

Prereqs (see PROJECT.md):
  - vendor/zi2zi-jit checkout (committed) + vendor/weights/zi2zi-JiT-B-16.pth
    (gdown 1chRW0YpKJ5Kh_5PFv1FMGehIpVixWO78)
  - Source Han Serif CN Light as the content font (auto-downloaded)
  - .venv-mxfont python env

Usage:
  .venv-mxfont/bin/python scripts/style-faithful-fill.py \
      --font path/to/Font.ttf [--out path/to/Font-filled.ttf] \
      [--epochs 200] [--device auto] [--direction auto] [--limit N] \
      [--workdir scratch/style-fill/Font]

Typical wall-clock on an M4 Mac (MPS): dataset ~1 min, fine-tune ~2-6 h for
200 epochs (use --epochs 60 for a quick draft), generation ~2-4 s/char.
"""

import argparse
import json
import os
import random
import re
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
JIT = ROOT / "vendor" / "zi2zi-jit"
VARIANTS_JSON = ROOT / "frontend" / "public" / "data" / "variants.json"
PATCHER = ROOT / "frontend" / "py" / "patch_chinese_font.py"
DEFAULT_CHECKPOINT = ROOT / "vendor" / "weights" / "zi2zi-JiT-B-16.pth"
SOURCE_FONT = ROOT / "vendor" / "weights" / "SourceHanSerifCN-Light.otf"
SOURCE_FONT_URL = (
    "https://github.com/adobe-fonts/source-han-serif/raw/release/"
    "SubsetOTF/CN/SourceHanSerifCN-Light.otf"
)

sys.path.insert(0, str(JIT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from glyph_vectorize import image_to_contours, shoelace  # noqa: E402


# ----------------------------------------------------------------- stage 1

def plan_fill(font_path: Path, direction: str):
    """Mirrors src/variants.ts planVariantFill: for each missing-half char,
    the first covered candidate becomes the metrics anchor (targetCp)."""
    from fontTools.ttLib import TTFont

    data = json.loads(VARIANTS_JSON.read_text())
    font = TTFont(str(font_path))
    covered = set(font.getBestCmap().keys())

    def plan_direction(table):
        items, missing_no_anchor = [], []
        for key, candidates in table.items():
            key_cp = next(ord(c) for c in key)  # single char, possibly astral
            if key_cp in covered:
                continue
            anchor = None
            for cand in candidates:
                if cand == key:
                    continue
                cand_cp = next(ord(c) for c in cand)
                if cand_cp in covered:
                    anchor = cand_cp
                    break
            if anchor is not None:
                items.append({"cp": key_cp, "char": key, "targetCp": anchor})
            else:
                missing_no_anchor.append(key)
        return items, missing_no_anchor

    s2t_items, s2t_missing = plan_direction(data["s2t"])
    t2s_items, t2s_missing = plan_direction(data["t2s"])

    if direction == "s2t" or (direction == "auto" and len(s2t_items) >= len(t2s_items)):
        chosen, items, skipped = "s2t", s2t_items, s2t_missing
    else:
        chosen, items, skipped = "t2s", t2s_items, t2s_missing
    return chosen, items, skipped


# ----------------------------------------------------------------- helpers

def run(cmd, cwd=None, env_extra=None, log=None):
    import os

    env = dict(os.environ)
    env["PYTHONPATH"] = str(JIT)
    env["TORCHDYNAMO_DISABLE"] = "1"
    if env_extra:
        env.update(env_extra)
    print("+", " ".join(str(c) for c in cmd))
    if log:
        with open(log, "ab") as fh:
            subprocess.run([str(c) for c in cmd], cwd=cwd or str(JIT), env=env, check=True, stdout=fh, stderr=fh)
    else:
        subprocess.run([str(c) for c in cmd], cwd=cwd or str(JIT), env=env, check=True)


def ensure_source_font():
    if SOURCE_FONT.exists():
        return
    print(f"Downloading content font (Source Han Serif CN Light) -> {SOURCE_FONT}")
    import urllib.request

    SOURCE_FONT.parent.mkdir(parents=True, exist_ok=True)
    urllib.request.urlretrieve(SOURCE_FONT_URL, SOURCE_FONT)


# ----------------------------------------------------------------- stage 4

def build_gen_npz(font_path: Path, items, train_meta_path: Path, out_npz: Path, seed=42):
    """test.npz-shaped input for the MISSING characters: content from the
    source font, style references from the font's own glyphs, white targets.
    Mirrors data_processing.pipeline.create_test_npz conventions (font label =
    fine-tuned slot 1, sequential char labels, style = first ref glyph)."""
    from data_processing.pipeline import create_reference_grid
    from data_processing.font_utils import GlyphRenderer

    train_meta = json.loads(train_meta_path.read_text())
    train_cps = [int(c["codepoint"].replace("U+", ""), 16) for c in train_meta["characters"]]

    src_renderer = GlyphRenderer(str(SOURCE_FONT), 256)
    tgt_renderer = GlyphRenderer(str(font_path), 256)

    kept, contents, styles, unicodes = [], [], [], []
    for item in items:
        cp = item["cp"]
        content = src_renderer.render(cp)
        if content is None or np.asarray(content.convert("L")).min() > 250:
            continue  # source font cannot render this char (e.g. ext-B)
        rng = random.Random(seed + cp)
        refs = rng.sample(train_cps, 8)
        grid1 = create_reference_grid(tgt_renderer, refs[:4])
        if grid1 is None:
            continue
        style = grid1.crop((0, 0, 128, 128))
        contents.append(np.array(content.convert("RGB")).transpose(2, 0, 1))
        styles.append(np.array(style.convert("RGB")).transpose(2, 0, 1))
        unicodes.append(cp)
        kept.append(item)

    n = len(kept)
    white = np.full((n, 3, 256, 256), 255, dtype=np.uint8)
    np.savez_compressed(
        out_npz,
        font_labels=np.full(n, 1, dtype=np.int64),
        char_labels=np.arange(n, dtype=np.int64),
        unicode_labels=np.array(unicodes, dtype=np.int64),
        content_images=np.stack(contents).astype(np.uint8) if n else np.empty((0, 3, 256, 256), np.uint8),
        target_images=white,
        style_images=np.stack(styles).astype(np.uint8) if n else np.empty((0, 3, 128, 128), np.uint8),
        num_original_samples=np.int64(n),
    )
    return kept


# ----------------------------------------------------------------- stage 5

def pngs_by_codepoint(gen_dir: Path) -> dict:
    out = {}
    for png in sorted(gen_dir.glob("*.png")):
        m = re.search(r"U\+([0-9A-Fa-f]+)", png.name)
        if m:
            out[int(m.group(1), 16)] = png
    return out


def vectorize_and_patch(font_path: Path, png_by_cp: dict, kept_items, aliases, out_font: Path, workdir: Path, iso=0.5):
    glyphs = []
    empty = 0
    for item in kept_items:
        png = png_by_cp.get(item["cp"])
        if png is None:
            continue
        arr = np.asarray(Image.open(png).convert("L"), dtype=np.float64)
        field = 1.0 - arr / 255.0  # ink-high
        contours = image_to_contours(field, iso=iso, fit=True, error=0.8, min_area=8.0)
        if not contours:
            empty += 1
            continue
        glyphs.append({
            "cp": item["cp"],
            "contours": [[[float(x), float(y)] for x, y in c] for c in contours],
            "targetCp": item["targetCp"],
        })

    spec = {"aliases": aliases, "glyphs": glyphs}
    spec_path = workdir / "patch-spec.json"
    spec_path.write_text(json.dumps(spec))
    subprocess.run(
        [sys.executable, str(PATCHER), str(font_path), str(spec_path), str(out_font)],
        check=True,
    )
    return len(glyphs), empty


def quality_grid(gen_dir: Path, out_png: Path, max_rows=16):
    tiles = []
    for png in sorted(gen_dir.glob("*.png"))[:max_rows]:
        tiles.append(np.asarray(Image.open(png).convert("L").resize((128, 128))))
    if tiles:
        cols = 8
        rows = [np.concatenate(tiles[i : i + cols] + [np.full((128, 128), 255, np.uint8)] * (cols - len(tiles[i : i + cols])), axis=1) for i in range(0, len(tiles), cols)]
        Image.fromarray(np.concatenate(rows, axis=0)).save(out_png)


# ------------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--font", required=True, type=Path)
    ap.add_argument("--out", type=Path, default=None)
    ap.add_argument("--workdir", type=Path, default=None)
    ap.add_argument("--checkpoint", type=Path, default=DEFAULT_CHECKPOINT)
    ap.add_argument("--direction", choices=["auto", "s2t", "t2s"], default="auto")
    ap.add_argument("--charset", choices=["gb2312", "gbk", "big5", "jisx0208"], default=None,
                    help="training charset; default: gb2312 when filling traditional, big5 when filling simplified")
    ap.add_argument("--epochs", type=int, default=200)
    ap.add_argument("--train-chars", type=int, default=500)
    ap.add_argument("--device", default="mps")
    ap.add_argument("--limit", type=int, default=None, help="cap generated chars (for trials)")
    ap.add_argument("--batch-size", type=int, default=16)
    ap.add_argument("--gen-batch-size", type=int, default=8)
    ap.add_argument("--cfg", type=float, default=2.6)
    ap.add_argument("--iso", type=float, default=0.5)
    ap.add_argument("--force", action="store_true", help="redo stages even if outputs exist")
    ap.add_argument("--textpecker-url", default=os.environ.get("TEXTPECKER_BASE_URL"),
                    help="OpenAI-compatible endpoint serving TextPecker-8B; enables the "
                         "hallucination gate (zi2zi-JiT issue #19). Unset = no gating.")
    ap.add_argument("--textpecker-model", default="TextPecker")
    ap.add_argument("--max-regen", type=int, default=2,
                    help="regeneration rounds for glyphs failing the TextPecker gate")
    args = ap.parse_args()

    font_path = args.font.resolve()
    name = font_path.stem
    workdir = (args.workdir or ROOT / "scratch" / "style-fill" / name).resolve()
    workdir.mkdir(parents=True, exist_ok=True)
    out_font = (args.out or font_path.with_name(f"{name}-filled.ttf")).resolve()

    ensure_source_font()
    if not args.checkpoint.exists():
        sys.exit(f"missing base checkpoint {args.checkpoint} — download with:\n"
                 f"  .venv-mxfont/bin/python -m gdown 1chRW0YpKJ5Kh_5PFv1FMGehIpVixWO78 -O {args.checkpoint}")

    # 1. plan
    direction, items, skipped = plan_fill(font_path, args.direction)
    if args.limit:
        items = items[: args.limit]
    print(f"plan: direction={direction}, {len(items)} chars to generate, {len(skipped)} without anchors (skipped)")
    if not items:
        sys.exit("nothing to fill")

    # s2t = filling simplified = the font's own glyphs are traditional -> big5
    charset = args.charset or ("big5" if direction == "s2t" else "gb2312")

    # 2. dataset
    dataset_dir = workdir / "dataset"
    fonts_dir = workdir / "font-input"
    if args.force and dataset_dir.exists():
        shutil.rmtree(dataset_dir)
    if not (dataset_dir / "test.npz").exists():
        fonts_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy(font_path, fonts_dir / font_path.name)
        run([
            sys.executable, "scripts/generate_font_dataset.py",
            "--source-font", SOURCE_FONT,
            "--font-dir", fonts_dir,
            "--output-dir", dataset_dir,
            "--charset", charset,
            "--train-chars-per-font", args.train_chars,
            "--test-chars-per-font", 8,
        ])

    train_font_dir = next((dataset_dir / "train").glob("001_*"))

    # 3. finetune
    lora_dir = workdir / "lora"
    last_ckpt = lora_dir / "checkpoint-last.pth"
    if args.force and lora_dir.exists():
        shutil.rmtree(lora_dir)
    if not last_ckpt.exists():
        run([
            sys.executable, "lora_single_gpu_finetune_jit.py",
            "--device", args.device, "--num_workers", 0,
            "--data_path", dataset_dir / "train",
            "--test_npz_path", dataset_dir / "test.npz",
            "--output_dir", lora_dir,
            "--base_checkpoint", args.checkpoint,
            "--model", "JiT-B/16", "--num_fonts", 1000, "--num_chars", 20000,
            "--max_chars_per_font", min(args.train_chars, 500),
            "--img_size", 256, "--lora_r", 32, "--lora_alpha", 32,
            "--lora_targets", "qkv,proj,w12,w3",
            "--epochs", args.epochs, "--batch_size", args.batch_size,
            "--blr", "8e-4", "--warmup_epochs", 1, "--save_last_freq", 10,
            "--proj_dropout", 0.1, "--P_mean", -0.8, "--P_std", 0.8,
            "--noise_scale", 1.0, "--cfg", args.cfg, "--seed", 42,
        ], log=workdir / "finetune.log")

    # 4. generate missing chars
    gen_npz = workdir / "gen.npz"
    kept = build_gen_npz(font_path, items, train_font_dir / "metadata.json", gen_npz)
    print(f"generation input: {len(kept)} of {len(items)} chars renderable from the source font")

    gen_root = workdir / "generated"
    if args.force and gen_root.exists():
        shutil.rmtree(gen_root)
    gen_pngs = list(gen_root.rglob("*.png")) if gen_root.exists() else []
    if len(gen_pngs) < len(kept):
        run([
            sys.executable, "generate_chars.py",
            "--device", args.device,
            "--checkpoint", last_ckpt,
            "--test_npz", gen_npz,
            "--output_dir", gen_root,
            "--sampling_method", "ab2", "--cfg", args.cfg,
            "--batch_size", args.gen_batch_size,
        ], log=workdir / "generate.log")

    gen_dir = next(gen_root.rglob("generated"))
    png_by_cp = pngs_by_codepoint(gen_dir)
    aliases = []

    # 4.5 hallucination gate (zi2zi-JiT issue #19): score every generated
    # glyph with TextPecker, regenerate failures with fresh seeds, and fall
    # back to variant-mapping (cmap alias) for persistent failures.
    if args.textpecker_url:
        from textpecker_gate import calibrate, passes, score_glyphs

        calib_path = workdir / "calibration.json"
        if calib_path.exists() and not args.force:
            calib = json.loads(calib_path.read_text())
        else:
            print("textpecker: calibrating on the font's own glyphs…")
            calib = calibrate(args.textpecker_url, args.textpecker_model, font_path)
            calib_path.write_text(json.dumps(calib, indent=2))
        print(f"textpecker: calibration {calib} -> gating on "
              f"{'sem+qua' if calib['use_qua'] else 'sem only'}")

        def gate(items_to_score, pngs):
            scores = score_glyphs(
                args.textpecker_url, args.textpecker_model,
                [(pngs[i["cp"]], i["char"]) for i in items_to_score],
            )
            ok, bad = [], []
            for item, score in zip(items_to_score, scores):
                (ok if passes(score, calib["use_qua"]) else bad).append((item, score))
            return ok, bad

        passed, failed = gate(kept, png_by_cp)
        all_scores = {chr(i["cp"]): s for i, s in passed + failed}
        for round_no in range(1, args.max_regen + 1):
            if not failed:
                break
            retry_items = [i for i, _ in failed]
            print(f"textpecker: {len(retry_items)} glyphs failed, regeneration round {round_no}…")
            retry_npz = workdir / f"gen-retry{round_no}.npz"
            retry_kept = build_gen_npz(font_path, retry_items, train_font_dir / "metadata.json",
                                       retry_npz, seed=1000 * round_no)
            retry_root = workdir / f"generated-retry{round_no}"
            if not retry_root.exists():
                run([
                    sys.executable, "generate_chars.py",
                    "--device", args.device,
                    "--checkpoint", last_ckpt,
                    "--test_npz", retry_npz,
                    "--output_dir", retry_root,
                    "--sampling_method", "ab2", "--cfg", args.cfg,
                    "--batch_size", args.gen_batch_size,
                    "--seed", 1000 * round_no,
                ], log=workdir / "generate.log")
            retry_pngs = pngs_by_codepoint(next(retry_root.rglob("generated")))
            ok, failed = gate(retry_kept, retry_pngs)
            for item, score in ok:
                png_by_cp[item["cp"]] = retry_pngs[item["cp"]]
                all_scores[item["char"]] = score
            passed += ok
            for item, score in failed:
                all_scores[item["char"]] = score

        (workdir / "scores.json").write_text(json.dumps(all_scores, ensure_ascii=False, indent=1))
        if failed:
            print(f"textpecker: {len(failed)} glyphs still failing -> variant-mapped instead")
            failed_cps = {i["cp"] for i, _ in failed}
            aliases = [{"cp": i["cp"], "toCp": i["targetCp"]} for i, _ in failed]
            kept = [i for i in kept if i["cp"] not in failed_cps]

    # 5. vectorize + patch
    patched, empty = vectorize_and_patch(
        font_path, png_by_cp, kept, aliases, out_font, workdir, iso=args.iso)
    quality_grid(gen_dir, workdir / "preview-grid.png")
    print(f"\nDone: {patched} glyphs patched into {out_font}")
    if aliases:
        print(f"  {len(aliases)} gate-failed chars variant-mapped to their counterparts")
    if empty:
        print(f"  {empty} generated images produced no usable outline (inspect {gen_dir})")
    print(f"  preview grid: {workdir / 'preview-grid.png'}")
    print("  upload the filled font in the app's Font Manager to use it")


if __name__ == "__main__":
    main()

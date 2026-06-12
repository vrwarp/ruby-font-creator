"""TextPecker quality gate for generated glyphs.

Implements the glyph-hallucination mitigation recommended by the zi2zi-JiT
maintainer in issue #19 ("generate multiple times and judge with a vision
model"): each generated glyph image is scored by the TextPecker-8B evaluator
(CVPR 2026, github.com/CIawevy/TextPecker, Apache-2.0), a VLM fine-tuned to
detect character-level STRUCTURAL anomalies (extra/missing/distorted strokes)
that ordinary OCR and general VLMs miss.

Score semantics for a single glyph with a known target character:
  sem == 1.0  -> recognized as exactly the target character
  qua == 1.0  -> no structural anomaly detected
TextPecker is trained on rendered text scenes, not isolated decorative
glyphs, so a calibration pass over glyphs the font ALREADY has decides
whether `qua` is trustworthy for this style (median qua < 0.9 on genuine
glyphs -> gate on `sem` only).

The evaluator is served separately via any OpenAI-compatible endpoint, e.g.:
  swift deploy --model CIawevy/TextPecker-8B-Qwen3VL \
      --infer_backend vllm --served_model_name TextPecker --port 8848
(or an mlx-vlm 4-bit conversion on Apple silicon). Point the pipeline at it
with --textpecker-url / TEXTPECKER_BASE_URL; when unset, gating is skipped.
"""

import base64
import io
import json
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "vendor" / "textpecker"))

from parse_utils_pecker import get_score_v2, get_template  # noqa: E402


def _encode_image(path: Path, upscale: int = 512) -> str:
    from PIL import Image

    img = Image.open(path).convert("RGB")
    if max(img.size) < upscale:
        img = img.resize((upscale, upscale), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=92)
    return base64.b64encode(buf.getvalue()).decode()


def _chat(base_url: str, model: str, image_b64: str, timeout: float = 120.0) -> str:
    payload = {
        "model": model,
        "temperature": 0.0,
        "max_tokens": 2048,
        "repetition_penalty": 1.2,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"},
                    },
                    {"type": "text", "text": get_template()},
                ],
            }
        ],
    }
    req = urllib.request.Request(
        base_url.rstrip("/") + "/chat/completions",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "Authorization": "Bearer EMPTY"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as res:
        body = json.loads(res.read())
    return body["choices"][0]["message"]["content"]


def score_glyph(base_url: str, model: str, png: Path, target_char: str) -> dict:
    """Returns {'char', 'qua', 'sem', 'recognized', 'error'?}."""
    try:
        raw = _chat(base_url, model, _encode_image(png))
        qua, sem, info = get_score_v2(raw, ref_target=target_char, qua_amplify_factor=1.0)
        return {
            "char": target_char,
            "qua": float(qua),
            "sem": float(sem) if sem != "None" else None,
            "recognized": info.get("recognized_text", ""),
        }
    except Exception as err:  # noqa: BLE001 — a scoring failure must not kill the fill
        return {"char": target_char, "qua": None, "sem": None, "recognized": "", "error": str(err)}


def score_glyphs(base_url: str, model: str, items, concurrency: int = 8):
    """items: iterable of (png_path, target_char). Returns list of score dicts
    in input order."""
    with ThreadPoolExecutor(max_workers=concurrency) as pool:
        return list(pool.map(lambda it: score_glyph(base_url, model, it[0], it[1]), items))


def calibrate(base_url: str, model: str, font_path: Path, sample: int = 40, concurrency: int = 8) -> dict:
    """Scores glyphs the font ALREADY contains to decide whether the
    structural-anomaly score (qua) is reliable for this style."""
    import tempfile

    sys.path.insert(0, str(ROOT / "vendor" / "zi2zi-jit"))
    from data_processing.font_utils import GlyphRenderer, get_cjk_codepoints, load_font

    font, validated = load_font(str(font_path))
    cps = sorted(get_cjk_codepoints(font))
    step = max(1, len(cps) // sample)
    chosen = cps[::step][:sample]
    renderer = GlyphRenderer(str(validated), 256)

    with tempfile.TemporaryDirectory() as td:
        items = []
        for cp in chosen:
            img = renderer.render(cp)
            if img is None:
                continue
            p = Path(td) / f"calib-{cp:05X}.png"
            img.save(p)
            items.append((p, chr(cp)))
        scores = score_glyphs(base_url, model, items, concurrency)

    quas = [s["qua"] for s in scores if s["qua"] is not None]
    sems = [s["sem"] for s in scores if s["sem"] is not None]
    quas.sort()
    median_qua = quas[len(quas) // 2] if quas else 0.0
    sem_pass = sum(1 for s in sems if s >= 1.0) / len(sems) if sems else 0.0
    return {
        "samples": len(scores),
        "median_qua": median_qua,
        "sem_pass_rate": sem_pass,
        # genuine glyphs tripping the anomaly detector means the style itself
        # reads as "anomalous" — fall back to recognition-only gating
        "use_qua": median_qua >= 0.9,
    }


def passes(score: dict, use_qua: bool) -> bool:
    if score.get("error"):
        return True  # do not block the fill on scorer outages
    if score["sem"] is None or score["sem"] < 1.0:
        return False
    return (not use_qua) or score["qua"] >= 1.0

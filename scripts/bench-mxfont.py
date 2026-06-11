"""Benchmark MX-Font ONNX variants with onnxruntime CPUExecutionProvider.

Per-glyph latency = 1 encoder run + 1 decoder run. Reports the median of
--runs timed iterations after --warmup warmups. Decoder inputs are real
encoder outputs (matters for QDQ models whose ranges are baked in).

NOTE: native ARM64 numbers do NOT transfer 1:1 to browser WASM; compare
relative ratios between variants, not absolute ms.

Usage:
  .venv-mxfont/bin/python scripts/bench-mxfont.py \
      --models-dir frontend/public/models --threads 1,4 --batch 1 \
      [--variants ,int8] [--runs 20] [--warmup 3]

--variants is a comma list of file suffixes: "" -> mxfont_encoder.onnx,
"int8" -> mxfont_encoder.int8.onnx, "int8s" -> mxfont_encoder.int8s.onnx.
Batch sizes > 1 require dynamic-batch models.
"""

import argparse
import statistics
import time
from pathlib import Path

import numpy as np
import onnxruntime as ort

ROOT = Path(__file__).resolve().parent.parent


OPT_LEVELS = {
    "disable": ort.GraphOptimizationLevel.ORT_DISABLE_ALL,
    "basic": ort.GraphOptimizationLevel.ORT_ENABLE_BASIC,
    "extended": ort.GraphOptimizationLevel.ORT_ENABLE_EXTENDED,
    "all": ort.GraphOptimizationLevel.ORT_ENABLE_ALL,
}


def make_session(path: Path, threads: int, opt: str = "all"):
    so = ort.SessionOptions()
    so.intra_op_num_threads = threads
    so.inter_op_num_threads = 1
    so.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
    so.graph_optimization_level = OPT_LEVELS[opt]
    return ort.InferenceSession(str(path), sess_options=so, providers=["CPUExecutionProvider"])


def bench_once(sess, feed, runs, warmup):
    for _ in range(warmup):
        sess.run(None, feed)
    times = []
    for _ in range(runs):
        t0 = time.perf_counter()
        out = sess.run(None, feed)
        times.append((time.perf_counter() - t0) * 1000.0)
    return statistics.median(times), out


def bench_variant(models_dir: Path, suffix: str, threads: int, batch: int, runs: int, warmup: int, opt: str = "all"):
    sfx = f".{suffix}" if suffix else ""
    enc_path = models_dir / f"mxfont_encoder{sfx}.onnx"
    dec_path = models_dir / f"mxfont_decoder{sfx}.onnx"
    if not enc_path.exists() or not dec_path.exists():
        return None

    enc = make_session(enc_path, threads, opt)
    dec = make_session(dec_path, threads, opt)

    rng = np.random.default_rng(0)
    img = (rng.random((batch, 1, 128, 128), dtype=np.float32) * 2 - 1).astype(np.float32)

    enc_ms, enc_out = bench_once(enc, {"image": img}, runs, warmup)
    dec_feed = {
        "style_last": enc_out[0],
        "style_skip": enc_out[1],
        "char_last": enc_out[2],
        "char_skip": enc_out[3],
    }
    dec_ms, _ = bench_once(dec, dec_feed, runs, warmup)
    return enc_ms, dec_ms


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--models-dir", default=str(ROOT / "frontend" / "public" / "models"))
    ap.add_argument("--threads", default="1,4", help="comma list of intra_op_num_threads")
    ap.add_argument("--batch", default="1", help="comma list of batch sizes (needs dynamic models for >1)")
    ap.add_argument("--variants", default=",int8", help='comma list of suffixes ("" = fp32)')
    ap.add_argument("--runs", type=int, default=20)
    ap.add_argument("--warmup", type=int, default=3)
    ap.add_argument("--opt", default="all", choices=sorted(OPT_LEVELS),
                    help="graph optimization level (NOTE: 'all' is 2x slower than "
                         "'extended' for the fp32 encoder on macOS ARM64)")
    args = ap.parse_args()

    models_dir = Path(args.models_dir)
    threads_list = [int(t) for t in args.threads.split(",") if t != ""]
    batch_list = [int(b) for b in args.batch.split(",") if b != ""]
    variants = args.variants.split(",")

    print(f"models-dir={models_dir} runs={args.runs} warmup={args.warmup} "
          f"opt={args.opt} ort={ort.__version__}")
    print("| variant | threads | batch | encoder ms | decoder ms | total ms/glyph |")
    print("|---|---|---|---|---|---|")
    for suffix in variants:
        name = suffix or "fp32"
        for threads in threads_list:
            for batch in batch_list:
                try:
                    res = bench_variant(models_dir, suffix, threads, batch, args.runs, args.warmup, args.opt)
                except Exception as e:  # noqa: BLE001
                    print(f"| {name} | {threads} | {batch} | ERROR: {type(e).__name__}: {str(e)[:80]} | | |")
                    continue
                if res is None:
                    print(f"| {name} | {threads} | {batch} | (missing) | | |")
                    continue
                enc_ms, dec_ms = res
                total = (enc_ms + dec_ms) / batch
                print(
                    f"| {name} | {threads} | {batch} | {enc_ms / batch:.1f} | "
                    f"{dec_ms / batch:.1f} | {total:.1f} |"
                )


if __name__ == "__main__":
    main()

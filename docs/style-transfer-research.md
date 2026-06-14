# Style-Faithful Glyph Generation: Why Structure Breaks, and the Roadmap to Fix It

_Research findings, June 2026. Status: diagnosis verified, roadmap not yet implemented._

A full Thorough browser run (192 chars × 12 epochs) on ZCOOL KuaiLe produced glyphs
that clearly capture the **style** — bold, rounded marker strokes — but break
**structure** on held-out characters: wrong or missing radicals, fragmented
components. This document distills a four-stream research effort into a prioritized
roadmap: a code-parity audit of `vendor/zi2zi-jit` vs the browser port, a survey of
how SOTA few-shot font generation preserves structure, the small-batch LoRA
stability literature, and an **empirically measured** structure-gate study run
against this repo's real artifacts (ZCOOL KuaiLe, Droid Sans Fallback, and 40
known-good offline generations).

---

## 1. Diagnosis (verified, in causal order)

### 1.1 The architectural ceiling — root cause

zi2zi-JiT's only structure signal is **one pooled 768-d content-encoder vector**,
repeated 15× as in-context tokens
(`vendor/zi2zi-jit/model_jit.py:398-410`: `content_emb.unsqueeze(1).repeat(1,
n_content, 1)`; the embedder pools spatially, `LabelEmbedder.encode` at
`model_jit.py:105-126`). Every structure-strong SOTA system gives the denoiser a
_spatial or symbolic_ structure channel instead:

| System                      | Structure channel                                                               |
| --------------------------- | ------------------------------------------------------------------------------- |
| FontDiffuser (AAAI 2024)    | multi-scale spatial content feature maps via MCA blocks                         |
| SLD-Font (arXiv:2602.18874) | content **image** channel-concatenated with the noisy latent                    |
| Diff-Font (IJCV 2024)       | stroke/component **count vectors** (char-ID embeddings alone were insufficient) |
| VQ-Font (AAAI 2024)         | VQ token prior + component recalibration                                        |
| IF-Font (NeurIPS 2024)      | Ideographic Description Sequences (IDS) replace the content image               |

A pooled vector cannot carry stroke-level layout. This is why **even the offline
full-recipe pipeline needs the TextPecker VLM gate** (hallucinations are upstream
issue zi2zi-JiT#19). Consequence: recipe tuning alone cannot fully fix held-out
structure — it must be **anchored at inference** and/or **gated**.

### 1.2 LoRA forgetting, amplified by the browser recipe

The base model renders held-out structure correctly (zero-shot evals during the
offline work), and breakage appears only _after_ LoRA fine-tuning — classic
few-shot personalization drift. Verified browser-vs-offline recipe gaps that
amplify it:

| Gap                        | Offline (validated)                                                                                                                 | Browser                                                                                                                                    | Evidence                                                                                |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Learning rate vs batch     | 8e-4 at **batch 16**                                                                                                                | 8e-4 at **batch 2** (3–8× hot per sqrt/linear scaling)                                                                                     | `lora_single_gpu_finetune_jit.py:197-198` applies blr verbatim; `frontend/main.ts:3223` |
| Font-slot embedding        | **trained** (`mark_only_lora_as_trainable(model, train_font_emb=True)`) — a dedicated "style register" absorbing global style shift | frozen — all style pressure flows through the same LoRA weights that implement content→structure                                           | `lora_single_gpu_finetune_jit.py:190`                                                   |
| Style reference per sample | random 1-of-8 per epoch (`ref_global_idx = random.randint(0, 7)`)                                                                   | one fixed ref per char, encoded once → memorization shortcut                                                                               | `main_jit.py:93`; `frontend/jit/raster.ts` renderStyleImage                             |
| Font-label-only dropout    | p=0.4 (`category_drop_prob`) **on top of** joint CFG drop p=0.1                                                                     | only the joint p=0.1 drop                                                                                                                  | `model_jit.py:105-110`; `frontend/jit/trainer.ts`                                       |
| Augmentation               | per-epoch resize(1.0–1.1×)+random-crop                                                                                              | none (samples pre-encoded once)                                                                                                            | `lora_single_gpu_finetune_jit.py:127-131`, `util/crop.py`                               |
| Sample exposure            | 500 chars × 200 epochs × b16 ≈ 100k visits                                                                                          | 192 × 12 × b2 ≈ 2.3k visits (~40× less)                                                                                                    | presets in `frontend/jit/recipe.ts:25-29`                                               |
| Content font               | Source Han Serif CN Light (what the frozen content encoder saw in pretraining)                                                      | Droid Sans Fallback — OOD on the _only_ structure pathway; CF-Font (CVPR 2023) shows content-font choice directly drives structural errors | `scripts/style-faithful-fill.py:52-56`; `frontend/main.ts:3129`                         |

### 1.3 Eliminated as causes (direct code verification)

- **char_label embeddings**: vestigial — `char_labels` ride the label tuple and the
  dropout path, but `LabelEmbedder` never embeds them; there is no char embedding
  table in the model. Browser parity is exact.
- **EMA**: the offline LoRA fine-tune disables it (`model.update_ema = lambda:
None`, `lora_single_gpu_finetune_jit.py:161`; `model_ema1` is only read for the
  base pretrained checkpoint in `generate_chars.py:197-199`).
- **Conditioning math / numerics**: browser conditioning (font + style + content,
  pooled, repeated in-context) matches the offline model op-for-op; gradient parity
  vs PyTorch goldens is errB 1.5e-5 (`test/jit-parity.test.ts`).

---

## 2. Roadmap

### Track A — Inference-time structure anchors (no retraining; work with already-saved adapters)

| #   | Technique                                                                                                                                                                                                                                                                                                                                                                | Change                                                                                 | Feasibility / impact   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | ---------------------- |
| A1  | **SDEdit-style init** (arXiv:2108.01073): start sampling from the noised content rendering, not pure noise. In this codebase's convention (z*t = t·x + (1−t)·e, t: 0=noise → 1=data): `z = tStart·content + (1−tStart)·noise·noiseScale`, integrate tStart→1. Anchors radical layout from step one; \_reduces* compute (fewer steps). Sweep tStart ∈ {0.15, 0.25, 0.35}. | ~10 lines in `frontend/jit/trainer.ts` sample() + optional plumb through worker/client | trivial / **high**     |
| A2  | **LoRA scale dial + early-step muting**: multiply the LoRA delta by α (post-hoc interpolation toward the intact prior — "LoRA Learns Less and Forgets Less", arXiv:2405.09673), plus the coarse-to-fine variant α(t)=0 for t<tSwitch so the _base model_ decides layout and the LoRA styles late. Sweep α ∈ {0.6, 0.8, 1.0} × tSwitch ∈ {0, 0.2, 0.3}.                   | pass `loraScale` through `model.ts` linear() as a jit argument                         | trivial / **high**     |
| A3  | **Decoupled two-condition CFG** (InstructPix2Pix, arXiv:2211.09800; HFH-Font TOG 2024 uses per-condition scales): `v = v_uncond + w_c(v_content − v_uncond) + w_s(v_full − v_content)` — strengthen content adherence independently of style. Sweep w_c ∈ [3, 8], w_s ∈ [1.5, 2.6] offline first.                                                                        | B=3 stacked forward in vAt() (one extra B=3 parity check)                              | moderate / high        |
| A4  | (stretch) **x0-space low-pass content injection** (FreeText-style, arXiv:2601.00535): `x̂' = x̂ + λ(t)·lowpass(content − x̂)` with λ→0 by mid-sampling. Pixel-space x-prediction makes this trivial — the sampler already has x̂ each step. Sweep λ₀ ∈ [0.3, 0.8], cutoff ∈ [0.4, 0.6], pool 8–16 px.                                                                        | small change in vAt()                                                                  | moderate / medium-high |
| A5  | (defer) Training-free attention/feature injection (Ctrl-X NeurIPS 2024, Stable Flow CVPR 2025): inject K/V from a content trajectory into early blocks. Strong literature, heavy surgery on `model.ts`.                                                                                                                                                                  | hard / medium                                                                          |
| A6  | (defer) Energy-gradient guidance (FreeDoM ICCV 2023, TFG NeurIPS 2024): steer with ∂E/∂z where E = 1 − softIoU(ink(x̂), dilated content skeleton). jax-js autodiff makes it possible (~2–3× cost on guided steps); literature says finicky to tune.                                                                                                                       | moderate / medium                                                                      |

### Track B — Training recipe fixes (validate offline first, then port)

1. **lr 2.5e-4** at batch 2 — or 4e-4 with **gradient accumulation 4** (effective
   batch 8; exact here: mean loss, no BatchNorm, so averaging 4 microbatch-2
   gradients reproduces the batch-8 gradient). AdamW **β2 0.975** (β2 horizon must
   shrink with batch; arXiv:2507.07101).
2. **Trainable font-slot embedding** in the LoRA tree (init from the ONNX slot-1
   vector; persist in the IndexedDB checkpoint) — restores offline parity and gives
   style a register outside the structure-carrying weights.
3. **Per-step random style reference**: encode every train char's 128px glyph once
   at prepare (≈192-entry style-embedding pool, no extra cost) and sample one per
   step — kills the memorization shortcut and mirrors offline 1-of-8.
4. **Font-label-only dropout p=0.4** in addition to the joint CFG drop p=0.1
   (parity with `category_drop_prob`).
5. **Prior preservation** (DreamBooth, arXiv:2208.12242): mix ~25% content-font
   targets with null style/font into training — directly defends the structural
   prior against forgetting.
6. **Augmentation at prepare**: 3–4 resize(0.85–1.0)+crop variants per char
   (prepare cost ×3–4; conditioning re-encoded per variant).
7. **Character selection by IDS component coverage** (cjkvi-ids tables; build-time
   ranked list intersected with the font cmap) instead of uniform random — a
   64–192 random draw can miss frequent radicals entirely. Rebalance presets
   chars > epochs at constant budget (Thorough 192×12 → 256×9; original zi2zi
   practice used 1000–2000 chars).
8. **Content font A/B**: Source Han Serif subset vs Droid offline; ship the subset
   (~4–8 MB) if it wins. (Current code keeps Droid consistent across train+gen so
   the LoRA partially absorbs the shift, but the encoder remains OOD.)
9. **Tail-average the last 3 epoch checkpoints** (cheap EMA substitute at ~1k-step
   scale; vendor EMA decays 0.9999/0.9996 have horizons far beyond these runs).

### Track C — Structure gate + adapter health check (poor-man's TextPecker; **empirically validated already**)

The gate study _measured_ candidate metrics on ZCOOL KuaiLe vs Droid Sans Fallback
with 64-char calibration, 120-char eval, synthetic corruptions (45%-slab erasure =
missing component; wrong char; single-component swap), and the 40 known-good
offline diffusion outputs in `scratch/style-fill/`:

| Metric (on bbox-normalized 128px ink)      | wrong-char AUC | missing-comp AUC | franken AUC | verdict                                                                |
| ------------------------------------------ | -------------- | ---------------- | ----------- | ---------------------------------------------------------------------- |
| 16×16 ink-density cosine (`occ16`)         | 0.961          | 0.996            | 0.877       | **gate**                                                               |
| blurred density-normalized soft-IoU        | 0.943          | 1.000            | 0.851       | **gate**                                                               |
| skeleton **directed** chamfer P90, ref→gen | 0.944          | 1.000            | 0.856       | **gate** (missing structure)                                           |
| skeleton directed chamfer P90, gen→ref     | 0.958          | 0.903            | 0.869       | **gate** (hallucinated strokes)                                        |
| connected components / hole counts         | 0.82           | 0.70             | 0.76        | **rejected** — punishes legitimate style (18% of known-good gens fail) |
| stroke-orientation histograms              | 0.78           | 0.64             | 0.65        | **rejected** — stroke direction _is_ style                             |

Union gate (fail if ANY metric below its per-font threshold at the 2.5th
percentile of calibration): **95% genuine pass, 100% missing-component catch,
77.5% wrong-char catch, ~54% single-component-swap catch**, ≈4 ms/glyph in
numpy → comfortably <100 ms in plain JS typed arrays (Zhang-Suen thinning at
64px + ~90k-op brute chamfer; no canvas needed beyond `sampleToInk`).

Design, mirroring `scripts/textpecker_gate.py`:

1. **`src/structure-gate.ts`** (DOM-free, unit-testable like `recipe.ts`):
   `prepRef`, `scoreGlyph`, `calibrate`, `passes`.
2. **Variant-margin check** (AUC 0.977): the generated glyph must match the
   _target's_ content rendering better than its _counterpart variant's_
   (margin < −0.05 ⇒ fail; skip when the two content renderings are >0.85
   similar). Catches the likeliest systematic failure — regurgitating the trained
   script's structure for its variant counterpart. `counterpartCp` is already
   plumbed per fill item.
3. **Per-font calibration**: score ~64 of the adapter's own `trainCps` real glyphs
   vs the content font (auto-adapts thresholds to how wild the style legitimately
   is); persist thresholds in `JitLoraEntry`. Degenerate-style escape hatch: if
   calibration median occ16 < ~0.70, keep only missing-component-grade thresholds.
4. **Regen policy**: best-of-3 with fresh seeds (`seed + round·1000003`, matching
   offline `--max-regen 2`), keep the best candidate by calibration z-score, alias
   fallback **only** below a hard floor (confidently broken), global regen budget
   ~20% of plan size.
5. **Adapter-level holdout auto-score in the preview gate** (bump `HOLDOUT_COUNT`
   4→8, `frontend/jit/recipe.ts:12`): score generated-vs-REAL glyphs (style cancels
   entirely) plus a threshold-free identification test (gen(c) must be nearest to
   real(c) among ~12 candidates; occ16's 0.961 wrong-char AUC supports this).
   Badge cells, warn "Structure check 5/8 — retrain with more effort" **before**
   the user commits to a multi-hour fill. The ZCOOL failure was systemic — per-glyph
   regen cannot fix an undertrained adapter; this detects it up front.
6. **Escalation if gate escapes >20% on real failures**: a tiny CJK recognition
   ONNX model (PaddleOCR PP-OCRv4 rec, ~10 MB int8, runs in the already-shipped
   onnxruntime-web wasm, 20–50 ms/glyph) scored as P(target char) with the same
   calibration-trust pattern — not a VLM.

---

## 2b. Measured anchor sweep (June 2026, post-implementation)

In-browser A/B on a Quick-preset ZCOOL adapter (75 optimizer updates), scored
by the preview gate's structure identification (k/8) and style-encoder cosine
vs the real glyphs (content-font baseline 0.90 — the "no style transfer"
floor):

| Anchor config                     | Structure | Style match | Visual                                       |
| --------------------------------- | --------- | ----------- | -------------------------------------------- |
| off (pure model, 20 steps)        | 1/8       | —           | ZCOOL-like chunky strokes, broken components |
| raw SDEdit init tStart 0.2 (8 st) | 7/8       | —           | thin, content-font-styled                    |
| blurred init tStart 0.3 (20 st)   | 7/8       | 0.89        | correct layout, gray blur residue in strokes |
| content-CFG w_c=4 alone (20 st)   | 2/8       | 0.87        | washed style, structure not rescued          |

Conclusions that OVERTURN the original Track-A default recommendation:
**every whole-run anchor trades style for structure** (pixel inits inject the
content font's appearance at any frequency band; conditioning-only guidance is
too weak to fix structure — consistent with the pooled-content architectural
ceiling). The shipped policy is therefore **rescue-only**: attempt 0 runs the
pure model (maximum style), and anchors escalate only on glyphs the structure
gate rejects — blurred init at round 1, stronger init + content-CFG at round 2. Style fidelity itself must come from training scale (the Quick preset's 75
updates are far too few; Thorough = 720). The preview gate now reports BOTH
axes: structure k/8 and style cosine vs the content-font baseline.

## 2c. Measured training-scale result (Standard preset, ZCOOL)

Standard retrain under the rescue-only policy (176 chars × 7 epochs × 2 aug

- 25% priors, 385 optimizer updates, preview sampled pure-model at 20 steps;
  this run's content-font style baseline measured 0.92):

| Adapter                | Structure (pure) | Style match | Visual                                      |
| ---------------------- | ---------------- | ----------- | ------------------------------------------- |
| Quick (75 updates)     | 1/8              | ~0.89       | ZCOOL-ish strokes, broken components        |
| Standard (385 updates) | 2/8              | **0.95**    | convincing ZCOOL stroke style, still broken |

Training scale **fixes style** — 0.95 clears the content-font baseline, and
the holdout strokes are visually ZCOOL's bold rounded marker style — but
**barely moves pure-model structure** (1/8 → 2/8), confirming the pooled-
content-vector ceiling (§1). Consequences:

- The two axes decouple cleanly: style is a training problem (solved at
  Standard scale), structure is an inference/gating problem.
- With a ~2/8 pure pass rate, most bulk-fill glyphs will take the anchor
  rescue path and inherit its style penalty — so the gate+rescue pipeline is
  a floor on correctness, not a route to a fully style-faithful fill.
- Open question for Thorough (720 updates): how far structure climbs at
  ~2× scale. Style needs no further headroom.

## 3. Experiment harness & priority order

**Offline A/B on MPS replicating browser scale** (~10–15 min/arm at ~0.5 s/step):
parameterize `scripts/style-faithful-fill.py` (`--blr`, drop probabilities, aug
toggle, fixed-vs-random ref, and a holdout-eval stage that renders ground truth for
covered-but-untrained chars). Metrics per arm:

- structure: TextPecker sem pass-rate (`scripts/textpecker_gate.py` exists) +
  binarized IoU/L1 vs the real held-out glyphs + the Track-C gate scores
- style retention: style-encoder embedding cosine between generated and real glyphs

Priority by information-per-minute:

1. **Arm 0** — reproduce the failure offline at browser scale (validates harness)
2. **A1 + A2 sweeps** — zero retraining; testable against the already-saved
   Thorough ZCOOL adapter in the browser immediately
3. **B1 (lr)** and **B3 (ref randomization)** arms
4. **B5 (prior mix)**, **B2 (trainable font-emb)**; remaining arms overnight
5. **Track C gate** ships in parallel — it is independent of training quality

Acceptance: sem pass-rate up without a style-cosine drop; browser preview holdout
auto-score ≥ 7/8 on a ZCOOL Thorough re-run.

## 4. Implementation phases (when greenlit)

- **Phase 1 (days, no retraining)**: A1 + A2 sampler options (`trainer.ts`,
  `jit-worker.ts`, `jit-client.ts`, `model.ts` loraScale); Track C items 1–4
  (`src/structure-gate.ts`, `test/structure-gate.test.ts` — node rasterization via
  the existing `flattenSvgPath` + scanline fill); item 5 preview auto-score
  (`main.ts` jitPreviewGate); per-glyph score logging via the `__jit` harness.
  If A1/A2 alone make ZCOOL usable, ship.
- **Phase 2 (week)**: offline A/B harness + B1–B7 (`trainer.ts`, worker prepare,
  `recipe.ts` presets + IDS coverage list, `db.ts` checkpoint fields); retrain
  ZCOOL and re-judge through the upgraded preview gate.
- **Phase 3 (if needed)**: B8 Source Han subset asset; A3 decoupled CFG; A4 x0
  injection; OCR-rec second-stage gate.

## 5. References

SDEdit arXiv:2108.01073 · InstructPix2Pix arXiv:2211.09800 · FontDiffuser AAAI
2024 · CF-Font CVPR 2023 · Diff-Font IJCV 2024 · VQ-Font AAAI 2024 · IF-Font
NeurIPS 2024 · FsFont CVPR 2022 · SLD-Font arXiv:2602.18874 · HFH-Font
arXiv:2410.06488 · FreeText arXiv:2601.00535 · Ctrl-X arXiv:2406.07540 · Stable
Flow CVPR 2025 · StyleAligned arXiv:2312.02133 · FreeDoM arXiv:2303.09833 · TFG
arXiv:2409.15761 · "LoRA Learns Less and Forgets Less" arXiv:2405.09673 ·
DreamBooth arXiv:2208.12242 · small-batch Adam scaling arXiv:2507.07101 · EMA
dynamics arXiv:2411.18704 · cjkvi-ids (IDS decompositions) ·
kaonashi-tyc/zi2zi-JiT (upstream; hallucination gate motivation in issue #19)

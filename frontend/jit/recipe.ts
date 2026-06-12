// Character-selection and reference-sampling recipe for in-browser zi2zi-JiT
// LoRA fine-tuning. Mirrors the validated offline pipeline
// (scripts/style-faithful-fill.py + vendor/zi2zi-jit/data_processing):
// deterministic seeded sampling of training characters from the user font,
// a held-out set for the preview gate, and per-character 4-glyph reference
// picks (seed = base + codepoint) for the 2x2 style grids.
//
// DOM-free on purpose so the recipe is unit-testable in node.

export const TRAIN_SEED = 42
export const HOLDOUT_SEED = 99999
export const HOLDOUT_COUNT = 8
export const REFS_PER_CHAR = 4

// Browser-feasible scalings of the offline recipe (500 chars x 200 epochs at
// batch 16 is ~35 h at the in-browser 2.5 s/step, batch 2). Step counts are
// chars/2 * epochs; ETA assumes ~2.5 s/step plus ~1.5 s/sample encoding.
// Rebalanced toward chars > epochs at roughly constant step budget (research
// doc Track B item 7; original zi2zi practice used 1000-2000 chars).
// augVariants: resize+crop augmentation variants rendered per char at
// prepare time (Track B item 6).
export interface TrainPreset {
  key: string
  label: string
  chars: number
  epochs: number
  augVariants: number
}

export const TRAIN_PRESETS: TrainPreset[] = [
  {
    key: 'quick',
    label: 'Quick (~12 min)',
    chars: 96,
    epochs: 5,
    augVariants: 1,
  },
  {
    key: 'standard',
    label: 'Standard (~30 min)',
    chars: 176,
    epochs: 7,
    augVariants: 2,
  },
  {
    key: 'thorough',
    label: 'Thorough (~55 min)',
    chars: 256,
    epochs: 9,
    augVariants: 2,
  },
]

export function presetByKey(key: string): TrainPreset {
  return TRAIN_PRESETS.find((p) => p.key === key) ?? TRAIN_PRESETS[1]
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function seededSample<T>(pool: T[], count: number, seed: number): T[] {
  const idx = [...pool.keys()]
  const rng = mulberry32(seed)
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[idx[i], idx[j]] = [idx[j], idx[i]]
  }
  return idx.slice(0, Math.min(count, idx.length)).map((i) => pool[i])
}

const isCjk = (cp: number) =>
  (cp >= 0x3400 && cp <= 0x9fff) ||
  (cp >= 0xf900 && cp <= 0xfaff) ||
  (cp >= 0x20000 && cp <= 0x2ffff)

// Training + holdout codepoints from the glyphs the user font already has.
// Sorted before sampling so the choice is stable across cmap iteration order.
//
// When `ranked` is provided (the IDS-component-coverage list from
// frontend/public/data/char-coverage.json, see
// scripts/build-char-coverage.js), training characters are taken in rank
// order from the chars the font actually covers, so the most
// document-frequent components are represented even in a small draw. The
// holdout stays seeded-random from the full pool, and any shortfall after
// the ranked pass is topped up with the seeded-random selection. Without
// `ranked` the behavior is the original uniform seeded sampling.
export function selectTrainingSet(
  covered: Iterable<number>,
  trainCount: number,
  ranked?: number[],
): { train: number[]; holdout: number[] } {
  const pool = [...covered].filter(isCjk).sort((a, b) => a - b)
  const holdout = seededSample(pool, HOLDOUT_COUNT, HOLDOUT_SEED)
  const holdoutSet = new Set(holdout)
  const trainPool = pool.filter((cp) => !holdoutSet.has(cp))
  if (!ranked || ranked.length === 0) {
    const train = seededSample(trainPool, trainCount, TRAIN_SEED)
    return { train, holdout }
  }
  const trainPoolSet = new Set(trainPool)
  const taken = new Set<number>()
  const train: number[] = []
  for (const cp of ranked) {
    if (train.length >= trainCount) break
    if (trainPoolSet.has(cp) && !taken.has(cp)) {
      taken.add(cp)
      train.push(cp)
    }
  }
  if (train.length < trainCount) {
    const remaining = trainPool.filter((cp) => !taken.has(cp))
    const topUp = seededSample(remaining, trainCount - train.length, TRAIN_SEED)
    train.push(...topUp)
  }
  return { train, holdout }
}

// 4 style-reference codepoints for one character: seeded per codepoint like
// the offline pipeline (seed = charset_seed + codepoint), excluding the
// character itself so the style grid never leaks the answer.
export function pickRefsFor(
  cp: number,
  trainCps: number[],
  baseSeed: number = TRAIN_SEED,
): number[] {
  const pool = trainCps.filter((c) => c !== cp)
  if (pool.length === 0) return []
  const refs = seededSample(pool, REFS_PER_CHAR, baseSeed + cp)
  while (refs.length < REFS_PER_CHAR) refs.push(refs[refs.length % pool.length])
  return refs
}

import { describe, it, expect } from 'vitest'
import {
  selectTrainingSet,
  pickRefsFor,
  presetByKey,
  TRAIN_PRESETS,
  HOLDOUT_COUNT,
  REFS_PER_CHAR,
} from '../frontend/jit/recipe.js'

// Deterministic character selection for in-browser LoRA training — the
// browser counterpart of the offline pipeline's seeded sampling.

const cjkPool = (n: number, start = 0x4e00) =>
  Array.from({ length: n }, (_, i) => start + i)

describe('jit training recipe', () => {
  it('splits covered codepoints into disjoint train/holdout sets', () => {
    const covered = cjkPool(500)
    const { train, holdout } = selectTrainingSet(covered, 128)
    expect(train.length).toBe(128)
    expect(holdout.length).toBe(HOLDOUT_COUNT)
    const trainSet = new Set(train)
    for (const cp of holdout) expect(trainSet.has(cp)).toBe(false)
  })

  it('is deterministic regardless of input iteration order', () => {
    const covered = cjkPool(300)
    const shuffledInput = [...covered].reverse()
    const a = selectTrainingSet(covered, 64)
    const b = selectTrainingSet(shuffledInput, 64)
    expect(a.train).toEqual(b.train)
    expect(a.holdout).toEqual(b.holdout)
  })

  it('filters non-CJK codepoints out of the pool', () => {
    const covered = [...cjkPool(50), 0x41, 0x61, 0x30, 0x2026]
    const { train, holdout } = selectTrainingSet(covered, 100)
    for (const cp of [...train, ...holdout]) {
      expect(cp).toBeGreaterThanOrEqual(0x3400)
    }
    expect(train.length).toBe(50 - HOLDOUT_COUNT)
  })

  it('picks per-character reference sets that exclude the character', () => {
    const covered = cjkPool(200)
    const { train } = selectTrainingSet(covered, 100)
    for (const cp of train.slice(0, 10)) {
      const refs = pickRefsFor(cp, train)
      expect(refs.length).toBe(REFS_PER_CHAR)
      expect(refs).not.toContain(cp)
      // deterministic per codepoint
      expect(pickRefsFor(cp, train)).toEqual(refs)
    }
    // different characters draw different reference sets (seeded per cp)
    const r1 = pickRefsFor(train[0], train)
    const r2 = pickRefsFor(train[1], train)
    expect(r1).not.toEqual(r2)
  })

  it('handles small fonts without throwing', () => {
    const covered = cjkPool(6)
    const { train, holdout } = selectTrainingSet(covered, 128)
    expect(train.length + holdout.length).toBeLessThanOrEqual(6)
    const refs = pickRefsFor(train[0], train)
    expect(refs.length).toBeLessThanOrEqual(REFS_PER_CHAR)
  })

  it('exposes presets with sane fallbacks', () => {
    expect(TRAIN_PRESETS.length).toBeGreaterThanOrEqual(3)
    expect(presetByKey('quick').chars).toBeLessThan(
      presetByKey('thorough').chars,
    )
    expect(presetByKey('nonsense').key).toBe('standard')
    for (const preset of TRAIN_PRESETS) {
      expect(preset.augVariants).toBeGreaterThanOrEqual(1)
    }
  })
})

describe('ranked coverage selection', () => {
  it('puts ranked chars present in the pool first, in rank order', () => {
    const covered = cjkPool(500)
    const { holdout: plainHoldout } = selectTrainingSet(covered, 64)
    const holdoutSet = new Set(plainHoldout)
    // Mix of in-pool and out-of-pool ranked chars, deliberately not sorted.
    const ranked = [
      0x4e00 + 450,
      0x9f00, // CJK but absent from the pool
      0x4e00 + 3,
      0x4e00 + 200,
      0x4e00 + 7,
    ].filter((cp) => !holdoutSet.has(cp))
    const { train, holdout } = selectTrainingSet(covered, 64, ranked)
    expect(holdout).toEqual(plainHoldout)
    const inPool = ranked.filter((cp) => cp >= 0x4e00 && cp < 0x4e00 + 500)
    expect(train.slice(0, inPool.length)).toEqual(inPool)
    expect(train.length).toBe(64)
    expect(new Set(train).size).toBe(64)
  })

  it('never overlaps holdout even when ranked includes holdout chars', () => {
    const covered = cjkPool(400)
    const ranked = [...covered] // every pool char, holdout included
    const { train, holdout } = selectTrainingSet(covered, 128, ranked)
    expect(train.length).toBe(128)
    expect(holdout.length).toBe(HOLDOUT_COUNT)
    const trainSet = new Set(train)
    for (const cp of holdout) expect(trainSet.has(cp)).toBe(false)
  })

  it('is deterministic for the same inputs', () => {
    const covered = cjkPool(300)
    const ranked = [0x4e00 + 99, 0x4e00 + 1, 0x4e00 + 250]
    const a = selectTrainingSet(covered, 64, ranked)
    const b = selectTrainingSet([...covered].reverse(), 64, ranked)
    expect(a.train).toEqual(b.train)
    expect(a.holdout).toEqual(b.holdout)
  })

  it('tops up from seeded-random pool when ranked is mostly absent', () => {
    const covered = cjkPool(300)
    const { holdout: plainHoldout } = selectTrainingSet(covered, 64)
    const holdoutSet = new Set(plainHoldout)
    const present = [0x4e00 + 123, 0x4e00 + 45].filter(
      (cp) => !holdoutSet.has(cp),
    )
    const absent = Array.from({ length: 100 }, (_, i) => 0x9000 + i)
    const { train, holdout } = selectTrainingSet(covered, 64, [
      ...absent,
      ...present,
    ])
    expect(train.length).toBe(64)
    expect(train.slice(0, present.length)).toEqual(present)
    for (const cp of absent) expect(train).not.toContain(cp)
    const trainSet = new Set(train)
    expect(trainSet.size).toBe(64)
    for (const cp of holdout) expect(trainSet.has(cp)).toBe(false)
  })

  it('matches the legacy selection when ranked is empty', () => {
    const covered = cjkPool(300)
    const plain = selectTrainingSet(covered, 64)
    const empty = selectTrainingSet(covered, 64, [])
    expect(empty.train).toEqual(plain.train)
    expect(empty.holdout).toEqual(plain.holdout)
  })
})

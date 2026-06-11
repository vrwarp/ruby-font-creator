import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  planVariantFill,
  summarizeCoverage,
  type VariantData,
} from '../src/variants.js'

const cp = (char: string): number => char.codePointAt(0)!

const emptyData = (): VariantData => ({ s2t: {}, t2s: {} })

describe('planVariantFill', () => {
  it('fills a missing simplified char from its covered traditional counterpart', () => {
    const data = emptyData()
    data.s2t['爱'] = ['愛']
    const covered = new Set([cp('愛')])

    const plan = planVariantFill(covered, data, 's2t')
    expect(plan.direction).toBe('s2t')
    expect(plan.items).toEqual([
      {
        char: '爱',
        cp: cp('爱'),
        counterpartChar: '愛',
        counterpartCp: cp('愛'),
      },
    ])
    expect(plan.missingNoCounterpart).toEqual([])
  })

  it('skips entries whose key codepoint is already covered', () => {
    const data = emptyData()
    data.s2t['爱'] = ['愛']
    const covered = new Set([cp('爱'), cp('愛')])

    const plan = planVariantFill(covered, data, 's2t')
    expect(plan.items).toEqual([])
    expect(plan.missingNoCounterpart).toEqual([])
  })

  it('prefers the first covered candidate in commonness order', () => {
    const data = emptyData()
    data.s2t['发'] = ['發', '髮']
    const covered = new Set([cp('發'), cp('髮')])

    const plan = planVariantFill(covered, data, 's2t')
    expect(plan.items).toHaveLength(1)
    expect(plan.items[0].counterpartChar).toBe('發')
  })

  it('falls back to the second candidate when the first is not covered', () => {
    const data = emptyData()
    data.s2t['发'] = ['發', '髮']
    const covered = new Set([cp('髮')])

    const plan = planVariantFill(covered, data, 's2t')
    expect(plan.items).toEqual([
      {
        char: '发',
        cp: cp('发'),
        counterpartChar: '髮',
        counterpartCp: cp('髮'),
      },
    ])
  })

  it('skips identity candidates (后 -> [後, 后])', () => {
    const data = emptyData()
    data.s2t['后'] = ['後', '后']
    // 后 itself is NOT covered, so the identity candidate must not be used.
    const covered = new Set([cp('後')])

    const plan = planVariantFill(covered, data, 's2t')
    expect(plan.items).toEqual([
      {
        char: '后',
        cp: cp('后'),
        counterpartChar: '後',
        counterpartCp: cp('後'),
      },
    ])
  })

  it('skips the identity candidate mid-list (干 -> [幹, 乾, 干, 榦])', () => {
    const data = emptyData()
    data.s2t['干'] = ['幹', '乾', '干', '榦']
    // Only 榦 covered: must skip 幹/乾 (uncovered) and 干 (identity).
    const covered = new Set([cp('榦')])

    const plan = planVariantFill(covered, data, 's2t')
    expect(plan.items).toEqual([
      {
        char: '干',
        cp: cp('干'),
        counterpartChar: '榦',
        counterpartCp: cp('榦'),
      },
    ])
  })

  it('reports missingNoCounterpart when no candidate is covered', () => {
    const data = emptyData()
    data.s2t['发'] = ['發', '髮']
    data.s2t['爱'] = ['愛']
    const covered = new Set([cp('愛')])

    const plan = planVariantFill(covered, data, 's2t')
    expect(plan.items.map((i) => i.char)).toEqual(['爱'])
    expect(plan.missingNoCounterpart).toEqual(['发'])
  })

  it('skips entries whose only candidate is the key itself entirely', () => {
    const data = emptyData()
    data.s2t['丑'] = ['丑']
    const covered = new Set<number>()

    const plan = planVariantFill(covered, data, 's2t')
    expect(plan.items).toEqual([])
    expect(plan.missingNoCounterpart).toEqual([])
  })

  it('fills missing traditional chars from covered simplified ones in t2s', () => {
    const data = emptyData()
    data.t2s['愛'] = ['爱']
    data.t2s['發'] = ['发']
    const covered = new Set([cp('爱'), cp('发')])

    const plan = planVariantFill(covered, data, 't2s')
    expect(plan.direction).toBe('t2s')
    expect(plan.items.map((i) => [i.char, i.counterpartChar])).toEqual([
      ['愛', '爱'],
      ['發', '发'],
    ])
  })

  it('auto picks the direction with more fillable items', () => {
    const data = emptyData()
    data.s2t['爱'] = ['愛']
    data.t2s['愛'] = ['爱']
    data.t2s['發'] = ['发']
    // Simplified coverage: t2s can fill 2 (愛, 發), s2t can fill 0.
    const covered = new Set([cp('爱'), cp('发')])

    const plan = planVariantFill(covered, data, 'auto')
    expect(plan.direction).toBe('t2s')
    expect(plan.items).toHaveLength(2)
  })

  it('auto breaks ties in favor of s2t', () => {
    const data = emptyData()
    data.s2t['爱'] = ['愛']
    data.t2s['愛'] = ['爱']
    // Neither side covered at all: both plans have 0 items.
    const covered = new Set<number>()

    const plan = planVariantFill(covered, data, 'auto')
    expect(plan.direction).toBe('s2t')
  })

  it('handles non-BMP surrogate-pair keys and candidates', () => {
    // 𠀀 is U+20000 (CJK ext-B), a surrogate pair in UTF-16.
    const extB = '𠀀'
    expect(extB.length).toBe(2)
    expect(cp(extB)).toBe(0x20000)

    const data = emptyData()
    data.s2t[extB] = ['吙']
    data.s2t['厐'] = [extB]

    // Surrogate-pair key: 𠀀 missing, fillable from covered BMP candidate.
    const planKey = planVariantFill(new Set([cp('吙')]), data, 's2t')
    expect(planKey.items).toEqual([
      {
        char: extB,
        cp: 0x20000,
        counterpartChar: '吙',
        counterpartCp: cp('吙'),
      },
    ])
    expect(planKey.missingNoCounterpart).toEqual(['厐'])

    // Surrogate-pair candidate: 厐 missing, fillable from covered 𠀀.
    const planCandidate = planVariantFill(new Set([0x20000]), data, 's2t')
    expect(planCandidate.items).toEqual([
      {
        char: '厐',
        cp: cp('厐'),
        counterpartChar: extB,
        counterpartCp: 0x20000,
      },
    ])
    expect(planCandidate.missingNoCounterpart).toEqual([])
  })
})

describe('summarizeCoverage', () => {
  it('counts present keys and fillable items in both directions', () => {
    const data = emptyData()
    data.s2t['爱'] = ['愛']
    data.s2t['发'] = ['發', '髮']
    data.t2s['愛'] = ['爱']
    data.t2s['發'] = ['发']
    data.t2s['髮'] = ['发']
    // Covered: simplified 爱 + 发, plus traditional 愛.
    const covered = new Set([cp('爱'), cp('发'), cp('愛')])

    const summary = summarizeCoverage(covered, data)
    expect(summary.simplifiedPresent).toBe(2)
    expect(summary.traditionalPresent).toBe(1)
    // s2t: both simplified keys already covered -> nothing to fill.
    expect(summary.s2tFillable).toBe(0)
    // t2s: 發 and 髮 missing, both fillable from covered 发.
    expect(summary.t2sFillable).toBe(2)
  })
})

describe('variants.json integration', () => {
  const dataPath = path.resolve(
    __dirname,
    '../frontend/public/data/variants.json',
  )
  const real = JSON.parse(fs.readFileSync(dataPath, 'utf8')) as VariantData & {
    source: string
    license: string
  }

  it('has pinned source metadata and license', () => {
    expect(real.source).toMatch(/^[0-9a-f]{40}$/)
    expect(real.license).toBe('Apache-2.0 (OpenCC)')
  })

  it('maps 爱 to 愛 as the first candidate', () => {
    expect(real.s2t['爱'][0]).toBe('愛')
  })

  it('preserves candidate order for 发', () => {
    expect(real.s2t['发']).toEqual(['發', '髮'])
  })

  it('has more than 3500 entries in each direction', () => {
    expect(Object.keys(real.s2t).length).toBeGreaterThan(3500)
    expect(Object.keys(real.t2s).length).toBeGreaterThan(3500)
  })
})

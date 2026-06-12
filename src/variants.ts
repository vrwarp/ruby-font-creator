/**
 * Pure, font-agnostic logic for planning simplified<->traditional variant
 * fills from OpenCC character dictionaries (STCharacters / TSCharacters).
 *
 * The data shape mirrors frontend/public/data/variants.json produced by
 * scripts/download-opencc.js: each map key is a single character (possibly a
 * surrogate pair for ext-B and beyond) and each value is a candidate list
 * ordered by commonness.
 */

export interface VariantData {
  s2t: Record<string, string[]>
  t2s: Record<string, string[]>
}

export type FillDirection = 's2t' | 't2s'

export interface FillItem {
  char: string
  cp: number
  counterpartChar: string
  counterpartCp: number
}

export interface FillPlan {
  direction: FillDirection
  items: FillItem[]
  missingNoCounterpart: string[]
}

/** Code point of the first (and expected only) character in a key. */
function cpOf(char: string): number {
  const cp = char.codePointAt(0)
  if (cp === undefined) {
    throw new Error('Empty variant key')
  }
  return cp
}

function planDirection(
  covered: Set<number>,
  map: Record<string, string[]>,
  direction: FillDirection,
): FillPlan {
  const items: FillItem[] = []
  const missingNoCounterpart: string[] = []

  for (const [char, candidates] of Object.entries(map)) {
    const cp = cpOf(char)
    if (covered.has(cp)) continue

    let counterpart: FillItem | null = null
    let hasNonIdentityCandidate = false
    for (const candidate of candidates) {
      if (candidate === char) continue
      hasNonIdentityCandidate = true
      const candidateCp = cpOf(candidate)
      if (covered.has(candidateCp)) {
        counterpart = {
          char,
          cp,
          counterpartChar: candidate,
          counterpartCp: candidateCp,
        }
        break
      }
    }

    if (counterpart) {
      items.push(counterpart)
    } else if (hasNonIdentityCandidate) {
      missingNoCounterpart.push(char)
    }
    // Entries whose only candidates are the key itself are skipped entirely.
  }

  return { direction, items, missingNoCounterpart }
}

/**
 * Plans which missing codepoints can be filled from covered counterparts.
 *
 * - 's2t': the font covers traditional characters; fill missing SIMPLIFIED
 *   codepoints (keys of data.s2t) from their first covered traditional
 *   candidate.
 * - 't2s': the font covers simplified characters; fill missing TRADITIONAL
 *   codepoints (keys of data.t2s) from their first covered simplified
 *   candidate.
 * - 'auto': compute both and return the plan with more items (tie -> s2t).
 *
 * Candidates equal to the key itself are skipped; entries with only identity
 * candidates are ignored. Entries whose candidates are all uncovered are
 * reported in missingNoCounterpart.
 */
export function planVariantFill(
  covered: Set<number>,
  data: VariantData,
  direction: FillDirection | 'auto',
): FillPlan {
  if (direction === 's2t' || direction === 't2s') {
    return planDirection(covered, data[direction], direction)
  }
  const s2t = planDirection(covered, data.s2t, 's2t')
  const t2s = planDirection(covered, data.t2s, 't2s')
  return t2s.items.length > s2t.items.length ? t2s : s2t
}

/**
 * Coverage summary used by the UI to suggest a fill direction:
 * how many simplified (s2t keys) / traditional (t2s keys) characters the
 * font already covers, and how many it could gain in each direction.
 */
export function summarizeCoverage(
  covered: Set<number>,
  data: VariantData,
): {
  simplifiedPresent: number
  traditionalPresent: number
  s2tFillable: number
  t2sFillable: number
} {
  let simplifiedPresent = 0
  for (const char of Object.keys(data.s2t)) {
    if (covered.has(cpOf(char))) simplifiedPresent++
  }
  let traditionalPresent = 0
  for (const char of Object.keys(data.t2s)) {
    if (covered.has(cpOf(char))) traditionalPresent++
  }
  return {
    simplifiedPresent,
    traditionalPresent,
    s2tFillable: planDirection(covered, data.s2t, 's2t').items.length,
    t2sFillable: planDirection(covered, data.t2s, 't2s').items.length,
  }
}

import fs from 'node:fs'
import path from 'node:path'

// Builds frontend/public/data/char-coverage.json: a coverage-ranked list of
// CJK codepoints for JiT LoRA training-set selection (docs/
// style-transfer-research.md, Track B item 7). A uniform random 64-256 char
// draw can miss frequent radicals entirely; instead we greedily rank
// characters so the most document-frequent IDS components are covered as
// early as possible. frontend/jit/recipe.ts intersects this list with the
// user font's cmap at train time.

// Pinned commit of cjkvi/cjkvi-ids (resolved from master on 2026-06-12)
const CJKVI_IDS_SHA = '86b4d16159f0079437870408f0ca186e529015db'
const IDS_URL = `https://raw.githubusercontent.com/cjkvi/cjkvi-ids/${CJKVI_IDS_SHA}/ids.txt`

// How many characters to rank. ~2048 keeps the JSON well under 30 KB while
// dwarfing the largest training preset (256 chars), so even fonts covering
// only a slice of the list still fill the training set from ranked picks.
const RANK_COUNT = 2048

const destDir = path.resolve(process.cwd(), 'frontend/public/data')

// IDC layout operators (U+2FF0..U+2FFB) describe arrangement, not shape
// content, and are dropped from component sets.
const isIdc = (cp) => cp >= 0x2ff0 && cp <= 0x2ffb

// Characters eligible for the ranked output: the BMP CJK ranges the JiT
// recipe trains on (supplementary-plane ideographs are excluded -- user fonts
// in the wild rarely cover them).
const isCandidate = (cp) =>
  (cp >= 0x3400 && cp <= 0x9fff) || (cp >= 0xf900 && cp <= 0xfaff)

// Code points allowed to act as component identifiers after expansion:
// ideographs (any plane), Kangxi radicals + radical supplement, CJK strokes,
// and U+3007. Anything else appearing in an IDS field (circled digits
// standing in for unencoded glyphs, kana look-alikes, Greek letters, ...) is
// an unencoded mark and is dropped.
const isComponent = (cp) =>
  (cp >= 0x3400 && cp <= 0x9fff) ||
  (cp >= 0xf900 && cp <= 0xfaff) ||
  (cp >= 0x20000 && cp <= 0x3ffff) ||
  (cp >= 0x2e80 && cp <= 0x2fdf) ||
  (cp >= 0x31c0 && cp <= 0x31ef) ||
  cp === 0x3007

async function downloadText(url) {
  console.log(`Downloading: ${url}`)
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.statusText}`)
  }
  return response.text()
}

// Parse ids.txt lines ("U+XXXX\t<char>\t<IDS>[\t<alt IDS>...]") into a map
// char -> direct component chars. Only the first IDS field is used (alternate
// fields are regional variants); trailing source tags like "[GTKV]" are
// stripped, and IDC operators / unencoded marks are dropped.
function parseIdsTable(text) {
  const table = new Map()
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue
    const parts = line.split('\t')
    if (parts.length < 3) continue
    const ch = parts[1]
    const field = parts[2].replace(/\[[A-Z]+\]$/u, '')
    const comps = []
    for (const c of field) {
      const cp = c.codePointAt(0)
      if (isIdc(cp) || !isComponent(cp)) continue
      comps.push(c)
    }
    table.set(ch, comps)
  }
  return table
}

// Recursively expand each char to its leaf components (memoized; cycles and
// self-decompositions terminate as atoms).
function buildLeafSets(table) {
  const memo = new Map()
  const inProgress = new Set()

  const expand = (ch) => {
    const cached = memo.get(ch)
    if (cached) return cached
    if (inProgress.has(ch)) return new Set([ch]) // cycle: treat as atom
    const comps = table.get(ch)
    if (
      !comps ||
      comps.length === 0 ||
      (comps.length === 1 && comps[0] === ch)
    ) {
      const atom = new Set([ch])
      memo.set(ch, atom)
      return atom
    }
    inProgress.add(ch)
    const leaves = new Set()
    for (const comp of comps) {
      for (const leaf of comp === ch ? [ch] : expand(comp)) leaves.add(leaf)
    }
    inProgress.delete(ch)
    memo.set(ch, leaves)
    return leaves
  }

  const leafSets = new Map()
  for (const ch of table.keys()) leafSets.set(ch, expand(ch))
  return leafSets
}

// Greedy weighted set cover: repeatedly pick the candidate whose leaf
// components add the largest document-frequency mass not yet covered, so
// common radicals are covered early. Ties break by total component frequency,
// then by lowest codepoint for determinism.
function rankByCoverage(leafSets, count) {
  // Document frequency of each component across the whole table.
  const df = new Map()
  for (const leaves of leafSets.values()) {
    for (const leaf of leaves) df.set(leaf, (df.get(leaf) ?? 0) + 1)
  }

  // Index components so the hot loop runs on integer arrays.
  const compIndex = new Map()
  const weights = []
  for (const comp of df.keys()) {
    compIndex.set(comp, weights.length)
    weights.push(df.get(comp))
  }

  const candidates = []
  for (const [ch, leaves] of leafSets) {
    const cp = ch.codePointAt(0)
    if (!isCandidate(cp) || [...ch].length !== 1) continue
    const comps = Int32Array.from([...leaves], (leaf) => compIndex.get(leaf))
    let total = 0
    for (const ci of comps) total += weights[ci]
    candidates.push({ cp, comps, total, cachedGain: total })
  }
  candidates.sort((a, b) => a.cp - b.cp)

  const covered = new Uint8Array(weights.length)
  const ranked = []
  while (ranked.length < count && candidates.length > 0) {
    let best = -1
    let bestGain = -1
    let bestTotal = -1
    for (let i = 0; i < candidates.length; i++) {
      const cand = candidates[i]
      // Gains only shrink as coverage grows, so a stale cached gain is an
      // upper bound: strictly-worse candidates skip the recompute.
      if (
        cand.cachedGain < bestGain ||
        (cand.cachedGain === bestGain && cand.total <= bestTotal)
      ) {
        continue
      }
      let gain = 0
      for (const ci of cand.comps) {
        if (!covered[ci]) gain += weights[ci]
      }
      cand.cachedGain = gain
      if (gain > bestGain || (gain === bestGain && cand.total > bestTotal)) {
        best = i
        bestGain = gain
        bestTotal = cand.total
      }
    }
    const [picked] = candidates.splice(best, 1)
    for (const ci of picked.comps) covered[ci] = 1
    ranked.push(picked.cp)
  }
  return ranked
}

async function main() {
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true })
  }

  const text = await downloadText(IDS_URL)
  const table = parseIdsTable(text)
  console.log(`Parsed ids.txt: ${table.size} decomposition entries`)

  const leafSets = buildLeafSets(table)
  const ranked = rankByCoverage(leafSets, RANK_COUNT)
  console.log(`Ranked ${ranked.length} characters by component coverage`)
  console.log(
    `Top 32: ${ranked
      .slice(0, 32)
      .map((cp) => String.fromCodePoint(cp))
      .join('')}`,
  )

  const destPath = path.join(destDir, 'char-coverage.json')
  fs.writeFileSync(destPath, JSON.stringify(ranked))
  const { size } = fs.statSync(destPath)
  console.log(`Wrote ${destPath} (${size} bytes)`)
}

main().catch((err) => {
  console.error('Error building char coverage list:', err)
  process.exit(1)
})

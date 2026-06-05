import type {
  AlternateReading,
  GlyphEntry,
  PolyphonicContext,
} from './types.js'

export interface PolyphonicEntry {
  codepoint: string
  glyph: string
  alternates: AlternateReading[]
}

export type PolyphonicMap = Record<
  string,
  {
    default: { ruby: string; codepoint: string }
    alternates: Array<{
      ruby: string
      codepoint: string
      contexts: PolyphonicContext[]
    }>
  }
>

/**
 * Polyphonic character data covering common Chinese usage plus evangelical Christian
 * worship vocabulary. Each entry maps a primary codepoint to one or more alternate
 * readings at PUA codepoints (U+E000–U+E0FF), with the bigram contexts that trigger
 * each alternate via GSUB calt substitution.
 */
export const POLYPHONIC_ENTRIES: PolyphonicEntry[] = [
  {
    codepoint: 'U+884C',
    glyph: '行',
    alternates: [
      {
        ruby: 'háng',
        codepoint: 'U+E000',
        contexts: [
          { word: '银行', before: 'U+9280' },
          { word: '行业', after: 'U+4E1A' },
          { word: '行列', after: 'U+5217' },
          { word: '内行', before: 'U+5185' },
          { word: '外行', before: 'U+5916' },
          { word: '行家', after: 'U+5BB6' },
          { word: '行距', after: 'U+8DDD' },
        ],
      },
    ],
  },
  {
    // 重生 (born again, John 3:3) is central evangelical doctrine
    codepoint: 'U+91CD',
    glyph: '重',
    alternates: [
      {
        ruby: 'chóng',
        codepoint: 'U+E001',
        contexts: [
          { word: '重生', after: 'U+751F' },
          { word: '重新', after: 'U+65B0' },
          { word: '重来', after: 'U+6765' },
          { word: '重建', after: 'U+5EFA' },
          { word: '重复', after: 'U+590D' },
        ],
      },
    ],
  },
  {
    // 音乐/圣乐 critical for worship; default lè covers 喜乐 (joy)
    codepoint: 'U+4E50',
    glyph: '乐',
    alternates: [
      {
        ruby: 'yuè',
        codepoint: 'U+E002',
        contexts: [
          { word: '音乐', before: 'U+97F3' },
          { word: '圣乐', before: 'U+5723' },
          { word: '乐器', after: 'U+5668' },
          { word: '诗乐', before: 'U+8BD7' },
        ],
      },
    ],
  },
  {
    // 使徒行传 (Acts): 传 = zhuàn (record/chronicle), preceded by 行
    codepoint: 'U+4F20',
    glyph: '传',
    alternates: [
      {
        ruby: 'zhuàn',
        codepoint: 'U+E003',
        contexts: [{ word: '行传', before: 'U+884C' }],
      },
    ],
  },
  {
    // Default zhǎng covers 长老 (elder), 成长 (growth); cháng for durative uses
    codepoint: 'U+957F',
    glyph: '长',
    alternates: [
      {
        ruby: 'cháng',
        codepoint: 'U+E004',
        contexts: [
          { word: '长久', after: 'U+4E45' },
          { word: '长存', after: 'U+5B58' },
          { word: '长远', after: 'U+8FDC' },
          { word: '长时', after: 'U+65F6' },
          { word: '长期', after: 'U+671F' },
        ],
      },
    ],
  },
  {
    // 受难 (Passion), 患难 (tribulation), 苦难 (suffering) — high frequency in worship
    codepoint: 'U+96BE',
    glyph: '难',
    alternates: [
      {
        ruby: 'nàn',
        codepoint: 'U+E005',
        contexts: [
          { word: '患难', before: 'U+60A3' },
          { word: '苦难', before: 'U+82E6' },
          { word: '受难', before: 'U+53D7' },
          { word: '灾难', before: 'U+707E' },
          { word: '难民', after: 'U+6C11' },
          { word: '遇难', before: 'U+9047' },
        ],
      },
    ],
  },
  {
    // Default cháo covers 朝拜/朝圣; zhāo for morning imagery (Hosea 6:4, Ps 30:5)
    codepoint: 'U+671D',
    glyph: '朝',
    alternates: [
      {
        ruby: 'zhāo',
        codepoint: 'U+E006',
        contexts: [
          { word: '朝露', after: 'U+9732' },
          { word: '朝早', after: 'U+65E9' },
        ],
      },
    ],
  },
  {
    // 复兴 (revival) is central to evangelical/charismatic vocabulary; default xìng covers 高兴
    codepoint: 'U+5174',
    glyph: '兴',
    alternates: [
      {
        ruby: 'xīng',
        codepoint: 'U+E007',
        contexts: [
          { word: '复兴', before: 'U+590D' },
          { word: '兴起', after: 'U+8D77' },
          { word: '兴盛', after: 'U+76DB' },
          { word: '兴旺', after: 'U+65FA' },
          { word: '振兴', before: 'U+632F' },
        ],
      },
    ],
  },
  {
    // 应许/应许之地 (promise/Promised Land); 应验 (prophecy fulfilled); 回应 (response)
    codepoint: 'U+5E94',
    glyph: '应',
    alternates: [
      {
        ruby: 'yìng',
        codepoint: 'U+E008',
        contexts: [
          { word: '回应', before: 'U+56DE' },
          { word: '应验', after: 'U+9A8C' },
          { word: '响应', before: 'U+54CD' },
          { word: '感应', before: 'U+611F' },
        ],
      },
    ],
  },
  {
    // 尽心尽性尽意 (Matt 22:37, Great Commandment) — jìn reading throughout
    codepoint: 'U+5C3D',
    glyph: '尽',
    alternates: [
      {
        ruby: 'jìn',
        codepoint: 'U+E009',
        contexts: [
          { word: '尽心', after: 'U+5FC3' },
          { word: '尽性', after: 'U+6027' },
          { word: '尽意', after: 'U+610F' },
          { word: '尽力', after: 'U+529B' },
          { word: '用尽', before: 'U+7528' },
          { word: '竭尽', before: 'U+7AED' },
        ],
      },
    ],
  },
  {
    // Default diào covers 曲调/音调 (melody/pitch); tiáo for regulatory senses
    codepoint: 'U+8C03',
    glyph: '调',
    alternates: [
      {
        ruby: 'tiáo',
        codepoint: 'U+E00A',
        contexts: [
          { word: '调和', after: 'U+548C' },
          { word: '调节', after: 'U+8282' },
          { word: '调整', after: 'U+6574' },
        ],
      },
    ],
  },
  {
    codepoint: 'U+8FD8',
    glyph: '还',
    alternates: [
      {
        ruby: 'huán',
        codepoint: 'U+E00B',
        contexts: [
          { word: '还债', after: 'U+503A' },
          { word: '归还', before: 'U+5F52' },
        ],
      },
    ],
  },
  {
    codepoint: 'U+597D',
    glyph: '好',
    alternates: [
      {
        ruby: 'hào',
        codepoint: 'U+E00C',
        contexts: [
          { word: '爱好', before: 'U+7231' },
          { word: '好学', after: 'U+5B66' },
          { word: '好奇', after: 'U+5947' },
        ],
      },
    ],
  },
  {
    // 圣都 = holy city (Jerusalem); default dōu covers "all/every"
    codepoint: 'U+90FD',
    glyph: '都',
    alternates: [
      {
        ruby: 'dū',
        codepoint: 'U+E00D',
        contexts: [
          { word: '圣都', before: 'U+5723' },
          { word: '首都', before: 'U+9996' },
          { word: '都市', after: 'U+5E02' },
        ],
      },
    ],
  },
  {
    // wéi covers 成为/行为/作为; default wèi covers 为主/为了/因为
    codepoint: 'U+4E3A',
    glyph: '为',
    alternates: [
      {
        ruby: 'wéi',
        codepoint: 'U+E00E',
        contexts: [
          { word: '成为', before: 'U+6210' },
          { word: '行为', before: 'U+884C' },
          { word: '作为', before: 'U+4F5C' },
          { word: '称为', before: 'U+79F0' },
          { word: '视为', before: 'U+89C6' },
          { word: '以为', before: 'U+4EE5' },
          { word: '认为', before: 'U+8BA4' },
        ],
      },
    ],
  },
  {
    // Default chù covers 各处/住处 (location); chǔ for process/handle senses
    codepoint: 'U+5904',
    glyph: '处',
    alternates: [
      {
        ruby: 'chǔ',
        codepoint: 'U+E00F',
        contexts: [
          { word: '处理', after: 'U+7406' },
          { word: '处置', after: 'U+7F6E' },
          { word: '处境', after: 'U+5883' },
        ],
      },
    ],
  },
]

/** Returns flat GlyphEntry objects for all alternate readings, for SVG generation. */
export function getAlternateGlyphEntries(): GlyphEntry[] {
  return POLYPHONIC_ENTRIES.flatMap(({ glyph, alternates }) =>
    alternates.map(({ ruby, codepoint }) => ({ codepoint, glyph, ruby })),
  )
}

/**
 * Builds the polyphonic-map.json structure, looking up primary ruby values
 * from the main dataset so the map is the single source of truth for consumers.
 */
export function buildPolyphonicMap(mainData: GlyphEntry[]): PolyphonicMap {
  const byCodepoint = new Map(mainData.map((e) => [e.codepoint, e]))
  const map: PolyphonicMap = {}

  for (const entry of POLYPHONIC_ENTRIES) {
    const primary = byCodepoint.get(entry.codepoint)
    if (!primary) continue

    map[entry.glyph] = {
      default: { ruby: primary.ruby, codepoint: entry.codepoint },
      alternates: entry.alternates.map(({ ruby, codepoint, contexts }) => ({
        ruby,
        codepoint,
        contexts,
      })),
    }
  }

  return map
}

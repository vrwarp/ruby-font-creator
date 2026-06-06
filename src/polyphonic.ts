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
  {
    codepoint: 'U+6A02',
    glyph: '樂',
    alternates: [
      {
        ruby: 'yuè',
        codepoint: 'U+E010',
        contexts: [
          { word: '音樂', before: 'U+97F3' },
          { word: '聖樂', before: 'U+8056' },
          { word: '樂器', after: 'U+5668' },
          { word: '詩樂', before: 'U+8A69' },
        ],
      },
    ],
  },
  {
    codepoint: 'U+50B3',
    glyph: '傳',
    alternates: [
      {
        ruby: 'zhuàn',
        codepoint: 'U+E011',
        contexts: [{ word: '行傳', before: 'U+884C' }],
      },
    ],
  },
  {
    codepoint: 'U+9577',
    glyph: '長',
    alternates: [
      {
        ruby: 'cháng',
        codepoint: 'U+E012',
        contexts: [
          { word: '長久', after: 'U+4E45' },
          { word: '長存', after: 'U+5B58' },
          { word: '長遠', after: 'U+8FDC' },
          { word: '長時', after: 'U+65F6' },
          { word: '長期', after: 'U+671F' },
        ],
      },
    ],
  },
  {
    codepoint: 'U+96E3',
    glyph: '難',
    alternates: [
      {
        ruby: 'nàn',
        codepoint: 'U+E013',
        contexts: [
          { word: '患難', before: 'U+60A3' },
          { word: '苦難', before: 'U+82E6' },
          { word: '受難', before: 'U+53D7' },
          { word: '災難', before: 'U+707E' },
          { word: '難民', after: 'U+6C11' },
          { word: '遇難', before: 'U+9047' },
        ],
      },
    ],
  },
  {
    codepoint: 'U+8208',
    glyph: '興',
    alternates: [
      {
        ruby: 'xīng',
        codepoint: 'U+E014',
        contexts: [
          { word: '復興', before: 'U+590D' },
          { word: '興起', after: 'U+8D77' },
          { word: '興盛', after: 'U+76DB' },
          { word: '興旺', after: 'U+65FA' },
          { word: '振興', before: 'U+632F' },
        ],
      },
    ],
  },
  {
    codepoint: 'U+61C9',
    glyph: '應',
    alternates: [
      {
        ruby: 'yìng',
        codepoint: 'U+E015',
        contexts: [
          { word: '回應', before: 'U+56DE' },
          { word: '應驗', after: 'U+9A8C' },
          { word: '響應', before: 'U+97FF' },
          { word: '感應', before: 'U+611F' },
        ],
      },
    ],
  },
  {
    codepoint: 'U+76E1',
    glyph: '盡',
    alternates: [
      {
        ruby: 'jìn',
        codepoint: 'U+E016',
        contexts: [
          { word: '盡心', after: 'U+5FC3' },
          { word: '盡性', after: 'U+6027' },
          { word: '盡意', after: 'U+610F' },
          { word: '盡力', after: 'U+529B' },
          { word: '用盡', before: 'U+7528' },
          { word: '竭盡', before: 'U+7AED' },
        ],
      },
    ],
  },
  {
    codepoint: 'U+8ABF',
    glyph: '調',
    alternates: [
      {
        ruby: 'tiáo',
        codepoint: 'U+E017',
        contexts: [
          { word: '調和', after: 'U+548C' },
          { word: '調節', after: 'U+7BC0' },
          { word: '調整', after: 'U+6574' },
        ],
      },
    ],
  },
  {
    codepoint: 'U+9084',
    glyph: '還',
    alternates: [
      {
        ruby: 'huán',
        codepoint: 'U+E018',
        contexts: [
          { word: '還債', after: 'U+50B5' },
          { word: '歸還', before: 'U+6B78' },
        ],
      },
    ],
  },
  {
    codepoint: 'U+70BA',
    glyph: '為',
    alternates: [
      {
        ruby: 'wéi',
        codepoint: 'U+E019',
        contexts: [
          { word: '成為', before: 'U+6210' },
          { word: '行為', before: 'U+884C' },
          { word: '作為', before: 'U+4F5C' },
          { word: '稱為', before: 'U+7A31' },
          { word: '視為', before: 'U+8996' },
          { word: '以為', before: 'U+4EE5' },
          { word: '認為', before: 'U+8A8D' },
        ],
      },
    ],
  },
  {
    codepoint: 'U+8655',
    glyph: '處',
    alternates: [
      {
        ruby: 'chǔ',
        codepoint: 'U+E01A',
        contexts: [
          { word: '處理', after: 'U+7406' },
          { word: '處置', after: 'U+7F6E' },
          { word: '處境', after: 'U+5883' },
        ],
      },
    ],
  },
  {
    codepoint: 'U+964D',
    glyph: '降',
    alternates: [
      {
        ruby: 'xiáng',
        codepoint: 'U+E01B',
        contexts: [{ word: '投降', before: 'U+6295' }],
      },
    ],
  },
  {
    codepoint: 'U+6076',
    glyph: '恶',
    alternates: [
      {
        ruby: 'wù',
        codepoint: 'U+E01C',
        contexts: [
          { word: '厌恶', before: 'U+538C' },
          { word: '可恶', before: 'U+53EF' },
          { word: '恶恶', before: 'U+6076' },
        ],
      },
    ],
  },
  {
    codepoint: 'U+60E1',
    glyph: '惡',
    alternates: [
      {
        ruby: 'wù',
        codepoint: 'U+E01D',
        contexts: [
          { word: '厭惡', before: 'U+53AD' },
          { word: '可惡', before: 'U+53EF' },
          { word: '惡惡', before: 'U+60E1' },
        ],
      },
    ],
  },
  {
    codepoint: 'U+5F39',
    glyph: '弹',
    alternates: [
      {
        ruby: 'dàn',
        codepoint: 'U+E01E',
        contexts: [{ word: '子弹', before: 'U+5B50' }],
      },
    ],
  },
  {
    codepoint: 'U+5F48',
    glyph: '彈',
    alternates: [
      {
        ruby: 'dàn',
        codepoint: 'U+E01F',
        contexts: [{ word: '子彈', before: 'U+5B50' }],
      },
    ],
  },
  {
    codepoint: 'U+521B',
    glyph: '创',
    alternates: [
      {
        ruby: 'chuāng',
        codepoint: 'U+E020',
        contexts: [
          { word: '创伤', after: 'U+4F24' },
          { word: '受创', before: 'U+53D7' },
        ],
      },
    ],
  },
  {
    codepoint: 'U+5275',
    glyph: '創',
    alternates: [
      {
        ruby: 'chuāng',
        codepoint: 'U+E021',
        contexts: [
          { word: '創傷', after: 'U+50B7' },
          { word: '受創', before: 'U+53D7' },
        ],
      },
    ],
  },
  {
    codepoint: 'U+548C',
    glyph: '和',
    alternates: [
      {
        ruby: 'hè',
        codepoint: 'U+E022',
        contexts: [
          { word: '附和', before: 'U+9644' },
          { word: '唱和', before: 'U+5531' },
          { word: '响应', before: 'U+54CD' },
          { word: '響應', before: 'U+97FF' },
        ],
      },
    ],
  },
  {
    codepoint: 'U+89C9',
    glyph: '觉',
    alternates: [
      {
        ruby: 'jiào',
        codepoint: 'U+E023',
        contexts: [{ word: '睡觉', before: 'U+7761' }],
      },
    ],
  },
  {
    codepoint: 'U+8AFA',
    glyph: '覺',
    alternates: [
      {
        ruby: 'jiào',
        codepoint: 'U+E024',
        contexts: [{ word: '睡覺', before: 'U+7761' }],
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

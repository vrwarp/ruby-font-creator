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
          { word: '重叠', after: 'U+53E0' },
          { word: '重疊', after: 'U+758A' },
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
          { word: '很长', before: 'U+5F88' },
          { word: '极长', before: 'U+6781' },
          { word: '特长', before: 'U+7279' },
          { word: '细长', before: 'U+7EC6' },
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
          { word: '还给', after: 'U+7ED9' },
          { word: '退还', before: 'U+9000' },
          { word: '偿还', before: 'U+507F' },
          { word: '还手', after: 'U+624B' },
          { word: '还书', after: 'U+4E66' },
          { word: '还原', after: 'U+539F' },
          { word: '还乡', after: 'U+4E61' },
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
          { word: '很長', before: 'U+5F88' },
          { word: '極長', before: 'U+6975' },
          { word: '特長', before: 'U+7279' },
          { word: '細長', before: 'U+7D30' },
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
          { word: '還給', after: 'U+7D66' },
          { word: '退還', before: 'U+9000' },
          { word: '償還', before: 'U+511F' },
          { word: '還手', after: 'U+624B' },
          { word: '還書', after: 'U+66F8' },
          { word: '還原', after: 'U+539F' },
          { word: '還鄉', after: 'U+9109' },
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
      {
        ruby: 'huò',
        codepoint: 'U+E033',
        contexts: [{ word: '和泥', after: 'U+6CE5' }],
      },
      {
        ruby: 'huó',
        codepoint: 'U+E034',
        contexts: [
          { word: '和面', after: 'U+9762' },
          { word: '和麵', after: 'U+9EB5' },
        ],
      },
      {
        ruby: 'hú',
        codepoint: 'U+E035',
        contexts: [
          { word: '和牌', after: 'U+724C' },
          { word: '和了', after: 'U+4E86' },
        ],
      },
    ],
  },
  {
    codepoint: 'U+5DEE',
    glyph: '差',
    alternates: [
      {
        ruby: 'chāi',
        codepoint: 'U+E038',
        contexts: [
          { word: '出差', before: 'U+51FA' },
          { word: '差事', after: 'U+4E8B' },
          { word: '公差', before: 'U+516C' },
          { word: '邮差', before: 'U+90AE' },
          { word: '郵差', before: 'U+90F5' },
        ],
      },
      {
        ruby: 'chā',
        codepoint: 'U+E039',
        contexts: [
          { word: '误差', before: 'U+8BEF' },
          { word: '誤差', before: 'U+8AA4' },
          { word: '偏差', before: 'U+504F' },
          { word: '时差', before: 'U+65F6' },
          { word: '時差', before: 'U+6642' },
          { word: '极差', before: 'U+6781' },
          { word: '極差', before: 'U+6975' },
          { word: '差别', after: 'U+522B' },
          { word: '差別', after: 'U+5225' },
          { word: '差异', after: 'U+5F02' },
          { word: '差異', after: 'U+7570' },
          { word: '差错', after: 'U+9519' },
          { word: '差錯', after: 'U+932B' },
        ],
      },
      {
        ruby: 'cī',
        codepoint: 'U+E03A',
        contexts: [
          { word: '参差', before: 'U+53C2' },
          { word: '參差', before: 'U+53C3' },
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
  {
    codepoint: 'U+5927',
    glyph: '大',
    alternates: [
      {
        ruby: 'dài',
        codepoint: 'U+E025',
        contexts: [{ word: '大夫', after: 'U+592B' }],
      },
    ],
  },
  {
    codepoint: 'U+62C5',
    glyph: '担',
    alternates: [
      {
        ruby: 'dàn',
        codepoint: 'U+E026',
        contexts: [{ word: '重担', before: 'U+91CD' }],
      },
    ],
  },
  {
    codepoint: 'U+64D4',
    glyph: '擔',
    alternates: [
      {
        ruby: 'dàn',
        codepoint: 'U+E027',
        contexts: [{ word: '重擔', before: 'U+91CD' }],
      },
    ],
  },
  {
    codepoint: 'U+6559',
    glyph: '教',
    alternates: [
      {
        ruby: 'jiāo',
        codepoint: 'U+E028',
        contexts: [
          { word: '教书', after: 'U+4E66' },
          { word: '教書', after: 'U+66F8' },
        ],
      },
    ],
  },
  {
    codepoint: 'U+5012',
    glyph: '倒',
    alternates: [
      {
        ruby: 'dǎo',
        codepoint: 'U+E029',
        contexts: [
          { word: '倒在', after: 'U+5728' },
          { word: '倒下', after: 'U+4E0B' },
          { word: '碰倒', before: 'U+78B0' },
          { word: '跌倒', before: 'U+8DCC' },
          { word: '摔倒', before: 'U+6454' },
          { word: '打倒', before: 'U+6253' },
        ],
      },
    ],
  },
  {
    codepoint: 'U+5730',
    glyph: '地',
    alternates: [
      {
        ruby: 'dì',
        codepoint: 'U+E02A',
        contexts: [
          { word: '地上', after: 'U+4E0A' },
          { word: '地下', after: 'U+4E0B' },
          { word: '地方', after: 'U+65B9' },
          { word: '地球', after: 'U+7403' },
          { word: '地图', after: 'U+56FE' },
          { word: '地圖', after: 'U+5716' },
          { word: '地址', after: 'U+5740' },
          { word: '地狱', after: 'U+7231' },
          { word: '地獄', after: 'U+7344' },
          { word: '地位', after: 'U+4F4D' },
          { word: '地带', after: 'U+5E26' },
          { word: '地帶', after: 'U+5E36' },
          { word: '地步', after: 'U+6B65' },
          { word: '地表', after: 'U+8868' },
          { word: '地势', after: 'U+52BF' },
          { word: '地勢', after: 'U+52E2' },
          { word: '地契', after: 'U+5951' },
          { word: '土地', before: 'U+571F' },
          { word: '各地', before: 'U+5404' },
          { word: '大地', before: 'U+5927' },
          { word: '墓地', before: 'U+5893' },
          { word: '目的地', before: 'U+7684' },
          { word: '圣地', before: 'U+5723' },
          { word: '聖地', before: 'U+8056' },
          { word: '盆地', before: 'U+76C6' },
          { word: '草地', before: 'U+8349' },
          { word: '平地', before: 'U+5E73' },
          { word: '林地', before: 'U+6797' },
        ],
      },
    ],
  },
  {
    codepoint: 'U+5939',
    glyph: '夹',
    alternates: [
      {
        ruby: 'jiá',
        codepoint: 'U+E02B',
        contexts: [
          { word: '夹杂', after: 'U+6742' },
          { word: '夹克', after: 'U+514B' },
          { word: '夹衣', after: 'U+8863' },
          { word: '夹道', after: 'U+9053' },
          { word: '夹攻', after: 'U+653B' },
        ],
      },
    ],
  },
  {
    codepoint: 'U+593E',
    glyph: '夾',
    alternates: [
      {
        ruby: 'jiá',
        codepoint: 'U+E02C',
        contexts: [
          { word: '夾雜', after: 'U+96DC' },
          { word: '夾克', after: 'U+514B' },
          { word: '夾衣', after: 'U+8863' },
          { word: '夾道', after: 'U+9053' },
          { word: '夾攻', after: 'U+653B' },
        ],
      },
    ],
  },
  {
    codepoint: 'U+5F97',
    glyph: '得',
    alternates: [
      {
        ruby: 'de',
        codepoint: 'U+E02D',
        contexts: [
          { word: '觉得', before: 'U+89C9' },
          { word: '覺得', before: 'U+8AFA' },
          { word: '变得', before: 'U+53D8' },
          { word: '變得', before: 'U+8B8A' },
          { word: '高兴得', before: 'U+5174' },
          { word: '高興得', before: 'U+8208' },
          { word: '得很', after: 'U+5F88' },
          { word: '看得到', before: 'U+770B' },
          { word: '听得到', before: 'U+542C' },
          { word: '聽得到', before: 'U+807D' },
          { word: '来得及', before: 'U+6765' },
          { word: '來得及', before: 'U+4F86' },
          { word: '来得及', after: 'U+53CA' },
          { word: '看得', after: 'U+898B' },
          { word: '看得', after: 'U+89C1' },
          { word: '出得', after: 'U+53BB' },
          { word: '进得', after: 'U+6765' },
          { word: '進得', after: 'U+4F86' },
          { word: '吃得', after: 'U+5B8C' },
          { word: '做得', after: 'U+5230' },
          { word: '做得', before: 'U+505A' },
        ],
      },
      {
        ruby: 'děi',
        codepoint: 'U+E02E',
        contexts: [
          { word: '你得', before: 'U+4F60' },
          { word: '他得', before: 'U+4ED6' },
          { word: '我得', before: 'U+6211' },
          { word: '们得', before: 'U+4EEC' },
          { word: '們得', before: 'U+5011' },
          { word: '谁得', before: 'U+8C01' },
          { word: '誰得', before: 'U+8AA0' },
          { word: '都得', before: 'U+90FD' },
          { word: '总得', before: 'U+603B' },
          { word: '總得', before: 'U+7E3D' },
          { word: '非得', before: 'U+975E' },
          { word: '不得不', before: 'U+4E0D' },
          { word: '不得不', after: 'U+4E0D' },
        ],
      },
    ],
  },
  {
    codepoint: 'U+7740',
    glyph: '着',
    alternates: [
      {
        ruby: 'zháo',
        codepoint: 'U+E02F',
        contexts: [
          { word: '睡着', before: 'U+7761' },
          { word: '着凉', after: 'U+51C9' },
          { word: '着凉', after: 'U+6D9B' },
          { word: '着火', after: 'U+706B' },
          { word: '着急', after: 'U+6225' },
          { word: '着迷', after: 'U+8FF7' },
        ],
      },
      {
        ruby: 'zhāo',
        codepoint: 'U+E030',
        contexts: [
          { word: '一着', before: 'U+4E00' },
          { word: '着数', after: 'U+6570' },
          { word: '着數', after: 'U+6578' },
        ],
      },
    ],
  },
  {
    codepoint: 'U+8457',
    glyph: '著',
    alternates: [
      {
        ruby: 'zháo',
        codepoint: 'U+E031',
        contexts: [
          { word: '睡著', before: 'U+7761' },
          { word: '著涼', after: 'U+51C9' },
          { word: '著涼', after: 'U+6D9B' },
          { word: '著火', after: 'U+706B' },
          { word: '著急', after: 'U+6225' },
          { word: '著迷', after: 'U+8FF7' },
        ],
      },
      {
        ruby: 'zhāo',
        codepoint: 'U+E032',
        contexts: [
          { word: '一著', before: 'U+4E00' },
          { word: '著数', after: 'U+6570' },
          { word: '著數', after: 'U+6578' },
        ],
      },
    ],
  },
  {
    codepoint: 'U+53C2',
    glyph: '参',
    alternates: [
      {
        ruby: 'cēn',
        codepoint: 'U+E036',
        contexts: [{ word: '参差', after: 'U+5DEE' }],
      },
    ],
  },
  {
    codepoint: 'U+53C3',
    glyph: '參',
    alternates: [
      {
        ruby: 'cēn',
        codepoint: 'U+E037',
        contexts: [{ word: '參差', after: 'U+5DEE' }],
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

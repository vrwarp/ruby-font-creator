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

/**
 * A context as emitted into polyphonic-map.json: `before`/`after` are
 * "U+XXXX" codepoint strings derived from the character-based source contexts.
 */
export interface PolyphonicMapContext {
  word: string
  before?: string
  after?: string
}

export type PolyphonicMap = Record<
  string,
  {
    default: { ruby: string; codepoint: string }
    alternates: Array<{
      ruby: string
      codepoint: string
      contexts: PolyphonicMapContext[]
    }>
  }
>

/**
 * Polyphonic character data covering common Chinese usage plus evangelical Christian
 * worship vocabulary. Each entry maps a primary codepoint to one or more alternate
 * readings at PUA codepoints (U+E000–U+E0FF), with the bigram contexts that trigger
 * each alternate via GSUB calt substitution.
 *
 * Script coverage policy (the font must work for both simplified and traditional
 * text):
 * - Characters whose simplified and traditional forms differ get one entry per
 *   form (e.g. 乐 U+4E50 and 樂 U+6A02), each with contexts in its own script.
 * - Characters shared by both scripts (e.g. 行, 重, 得, 地) carry contexts for
 *   BOTH scripts: every context word whose neighbour character differs between
 *   scripts is listed twice (e.g. 银行 and 銀行).
 * - `before`/`after` are written as characters, never raw codepoints, and must
 *   be the actual neighbours of the glyph inside `word` — this is enforced by
 *   test/polyphonic.test.ts.
 */
export const POLYPHONIC_ENTRIES: PolyphonicEntry[] = [
  {
    // 行 is identical in simplified & traditional text — contexts cover both
    codepoint: 'U+884C',
    glyph: '行',
    alternates: [
      {
        ruby: 'háng',
        codepoint: 'U+E000',
        contexts: [
          { word: '银行', before: '银' },
          { word: '銀行', before: '銀' },
          { word: '行业', after: '业' },
          { word: '行業', after: '業' },
          { word: '行列', after: '列' },
          { word: '内行', before: '内' },
          { word: '內行', before: '內' },
          { word: '外行', before: '外' },
          { word: '行家', after: '家' },
          { word: '行距', after: '距' },
        ],
      },
    ],
  },
  {
    // 重生 (born again, John 3:3) is central evangelical doctrine; shared glyph
    codepoint: 'U+91CD',
    glyph: '重',
    alternates: [
      {
        ruby: 'chóng',
        codepoint: 'U+E001',
        contexts: [
          { word: '重生', after: '生' },
          { word: '重新', after: '新' },
          { word: '重来', after: '来' },
          { word: '重來', after: '來' },
          { word: '重建', after: '建' },
          { word: '重复', after: '复' },
          { word: '重複', after: '複' },
          { word: '重叠', after: '叠' },
          { word: '重疊', after: '疊' },
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
          { word: '音乐', before: '音' },
          { word: '圣乐', before: '圣' },
          { word: '乐器', after: '器' },
          { word: '诗乐', before: '诗' },
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
        contexts: [{ word: '行传', before: '行' }],
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
          { word: '长久', after: '久' },
          { word: '长存', after: '存' },
          { word: '长远', after: '远' },
          { word: '长时', after: '时' },
          { word: '长期', after: '期' },
          { word: '很长', before: '很' },
          { word: '极长', before: '极' },
          { word: '特长', before: '特' },
          { word: '细长', before: '细' },
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
          { word: '患难', before: '患' },
          { word: '苦难', before: '苦' },
          { word: '受难', before: '受' },
          { word: '灾难', before: '灾' },
          { word: '难民', after: '民' },
          { word: '遇难', before: '遇' },
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
          { word: '朝露', after: '露' },
          { word: '朝早', after: '早' },
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
          { word: '复兴', before: '复' },
          { word: '兴起', after: '起' },
          { word: '兴盛', after: '盛' },
          { word: '兴旺', after: '旺' },
          { word: '振兴', before: '振' },
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
          { word: '回应', before: '回' },
          { word: '应验', after: '验' },
          { word: '响应', before: '响' },
          { word: '感应', before: '感' },
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
          { word: '尽心', after: '心' },
          { word: '尽性', after: '性' },
          { word: '尽意', after: '意' },
          { word: '尽力', after: '力' },
          { word: '用尽', before: '用' },
          { word: '竭尽', before: '竭' },
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
          { word: '调和', after: '和' },
          { word: '调节', after: '节' },
          { word: '调整', after: '整' },
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
          { word: '还债', after: '债' },
          { word: '归还', before: '归' },
          { word: '还给', after: '给' },
          { word: '退还', before: '退' },
          { word: '偿还', before: '偿' },
          { word: '还手', after: '手' },
          { word: '还书', after: '书' },
          { word: '还原', after: '原' },
          { word: '还乡', after: '乡' },
        ],
      },
    ],
  },
  {
    // Shared glyph — 爱好/愛好 and 好学/好學 cover both scripts
    codepoint: 'U+597D',
    glyph: '好',
    alternates: [
      {
        ruby: 'hào',
        codepoint: 'U+E00C',
        contexts: [
          { word: '爱好', before: '爱' },
          { word: '愛好', before: '愛' },
          { word: '好学', after: '学' },
          { word: '好學', after: '學' },
          { word: '好奇', after: '奇' },
        ],
      },
    ],
  },
  {
    // 圣都/聖都 = holy city (Jerusalem); default dōu covers "all/every"; shared glyph
    codepoint: 'U+90FD',
    glyph: '都',
    alternates: [
      {
        ruby: 'dū',
        codepoint: 'U+E00D',
        contexts: [
          { word: '圣都', before: '圣' },
          { word: '聖都', before: '聖' },
          { word: '首都', before: '首' },
          { word: '都市', after: '市' },
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
          { word: '成为', before: '成' },
          { word: '行为', before: '行' },
          { word: '作为', before: '作' },
          { word: '称为', before: '称' },
          { word: '视为', before: '视' },
          { word: '以为', before: '以' },
          { word: '认为', before: '认' },
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
          { word: '处理', after: '理' },
          { word: '处置', after: '置' },
          { word: '处境', after: '境' },
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
          { word: '音樂', before: '音' },
          { word: '聖樂', before: '聖' },
          { word: '樂器', after: '器' },
          { word: '詩樂', before: '詩' },
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
        contexts: [{ word: '行傳', before: '行' }],
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
          { word: '長久', after: '久' },
          { word: '長存', after: '存' },
          { word: '長遠', after: '遠' },
          { word: '長時', after: '時' },
          { word: '長期', after: '期' },
          { word: '很長', before: '很' },
          { word: '極長', before: '極' },
          { word: '特長', before: '特' },
          { word: '細長', before: '細' },
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
          { word: '患難', before: '患' },
          { word: '苦難', before: '苦' },
          { word: '受難', before: '受' },
          { word: '災難', before: '災' },
          { word: '難民', after: '民' },
          { word: '遇難', before: '遇' },
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
          { word: '復興', before: '復' },
          { word: '興起', after: '起' },
          { word: '興盛', after: '盛' },
          { word: '興旺', after: '旺' },
          { word: '振興', before: '振' },
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
          { word: '回應', before: '回' },
          { word: '應驗', after: '驗' },
          { word: '響應', before: '響' },
          { word: '感應', before: '感' },
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
          { word: '盡心', after: '心' },
          { word: '盡性', after: '性' },
          { word: '盡意', after: '意' },
          { word: '盡力', after: '力' },
          { word: '用盡', before: '用' },
          { word: '竭盡', before: '竭' },
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
          { word: '調和', after: '和' },
          { word: '調節', after: '節' },
          { word: '調整', after: '整' },
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
          { word: '還債', after: '債' },
          { word: '歸還', before: '歸' },
          { word: '還給', after: '給' },
          { word: '退還', before: '退' },
          { word: '償還', before: '償' },
          { word: '還手', after: '手' },
          { word: '還書', after: '書' },
          { word: '還原', after: '原' },
          { word: '還鄉', after: '鄉' },
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
          { word: '成為', before: '成' },
          { word: '行為', before: '行' },
          { word: '作為', before: '作' },
          { word: '稱為', before: '稱' },
          { word: '視為', before: '視' },
          { word: '以為', before: '以' },
          { word: '認為', before: '認' },
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
          { word: '處理', after: '理' },
          { word: '處置', after: '置' },
          { word: '處境', after: '境' },
        ],
      },
    ],
  },
  {
    // Shared glyph
    codepoint: 'U+964D',
    glyph: '降',
    alternates: [
      {
        ruby: 'xiáng',
        codepoint: 'U+E01B',
        contexts: [{ word: '投降', before: '投' }],
      },
    ],
  },
  {
    // 恶恶 (wù è, "hate evil", Rom 12:9): the FIRST 恶 reads wù, so the trigger
    // is the following 恶, not a preceding one
    codepoint: 'U+6076',
    glyph: '恶',
    alternates: [
      {
        ruby: 'wù',
        codepoint: 'U+E01C',
        contexts: [
          { word: '厌恶', before: '厌' },
          { word: '可恶', before: '可' },
          { word: '恶恶', after: '恶' },
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
          { word: '厭惡', before: '厭' },
          { word: '可惡', before: '可' },
          { word: '惡惡', after: '惡' },
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
        contexts: [{ word: '子弹', before: '子' }],
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
        contexts: [{ word: '子彈', before: '子' }],
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
          { word: '创伤', after: '伤' },
          { word: '受创', before: '受' },
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
          { word: '創傷', after: '傷' },
          { word: '受創', before: '受' },
        ],
      },
    ],
  },
  {
    // Shared glyph; 附/唱/泥/面/牌/了 are shared too, 麵 is the traditional form of 面
    codepoint: 'U+548C',
    glyph: '和',
    alternates: [
      {
        ruby: 'hè',
        codepoint: 'U+E022',
        contexts: [
          { word: '附和', before: '附' },
          { word: '唱和', before: '唱' },
        ],
      },
      {
        ruby: 'huò',
        codepoint: 'U+E033',
        contexts: [{ word: '和泥', after: '泥' }],
      },
      {
        ruby: 'huó',
        codepoint: 'U+E034',
        contexts: [
          { word: '和面', after: '面' },
          { word: '和麵', after: '麵' },
        ],
      },
      {
        ruby: 'hú',
        codepoint: 'U+E035',
        contexts: [
          { word: '和牌', after: '牌' },
          { word: '和了', after: '了' },
        ],
      },
    ],
  },
  {
    // Shared glyph — contexts cover both scripts
    codepoint: 'U+5DEE',
    glyph: '差',
    alternates: [
      {
        ruby: 'chāi',
        codepoint: 'U+E038',
        contexts: [
          { word: '出差', before: '出' },
          { word: '差事', after: '事' },
          { word: '公差', before: '公' },
          { word: '邮差', before: '邮' },
          { word: '郵差', before: '郵' },
        ],
      },
      {
        ruby: 'chā',
        codepoint: 'U+E039',
        contexts: [
          { word: '误差', before: '误' },
          { word: '誤差', before: '誤' },
          { word: '偏差', before: '偏' },
          { word: '时差', before: '时' },
          { word: '時差', before: '時' },
          { word: '极差', before: '极' },
          { word: '極差', before: '極' },
          { word: '差别', after: '别' },
          { word: '差別', after: '別' },
          { word: '差异', after: '异' },
          { word: '差異', after: '異' },
          { word: '差错', after: '错' },
          { word: '差錯', after: '錯' },
        ],
      },
      {
        ruby: 'cī',
        codepoint: 'U+E03A',
        contexts: [
          { word: '参差', before: '参' },
          { word: '參差', before: '參' },
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
        contexts: [{ word: '睡觉', before: '睡' }],
      },
    ],
  },
  {
    codepoint: 'U+89BA',
    glyph: '覺',
    alternates: [
      {
        ruby: 'jiào',
        codepoint: 'U+E024',
        contexts: [{ word: '睡覺', before: '睡' }],
      },
    ],
  },
  {
    // Shared glyph
    codepoint: 'U+5927',
    glyph: '大',
    alternates: [
      {
        ruby: 'dài',
        codepoint: 'U+E025',
        contexts: [{ word: '大夫', after: '夫' }],
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
        contexts: [{ word: '重担', before: '重' }],
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
        contexts: [{ word: '重擔', before: '重' }],
      },
    ],
  },
  {
    // Shared glyph — 教书/教書 cover both scripts
    codepoint: 'U+6559',
    glyph: '教',
    alternates: [
      {
        ruby: 'jiāo',
        codepoint: 'U+E028',
        contexts: [
          { word: '教书', after: '书' },
          { word: '教書', after: '書' },
        ],
      },
    ],
  },
  {
    // Shared glyph; all context characters are shared between scripts
    codepoint: 'U+5012',
    glyph: '倒',
    alternates: [
      {
        ruby: 'dǎo',
        codepoint: 'U+E029',
        contexts: [
          { word: '倒在', after: '在' },
          { word: '倒下', after: '下' },
          { word: '碰倒', before: '碰' },
          { word: '跌倒', before: '跌' },
          { word: '摔倒', before: '摔' },
          { word: '打倒', before: '打' },
        ],
      },
    ],
  },
  {
    // Shared glyph — contexts cover both scripts
    codepoint: 'U+5730',
    glyph: '地',
    alternates: [
      {
        ruby: 'dì',
        codepoint: 'U+E02A',
        contexts: [
          { word: '地上', after: '上' },
          { word: '地下', after: '下' },
          { word: '地方', after: '方' },
          { word: '地球', after: '球' },
          { word: '地图', after: '图' },
          { word: '地圖', after: '圖' },
          { word: '地址', after: '址' },
          { word: '地狱', after: '狱' },
          { word: '地獄', after: '獄' },
          { word: '地位', after: '位' },
          { word: '地带', after: '带' },
          { word: '地帶', after: '帶' },
          { word: '地步', after: '步' },
          { word: '地表', after: '表' },
          { word: '地势', after: '势' },
          { word: '地勢', after: '勢' },
          { word: '地契', after: '契' },
          { word: '土地', before: '土' },
          { word: '各地', before: '各' },
          { word: '大地', before: '大' },
          { word: '墓地', before: '墓' },
          { word: '目的地', before: '的' },
          { word: '圣地', before: '圣' },
          { word: '聖地', before: '聖' },
          { word: '盆地', before: '盆' },
          { word: '草地', before: '草' },
          { word: '平地', before: '平' },
          { word: '林地', before: '林' },
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
          { word: '夹杂', after: '杂' },
          { word: '夹克', after: '克' },
          { word: '夹衣', after: '衣' },
          { word: '夹道', after: '道' },
          { word: '夹攻', after: '攻' },
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
          { word: '夾雜', after: '雜' },
          { word: '夾克', after: '克' },
          { word: '夾衣', after: '衣' },
          { word: '夾道', after: '道' },
          { word: '夾攻', after: '攻' },
        ],
      },
    ],
  },
  {
    // Shared glyph — contexts cover both scripts
    codepoint: 'U+5F97',
    glyph: '得',
    alternates: [
      {
        ruby: 'de',
        codepoint: 'U+E02D',
        contexts: [
          { word: '觉得', before: '觉' },
          { word: '覺得', before: '覺' },
          { word: '变得', before: '变' },
          { word: '變得', before: '變' },
          { word: '高兴得', before: '兴' },
          { word: '高興得', before: '興' },
          { word: '得很', after: '很' },
          { word: '看得到', before: '看' },
          { word: '听得到', before: '听' },
          { word: '聽得到', before: '聽' },
          { word: '来得及', before: '来', after: '及' },
          { word: '來得及', before: '來' },
          { word: '看得見', after: '見' },
          { word: '看得见', after: '见' },
          { word: '出得去', after: '去' },
          { word: '进得来', after: '来' },
          { word: '進得來', after: '來' },
          { word: '吃得完', after: '完' },
          { word: '做得到', before: '做', after: '到' },
        ],
      },
      {
        ruby: 'děi',
        codepoint: 'U+E02E',
        contexts: [
          { word: '你得', before: '你' },
          { word: '他得', before: '他' },
          { word: '我得', before: '我' },
          { word: '们得', before: '们' },
          { word: '們得', before: '們' },
          { word: '谁得', before: '谁' },
          { word: '誰得', before: '誰' },
          { word: '都得', before: '都' },
          { word: '总得', before: '总' },
          { word: '總得', before: '總' },
          { word: '非得', before: '非' },
          { word: '不得不', before: '不', after: '不' },
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
          { word: '睡着', before: '睡' },
          { word: '着凉', after: '凉' },
          { word: '着火', after: '火' },
          { word: '着急', after: '急' },
          { word: '着迷', after: '迷' },
        ],
      },
      {
        ruby: 'zhāo',
        codepoint: 'U+E030',
        contexts: [
          { word: '一着', before: '一' },
          { word: '着数', after: '数' },
          { word: '着數', after: '數' },
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
          { word: '睡著', before: '睡' },
          { word: '著涼', after: '涼' },
          { word: '著火', after: '火' },
          { word: '著急', after: '急' },
          { word: '著迷', after: '迷' },
        ],
      },
      {
        ruby: 'zhāo',
        codepoint: 'U+E032',
        contexts: [
          { word: '一著', before: '一' },
          { word: '著数', after: '数' },
          { word: '著數', after: '數' },
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
        contexts: [{ word: '参差', after: '差' }],
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
        contexts: [{ word: '參差', after: '差' }],
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

/** Converts a single character to its "U+XXXX" codepoint string. */
export function charToCodepoint(char: string): string {
  return 'U+' + char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')
}

function toMapContext(ctx: PolyphonicContext): PolyphonicMapContext {
  const mapCtx: PolyphonicMapContext = { word: ctx.word }
  if (ctx.before) mapCtx.before = charToCodepoint(ctx.before)
  if (ctx.after) mapCtx.after = charToCodepoint(ctx.after)
  return mapCtx
}

/**
 * Builds the polyphonic-map.json structure, looking up primary ruby values
 * from the main dataset so the map is the single source of truth for consumers.
 * Character-based contexts are converted to "U+XXXX" codepoints here.
 * Entries whose primary codepoint is absent from `mainData` are skipped —
 * intentional for subset builds (e.g. the live tester font).
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
        contexts: contexts.map(toMapContext),
      })),
    }
  }

  return map
}

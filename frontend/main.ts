// Pinyin Typography Lab Main Application Logic
import TextToSVG from 'text-to-svg'
import opentype from 'opentype.js'
import ruby from '../src/ruby.js'
import {
  getAlternateGlyphEntries,
  POLYPHONIC_ENTRIES,
} from '../src/polyphonic.js'

// Interface declarations
interface SyllablePreset {
  hanzi: string
  pinyin: string
  desc: string
}

interface PoemLine {
  hanzi: string
  pinyin: string[]
}

interface PoemPreset {
  title: string
  author: string
  lines: PoemLine[]
}

interface WorshipSlide {
  slideNumber: number
  type: string
  english: string
  lines: {
    hanzi: string
    pinyin: string[]
  }[]
}

// Preset Data
const presetsSyllable: SyllablePreset[] = [
  {
    hanzi: '窗',
    pinyin: 'chuāng',
    desc: '6-letter long horizontal syllable containing medial, nucleus, and nasal coda.',
  },
  {
    hanzi: '双',
    pinyin: 'shuāng',
    desc: 'Complex double-consonant initial with nasal diphthong ending.',
  },
  {
    hanzi: '强',
    pinyin: 'qiáng',
    desc: '5-letter nasal syllable prone to adjacent horizontal collision.',
  },
  {
    hanzi: '绿',
    pinyin: 'lǜ',
    desc: 'Syllable utilizing a high-diacritic umlaut stacking challenge.',
  },
  {
    hanzi: '知',
    pinyin: 'zhī',
    desc: 'Standard short syllable to contrast alongside extended syllables.',
  },
]

const presetsWorship: WorshipSlide[] = [
  {
    slideNumber: 1,
    type: 'Verse 1 - 1/2',
    english: 'Amazing grace! How sweet the sound',
    lines: [
      {
        hanzi: '奇异恩典何等甘甜',
        pinyin: ['qí', 'yì', 'ēn', 'diǎn', 'hé', 'děng', 'gān', 'tián'],
      },
      {
        hanzi: '我罪已得赦免',
        pinyin: ['wǒ', 'zuì', 'yǐ', 'dé', 'shè', 'miǎn'],
      },
    ],
  },
  {
    slideNumber: 2,
    type: 'Verse 1 - 2/2',
    english: 'That saved a wretch like me!',
    lines: [
      {
        hanzi: '前我失丧今被寻回',
        pinyin: ['qián', 'wǒ', 'shī', 'sàng', 'jīn', 'bèi', 'xún', 'huí'],
      },
      {
        hanzi: '瞎眼今得看见',
        pinyin: ['xiā', 'yǎn', 'jīn', 'dé', 'kàn', 'jiàn'],
      },
    ],
  },
  {
    slideNumber: 3,
    type: 'Verse 2 - 1/2',
    english: "'Twas grace that taught my heart to fear,",
    lines: [
      {
        hanzi: '如此恩典使我敬畏',
        pinyin: ['rú', 'cǐ', 'ēn', 'diǎn', 'shǐ', 'wǒ', 'jìng', 'wèi'],
      },
      {
        hanzi: '使我心得安慰',
        pinyin: ['shǐ', 'wǒ', 'xīn', 'dé', 'ān', 'wèi'],
      },
    ],
  },
  {
    slideNumber: 4,
    type: 'Verse 2 - 2/2',
    english: 'And grace my fears relieved;',
    lines: [
      {
        hanzi: '初信之时即蒙恩惠',
        pinyin: ['chū', 'xìn', 'zhī', 'shí', 'jí', 'méng', 'ēn', 'huì'],
      },
      {
        hanzi: '真是何等宝贵',
        pinyin: ['zhēn', 'shì', 'hé', 'děng', 'bǎo', 'guì'],
      },
    ],
  },
  {
    slideNumber: 5,
    type: 'Verse 3 - 1/2',
    english: 'Through many dangers, toils and snares',
    lines: [
      {
        hanzi: '许多危险试炼网罗',
        pinyin: ['xǔ', 'duō', 'wēi', 'xiǎn', 'shì', 'liàn', 'wǎng', 'luó'],
      },
      {
        hanzi: '我已安然经过',
        pinyin: ['wǒ', 'yǐ', 'ān', 'rán', 'jīng', 'guò'],
      },
    ],
  },
  {
    slideNumber: 6,
    type: 'Verse 3 - 2/2',
    english:
      'Grace hath brought me safe thus far, and grace will lead me home.',
    lines: [
      {
        hanzi: '靠主恩典安全不怕',
        pinyin: ['kào', 'zhǔ', 'ēn', 'diǎn', 'ān', 'quán', 'bú', 'pà'],
      },
      {
        hanzi: '更引导我归家',
        pinyin: ['gèng', 'yǐn', 'dǎo', 'wǒ', 'guī', 'jiā'],
      },
    ],
  },
  {
    slideNumber: 7,
    type: 'Verse 4 - 1/2',
    english: 'The Lord has promised good to me,',
    lines: [
      {
        hanzi: '主曾许诺降福于我',
        pinyin: ['zhǔ', 'céng', 'xǔ', 'nuò', 'jiàng', 'fú', 'yú', 'wǒ'],
      },
      {
        hanzi: '祂话是我指望',
        pinyin: ['tā', 'huà', 'shì', 'wǒ', 'zhǐ', 'wàng'],
      },
    ],
  },
  {
    slideNumber: 8,
    type: 'Verse 4 - 2/2',
    english:
      'His word my hope secures; He will my shield and portion be, as long as life endures.',
    lines: [
      {
        hanzi: '祂必作我盾牌产业',
        pinyin: ['tā', 'bì', 'zuò', 'wǒ', 'dùn', 'pái', 'chǎn', 'yè'],
      },
      {
        hanzi: '一生一世永长存',
        pinyin: ['yī', 'shēng', 'yī', 'shì', 'yǒng', 'cháng', 'cún'],
      },
    ],
  },
  {
    slideNumber: 9,
    type: 'Verse 5 - 1/2',
    english: 'Yea, when this flesh and heart shall fail,',
    lines: [
      {
        hanzi: '当我身体灵魂衰竭',
        pinyin: ['dāng', 'wǒ', 'shēn', 'tǐ', 'líng', 'hún', 'shuāi', 'jié'],
      },
      {
        hanzi: '肉身生命停息',
        pinyin: ['ròu', 'shēn', 'shēng', 'mìng', 'tíng', 'xī'],
      },
    ],
  },
  {
    slideNumber: 10,
    type: 'Verse 5 - 2/2',
    english:
      'And mortal life shall cease, I shall possess, within the veil, a life of joy and peace.',
    lines: [
      {
        hanzi: '我必在幔内得产业',
        pinyin: ['wǒ', 'bì', 'zài', 'màn', 'nèi', 'dé', 'chǎn', 'yè'],
      },
      {
        hanzi: '享平安喜乐无已',
        pinyin: ['xiǎng', 'píng', 'ān', 'xǐ', 'lè', 'wú', 'yǐ'],
      },
    ],
  },
  {
    slideNumber: 11,
    type: 'Verse 6 - 1/2',
    english: 'When we’ve been there ten thousand years,',
    lines: [
      {
        hanzi: '将来在那黄金美地',
        pinyin: ['jiāng', 'lái', 'zài', 'nà', 'huáng', 'jīn', 'měi', 'dì'],
      },
      {
        hanzi: '光辉烈日一般',
        pinyin: ['guāng', 'huī', 'liè', 'rì', 'yī', 'bān'],
      },
    ],
  },
  {
    slideNumber: 12,
    type: 'Verse 6 - 2/2',
    english:
      'Bright shining as the sun, we’ve no less days to sing God’s praise, than when we first begun.',
    lines: [
      {
        hanzi: '歌颂赞美主恩万年',
        pinyin: ['gē', 'sòng', 'zàn', 'měi', 'zhǔ', 'ēn', 'wàn', 'nián'],
      },
      {
        hanzi: '不比初信时少',
        pinyin: ['bù', 'bǐ', 'chū', 'xìn', 'shí', 'shǎo'],
      },
    ],
  },
]

const presetsPoem: PoemPreset[] = [
  {
    title: '春晓 (Spring Dawn)',
    author: 'Meng Haoran (孟浩然)',
    lines: [
      { hanzi: '春眠不觉晓', pinyin: ['chūn', 'mián', 'bù', 'jué', 'xiǎo'] },
      { hanzi: '处处闻啼鸟', pinyin: ['chù', 'chù', 'wén', 'tí', 'niǎo'] },
      { hanzi: '夜来风雨声', pinyin: ['yè', 'lái', 'fēng', 'yǔ', 'shēng'] },
      { hanzi: '花落知多少', pinyin: ['huā', 'luò', 'zhī', 'duō', 'shǎo'] },
    ],
  },
  {
    title: '静夜思 (Quiet Night Thought)',
    author: 'Li Bai (李白)',
    lines: [
      {
        hanzi: '床前明月光',
        pinyin: ['chuáng', 'qián', 'míng', 'yuè', 'guāng'],
      },
      { hanzi: '疑是地上霜', pinyin: ['yí', 'shì', 'dì', 'shàng', 'shuāng'] },
      { hanzi: '举头望明月', pinyin: ['jǔ', 'tóu', 'wàng', 'míng', 'yuè'] },
      { hanzi: '低头思故乡', pinyin: ['dī', 'tóu', 'sī', 'gù', 'xiāng'] },
    ],
  },
]

const themesWorship = [
  { id: 'navy', name: 'Deep Ocean Navy', class: 'theme-navy' },
  { id: 'emerald', name: 'Mountain Emerald', class: 'theme-emerald' },
  { id: 'charcoal', name: 'Imperial Indigo', class: 'theme-charcoal' },
  { id: 'sunset', name: 'Autumn Sunset', class: 'theme-sunset' },
]

// Application State
const state = {
  // Glyph Selection
  activeSyllableIndex: 0,
  customHanzi: '',
  customPinyin: '',

  // Layout & Alignment
  placement: 'top', // top | bottom
  pinyinFont: 'droid-sans', // droid-sans | pt-sans-regular | pt-sans-bold
  managerSelectedFont: 'droid-sans',
  showGuides: false,
  characterWidth: 80,

  // Micro-Typography Parameters
  strategy: 'smart', // smart | proportional | global
  verticalOffset: 4, // px
  opticalSqueeze: 65, // %
  fontWeight: 500,
  letterTracking: -0.04, // em
  pinyinSize: 13, // px
  hanziSize: 48, // px

  // Worship Simulator State
  worshipTheme: 'navy',
  worshipRatio: '16:9',
  worshipScale: 1.0,
  worshipSlideIndex: 0,
  worshipSubtitleVisible: true,

  // Textbook State
  activePoemIndex: 0,

  // Tester State
  testerFontSize: 32,
  testerLineHeight: 1.8,
  testerText: `聖哉！聖哉！聖哉！全能大主宰

聖哉，聖哉，聖哉！全能的大主宰！
清晨歡悅歌詠，高聲頌主聖恩；
聖哉，聖哉，聖哉！恩慈永不更改！
榮耀與讚美，歸三一真神！

聖哉，聖哉，聖哉！聖徒虔誠敬拜，
各以華麗金冠，奉獻寶座之前；
千萬天使天軍，謙敬崇拜上主，

聖哉，聖哉，聖哉！主藏在雲彩裡，
罪人焉得瞻望，真主威嚴榮光；
惟耶和華至聖，誰堪與主相比？
力、仁、聖、完備，大哉天地王。

聖哉，聖哉，聖哉！全能的大主宰！
天上地下海中，萬物頌主聖名；
聖哉，聖哉，聖哉！恩慈永不更改！
榮耀與讚美，歸三一真神！`.trim(),
  testerActiveFontFamily: '',

  // View state
  activeTab: 'worship', // worship | textbook | sandbox | tester
  darkMode: true,
  enablePolyphonic: true,
}

// DOM Selectors
const elements = {
  themeToggleBtn: document.getElementById('btn-theme-toggle')!,
  sectionChooseSyllable: document.getElementById('section-choose-syllable')!,
  syllablePresets: document.getElementById('syllable-presets')!,
  inputCustomHanzi: document.getElementById(
    'input-custom-hanzi',
  ) as HTMLInputElement,
  inputCustomPinyin: document.getElementById(
    'input-custom-pinyin',
  ) as HTMLInputElement,

  placementControl: document.getElementById('placement-control')!,
  pinyinFontSelect: document.getElementById(
    'pinyin-font-select',
  ) as HTMLSelectElement,
  pinyinUploadZone: document.getElementById('pinyin-upload-zone')!,
  pinyinFileInput: document.getElementById(
    'pinyin-file-input',
  ) as HTMLInputElement,
  auditSummaryBadge: document.getElementById('audit-summary-badge')!,
  auditGlyphGrid: document.getElementById('audit-glyph-grid')!,
  btnPatchPinyin: document.getElementById(
    'btn-patch-pinyin',
  ) as HTMLButtonElement,
  btnDeletePinyin: document.getElementById(
    'btn-delete-pinyin',
  ) as HTMLButtonElement,
  pinyinStatusBox: document.getElementById('pinyin-status-box')!,
  pinyinPatchLogs: document.getElementById('pinyin-patch-logs')!,
  managerFontSelect: document.getElementById(
    'manager-font-select',
  ) as HTMLSelectElement,
  btnUsePinyin: document.getElementById('btn-use-pinyin') as HTMLButtonElement,
  pinyinManagerPreview: document.getElementById('pinyin-manager-preview')!,
  toggleGuides: document.getElementById('toggle-guides') as HTMLInputElement,
  rangeCharacterWidth: document.getElementById(
    'range-character-width',
  ) as HTMLInputElement,
  valCharacterWidth: document.getElementById('val-character-width')!,
  btnResetControls: document.getElementById('btn-reset-controls')!,

  strategyControl: document.getElementById('strategy-control')!,
  rangeVerticalOffset: document.getElementById(
    'range-vertical-offset',
  ) as HTMLInputElement,
  valVerticalOffset: document.getElementById('val-vertical-offset')!,
  rangeOpticalSqueeze: document.getElementById(
    'range-optical-squeeze',
  ) as HTMLInputElement,
  valOpticalSqueeze: document.getElementById('val-optical-squeeze')!,
  rangeStrokeWeight: document.getElementById(
    'range-stroke-weight',
  ) as HTMLInputElement,
  valStrokeWeight: document.getElementById('val-stroke-weight')!,
  rangeLetterTracking: document.getElementById(
    'range-letter-tracking',
  ) as HTMLInputElement,
  valLetterTracking: document.getElementById('val-letter-tracking')!,

  rangePinyinSize: document.getElementById(
    'range-pinyin-size',
  ) as HTMLInputElement,
  valPinyinSize: document.getElementById('val-pinyin-size')!,
  rangeHanziSize: document.getElementById(
    'range-hanzi-size',
  ) as HTMLInputElement,
  valHanziSize: document.getElementById('val-hanzi-size')!,

  viewTabs: document.querySelectorAll('.view-tabs .tab-btn'),
  tabPanes: document.querySelectorAll('.tab-pane'),

  // Worship Selectors
  worshipThemeSelect: document.getElementById(
    'worship-theme-select',
  ) as HTMLSelectElement,
  btnWorshipRatio: document.getElementById('btn-worship-ratio')!,
  btnPresent: document.getElementById('btn-present')!,
  worshipViewport: document.getElementById('worship-viewport')!,
  worshipSlideContent: document.getElementById('worship-slide-content')!,
  worshipSlideEnglish: document.getElementById('worship-slide-english')!,
  btnPrevSlide: document.getElementById('btn-prev-slide')!,
  btnNextSlide: document.getElementById('btn-next-slide')!,
  worshipSlideDots: document.getElementById('worship-slide-dots')!,
  currentSlideNum: document.getElementById('current-slide-num')!,
  totalSlideNum: document.getElementById('total-slide-num')!,
  rangeWorshipScale: document.getElementById(
    'range-worship-scale',
  ) as HTMLInputElement,
  valWorshipScale: document.getElementById('val-worship-scale')!,
  btnToggleSubtitle: document.getElementById('btn-toggle-subtitle')!,
  activeStrategyLabel: document.getElementById('active-strategy-label')!,

  // Textbook Selectors
  textbookBookSelector: document.getElementById('textbook-book-selector')!,
  textbookPoemTitle: document.getElementById('textbook-poem-title')!,
  textbookPoemAuthor: document.getElementById('textbook-poem-author')!,
  textbookContent: document.getElementById('textbook-content')!,
  metricGuardText: document.getElementById('metric-guard-text')!,
  metricGuardBadge: document.getElementById('metric-guard-badge')!,

  // Vector Sandbox Selectors
  svgPreviewContainer: document.getElementById('svg-preview-container')!,
  fontLoadingBanner: document.getElementById('font-loading-banner')!,
  codeConfigOutput: document.getElementById(
    'code-config-output',
  ) as HTMLElement | null,
  btnCopyConfig: document.getElementById(
    'btn-copy-config',
  ) as HTMLElement | null,
  btnExportSVG: document.getElementById('btn-export-svg')!,

  // Presentation Overlay Selectors
  presentationOverlay: document.getElementById('presentation-overlay')!,
  presentationContent: document.getElementById('presentation-content')!,
  btnExitPresentation: document.getElementById('btn-exit-presentation')!,

  // Build and Download Selectors
  btnBuildFont: document.getElementById('btn-build-font')!,
  togglePolyphonic: document.getElementById(
    'toggle-polyphonic',
  ) as HTMLInputElement,
  inputFontName: document.getElementById('input-font-name') as HTMLInputElement,
  buildStatusContainer: document.getElementById('build-status-container')!,
  buildStatusBadge: document.getElementById('build-status-badge')!,
  buildStatusTime: document.getElementById('build-status-time')!,
  buildLogs: document.getElementById('build-logs')!,
  buildDownloadLinks: document.getElementById('build-download-links')!,
  linkDownloadTtf: document.getElementById(
    'link-download-ttf',
  ) as HTMLAnchorElement,
  linkDownloadWoff2: document.getElementById(
    'link-download-woff2',
  ) as HTMLAnchorElement,

  // Tester Selectors
  testerFontStatus: document.getElementById('tester-font-status')!,
  testerFontSelect: document.getElementById(
    'tester-font-select',
  ) as HTMLSelectElement,
  testerFontSelectorGroup: document.getElementById(
    'tester-font-selector-group',
  )!,
  rangeTesterFontSize: document.getElementById(
    'range-tester-font-size',
  ) as HTMLInputElement,
  valTesterFontSize: document.getElementById('val-tester-font-size')!,
  rangeTesterLineHeight: document.getElementById(
    'range-tester-line-height',
  ) as HTMLInputElement,
  valTesterLineHeight: document.getElementById('val-tester-line-height')!,
  testerTextInput: document.getElementById(
    'tester-text-input',
  ) as HTMLTextAreaElement,
}

// Start Initialize

function saveStateToUrl() {
  const params = new URLSearchParams()
  params.set('placement', state.placement)
  params.set('pinyinFont', state.pinyinFont)
  params.set('showGuides', state.showGuides ? '1' : '0')
  params.set('characterWidth', state.characterWidth.toString())
  params.set('strategy', state.strategy)
  params.set('verticalOffset', state.verticalOffset.toString())
  params.set('opticalSqueeze', state.opticalSqueeze.toString())
  params.set('fontWeight', state.fontWeight.toString())
  params.set('letterTracking', state.letterTracking.toFixed(3))
  params.set('pinyinSize', state.pinyinSize.toString())
  params.set('hanziSize', state.hanziSize.toString())
  params.set('activeTab', state.activeTab)
  params.set('enablePolyphonic', state.enablePolyphonic ? '1' : '0')
  params.set('worshipTheme', state.worshipTheme)
  params.set('worshipRatio', state.worshipRatio)
  params.set('worshipScale', state.worshipScale.toFixed(2))
  params.set('worshipSlideIndex', state.worshipSlideIndex.toString())
  params.set('worshipSubtitleVisible', state.worshipSubtitleVisible ? '1' : '0')

  params.set('activeSyllableIndex', state.activeSyllableIndex.toString())
  if (state.customHanzi) params.set('customHanzi', state.customHanzi)
  if (state.customPinyin) params.set('customPinyin', state.customPinyin)

  params.set('testerFontSize', state.testerFontSize.toString())
  params.set('testerLineHeight', state.testerLineHeight.toString())
  params.set('testerText', state.testerText)

  const newUrl = `${window.location.pathname}?${params.toString()}${window.location.hash}`
  window.history.replaceState({}, '', newUrl)
}

function loadStateFromUrl() {
  const params = new URLSearchParams(window.location.search)

  if (params.has('placement')) state.placement = params.get('placement')!
  if (params.has('pinyinFont')) state.pinyinFont = params.get('pinyinFont')!
  if (params.has('showGuides'))
    state.showGuides = params.get('showGuides') === '1'
  if (params.has('characterWidth'))
    state.characterWidth = parseInt(params.get('characterWidth')!, 10)
  if (params.has('strategy')) state.strategy = params.get('strategy')!
  if (params.has('verticalOffset'))
    state.verticalOffset = parseInt(params.get('verticalOffset')!, 10)
  if (params.has('opticalSqueeze'))
    state.opticalSqueeze = parseInt(params.get('opticalSqueeze')!, 10)
  if (params.has('fontWeight'))
    state.fontWeight = parseInt(params.get('fontWeight')!, 10)
  if (params.has('letterTracking'))
    state.letterTracking = parseFloat(params.get('letterTracking')!)
  if (params.has('pinyinSize'))
    state.pinyinSize = parseInt(params.get('pinyinSize')!, 10)
  if (params.has('hanziSize'))
    state.hanziSize = parseInt(params.get('hanziSize')!, 10)
  if (params.has('activeTab')) state.activeTab = params.get('activeTab')!
  if (params.has('enablePolyphonic'))
    state.enablePolyphonic = params.get('enablePolyphonic') === '1'

  if (params.has('worshipTheme'))
    state.worshipTheme = params.get('worshipTheme')!
  if (params.has('worshipRatio'))
    state.worshipRatio = params.get('worshipRatio')!
  if (params.has('worshipScale'))
    state.worshipScale = parseFloat(params.get('worshipScale')!)
  if (params.has('worshipSlideIndex'))
    state.worshipSlideIndex = parseInt(params.get('worshipSlideIndex')!, 10)
  if (params.has('worshipSubtitleVisible'))
    state.worshipSubtitleVisible = params.get('worshipSubtitleVisible') === '1'

  if (params.has('activeSyllableIndex'))
    state.activeSyllableIndex = parseInt(params.get('activeSyllableIndex')!, 10)
  if (params.has('customHanzi')) state.customHanzi = params.get('customHanzi')!
  if (params.has('customPinyin'))
    state.customPinyin = params.get('customPinyin')!

  if (params.has('testerFontSize'))
    state.testerFontSize = parseInt(params.get('testerFontSize')!, 10)
  if (params.has('testerLineHeight'))
    state.testerLineHeight = parseFloat(params.get('testerLineHeight')!)
  if (params.has('testerText')) state.testerText = params.get('testerText')!
}

function syncUIFromState() {
  // Range sliders
  elements.rangeVerticalOffset.value = state.verticalOffset.toString()
  elements.rangeOpticalSqueeze.value = state.opticalSqueeze.toString()
  elements.rangeCharacterWidth.value = state.characterWidth.toString()
  elements.rangeStrokeWeight.value = state.fontWeight.toString()
  elements.rangeLetterTracking.value = state.letterTracking.toString()
  elements.rangePinyinSize.value = state.pinyinSize.toString()
  elements.rangeHanziSize.value = state.hanziSize.toString()
  elements.rangeWorshipScale.value = state.worshipScale.toString()

  // Labels text content
  elements.valVerticalOffset.textContent = `${state.verticalOffset}px`
  elements.valOpticalSqueeze.textContent = `${state.opticalSqueeze}%`
  elements.valCharacterWidth.textContent = `${state.characterWidth}px`
  elements.valStrokeWeight.textContent = `${state.fontWeight}`
  elements.valLetterTracking.textContent = `${state.letterTracking.toFixed(3)}em`
  elements.valPinyinSize.textContent = `${state.pinyinSize}px`
  elements.valHanziSize.textContent = `${state.hanziSize}px`
  elements.valWorshipScale.textContent = `${Math.round(state.worshipScale * 100)}%`

  // Checkbox
  elements.toggleGuides.checked = state.showGuides
  elements.togglePolyphonic.checked = state.enablePolyphonic

  // Custom text inputs
  elements.inputCustomHanzi.value = state.customHanzi
  elements.inputCustomPinyin.value = state.customPinyin

  // Placement segmented control
  document.querySelectorAll('#placement-control .segment-btn').forEach((b) => {
    b.classList.toggle(
      'active',
      b.getAttribute('data-placement') === state.placement,
    )
  })

  // Pinyin Font select
  if (elements.pinyinFontSelect) {
    elements.pinyinFontSelect.value = state.pinyinFont
  }

  // Strategy segmented control
  document.querySelectorAll('#strategy-control .segment-btn').forEach((b) => {
    b.classList.toggle(
      'active',
      b.getAttribute('data-strategy') === state.strategy,
    )
  })

  // View Tab active buttons
  elements.viewTabs.forEach((btn) => {
    const tabName = (btn as HTMLElement).dataset.tab
    btn.classList.toggle('active', tabName === state.activeTab)
  })
  elements.tabPanes.forEach((pane) => {
    pane.classList.toggle('active', pane.id === `pane-${state.activeTab}`)
  })

  // Select dropdowns
  elements.worshipThemeSelect.value = state.worshipTheme
  elements.btnWorshipRatio.textContent = state.worshipRatio
  elements.btnToggleSubtitle.textContent = state.worshipSubtitleVisible
    ? 'VISIBLE'
    : 'MUTED'
  elements.btnToggleSubtitle.className = `btn btn-small ${state.worshipSubtitleVisible ? 'btn-primary' : 'btn-secondary'}`

  // Tester UI Sync
  elements.rangeTesterFontSize.value = state.testerFontSize.toString()
  elements.valTesterFontSize.textContent = `${state.testerFontSize}px`
  elements.rangeTesterLineHeight.value = state.testerLineHeight.toString()
  elements.valTesterLineHeight.textContent = state.testerLineHeight.toString()
  elements.testerTextInput.value = state.testerText
  if (state.testerActiveFontFamily) {
    elements.testerTextInput.style.fontFamily = `'${state.testerActiveFontFamily}', sans-serif`
    elements.testerFontStatus.className = 'badge badge-success'
    elements.testerFontStatus.textContent = `Active: ${state.testerActiveFontFamily}`
  } else {
    elements.testerTextInput.style.fontFamily = 'var(--font-serif)'
    elements.testerFontStatus.className = 'badge badge-warning'
    elements.testerFontStatus.textContent = 'No Font Loaded'
  }
}

// --- Pinyin Font Settings Management ---
const PINYIN_REQUIRED_CHARS = [
  'ā',
  'á',
  'ǎ',
  'à',
  'ē',
  'é',
  'ě',
  'è',
  'ī',
  'í',
  'ǐ',
  'ì',
  'ō',
  'ó',
  'ǒ',
  'ò',
  'ū',
  'ú',
  'ǔ',
  'ù',
  'ü',
  'ǖ',
  'ǘ',
  'ǚ',
  'ǜ',
]

function auditFontCoverage(font: opentype.Font): {
  present: string[]
  missing: string[]
} {
  const present: string[] = []
  const missing: string[] = []
  for (const char of PINYIN_REQUIRED_CHARS) {
    const glyph = font.charToGlyph(char)
    if (glyph && glyph.index > 0) {
      present.push(char)
    } else {
      missing.push(char)
    }
  }
  return { present, missing }
}

function clearPinyinLogs() {
  elements.pinyinPatchLogs.textContent = ''
  elements.pinyinStatusBox.style.display = 'block'
}

function showPinyinStatus(msg: string, showSpinner: boolean) {
  if (msg) {
    elements.pinyinStatusBox.style.display = 'block'
    elements.pinyinPatchLogs.textContent += msg + '\n'
    elements.pinyinPatchLogs.scrollTop = elements.pinyinPatchLogs.scrollHeight
    const spinner = elements.pinyinStatusBox.querySelector(
      '.status-spinner',
    ) as HTMLElement
    if (spinner) {
      spinner.style.display = showSpinner ? 'inline-block' : 'none'
    }
  } else {
    elements.pinyinStatusBox.style.display = 'none'
    elements.pinyinPatchLogs.textContent = ''
  }
}

async function refreshPinyinFontsDropdown(selectedName?: string) {
  try {
    const { listPinyinFonts } = await import('./db.js')
    const customFonts = await listPinyinFonts()

    elements.pinyinFontSelect.innerHTML = ''
    elements.managerFontSelect.innerHTML = ''

    const systemFonts = [
      { value: 'droid-sans', text: 'Droid Sans (System)' },
      { value: 'pt-sans-regular', text: 'PT Sans Regular (System)' },
      { value: 'pt-sans-bold', text: 'PT Sans Bold (System)' },
    ]

    systemFonts.forEach((f) => {
      const opt = document.createElement('option')
      opt.value = f.value
      opt.textContent = f.text
      elements.pinyinFontSelect.appendChild(opt)

      const optM = document.createElement('option')
      optM.value = f.value
      optM.textContent = f.text
      elements.managerFontSelect.appendChild(optM)
    })

    customFonts.forEach((f) => {
      const opt = document.createElement('option')
      opt.value = f.name
      opt.textContent = `${f.displayName}${f.isPatched ? ' (Patched)' : ''}`
      elements.pinyinFontSelect.appendChild(opt)

      const optM = document.createElement('option')
      optM.value = f.name
      optM.textContent = `${f.displayName}${f.isPatched ? ' (Patched)' : ''}`
      elements.managerFontSelect.appendChild(optM)
    })

    const target = state.pinyinFont || 'droid-sans'
    elements.pinyinFontSelect.value = target

    const managedTarget =
      selectedName || state.managerSelectedFont || 'droid-sans'
    elements.managerFontSelect.value = managedTarget
    state.managerSelectedFont = managedTarget

    await auditActivePinyinFont()
  } catch (err) {
    console.error('Failed to refresh pinyin fonts list:', err)
  }
}

async function auditActivePinyinFont() {
  try {
    const fontKey = state.managerSelectedFont
    const engine = await getAnnotationFontEngine(fontKey)
    const font = engine.font
    const { present, missing } = auditFontCoverage(font)

    elements.auditSummaryBadge.textContent = `${missing.length}/${PINYIN_REQUIRED_CHARS.length} Missing`
    if (missing.length === 0) {
      elements.auditSummaryBadge.className = 'badge badge-success'
      elements.btnPatchPinyin.disabled = true
    } else {
      elements.auditSummaryBadge.className = 'badge badge-danger'
      const isSystem = [
        'droid-sans',
        'pt-sans-regular',
        'pt-sans-bold',
      ].includes(fontKey)
      elements.btnPatchPinyin.disabled = isSystem
    }

    const isSystem = ['droid-sans', 'pt-sans-regular', 'pt-sans-bold'].includes(
      fontKey,
    )
    elements.btnDeletePinyin.disabled = isSystem

    elements.btnUsePinyin.disabled = state.pinyinFont === fontKey

    elements.auditGlyphGrid.innerHTML = ''
    PINYIN_REQUIRED_CHARS.forEach((char) => {
      const badge = document.createElement('span')
      badge.textContent = char
      const isPresent = present.includes(char)
      badge.className = `audit-badge ${isPresent ? 'present' : 'missing'}`
      badge.title = isPresent ? `${char} is present` : `${char} is missing!`
      elements.auditGlyphGrid.appendChild(badge)
    })

    elements.pinyinManagerPreview.innerHTML = ''
    const previewString =
      'ā á ǎ à  ē é ě è  ī í ǐ ì  ō ó ǒ ò  ū ú ǔ ù  ü ǖ ǘ ǚ ǜ'
    for (const char of previewString) {
      if (char === ' ') {
        elements.pinyinManagerPreview.appendChild(document.createTextNode(' '))
      } else {
        const span = document.createElement('span')
        if (missing.includes(char)) {
          span.className = 'preview-char missing'
          span.textContent = '☒'
          span.title = `${char} is missing!`
        } else {
          span.className = 'preview-char'
          span.textContent = char
        }
        elements.pinyinManagerPreview.appendChild(span)
      }
    }

    try {
      const fontName = `manager-${fontKey}`
      let fontBuffer: ArrayBuffer
      if (isSystem) {
        let filename = 'DroidSansFallbackFull.ttf'
        if (fontKey === 'pt-sans-regular') {
          filename = 'PT_Sans-Narrow-Web-Regular.ttf'
        } else if (fontKey === 'pt-sans-bold') {
          filename = 'PT_Sans-Narrow-Web-Bold.ttf'
        }
        const res = await fetch(`./resources/fonts/${filename}?v=2.0.0`)
        if (!res.ok) throw new Error('Failed to load system font file')
        fontBuffer = await res.arrayBuffer()
      } else {
        const { getPinyinFont } = await import('./db.js')
        const fontEntry = await getPinyinFont(fontKey)
        if (!fontEntry) throw new Error('Font entry not found')
        fontBuffer = fontEntry.ttf.buffer.slice(
          fontEntry.ttf.byteOffset,
          fontEntry.ttf.byteOffset + fontEntry.ttf.byteLength,
        )
      }
      const fontFace = new FontFace(fontName, fontBuffer)
      await fontFace.load()
      document.fonts.add(fontFace)
      elements.pinyinManagerPreview.style.fontFamily = `'${fontName}', sans-serif`
    } catch (err) {
      console.error('Failed to load preview FontFace:', err)
      elements.pinyinManagerPreview.style.fontFamily = 'var(--font-sans)'
    }
  } catch (err) {
    console.error('Audit failed:', err)
  }
}

async function handlePinyinFontUpload(file: File) {
  try {
    showPinyinStatus('Reading font file...', true)
    const buffer = await file.arrayBuffer()
    const font = opentype.parse(buffer)

    const displayName =
      font.names.fontFamily?.en || file.name.replace(/\.[^/.]+$/, '')
    const name = file.name.replace(/\.[^/.]+$/, '').replace(/\s+/g, '-')

    const { savePinyinFont } = await import('./db.js')
    await savePinyinFont({
      name,
      displayName,
      ttf: new Uint8Array(buffer),
      isSystem: false,
      isPatched: false,
      timestamp: Date.now(),
    })

    showPinyinStatus('Font uploaded successfully!', false)
    setTimeout(() => showPinyinStatus('', false), 3000)

    // Select and load uploaded font in the manager tab
    state.managerSelectedFont = name
    await refreshPinyinFontsDropdown(name)
    updateUI()
  } catch (err: any) {
    console.error('Font upload failed:', err)
    showPinyinStatus(`Upload failed: ${err.message}`, false)
  }
}

function setupPinyinFontEvents() {
  const zone = elements.pinyinUploadZone
  const fileInput = elements.pinyinFileInput

  zone.addEventListener('click', () => fileInput.click())

  fileInput.addEventListener('change', () => {
    const files = fileInput.files
    if (files && files.length > 0) {
      handlePinyinFontUpload(files[0])
    }
  })

  zone.addEventListener('dragover', (e) => {
    e.preventDefault()
    zone.classList.add('dragover')
  })

  zone.addEventListener('dragleave', () => {
    zone.classList.remove('dragover')
  })

  zone.addEventListener('drop', (e) => {
    e.preventDefault()
    zone.classList.remove('dragover')
    const files = e.dataTransfer?.files
    if (files && files.length > 0 && files[0].name.endsWith('.ttf')) {
      handlePinyinFontUpload(files[0])
    }
  })

  elements.managerFontSelect.addEventListener('change', () => {
    state.managerSelectedFont = elements.managerFontSelect.value
    auditActivePinyinFont()
  })

  elements.btnUsePinyin.addEventListener('click', () => {
    const name = state.managerSelectedFont
    state.pinyinFont = name
    elements.pinyinFontSelect.value = name
    elements.btnUsePinyin.disabled = true
    updateUI()
  })

  elements.btnDeletePinyin.addEventListener('click', async () => {
    const name = state.managerSelectedFont
    if (['droid-sans', 'pt-sans-regular', 'pt-sans-bold'].includes(name)) return

    if (
      confirm(
        `Are you sure you want to delete the custom pinyin font "${name}"?`,
      )
    ) {
      try {
        const { deletePinyinFont } = await import('./db.js')
        await deletePinyinFont(name)
        if (annotationFontEngines[name]) {
          delete annotationFontEngines[name]
        }
        if (state.pinyinFont === name) {
          state.pinyinFont = 'droid-sans'
          elements.pinyinFontSelect.value = 'droid-sans'
        }
        state.managerSelectedFont = 'droid-sans'
        await refreshPinyinFontsDropdown('droid-sans')
        updateUI()
      } catch (err) {
        console.error('Failed to delete font:', err)
      }
    }
  })

  elements.btnPatchPinyin.addEventListener('click', async () => {
    const fontKey = state.managerSelectedFont
    if (['droid-sans', 'pt-sans-regular', 'pt-sans-bold'].includes(fontKey))
      return

    try {
      clearPinyinLogs()
      showPinyinStatus('Locating missing glyphs...', true)
      const { getPinyinFont, savePinyinFont } = await import('./db.js')
      const fontEntry = await getPinyinFont(fontKey)
      if (!fontEntry) throw new Error('Selected font not found in database.')

      const engine = await getAnnotationFontEngine(fontKey)
      const { missing } = auditFontCoverage(engine.font)
      if (missing.length === 0) {
        showPinyinStatus('Font already has all required glyphs.', false)
        return
      }

      showPinyinStatus('Fetching source Droid Sans Fallback...', true)
      const res = await fetch('./resources/fonts/DroidSansFallbackFull.ttf')
      if (!res.ok) throw new Error('Failed to load DroidSansFallbackFull.ttf')
      const srcBuffer = await res.arrayBuffer()
      const srcBytes = new Uint8Array(srcBuffer)

      showPinyinStatus('Patching missing characters in browser...', true)
      const { patchFontInBrowser } = await import('./compiler.js')
      const patchedBytes = await patchFontInBrowser(
        fontEntry.ttf,
        srcBytes,
        missing,
        (msg) => {
          showPinyinStatus(msg.trim(), true)
        },
      )

      showPinyinStatus('Saving patched font...', true)
      await savePinyinFont({
        name: fontEntry.name,
        displayName: fontEntry.displayName,
        ttf: patchedBytes,
        isSystem: false,
        isPatched: true,
        timestamp: Date.now(),
      })

      if (annotationFontEngines[fontKey]) {
        delete annotationFontEngines[fontKey]
      }

      showPinyinStatus('Font successfully patched!', false)
      setTimeout(() => showPinyinStatus('', false), 3000)

      await refreshPinyinFontsDropdown(fontKey)
      if (state.pinyinFont === fontKey) {
        updateUI()
      }
    } catch (err: any) {
      console.error('Patch failed:', err)
      showPinyinStatus(`Patch failed: ${err.message}`, false)
    }
  })
}

function init() {
  setupTheme()
  setupPresets()
  setupEventListeners()
  setupPinyinFontEvents()
  loadLocalFont()
  loadStateFromUrl()
  syncUIFromState()
  refreshPinyinFontsDropdown()
  fetchAndPopulateFonts()
  updateUI()
}

// Set up App Color Theme
function applyTheme() {
  if (state.darkMode) {
    document.documentElement.classList.remove('light-mode')
    elements.themeToggleBtn.innerHTML = '<i class="fa-solid fa-sun"></i>'
    elements.themeToggleBtn.title = 'Switch to Light Mode'
  } else {
    document.documentElement.classList.add('light-mode')
    elements.themeToggleBtn.innerHTML = '<i class="fa-solid fa-moon"></i>'
    elements.themeToggleBtn.title = 'Switch to Dark Mode'
  }
  localStorage.setItem('theme', state.darkMode ? 'dark' : 'light')
}

function setupTheme() {
  const savedTheme = localStorage.getItem('theme')
  if (savedTheme) {
    state.darkMode = savedTheme === 'dark'
  } else {
    state.darkMode = !window.matchMedia('(prefers-color-scheme: light)').matches
  }

  applyTheme()

  elements.themeToggleBtn.addEventListener('click', () => {
    state.darkMode = !state.darkMode
    applyTheme()
  })

  window
    .matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', (e) => {
      if (!localStorage.getItem('theme')) {
        state.darkMode = e.matches
        applyTheme()
      }
    })
}

// Generate preset buttons dynamically
function setupPresets() {
  // Single Syllables
  elements.syllablePresets.innerHTML = ''
  presetsSyllable.forEach((preset, idx) => {
    const btn = document.createElement('button')
    btn.className = `preset-btn ${idx === state.activeSyllableIndex ? 'active' : ''}`
    btn.innerHTML = `
      <span class="preset-pinyin">${preset.pinyin}</span>
      <span class="preset-hanzi">${preset.hanzi}</span>
    `
    btn.addEventListener('click', () => {
      state.activeSyllableIndex = idx
      state.customHanzi = ''
      state.customPinyin = ''
      elements.inputCustomHanzi.value = ''
      elements.inputCustomPinyin.value = ''

      // Select preset button active state
      document.querySelectorAll('.preset-btn').forEach((b, i) => {
        b.classList.toggle('active', i === idx)
      })
      updateUI()
    })
    elements.syllablePresets.appendChild(btn)
  })

  // Worship Themes Select dropdown
  elements.worshipThemeSelect.innerHTML = ''
  themesWorship.forEach((theme) => {
    const option = document.createElement('option')
    option.value = theme.id
    option.textContent = theme.name
    elements.worshipThemeSelect.appendChild(option)
  })

  // Textbook Book buttons
  elements.textbookBookSelector.innerHTML = ''
  presetsPoem.forEach((poem, idx) => {
    const btn = document.createElement('button')
    btn.className = `btn btn-small ${idx === state.activePoemIndex ? 'btn-primary' : 'btn-secondary'}`
    btn.textContent = poem.title.split(' ')[0]
    btn.addEventListener('click', () => {
      state.activePoemIndex = idx
      document
        .querySelectorAll('#textbook-book-selector button')
        .forEach((b, i) => {
          b.className = `btn btn-small ${i === idx ? 'btn-primary' : 'btn-secondary'}`
        })
      updateUI()
    })
    elements.textbookBookSelector.appendChild(btn)
  })
}

// Add All Event Listeners for State changes
function setupEventListeners() {
  // Custom Inputs
  elements.inputCustomHanzi.addEventListener('input', (e) => {
    state.customHanzi = (e.target as HTMLInputElement).value
    state.activeSyllableIndex = -1
    document
      .querySelectorAll('.preset-btn')
      .forEach((b) => b.classList.remove('active'))
    updateUI()
  })
  elements.inputCustomPinyin.addEventListener('input', (e) => {
    state.customPinyin = (e.target as HTMLInputElement).value
    state.activeSyllableIndex = -1
    document
      .querySelectorAll('.preset-btn')
      .forEach((b) => b.classList.remove('active'))
    updateUI()
  })

  // Layout Controls
  elements.placementControl.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('button')
    if (!btn) return
    state.placement = btn.dataset.placement || 'top'
    document
      .querySelectorAll('#placement-control .segment-btn')
      .forEach((b) => {
        b.classList.toggle('active', b === btn)
      })
    updateUI()
  })

  elements.pinyinFontSelect.addEventListener('change', () => {
    state.pinyinFont = elements.pinyinFontSelect.value
    auditActivePinyinFont()
    updateUI()
  })

  elements.toggleGuides.addEventListener('change', (e) => {
    state.showGuides = (e.target as HTMLInputElement).checked
    updateUI()
  })

  elements.togglePolyphonic.addEventListener('change', (e) => {
    state.enablePolyphonic = (e.target as HTMLInputElement).checked
    updateUI()
  })

  // Micro-Typography Controls
  elements.strategyControl.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('button')
    if (!btn) return
    state.strategy = btn.dataset.strategy || 'smart'
    document.querySelectorAll('#strategy-control .segment-btn').forEach((b) => {
      b.classList.toggle('active', b === btn)
    })
    updateUI()
  })

  // Range Slider values updates
  const bindSlider = (
    inputEl: HTMLInputElement,
    valueEl: HTMLElement,
    stateKey: string,
    formatter: (v: number) => string,
    isFloat = false,
  ) => {
    inputEl.addEventListener('input', () => {
      const val = isFloat ? parseFloat(inputEl.value) : parseInt(inputEl.value)
      ;(state as any)[stateKey] = val
      valueEl.textContent = formatter(val)
      updateUI()
    })
  }

  bindSlider(
    elements.rangeCharacterWidth,
    elements.valCharacterWidth,
    'characterWidth',
    (v) => `${v}px`,
  )
  bindSlider(
    elements.rangeVerticalOffset,
    elements.valVerticalOffset,
    'verticalOffset',
    (v) => `${v}px`,
  )
  bindSlider(
    elements.rangeOpticalSqueeze,
    elements.valOpticalSqueeze,
    'opticalSqueeze',
    (v) => `${v}%`,
  )
  bindSlider(
    elements.rangeStrokeWeight,
    elements.valStrokeWeight,
    'fontWeight',
    (v) => {
      if (v <= 150) return `${v} (Thin)`
      if (v <= 250) return `${v} (Extra Light)`
      if (v <= 350) return `${v} (Light)`
      if (v <= 450) return `${v} (Regular)`
      if (v <= 550) return `${v} (Medium)`
      if (v <= 650) return `${v} (Semibold)`
      if (v <= 750) return `${v} (Bold)`
      if (v <= 850) return `${v} (Extra Bold)`
      return `${v} (Black)`
    },
  )
  bindSlider(
    elements.rangeLetterTracking,
    elements.valLetterTracking,
    'letterTracking',
    (v) => `${v.toFixed(3)}em`,
    true,
  )
  bindSlider(
    elements.rangePinyinSize,
    elements.valPinyinSize,
    'pinyinSize',
    (v) => `${v}px`,
  )
  bindSlider(
    elements.rangeHanziSize,
    elements.valHanziSize,
    'hanziSize',
    (v) => `${v}px`,
  )

  // Reset controls
  elements.btnResetControls.addEventListener('click', () => {
    state.verticalOffset = 4
    state.opticalSqueeze = 65
    state.fontWeight = 500
    state.letterTracking = -0.04
    state.pinyinSize = 13
    state.hanziSize = 48
    state.strategy = 'smart'
    state.characterWidth = 80

    // Update Slider inputs elements values
    elements.rangeVerticalOffset.value = '4'
    elements.valVerticalOffset.textContent = '4px'
    elements.rangeOpticalSqueeze.value = '65'
    elements.valOpticalSqueeze.textContent = '65%'
    elements.rangeStrokeWeight.value = '500'
    elements.valStrokeWeight.textContent = '500 (Medium)'
    elements.rangeLetterTracking.value = '-0.04'
    elements.valLetterTracking.textContent = '-0.040em'
    elements.rangePinyinSize.value = '13'
    elements.valPinyinSize.textContent = '13px'
    elements.rangeHanziSize.value = '48'
    elements.valHanziSize.textContent = '48px'
    elements.rangeCharacterWidth.value = '80'
    elements.valCharacterWidth.textContent = '80px'

    // Set strategy controls active classes
    document.querySelectorAll('#strategy-control .segment-btn').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-strategy') === 'smart')
    })

    updateUI()
  })

  // Tab switcher
  elements.viewTabs.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tabName = (btn as HTMLElement).dataset.tab || 'worship'
      state.activeTab = tabName
      elements.viewTabs.forEach((b) => b.classList.toggle('active', b === btn))
      elements.tabPanes.forEach((pane) => {
        pane.classList.toggle('active', pane.id === `pane-${tabName}`)
      })
      updateUI()
    })
  })

  // Worship Actions
  elements.worshipThemeSelect.addEventListener('change', (e) => {
    state.worshipTheme = (e.target as HTMLSelectElement).value
    updateUI()
  })

  elements.btnWorshipRatio.addEventListener('click', () => {
    state.worshipRatio = state.worshipRatio === '16:9' ? '4:3' : '16:9'
    elements.btnWorshipRatio.textContent = state.worshipRatio
    updateUI()
  })

  // Worship Scale Slider
  elements.rangeWorshipScale.addEventListener('input', () => {
    const val = parseFloat(elements.rangeWorshipScale.value)
    state.worshipScale = val
    elements.valWorshipScale.textContent = `${Math.round(val * 100)}%`
    updateUI()
  })

  // Subtitle Toggle
  elements.btnToggleSubtitle.addEventListener('click', () => {
    state.worshipSubtitleVisible = !state.worshipSubtitleVisible
    elements.btnToggleSubtitle.textContent = state.worshipSubtitleVisible
      ? 'VISIBLE'
      : 'MUTED'
    elements.btnToggleSubtitle.className = `btn btn-small ${state.worshipSubtitleVisible ? 'btn-primary' : 'btn-secondary'}`
    updateUI()
  })

  // Slide navigation
  elements.btnPrevSlide.addEventListener('click', () => {
    state.worshipSlideIndex =
      (state.worshipSlideIndex - 1 + presetsWorship.length) %
      presetsWorship.length
    updateUI()
  })
  elements.btnNextSlide.addEventListener('click', () => {
    state.worshipSlideIndex =
      (state.worshipSlideIndex + 1) % presetsWorship.length
    updateUI()
  })

  // Keybindings for worship mode slide controls
  window.addEventListener('keydown', (e) => {
    if (state.activeTab === 'worship') {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault()
        state.worshipSlideIndex =
          (state.worshipSlideIndex + 1) % presetsWorship.length
        updateUI()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        state.worshipSlideIndex =
          (state.worshipSlideIndex - 1 + presetsWorship.length) %
          presetsWorship.length
        updateUI()
      } else if (
        e.key === 'Escape' &&
        elements.presentationOverlay.classList.contains('active')
      ) {
        exitPresentation()
      }
    }
  })

  // Fullscreen Presentation Mode
  elements.btnPresent.addEventListener('click', enterPresentation)
  elements.btnExitPresentation.addEventListener('click', exitPresentation)

  // Clipboard Copier
  if (elements.btnCopyConfig) {
    elements.btnCopyConfig.addEventListener('click', () => {
      navigator.clipboard.writeText(
        elements.codeConfigOutput?.textContent || '',
      )
      const origText = elements.btnCopyConfig!.innerHTML
      elements.btnCopyConfig!.innerHTML =
        '<i class="fa-solid fa-check"></i> Copied!'
      setTimeout(() => {
        if (elements.btnCopyConfig) {
          elements.btnCopyConfig.innerHTML = origText
        }
      }, 2000)
    })
  }

  // SVG Export button
  elements.btnExportSVG.addEventListener('click', triggerSVGDownload)

  // Build font trigger
  elements.btnBuildFont.addEventListener('click', triggerFontBuild)

  // Tester event listeners
  bindSlider(
    elements.rangeTesterFontSize,
    elements.valTesterFontSize,
    'testerFontSize',
    (v) => `${v}px`,
  )
  bindSlider(
    elements.rangeTesterLineHeight,
    elements.valTesterLineHeight,
    'testerLineHeight',
    (v) => `${v.toFixed(1)}`,
    true,
  )
  elements.testerTextInput.addEventListener('input', (e) => {
    state.testerText = (e.target as HTMLTextAreaElement).value
    updateUI()
  })

  elements.testerFontSelect.addEventListener('change', async (e) => {
    const selected = (e.target as HTMLSelectElement).value
    if (selected === 'default') {
      state.testerActiveFontFamily = ''
      updateUI()
    } else if (selected === 'live') {
      triggerLiveFontBuild()
    } else if (selected) {
      try {
        const { getFont } = await import('./db.js')
        const saved = await getFont(selected)
        if (saved) {
          if (saved.config) {
            state.placement = saved.config.placement
            state.verticalOffset = saved.config.verticalOffset
            state.opticalSqueeze = saved.config.opticalSqueeze
            state.fontWeight = saved.config.fontWeight
            state.letterTracking = saved.config.letterTracking
            state.pinyinSize = saved.config.pinyinSize
            state.hanziSize = saved.config.hanziSize
            state.strategy = saved.config.strategy
            state.characterWidth = saved.config.characterWidth
            state.enablePolyphonic = saved.config.enablePolyphonic

            elements.rangeVerticalOffset.value = state.verticalOffset.toString()
            elements.rangeOpticalSqueeze.value = state.opticalSqueeze.toString()
            elements.rangeStrokeWeight.value = state.fontWeight.toString()
            elements.rangeLetterTracking.value = state.letterTracking.toString()
            elements.rangePinyinSize.value = state.pinyinSize.toString()
            elements.rangeHanziSize.value = state.hanziSize.toString()
            elements.rangeCharacterWidth.value = state.characterWidth.toString()
            elements.togglePolyphonic.checked = state.enablePolyphonic
            elements.valVerticalOffset.textContent = `${state.verticalOffset}px`
            elements.valOpticalSqueeze.textContent = `${state.opticalSqueeze}%`
            elements.valStrokeWeight.textContent = state.fontWeight.toString()
            elements.valLetterTracking.textContent =
              state.letterTracking.toFixed(3)
            elements.valPinyinSize.textContent = `${state.pinyinSize}px`
            elements.valHanziSize.textContent = `${state.hanziSize}px`
            elements.valCharacterWidth.textContent = `${state.characterWidth}px`

            const placeActive = document.querySelector(
              '#placement-control .active',
            )
            if (placeActive) placeActive.classList.remove('active')
            const placeBtn = document.querySelector(
              `#placement-control button[data-val="${state.placement}"]`,
            )
            if (placeBtn) placeBtn.classList.add('active')

            const stratActive = document.querySelector(
              '#strategy-control .active',
            )
            if (stratActive) stratActive.classList.remove('active')
            const stratBtn = document.querySelector(
              `#strategy-control button[data-val="${state.strategy}"]`,
            )
            if (stratBtn) stratBtn.classList.add('active')

            updateUI()
          }
          await loadGeneratedFont(selected, saved.ttf, saved.woff2)
        }
      } catch (err) {
        console.error('Failed to load font from IndexedDB:', err)
      }
    }
  })
}

let localFontEngine: any = null
const annotationFontEngines: Record<string, any> = {}

async function getLocalFontEngine(): Promise<any> {
  if (localFontEngine) return localFontEngine

  const res = await fetch('./resources/fonts/DroidSansFallbackFull.ttf')
  if (!res.ok)
    throw new Error('Failed to fetch base font DroidSansFallbackFull.ttf')
  const buffer = await res.arrayBuffer()
  const font = opentype.parse(buffer)
  localFontEngine = new TextToSVG(font)
  return localFontEngine
}

async function getAnnotationFontEngine(fontKey: string): Promise<any> {
  if (annotationFontEngines[fontKey]) return annotationFontEngines[fontKey]

  const systemFontKeys = ['droid-sans', 'pt-sans-regular', 'pt-sans-bold']
  if (systemFontKeys.includes(fontKey)) {
    let filename = 'DroidSansFallbackFull.ttf'
    if (fontKey === 'pt-sans-regular') {
      filename = 'PT_Sans-Narrow-Web-Regular.ttf'
    } else if (fontKey === 'pt-sans-bold') {
      filename = 'PT_Sans-Narrow-Web-Bold.ttf'
    }

    const res = await fetch(`./resources/fonts/${filename}?v=2.0.0`)
    if (!res.ok) throw new Error(`Failed to fetch annotation font ${filename}`)
    const buffer = await res.arrayBuffer()
    const font = opentype.parse(buffer)
    const engine = new TextToSVG(font)
    annotationFontEngines[fontKey] = engine
    return engine
  } else {
    const { getPinyinFont } = await import('./db.js')
    const fontEntry = await getPinyinFont(fontKey)
    if (!fontEntry) {
      throw new Error(`Pinyin font not found in DB: ${fontKey}`)
    }
    const buffer = fontEntry.ttf.buffer.slice(
      fontEntry.ttf.byteOffset,
      fontEntry.ttf.byteOffset + fontEntry.ttf.byteLength,
    )
    const font = opentype.parse(buffer)
    const engine = new TextToSVG(font)
    annotationFontEngines[fontKey] = engine
    return engine
  }
}

// Helper to render vector preview SVGs locally in-browser
async function getPreviews(
  glyphs: { glyph: string; ruby: string }[],
): Promise<{ glyph: string; ruby: string; svg: string }[]> {
  try {
    const baseEngine = await getLocalFontEngine()
    const annoEngine = await getAnnotationFontEngine(state.pinyinFont)
    return glyphs.map((char) => {
      const isPlacementTop = state.placement === 'top'
      const characterWidth = state.characterWidth || 80
      const centerVal = characterWidth / 2
      const baseLineY = isPlacementTop ? 92 : -4
      const baseAnchor = isPlacementTop ? 'bottom center' : 'top center'
      const annoLineY = isPlacementTop
        ? -4 - state.verticalOffset
        : 92 + state.verticalOffset
      const annoAnchor = isPlacementTop ? 'top center' : 'bottom center'

      const baseSvgPath = ruby.getBase(baseEngine, char.glyph, {
        x: centerVal,
        y: baseLineY,
        fontSize: 56,
        anchor: baseAnchor,
        attributes: {
          fill: 'currentColor',
          id: 'glyph',
        },
      })

      const pinyinFontSize = Math.round(
        56 * (state.pinyinSize / state.hanziSize),
      )

      const pinyinPaths = ruby.getAnnotation(annoEngine, char.ruby, {
        x: centerVal,
        y: annoLineY,
        fontSize: pinyinFontSize,
        anchor: annoAnchor,
        attributes: {
          fill: 'currentColor',
          id: 'annotation',
        },
        squeeze: state.opticalSqueeze,
        tracking: state.letterTracking,
        weight: state.fontWeight,
        strategy: state.strategy,
      })

      const svgContent = `<svg width="${characterWidth}" height="80" viewBox="0 0 ${characterWidth} 80" xmlns="http://www.w3.org/2000/svg">
        ${baseSvgPath}
        ${pinyinPaths}
      </svg>`

      return {
        glyph: char.glyph,
        ruby: char.ruby,
        svg: svgContent,
      }
    })
  } catch (err) {
    console.error('Error rendering previews locally:', err)
    return glyphs.map((g) => ({
      glyph: g.glyph,
      ruby: g.ruby,
      svg: `<svg viewBox="0 0 80 80" width="80" height="80"><text x="40" y="50" text-anchor="middle" fill="red" font-size="14">${g.glyph}</text></svg>`,
    }))
  }
}

async function loadLocalFont() {
  try {
    await getLocalFontEngine()
    await getAnnotationFontEngine(state.pinyinFont)
    elements.fontLoadingBanner.innerHTML = `<span class="text-emerald-500"><i class="fa-solid fa-circle-check"></i> In-Browser Preview Engine Active</span>`
  } catch (err: any) {
    elements.fontLoadingBanner.innerHTML = `<span class="text-rose-500"><i class="fa-solid fa-circle-xmark"></i> Failed to initialize engine: ${err.message}</span>`
  }
}

// Compute Pinyin layout specs based on syllable size and active strategy
function computeSyllableSpecs(syllable: string) {
  const length = syllable.length
  let scaleX = 100
  let letterSpacing = 0
  let weight = 400

  if (state.strategy === 'global') {
    scaleX = state.opticalSqueeze
    letterSpacing = state.letterTracking
    weight = state.fontWeight
  } else if (state.strategy === 'smart') {
    if (length >= 5) {
      scaleX = state.opticalSqueeze
      letterSpacing = state.letterTracking
      weight = state.fontWeight
    } else {
      scaleX = 100
      letterSpacing = 0
      weight = 400
    }
  } else if (state.strategy === 'proportional') {
    if (length <= 3) {
      scaleX = 100
      letterSpacing = 0
      weight = 400
    } else if (length === 4) {
      scaleX = 100 - (100 - state.opticalSqueeze) * 0.35
      letterSpacing = state.letterTracking * 0.35
      weight = 400 + (state.fontWeight - 400) * 0.35
    } else {
      scaleX = state.opticalSqueeze
      letterSpacing = state.letterTracking
      weight = state.fontWeight
    }
  }

  return { scaleX, letterSpacing, weight }
}

// Active Test Syllable getter
function getActiveSyllable() {
  if (
    state.activeSyllableIndex >= 0 &&
    state.activeSyllableIndex < presetsSyllable.length
  ) {
    return presetsSyllable[state.activeSyllableIndex]
  }
  return {
    hanzi: state.customHanzi.trim() || '字',
    pinyin: state.customPinyin.trim().toLowerCase() || 'zì',
    desc: 'Custom test syllable',
  }
}

// Update App Views
function updateUI() {
  // Toggle Choose Test Syllable section based on activeTab
  if (elements.sectionChooseSyllable) {
    ;(elements.sectionChooseSyllable as HTMLElement).style.display =
      state.activeTab === 'sandbox' ? 'flex' : 'none'
  }

  // Update labels values
  elements.valVerticalOffset.textContent = `${state.verticalOffset}px`
  elements.valOpticalSqueeze.textContent = `${state.opticalSqueeze}%`
  elements.valLetterTracking.textContent = `${state.letterTracking.toFixed(3)}em`
  elements.valPinyinSize.textContent = `${state.pinyinSize}px`
  elements.valHanziSize.textContent = `${state.hanziSize}px`

  // Update simulation mode specific cards
  if (state.activeTab === 'worship') {
    renderWorship()
  } else if (state.activeTab === 'textbook') {
    renderTextbook()
  } else if (state.activeTab === 'sandbox') {
    renderSandbox()
  } else if (state.activeTab === 'tester') {
    renderTester()
  }

  // Generate config
  generateCLIConfig()

  // Save current options state to URL query params
  saveStateToUrl()
}

// Render Worship simulator viewport
async function renderWorship() {
  const slide = presetsWorship[state.worshipSlideIndex]
  elements.worshipViewport.className = `viewport-canvas ${themesWorship.find((t) => t.id === state.worshipTheme)?.class} ${state.worshipRatio === '4:3' ? 'aspect-4-3' : ''}`

  elements.worshipViewport.classList.toggle('guides-muted', !state.showGuides)

  const K = state.worshipScale

  // Compile list of all glyphs on this slide
  const glyphList: { glyph: string; ruby: string }[] = []
  slide.lines.forEach((line) => {
    line.hanzi.split('').forEach((char, idx) => {
      glyphList.push({ glyph: char, ruby: line.pinyin[idx] || '' })
    })
  })

  const svgs = await getPreviews(glyphList)

  elements.worshipSlideContent.innerHTML = ''
  let svgIdx = 0

  slide.lines.forEach((line) => {
    const lineEl = document.createElement('div')
    lineEl.className = 'slide-line'
    lineEl.style.gap = '0px'

    line.hanzi.split('').forEach(() => {
      const item = svgs[svgIdx++]
      if (!item) return

      const block = document.createElement('div')
      block.className = 'ruby-char-block'
      block.style.width = `${state.hanziSize * 1.4 * K * (state.characterWidth / 80)}px`

      block.innerHTML = item.svg
      const svgEl = block.querySelector('svg')
      if (svgEl) {
        svgEl.style.width = '100%'
        svgEl.style.height = 'auto'
        svgEl.style.display = 'block'
        svgEl.style.color = 'inherit'
        svgEl.style.overflow = 'visible'
      }

      lineEl.appendChild(block)
    })

    elements.worshipSlideContent.appendChild(lineEl)
  })

  elements.worshipSlideEnglish.textContent = state.worshipSubtitleVisible
    ? slide.english
    : ''
  elements.worshipSlideEnglish.style.opacity = state.worshipSubtitleVisible
    ? '0.75'
    : '0'

  // Dots
  elements.worshipSlideDots.innerHTML = ''
  presetsWorship.forEach((_, idx) => {
    const dot = document.createElement('button')
    dot.className = `slide-dot ${idx === state.worshipSlideIndex ? 'active' : ''}`
    dot.addEventListener('click', () => {
      state.worshipSlideIndex = idx
      updateUI()
    })
    elements.worshipSlideDots.appendChild(dot)
  })

  elements.currentSlideNum.textContent = (
    state.worshipSlideIndex + 1
  ).toString()
  elements.totalSlideNum.textContent = presetsWorship.length.toString()
  elements.activeStrategyLabel.textContent = `${state.strategy} squeeze`
}

// Render Textbook layout simulation
async function renderTextbook() {
  const poem = presetsPoem[state.activePoemIndex]
  elements.textbookPoemTitle.textContent = poem.title
  elements.textbookPoemAuthor.textContent = poem.author

  const hzSize = state.hanziSize
  const pSize = state.pinyinSize

  const glyphList: { glyph: string; ruby: string }[] = []
  poem.lines.forEach((line) => {
    line.hanzi.split('').forEach((char, idx) => {
      glyphList.push({ glyph: char, ruby: line.pinyin[idx] || '' })
    })
  })

  const svgs = await getPreviews(glyphList)

  elements.textbookContent.innerHTML = ''
  let svgIdx = 0

  poem.lines.forEach((line) => {
    const lineEl = document.createElement('div')
    lineEl.className = 'textbook-line'
    lineEl.style.gap = `${hzSize * 0.4}px`

    line.hanzi.split('').forEach(() => {
      const item = svgs[svgIdx++]
      if (!item) return

      const block = document.createElement('div')
      block.className = 'textbook-char-cell'
      block.style.width = `${hzSize * (state.characterWidth / 80)}px`
      block.style.height = `${hzSize}px`

      block.innerHTML = item.svg
      const svgEl = block.querySelector('svg')
      if (svgEl) {
        svgEl.style.width = '100%'
        svgEl.style.height = '100%'
        svgEl.style.display = 'block'
        svgEl.style.color = 'inherit'
        svgEl.style.overflow = 'visible'
      }

      if (state.showGuides) {
        const grid = document.createElement('div')
        grid.className = 'textbook-cell-grid'
        grid.innerHTML =
          '<div class="grid-line-v"></div><div class="grid-line-h"></div>'
        block.appendChild(grid)
      }

      const wrapper = document.createElement('div')
      wrapper.className = 'ruby-char-block'
      wrapper.style.width = `${hzSize * (state.characterWidth / 80)}px`

      if (state.showGuides) {
        wrapper.style.outline = '1px dashed rgba(20, 184, 166, 0.15)'
      }

      wrapper.appendChild(block)
      lineEl.appendChild(wrapper)
    })

    elements.textbookContent.appendChild(lineEl)
  })

  const sampleSpecs = computeSyllableSpecs('chuāng')
  const estimatedWidth = Math.max(
    15,
    Math.round(
      6 *
        ((sampleSpecs.scaleX / 100) * pSize * 0.55 +
          sampleSpecs.letterSpacing * 12),
    ),
  )

  elements.metricGuardText.innerHTML = `At <strong>${sampleSpecs.scaleX}%</strong> squeeze and <strong>${sampleSpecs.letterSpacing}em</strong> tracking, the longest syllable (<em>chuāng</em>) spans approx <strong>${estimatedWidth}px</strong> horizontally.`

  if (estimatedWidth > hzSize) {
    elements.metricGuardBadge.className = 'badge badge-warning'
    elements.metricGuardBadge.textContent = 'Slight Overflow Risk'
  } else {
    elements.metricGuardBadge.className = 'badge badge-success'
    elements.metricGuardBadge.textContent = 'Perfect Container Fit!'
  }
}

// Render Sandbox with True vector paths via backend API
async function renderSandbox() {
  const syllable = getActiveSyllable()
  elements.svgPreviewContainer.innerHTML = ''

  const svgs = await getPreviews([
    { glyph: syllable.hanzi, ruby: syllable.pinyin },
  ])
  const item = svgs[0]
  if (item) {
    elements.svgPreviewContainer.innerHTML = item.svg
    const svgEl = elements.svgPreviewContainer.querySelector('svg')
    if (svgEl) {
      svgEl.setAttribute('width', '100%')
      svgEl.setAttribute('height', '100%')
      svgEl.style.overflow = 'visible'

      const isPlacementTop = state.placement === 'top'
      const minY = isPlacementTop
        ? Math.min(-15 - state.verticalOffset, 0)
        : -70
      const maxY = isPlacementTop
        ? 100
        : Math.max(105 + state.verticalOffset, 90)
      const heightY = maxY - minY
      svgEl.setAttribute(
        'viewBox',
        `0 ${minY} ${state.characterWidth} ${heightY}`,
      )
    }
  }
}

// Generate the configuration TypeScript code block
function generateCLIConfig() {
  const currentSyllable = getActiveSyllable()
  const specs = computeSyllableSpecs(currentSyllable.pinyin)

  const code = `import path from 'node:path'
import layout from '../layouts.js'
import type { BuildConfig } from '../types.js'

const projectRoot = import.meta.dirname

const config: BuildConfig = {
  canvas: { width: ${state.characterWidth}, height: 80 },
  dataSource: path.resolve(projectRoot, '../data.json'),
  get destFilename() {
    return path.resolve(projectRoot, \`../../build/\${this.fontName}\`)
  },
  fontFilepath: path.resolve(
    projectRoot,
    '../../resources/fonts/DroidSansFallbackFull.ttf',
  ),${
    state.pinyinFont === 'pt-sans-regular'
      ? `\n  annotationFontFilepath: path.resolve(
    projectRoot,
    '../../resources/fonts/PT_Sans-Narrow-Web-Regular.ttf',
  ),`
      : state.pinyinFont === 'pt-sans-bold'
        ? `\n  annotationFontFilepath: path.resolve(
    projectRoot,
    '../../resources/fonts/PT_Sans-Narrow-Web-Bold.ttf',
  ),`
        : ''
  }
  fontName: 'ruby-font-creator',
  formats: ['ttf', 'woff2'],
  inputFiles: './build/**/*.svg',
  workingDir: path.resolve(projectRoot, '../../build/svg'),
  get layout() {
    return {
      base: {
        x: this.canvas.width / 2,
        y: ${state.placement === 'top' ? 'this.canvas.height + 12' : '-4'},
        fontSize: 56,
        anchor: '${state.placement === 'top' ? 'bottom center' : 'top center'}',
        attributes: { fill: 'black', stroke: 'black', id: 'glyph' }
      },
      annotation: {
        x: this.canvas.width / 2,
        y: ${state.placement === 'top' ? `-4 - ${state.verticalOffset}` : `this.canvas.height + 12 + ${state.verticalOffset}`},
        fontSize: ${Math.round(56 * (state.pinyinSize / state.hanziSize))},
        anchor: '${state.placement === 'top' ? 'top center' : 'bottom center'}',
        attributes: {
          fill: 'black',
          stroke: 'black',
          id: 'annotation',
        },
        squeeze: ${specs.scaleX},
        tracking: ${specs.letterSpacing.toFixed(3)},
        weight: ${Math.round(specs.weight)}
      }
    }
  }
}

export default config
`

  if (elements.codeConfigOutput) {
    elements.codeConfigOutput.textContent = code
  }
}

// Package current preview SVG into download link
function triggerSVGDownload() {
  const svgMarkup = elements.svgPreviewContainer.innerHTML
  if (!svgMarkup) return

  const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  const currentSyllable = getActiveSyllable()
  const link = document.createElement('a')
  link.href = url
  link.download = `u-${currentSyllable.hanzi}-${currentSyllable.pinyin}.svg`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// Present Fullscreen slide
function enterPresentation() {
  const viewport = elements.worshipViewport
  elements.presentationContent.innerHTML = ''

  // Clone slide viewport
  const clone = viewport.cloneNode(true) as HTMLElement
  clone.style.width = '90%'
  clone.style.height = '90%'
  clone.style.aspectRatio = state.worshipRatio === '4:3' ? '4/3' : '16/9'
  clone.style.maxWidth = 'none'
  clone.style.maxHeight = 'none'
  clone.querySelector('.nav-slide-btn')?.remove()
  clone.querySelector('.nav-slide-btn')?.remove() // twice to remove both

  elements.presentationContent.appendChild(clone)
  elements.presentationOverlay.classList.add('active')
}

function exitPresentation() {
  elements.presentationOverlay.classList.remove('active')
}

// Trigger browser-side font compiler task
async function triggerFontBuild() {
  const fontName = elements.inputFontName.value.trim() || 'ruby-font'
  const sanitizedFontName = fontName.replace(/[^a-zA-Z0-9-_]/g, '')

  elements.buildStatusContainer.style.display = 'block'
  elements.buildStatusBadge.className = 'badge badge-warning'
  elements.buildStatusBadge.textContent = 'Building...'
  elements.buildStatusTime.textContent = new Date().toLocaleTimeString()
  elements.buildLogs.textContent = 'Initializing in-browser compilation...\n'
  elements.buildDownloadLinks.style.display = 'none'
  elements.btnBuildFont.setAttribute('disabled', 'true')

  try {
    const baseFontEngine = await getLocalFontEngine()
    const annotationFontEngine = await getAnnotationFontEngine(state.pinyinFont)

    // Load base data
    const dataResponse = await fetch('./data.json')
    if (!dataResponse.ok) throw new Error('Failed to fetch data.json')
    const allData = await dataResponse.json()

    const { compileFontInBrowser } = await import('./compiler.js')
    const { saveFont } = await import('./db.js')

    const allEntries = [...allData, ...getAlternateGlyphEntries()]

    // Build configuration object
    const calculatedPinyinFontSize = Math.round(
      56 * (state.pinyinSize / state.hanziSize),
    )
    const config = {
      canvas: { width: state.characterWidth, height: 80 },
      fontName: sanitizedFontName,
      layout: {
        base: {
          x: state.characterWidth / 2,
          y: state.placement === 'top' ? 92 : -4,
          fontSize: 56,
          anchor: state.placement === 'top' ? 'bottom center' : 'top center',
        },
        annotation: {
          x: state.characterWidth / 2,
          y:
            state.placement === 'top'
              ? -4 - state.verticalOffset
              : 92 + state.verticalOffset,
          fontSize: calculatedPinyinFontSize,
          anchor: state.placement === 'top' ? 'top center' : 'bottom center',
          squeeze: state.opticalSqueeze,
          tracking: state.letterTracking,
          weight: state.fontWeight,
          strategy: state.strategy,
        },
      },
    } as any

    const result = await compileFontInBrowser(
      allEntries,
      config,
      baseFontEngine,
      annotationFontEngine,
      state.enablePolyphonic,
      (msg) => {
        elements.buildLogs.textContent += msg
        elements.buildLogs.scrollTop = elements.buildLogs.scrollHeight
      },
    )

    // Save to IndexedDB
    elements.buildLogs.textContent += 'Saving compiled font to IndexedDB...\n'
    await saveFont({
      fontName: sanitizedFontName,
      ttf: result.ttf,
      woff2: result.woff2,
      config: {
        placement: state.placement,
        verticalOffset: state.verticalOffset,
        opticalSqueeze: state.opticalSqueeze,
        fontWeight: state.fontWeight,
        letterTracking: state.letterTracking,
        pinyinSize: state.pinyinSize,
        hanziSize: state.hanziSize,
        strategy: state.strategy,
        characterWidth: state.characterWidth,
        enablePolyphonic: state.enablePolyphonic,
      },
      timestamp: Date.now(),
    })

    // Setup Blob URLs for downloads
    const ttfBlob = new Blob([result.ttf], { type: 'font/ttf' })
    const woff2Blob = new Blob([result.woff2], { type: 'font/woff2' })

    elements.linkDownloadTtf.href = URL.createObjectURL(ttfBlob)
    elements.linkDownloadTtf.download = `${sanitizedFontName}.ttf`

    elements.linkDownloadWoff2.href = URL.createObjectURL(woff2Blob)
    elements.linkDownloadWoff2.download = `${sanitizedFontName}.woff2`

    elements.buildStatusBadge.className = 'badge badge-success'
    elements.buildStatusBadge.textContent = 'Success'
    elements.buildDownloadLinks.style.display = 'flex'

    // Load and register locally in browser for testing
    await loadGeneratedFont(sanitizedFontName, result.ttf, result.woff2)
    fetchAndPopulateFonts(sanitizedFontName)
  } catch (err: any) {
    elements.buildStatusBadge.className = 'badge badge-danger'
    elements.buildStatusBadge.textContent = 'Failed'
    elements.buildLogs.textContent += `\nError: ${err.message}\n`
  } finally {
    elements.btnBuildFont.removeAttribute('disabled')
  }
}

let liveBuildTimeout: number | null = null

async function triggerLiveFontBuild() {
  if (elements.testerFontSelect.value !== 'live') {
    return
  }

  elements.testerFontStatus.className = 'badge badge-warning'
  elements.testerFontStatus.textContent = 'Building Live...'

  try {
    const baseFontEngine = await getLocalFontEngine()
    const annotationFontEngine = await getAnnotationFontEngine(state.pinyinFont)
    const text = state.testerText || ' '
    const uniqueChars = new Set(text.split(''))

    // Load base data
    const dataResponse = await fetch('./data.json')
    if (!dataResponse.ok) throw new Error('Failed to fetch data.json')
    const allData = await dataResponse.json()

    // Filter data matching user input
    const filteredData = allData.filter((entry: any) =>
      uniqueChars.has(entry.glyph),
    )

    if (state.enablePolyphonic) {
      const alternates = getAlternateGlyphEntries()
      const polyGlyphs = new Set(POLYPHONIC_ENTRIES.map((p) => p.glyph))
      const activePolyGlyphs = [...uniqueChars].filter((c) => polyGlyphs.has(c))
      const activeAlternates = alternates.filter((alt) => {
        const parentEntry = POLYPHONIC_ENTRIES.find((p) =>
          p.alternates.some((a) => a.codepoint === alt.codepoint),
        )
        return parentEntry && activePolyGlyphs.includes(parentEntry.glyph)
      })
      filteredData.push(...activeAlternates)
    }

    const { compileFontInBrowser } = await import('./compiler.js')
    const calculatedPinyinFontSize = Math.round(
      56 * (state.pinyinSize / state.hanziSize),
    )
    const config = {
      canvas: { width: state.characterWidth, height: 80 },
      fontName: 'live',
      layout: {
        base: {
          x: state.characterWidth / 2,
          y: state.placement === 'top' ? 92 : -4,
          fontSize: 56,
          anchor: state.placement === 'top' ? 'bottom center' : 'top center',
        },
        annotation: {
          x: state.characterWidth / 2,
          y:
            state.placement === 'top'
              ? -4 - state.verticalOffset
              : 92 + state.verticalOffset,
          fontSize: calculatedPinyinFontSize,
          anchor: state.placement === 'top' ? 'top center' : 'bottom center',
          squeeze: state.opticalSqueeze,
          tracking: state.letterTracking,
          weight: state.fontWeight,
          strategy: state.strategy,
        },
      },
    } as any

    const result = await compileFontInBrowser(
      filteredData,
      config,
      baseFontEngine,
      annotationFontEngine,
      state.enablePolyphonic,
      () => {}, // silence logging for live build
    )

    await loadGeneratedFont('live', result.ttf, result.woff2)
  } catch (err: any) {
    console.error('Live font build failed:', err)
    elements.testerFontStatus.className = 'badge badge-danger'
    elements.testerFontStatus.textContent = 'Build Failed'
  }
}

function debouncedLiveFontBuild() {
  if (liveBuildTimeout) {
    clearTimeout(liveBuildTimeout)
  }
  liveBuildTimeout = window.setTimeout(() => {
    triggerLiveFontBuild()
  }, 600)
}

function renderTester() {
  elements.testerTextInput.style.fontSize = `${state.testerFontSize}px`
  elements.testerTextInput.style.lineHeight = state.testerLineHeight.toString()
  elements.valTesterFontSize.textContent = `${state.testerFontSize}px`
  elements.valTesterLineHeight.textContent = state.testerLineHeight.toFixed(1)

  if (state.testerActiveFontFamily) {
    elements.testerTextInput.style.fontFamily = `'${state.testerActiveFontFamily}', sans-serif`
  } else {
    elements.testerTextInput.style.fontFamily = 'var(--font-serif)'
  }

  if (elements.testerFontSelect.value === 'live') {
    debouncedLiveFontBuild()
  }
}

async function loadGeneratedFont(
  fontName: string,
  ttfBuffer: Uint8Array,
  woff2Buffer: Uint8Array,
) {
  try {
    const fontFace = new FontFace(
      fontName,
      woff2Buffer.length > 0 ? woff2Buffer : ttfBuffer,
    )

    elements.testerFontStatus.className = 'badge badge-warning'
    elements.testerFontStatus.textContent = 'Loading Font...'

    await fontFace.load()
    document.fonts.add(fontFace)

    state.testerActiveFontFamily = fontName
    elements.testerTextInput.style.fontFamily = `'${fontName}', sans-serif`
    elements.testerFontStatus.className = 'badge badge-success'
    elements.testerFontStatus.textContent = `Active: ${fontName}`

    console.log(`Successfully loaded generated font: ${fontName}`)
  } catch (err: any) {
    console.error('Failed to load generated font face:', err)
    elements.testerFontStatus.className = 'badge badge-danger'
    elements.testerFontStatus.textContent = 'Load Failed'
  }
}

async function fetchAndPopulateFonts(selectFontName?: string) {
  try {
    const { listFonts } = await import('./db.js')
    let fontNames: string[] = await listFonts()
    fontNames = fontNames.filter((name) => name !== 'live')

    // Populate stored fonts list container
    const listContainer = document.getElementById('stored-fonts-list')
    if (listContainer) {
      listContainer.innerHTML = ''
      if (fontNames.length === 0) {
        listContainer.innerHTML =
          '<div style="color: var(--text-muted); font-size: 0.72rem; text-align: center; padding: 1rem;">No stored custom fonts.</div>'
      } else {
        fontNames.forEach((name) => {
          const item = document.createElement('div')
          item.className = 'stored-font-item'
          item.style.display = 'flex'
          item.style.alignItems = 'center'
          item.style.justifyContent = 'space-between'
          item.style.padding = '0.4rem 0.6rem'
          item.style.border = '1px solid var(--border-color)'
          item.style.borderRadius = '0.5rem'
          item.style.backgroundColor = 'var(--bg-card)'

          const nameSpan = document.createElement('span')
          nameSpan.textContent = name
          nameSpan.style.fontSize = '0.75rem'
          nameSpan.style.fontWeight = '600'
          nameSpan.style.color = 'var(--text-primary)'
          nameSpan.style.overflow = 'hidden'
          nameSpan.style.textOverflow = 'ellipsis'
          nameSpan.style.whiteSpace = 'nowrap'
          nameSpan.style.maxWidth = '120px'

          const actionsDiv = document.createElement('div')
          actionsDiv.style.display = 'flex'
          actionsDiv.style.gap = '0.25rem'

          // Use Button
          const useBtn = document.createElement('button')
          useBtn.className =
            name === state.testerActiveFontFamily
              ? 'btn btn-small btn-primary'
              : 'btn btn-small btn-secondary'
          useBtn.style.padding = '0.15rem 0.4rem'
          useBtn.style.fontSize = '0.65rem'
          useBtn.textContent =
            name === state.testerActiveFontFamily ? 'Active' : 'Use'
          useBtn.addEventListener('click', async () => {
            elements.testerFontSelect.value = name
            const event = new Event('change')
            elements.testerFontSelect.dispatchEvent(event)
          })

          // TTF Download Button
          const dlTtfBtn = document.createElement('button')
          dlTtfBtn.className = 'btn btn-small btn-secondary'
          dlTtfBtn.style.padding = '0.15rem 0.4rem'
          dlTtfBtn.style.fontSize = '0.65rem'
          dlTtfBtn.innerHTML = '<i class="fa-solid fa-download"></i> TTF'
          dlTtfBtn.addEventListener('click', async () => {
            const { getFont } = await import('./db.js')
            const font = await getFont(name)
            if (font) {
              const blob = new Blob([font.ttf], { type: 'font/ttf' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `${name}.ttf`
              a.click()
            }
          })

          // WOFF2 Download Button
          const dlWoff2Btn = document.createElement('button')
          dlWoff2Btn.className = 'btn btn-small btn-secondary'
          dlWoff2Btn.style.padding = '0.15rem 0.4rem'
          dlWoff2Btn.style.fontSize = '0.65rem'
          dlWoff2Btn.innerHTML = 'WOFF2'
          dlWoff2Btn.addEventListener('click', async () => {
            const { getFont } = await import('./db.js')
            const font = await getFont(name)
            if (font) {
              const blob = new Blob([font.woff2], { type: 'font/woff2' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `${name}.woff2`
              a.click()
            }
          })

          // Delete Button
          const delBtn = document.createElement('button')
          delBtn.className = 'btn btn-small'
          delBtn.style.padding = '0.15rem 0.35rem'
          delBtn.style.fontSize = '0.65rem'
          delBtn.style.backgroundColor = 'rgba(244, 63, 94, 0.15)'
          delBtn.style.color = 'var(--color-rose)'
          delBtn.style.border = '1px solid rgba(244, 63, 94, 0.3)'
          delBtn.innerHTML = '<i class="fa-solid fa-trash"></i>'
          delBtn.addEventListener('click', async () => {
            if (confirm(`Delete font "${name}"?`)) {
              const { deleteFont } = await import('./db.js')
              await deleteFont(name)
              if (state.testerActiveFontFamily === name) {
                state.testerActiveFontFamily = ''
              }
              await fetchAndPopulateFonts()
            }
          })

          actionsDiv.appendChild(useBtn)
          actionsDiv.appendChild(dlTtfBtn)
          actionsDiv.appendChild(dlWoff2Btn)
          actionsDiv.appendChild(delBtn)

          item.appendChild(nameSpan)
          item.appendChild(actionsDiv)
          listContainer.appendChild(item)
        })
      }
    }

    // Populate dropdown selector
    elements.testerFontSelect.innerHTML = ''

    // Always add default option
    const defaultOption = document.createElement('option')
    defaultOption.value = 'default'
    defaultOption.textContent = 'Default Font'
    elements.testerFontSelect.appendChild(defaultOption)

    // Always add live option
    const liveOption = document.createElement('option')
    liveOption.value = 'live'
    liveOption.textContent = 'live'
    elements.testerFontSelect.appendChild(liveOption)

    elements.testerFontSelectorGroup.style.display = 'flex'
    fontNames.forEach((name) => {
      const option = document.createElement('option')
      option.value = name
      option.textContent = name
      elements.testerFontSelect.appendChild(option)
    })

    // Auto-select font: use parameter first, then current active state, fallback to default
    const targetFont =
      selectFontName || state.testerActiveFontFamily || 'default'

    if (targetFont === 'default') {
      elements.testerFontSelect.value = 'default'
      state.testerActiveFontFamily = ''
      updateUI()
    } else if (targetFont === 'live') {
      elements.testerFontSelect.value = 'live'
      triggerLiveFontBuild()
    } else if (fontNames.includes(targetFont)) {
      elements.testerFontSelect.value = targetFont
      const { getFont } = await import('./db.js')
      const saved = await getFont(targetFont)
      if (saved) {
        if (saved.config) {
          state.placement = saved.config.placement
          state.verticalOffset = saved.config.verticalOffset
          state.opticalSqueeze = saved.config.opticalSqueeze
          state.fontWeight = saved.config.fontWeight
          state.letterTracking = saved.config.letterTracking
          state.pinyinSize = saved.config.pinyinSize
          state.hanziSize = saved.config.hanziSize
          state.strategy = saved.config.strategy
          state.characterWidth = saved.config.characterWidth
          state.enablePolyphonic = saved.config.enablePolyphonic

          elements.rangeVerticalOffset.value = state.verticalOffset.toString()
          elements.rangeOpticalSqueeze.value = state.opticalSqueeze.toString()
          elements.rangeStrokeWeight.value = state.fontWeight.toString()
          elements.rangeLetterTracking.value = state.letterTracking.toString()
          elements.rangePinyinSize.value = state.pinyinSize.toString()
          elements.rangeHanziSize.value = state.hanziSize.toString()
          elements.rangeCharacterWidth.value = state.characterWidth.toString()
          elements.togglePolyphonic.checked = state.enablePolyphonic

          document
            .querySelectorAll('#placement-control .segment-btn')
            .forEach((b) => {
              b.classList.toggle(
                'active',
                b.getAttribute('data-placement') === state.placement,
              )
            })
          document
            .querySelectorAll('#strategy-control .segment-btn')
            .forEach((b) => {
              b.classList.toggle(
                'active',
                b.getAttribute('data-strategy') === state.strategy,
              )
            })
        }
        await loadGeneratedFont(targetFont, saved.ttf, saved.woff2)
      }
    }
  } catch (err) {
    console.error('Error listing generated fonts:', err)
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then((registration) => {
        console.log(
          '[PWA] Service Worker registered scope:',
          registration.scope,
        )
      })
      .catch((err) => {
        console.error('[PWA] Service Worker registration failed:', err)
      })
  })
}

// Start initialization after all declarations are evaluated
init()

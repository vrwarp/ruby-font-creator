// Pinyin Typography Lab Main Application Logic

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
  testerText: `聖哉!聖哉!聖哉!全能大主宰

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
  syllablePresets: document.getElementById('syllable-presets')!,
  inputCustomHanzi: document.getElementById(
    'input-custom-hanzi',
  ) as HTMLInputElement,
  inputCustomPinyin: document.getElementById(
    'input-custom-pinyin',
  ) as HTMLInputElement,

  placementControl: document.getElementById('placement-control')!,
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
  codeConfigOutput: document.getElementById('code-config-output')!,
  btnCopyConfig: document.getElementById('btn-copy-config')!,
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
  testerPreviewRender: document.getElementById('tester-preview-render')!,
}

// Start Initialize
init()

function saveStateToUrl() {
  const params = new URLSearchParams()
  params.set('placement', state.placement)
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
  elements.testerPreviewRender.textContent = state.testerText
  if (state.testerActiveFontFamily) {
    elements.testerPreviewRender.style.fontFamily = `'${state.testerActiveFontFamily}', sans-serif`
    elements.testerFontStatus.className = 'badge badge-success'
    elements.testerFontStatus.textContent = `Active: ${state.testerActiveFontFamily}`
  } else {
    elements.testerPreviewRender.style.fontFamily = 'var(--font-serif)'
    elements.testerFontStatus.className = 'badge badge-warning'
    elements.testerFontStatus.textContent = 'No Font Loaded'
  }
}

function init() {
  setupTheme()
  setupPresets()
  setupEventListeners()
  loadLocalFont()
  loadStateFromUrl()
  syncUIFromState()
  fetchAndPopulateFonts()
  updateUI()
}

// Set up App Color Theme
function setupTheme() {
  elements.themeToggleBtn.addEventListener('click', () => {
    state.darkMode = !state.darkMode
    if (state.darkMode) {
      document.documentElement.classList.remove('light-mode')
      elements.themeToggleBtn.innerHTML = '<i class="fa-solid fa-moon"></i>'
    } else {
      document.documentElement.classList.add('light-mode')
      elements.themeToggleBtn.innerHTML = '<i class="fa-solid fa-sun"></i>'
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
  elements.btnCopyConfig.addEventListener('click', () => {
    navigator.clipboard.writeText(elements.codeConfigOutput.textContent || '')
    const origText = elements.btnCopyConfig.innerHTML
    elements.btnCopyConfig.innerHTML =
      '<i class="fa-solid fa-check"></i> Copied!'
    setTimeout(() => {
      elements.btnCopyConfig.innerHTML = origText
    }, 2000)
  })

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

  elements.testerFontSelect.addEventListener('change', (e) => {
    const selected = (e.target as HTMLSelectElement).value
    if (selected === 'live') {
      triggerLiveFontBuild()
    } else if (selected) {
      loadGeneratedFont(
        selected,
        `/build/${selected}.ttf`,
        `/build/${selected}.woff2`,
      )
    }
  })
}

// Helper to fetch vector preview SVGs generated by the backend font engine
async function getPreviews(
  glyphs: { glyph: string; ruby: string }[],
): Promise<{ glyph: string; ruby: string; svg: string }[]> {
  try {
    const response = await fetch('/api/render-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        glyphs,
        layout: {
          placement: state.placement,
          verticalOffset: state.verticalOffset,
          opticalSqueeze: state.opticalSqueeze,
          fontWeight: state.fontWeight,
          letterTracking: state.letterTracking,
          strategy: state.strategy,
          pinyinSize: state.pinyinSize,
          hanziSize: state.hanziSize,
          characterWidth: state.characterWidth,
        },
      }),
    })
    if (!response.ok) throw new Error('Preview fetch failed')
    return await response.json()
  } catch (err) {
    console.error('Error fetching preview SVGs:', err)
    return glyphs.map((g) => ({
      glyph: g.glyph,
      ruby: g.ruby,
      svg: `<svg viewBox="0 0 80 80" width="80" height="80"><text x="40" y="50" text-anchor="middle" fill="red" font-size="14">${g.glyph}</text></svg>`,
    }))
  }
}

function loadLocalFont() {
  // Stubbed out: Opentype is no longer required client-side since the backend renders true vectors!
  elements.fontLoadingBanner.innerHTML = `<span class="text-emerald-500"><i class="fa-solid fa-circle-check"></i> Backend Live Renderer Active</span>`
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
  ),
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

  elements.codeConfigOutput.textContent = code
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

// Trigger backend font compiler task via Vite API middleware
async function triggerFontBuild() {
  const fontName = elements.inputFontName.value.trim() || 'ruby-font'

  elements.buildStatusContainer.style.display = 'block'
  elements.buildStatusBadge.className = 'badge badge-warning'
  elements.buildStatusBadge.textContent = 'Building...'
  elements.buildStatusTime.textContent = new Date().toLocaleTimeString()
  elements.buildLogs.textContent = 'Triggering backend compilation...\n'
  elements.buildDownloadLinks.style.display = 'none'
  elements.btnBuildFont.setAttribute('disabled', 'true')

  try {
    const response = await fetch('/api/build-font', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        placement: state.placement,
        verticalOffset: state.verticalOffset,
        opticalSqueeze: state.opticalSqueeze,
        fontWeight: state.fontWeight,
        letterTracking: state.letterTracking,
        pinyinSize: state.pinyinSize,
        hanziSize: state.hanziSize,
        fontName: fontName,
        strategy: state.strategy,
        characterWidth: state.characterWidth,
        enablePolyphonic: state.enablePolyphonic,
      }),
    })

    if (!response.body) {
      throw new Error('ReadableStream not supported in this browser.')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let done = false

    while (!done) {
      const { value, done: doneReading } = await reader.read()
      done = doneReading
      const chunk = decoder.decode(value, { stream: !done })

      // Split by newline since the server streams newline-separated JSON objects
      const lines = chunk.split('\n')
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const data = JSON.parse(line)
          if (data.status === 'building' && data.log) {
            elements.buildLogs.textContent += data.log
            elements.buildLogs.scrollTop = elements.buildLogs.scrollHeight
          } else if (data.status === 'success') {
            elements.buildStatusBadge.className = 'badge badge-success'
            elements.buildStatusBadge.textContent = 'Success'
            elements.buildLogs.textContent += `\nSuccess: ${data.message}\n`
            elements.buildLogs.scrollTop = elements.buildLogs.scrollHeight

            // Setup download links
            elements.linkDownloadTtf.href = data.files.ttf
            elements.linkDownloadWoff2.href = data.files.woff2
            elements.buildDownloadLinks.style.display = 'flex'

            // Dynamically load the built font into the tester tab and refresh list
            fetchAndPopulateFonts(fontName)
          } else if (data.status === 'error') {
            elements.buildStatusBadge.className = 'badge badge-danger'
            elements.buildStatusBadge.textContent = 'Error'
            elements.buildLogs.textContent += `\nError: ${data.message}\n`
            elements.buildLogs.scrollTop = elements.buildLogs.scrollHeight
          }
        } catch {
          // Incomplete chunk line or parsing error, skip
        }
      }
    }
  } catch (err: any) {
    elements.buildStatusBadge.className = 'badge badge-danger'
    elements.buildStatusBadge.textContent = 'Failed'
    elements.buildLogs.textContent += `\nHTTP Error: ${err.message}\n`
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
    const response = await fetch('/api/build-font', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        placement: state.placement,
        verticalOffset: state.verticalOffset,
        opticalSqueeze: state.opticalSqueeze,
        fontWeight: state.fontWeight,
        letterTracking: state.letterTracking,
        pinyinSize: state.pinyinSize,
        hanziSize: state.hanziSize,
        fontName: 'live',
        strategy: state.strategy,
        characterWidth: state.characterWidth,
        enablePolyphonic: state.enablePolyphonic,
        text: state.testerText || ' ',
      }),
    })

    if (!response.body) {
      throw new Error('ReadableStream not supported')
    }

    const reader = response.body.getReader()
    let done = false

    while (!done) {
      const { done: doneReading } = await reader.read()
      done = doneReading
    }

    await loadGeneratedFont('live', '/build/live.ttf', '/build/live.woff2')
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
  elements.testerPreviewRender.textContent = state.testerText
  elements.testerPreviewRender.style.fontSize = `${state.testerFontSize}px`
  elements.testerPreviewRender.style.lineHeight =
    state.testerLineHeight.toString()
  elements.valTesterFontSize.textContent = `${state.testerFontSize}px`
  elements.valTesterLineHeight.textContent = state.testerLineHeight.toFixed(1)

  if (state.testerActiveFontFamily) {
    elements.testerPreviewRender.style.fontFamily = `'${state.testerActiveFontFamily}', sans-serif`
  } else {
    elements.testerPreviewRender.style.fontFamily = 'var(--font-serif)'
  }

  if (elements.testerFontSelect.value === 'live') {
    debouncedLiveFontBuild()
  }
}

async function loadGeneratedFont(
  fontName: string,
  ttfUrl: string,
  woff2Url: string,
) {
  try {
    const cacheBuster = `?t=${Date.now()}`
    const fontFace = new FontFace(
      fontName,
      `url(${woff2Url}${cacheBuster}) format('woff2'), url(${ttfUrl}${cacheBuster}) format('truetype')`,
    )

    elements.testerFontStatus.className = 'badge badge-warning'
    elements.testerFontStatus.textContent = 'Loading Font...'

    await fontFace.load()
    document.fonts.add(fontFace)

    state.testerActiveFontFamily = fontName
    elements.testerPreviewRender.style.fontFamily = `'${fontName}', sans-serif`
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
    const response = await fetch('/api/list-fonts')
    if (!response.ok) throw new Error('Failed to fetch fonts list')
    let fontNames: string[] = await response.json()
    fontNames = fontNames.filter((name) => name !== 'live')

    // Populate dropdown selector
    elements.testerFontSelect.innerHTML = ''

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

    // Auto-select font: use parameter first, then current active state, fallback to live
    const targetFont = selectFontName || state.testerActiveFontFamily || 'live'

    if (targetFont === 'live') {
      elements.testerFontSelect.value = 'live'
      triggerLiveFontBuild()
    } else if (fontNames.includes(targetFont)) {
      elements.testerFontSelect.value = targetFont
      loadGeneratedFont(
        targetFont,
        `/build/${targetFont}.ttf`,
        `/build/${targetFont}.woff2`,
      )
    }
  } catch (err) {
    console.error('Error listing generated fonts:', err)
  }
}

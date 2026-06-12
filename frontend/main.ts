// Pinyin Typography Lab Main Application Logic
import TextToSVG from 'text-to-svg'
import opentype from 'opentype.js'
import ruby from '../src/ruby.js'
import {
  getAlternateGlyphEntries,
  POLYPHONIC_ENTRIES,
} from '../src/polyphonic.js'
import { traceGrayscaleImage } from '../src/vectorizer.js'
import {
  planVariantFill,
  summarizeCoverage,
  type FillDirection,
  type VariantData,
} from '../src/variants.js'
import {
  Zi2ziClient,
  Zi2ziPool,
  MODEL_SIZE,
  renderGlyphTensor,
  pickStyleRefs,
  type StyleFactors,
} from './zi2zi-client.js'
import { JitClient } from './jit/jit-client.js'
import { JitRasterizer, sampleToInk, JIT_CONTENT_SIZE } from './jit/raster.js'
import { selectTrainingSet, pickRefsFor, presetByKey } from './jit/recipe.js'

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
  chineseFont: 'droid-sans-fallback',
  managerSelectedFont: 'droid-sans',
  managerSelectedChineseFont: 'droid-sans-fallback',
  showGuides: false,
  characterWidth: 80,

  // Micro-Typography Parameters
  strategy: 'smart', // smart | proportional | global
  verticalOffset: 4, // px
  opticalSqueeze: 65, // %
  fontWeight: 500,
  letterTracking: -0.04, // em
  pinyinSize: 18, // px
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
  activeTab: 'worship', // worship | textbook | sandbox | tester | manager
  darkMode: true,
  enablePolyphonic: true,
  zi2ziThreshold: 128,
  zi2ziSmoothing: 1.0,
  zi2ziGeneratedSvg: '',
  zi2ziGeneratedChar: '',
  zi2ziStatus: 'Model not loaded',
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

  // Chinese Font Selectors
  chineseFontSelect: document.getElementById(
    'chinese-font-select',
  ) as HTMLSelectElement,
  chineseUploadZone: document.getElementById('chinese-upload-zone')!,
  chineseFileInput: document.getElementById(
    'chinese-file-input',
  ) as HTMLInputElement,
  managerChineseFontSelect: document.getElementById(
    'manager-chinese-font-select',
  ) as HTMLSelectElement,
  btnUseChinese: document.getElementById(
    'btn-use-chinese',
  ) as HTMLButtonElement,
  btnDeleteChinese: document.getElementById(
    'btn-delete-chinese',
  ) as HTMLButtonElement,
  chineseManagerPreview: document.getElementById('chinese-manager-preview')!,
  chineseFontFamilyLbl: document.getElementById('chinese-font-family-lbl')!,
  chineseFontEmLbl: document.getElementById('chinese-font-em-lbl')!,

  zi2ziInputChar: document.getElementById(
    'zi2zi-input-char',
  ) as HTMLInputElement,
  zi2ziStatusLbl: document.getElementById('zi2zi-status-lbl')!,
  zi2ziDirectionSelect: document.getElementById(
    'zi2zi-direction-select',
  ) as HTMLSelectElement,
  zi2ziModeSelect: document.getElementById(
    'zi2zi-mode-select',
  ) as HTMLSelectElement,
  zi2ziProgressBar: document.getElementById('zi2zi-progress-bar')!,
  zi2ziProgressLbl: document.getElementById('zi2zi-progress-lbl')!,
  chineseFontCoverageLbl: document.getElementById('chinese-font-coverage-lbl')!,
  rangeZi2ziThreshold: document.getElementById(
    'range-zi2zi-threshold',
  ) as HTMLInputElement,
  valZi2ziThreshold: document.getElementById('val-zi2zi-threshold')!,
  rangeZi2ziSmoothing: document.getElementById(
    'range-zi2zi-smoothing',
  ) as HTMLInputElement,
  valZi2ziSmoothing: document.getElementById('val-zi2zi-smoothing')!,
  btnZi2ziGenerate: document.getElementById(
    'btn-zi2zi-generate',
  ) as HTMLButtonElement,
  btnZi2ziInject: document.getElementById(
    'btn-zi2zi-inject',
  ) as HTMLButtonElement,
  btnZi2ziBatch: document.getElementById(
    'btn-zi2zi-batch',
  ) as HTMLButtonElement,
  zi2ziSrcPreview: document.getElementById('zi2zi-src-preview')!,
  zi2ziCanvasOutput: document.getElementById(
    'zi2zi-canvas-output',
  ) as HTMLCanvasElement,
  zi2ziSvgRender: document.getElementById('zi2zi-svg-render')!,
  jitPanel: document.getElementById('jit-panel')!,
  jitPresetSelect: document.getElementById(
    'jit-preset-select',
  ) as HTMLSelectElement,
  jitQualitySelect: document.getElementById(
    'jit-quality-select',
  ) as HTMLSelectElement,
  btnJitRetrain: document.getElementById(
    'btn-jit-retrain',
  ) as HTMLButtonElement,
  jitStatusLbl: document.getElementById('jit-status-lbl')!,
  jitTrainProgress: document.getElementById('jit-train-progress')!,
  jitTrainBar: document.getElementById('jit-train-bar')!,
  jitTrainLbl: document.getElementById('jit-train-lbl')!,
  btnJitCancelTrain: document.getElementById(
    'btn-jit-cancel-train',
  ) as HTMLButtonElement,
  jitPreview: document.getElementById('jit-preview')!,
  jitPreviewGrid: document.getElementById('jit-preview-grid')!,
  btnJitAccept: document.getElementById('btn-jit-accept') as HTMLButtonElement,
  btnJitReject: document.getElementById('btn-jit-reject') as HTMLButtonElement,
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

  params.set('chineseFont', state.chineseFont)
  params.set('zi2ziThreshold', state.zi2ziThreshold.toString())
  params.set('zi2ziSmoothing', state.zi2ziSmoothing.toString())

  const newUrl = `${window.location.pathname}?${params.toString()}${window.location.hash}`
  window.history.replaceState({}, '', newUrl)
}

// URL params are user input: clamp numbers to the slider ranges and reject
// unknown enum values so a malformed link can't crash the renderers.
function loadStateFromUrl() {
  const params = new URLSearchParams(window.location.search)

  const readString = (key: string, allowed: string[], fallback: string) => {
    const raw = params.get(key)
    return raw !== null && allowed.includes(raw) ? raw : fallback
  }
  const readInt = (key: string, fallback: number, min: number, max: number) => {
    const raw = params.get(key)
    if (raw === null) return fallback
    const val = parseInt(raw, 10)
    return Number.isFinite(val) ? Math.min(max, Math.max(min, val)) : fallback
  }
  const readFloat = (
    key: string,
    fallback: number,
    min: number,
    max: number,
  ) => {
    const raw = params.get(key)
    if (raw === null) return fallback
    const val = parseFloat(raw)
    return Number.isFinite(val) ? Math.min(max, Math.max(min, val)) : fallback
  }
  const readBool = (key: string, fallback: boolean) =>
    params.has(key) ? params.get(key) === '1' : fallback

  state.placement = readString('placement', ['top', 'bottom'], state.placement)
  if (params.has('pinyinFont')) state.pinyinFont = params.get('pinyinFont')!
  state.showGuides = readBool('showGuides', state.showGuides)
  state.characterWidth = readInt(
    'characterWidth',
    state.characterWidth,
    50,
    150,
  )
  state.strategy = readString(
    'strategy',
    ['smart', 'proportional', 'global'],
    state.strategy,
  )
  state.verticalOffset = readInt(
    'verticalOffset',
    state.verticalOffset,
    -20,
    60,
  )
  state.opticalSqueeze = readInt(
    'opticalSqueeze',
    state.opticalSqueeze,
    30,
    120,
  )
  state.fontWeight = readInt('fontWeight', state.fontWeight, 100, 900)
  state.letterTracking = readFloat(
    'letterTracking',
    state.letterTracking,
    -0.25,
    0.25,
  )
  state.pinyinSize = readInt('pinyinSize', state.pinyinSize, 8, 50)
  state.hanziSize = readInt('hanziSize', state.hanziSize, 36, 80)
  state.activeTab = readString(
    'activeTab',
    ['worship', 'textbook', 'sandbox', 'tester', 'manager'],
    state.activeTab,
  )
  state.enablePolyphonic = readBool('enablePolyphonic', state.enablePolyphonic)

  state.worshipTheme = readString(
    'worshipTheme',
    themesWorship.map((t) => t.id),
    state.worshipTheme,
  )
  state.worshipRatio = readString(
    'worshipRatio',
    ['16:9', '4:3'],
    state.worshipRatio,
  )
  state.worshipScale = readFloat('worshipScale', state.worshipScale, 0.8, 1.5)
  state.worshipSlideIndex = readInt(
    'worshipSlideIndex',
    state.worshipSlideIndex,
    0,
    presetsWorship.length - 1,
  )
  state.worshipSubtitleVisible = readBool(
    'worshipSubtitleVisible',
    state.worshipSubtitleVisible,
  )

  state.activeSyllableIndex = readInt(
    'activeSyllableIndex',
    state.activeSyllableIndex,
    -1,
    presetsSyllable.length - 1,
  )
  if (params.has('customHanzi')) state.customHanzi = params.get('customHanzi')!
  if (params.has('customPinyin'))
    state.customPinyin = params.get('customPinyin')!

  state.testerFontSize = readInt('testerFontSize', state.testerFontSize, 16, 96)
  state.testerLineHeight = readFloat(
    'testerLineHeight',
    state.testerLineHeight,
    1.0,
    3.0,
  )
  if (params.has('testerText')) state.testerText = params.get('testerText')!

  if (params.has('chineseFont')) state.chineseFont = params.get('chineseFont')!
  state.zi2ziThreshold = readInt(
    'zi2ziThreshold',
    state.zi2ziThreshold,
    20,
    230,
  )
  state.zi2ziSmoothing = readFloat(
    'zi2ziSmoothing',
    state.zi2ziSmoothing,
    0.1,
    3.0,
  )
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

  // Chinese Font Selectors Sync
  if (elements.chineseFontSelect) {
    elements.chineseFontSelect.value = state.chineseFont
  }
  if (elements.managerChineseFontSelect) {
    elements.managerChineseFontSelect.value = state.managerSelectedChineseFont
  }

  // zi2zi UI Sync
  elements.rangeZi2ziThreshold.value = state.zi2ziThreshold.toString()
  elements.valZi2ziThreshold.textContent = state.zi2ziThreshold.toString()
  elements.rangeZi2ziSmoothing.value = state.zi2ziSmoothing.toString()
  elements.valZi2ziSmoothing.textContent = state.zi2ziSmoothing.toFixed(1)
  elements.zi2ziInputChar.value = state.zi2ziGeneratedChar || '书'
  elements.zi2ziSrcPreview.textContent = elements.zi2ziInputChar.value
}

// Apply the layout configuration stored with a compiled font, then refresh
// every bound control from state.
function applySavedConfig(config: any) {
  if (!config) return
  state.placement = config.placement ?? state.placement
  state.verticalOffset = config.verticalOffset ?? state.verticalOffset
  state.opticalSqueeze = config.opticalSqueeze ?? state.opticalSqueeze
  state.fontWeight = config.fontWeight ?? state.fontWeight
  state.letterTracking = config.letterTracking ?? state.letterTracking
  state.pinyinSize = config.pinyinSize ?? state.pinyinSize
  state.hanziSize = config.hanziSize ?? state.hanziSize
  state.strategy = config.strategy ?? state.strategy
  state.characterWidth = config.characterWidth ?? state.characterWidth
  state.enablePolyphonic = config.enablePolyphonic ?? state.enablePolyphonic
  syncUIFromState()
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
    const hasPath =
      glyph && glyph.getPath && glyph.getPath(0, 0, 72).commands.length > 0
    if (glyph && glyph.index > 0 && hasPath) {
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
        const isPresent = !missing.includes(char)
        if (isPresent && !isSystem) {
          const wrapper = document.createElement('span')
          wrapper.className = 'preview-char-wrapper'

          const span = document.createElement('span')
          span.className = 'preview-char'
          span.textContent = char

          const delBtn = document.createElement('button')
          delBtn.className = 'btn-delete-glyph'
          delBtn.innerHTML = '<i class="fa-solid fa-square-xmark"></i>'
          delBtn.title = `Delete '${char}' glyph from font to regenerate`

          delBtn.addEventListener('click', async (e) => {
            e.stopPropagation()
            if (
              confirm(
                `Are you sure you want to delete glyph '${char}' from font "${fontKey}" to regenerate it?`,
              )
            ) {
              try {
                clearPinyinLogs()
                showPinyinStatus(`Removing glyph '${char}'...`, true)

                const { getPinyinFont, savePinyinFont } =
                  await import('./db.js')
                const fontEntry = await getPinyinFont(fontKey)
                if (!fontEntry) throw new Error('Font entry not found')

                const { deleteGlyphFromFont } = await import('./compiler.js')
                const updatedBytes = await deleteGlyphFromFont(
                  fontEntry.ttf,
                  char,
                  (msg) => {
                    showPinyinStatus(msg.trim(), true)
                  },
                )

                showPinyinStatus('Saving updated font...', true)
                await savePinyinFont({
                  ...fontEntry,
                  ttf: updatedBytes,
                  timestamp: Date.now(),
                })

                if (annotationFontEngines[fontKey]) {
                  delete annotationFontEngines[fontKey]
                }

                showPinyinStatus(`Glyph '${char}' deleted successfully!`, false)
                setTimeout(() => showPinyinStatus('', false), 2000)

                await refreshPinyinFontsDropdown(fontKey)
                updateUI()
              } catch (err: any) {
                console.error('Failed to delete glyph:', err)
                showPinyinStatus(`Delete failed: ${err.message}`, false)
              }
            }
          })

          wrapper.appendChild(span)
          wrapper.appendChild(delBtn)
          elements.pinyinManagerPreview.appendChild(wrapper)
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
        const res = await fetch(`./resources/fonts/${filename}`)
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
      registerFontFace(fontFace)
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

      showPinyinStatus('Patching missing characters in browser...', true)
      const { patchFontInBrowser } = await import('./compiler.js')
      const patchedBytes = await patchFontInBrowser(
        fontEntry.ttf,
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
  setupChineseFontEvents()
  setupZi2ziEvents()
  loadLocalFont()
  loadStateFromUrl()
  syncUIFromState()
  refreshPinyinFontsDropdown()
  refreshChineseFontsDropdown()
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
    state.pinyinSize = 18
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
    elements.rangePinyinSize.value = '18'
    elements.valPinyinSize.textContent = '18px'
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
            applySavedConfig(saved.config)
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
  localFontEngine = await getChineseFontEngine(state.chineseFont)
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

    const res = await fetch(`./resources/fonts/${filename}`)
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

// Tokens so overlapping async renders can't write stale DOM out of order
let worshipRenderToken = 0
let textbookRenderToken = 0
let sandboxRenderToken = 0

// Render Worship simulator viewport
async function renderWorship() {
  const token = ++worshipRenderToken
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
  if (token !== worshipRenderToken) return

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

  // Keep the fullscreen presentation clone in sync with slide navigation
  if (elements.presentationOverlay.classList.contains('active')) {
    refreshPresentationClone()
  }
}

// Render Textbook layout simulation
async function renderTextbook() {
  const token = ++textbookRenderToken
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
  if (token !== textbookRenderToken) return

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

// Render Sandbox with true vector paths computed in-browser
async function renderSandbox() {
  const token = ++sandboxRenderToken
  const syllable = getActiveSyllable()
  elements.svgPreviewContainer.innerHTML = ''

  const svgs = await getPreviews([
    { glyph: syllable.hanzi, ruby: syllable.pinyin },
  ])
  if (token !== sandboxRenderToken) return
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
        squeeze: ${state.opticalSqueeze},
        tracking: ${state.letterTracking.toFixed(3)},
        weight: ${state.fontWeight},
        strategy: '${state.strategy}'
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

// Clone the live worship viewport into the fullscreen overlay; called on entry
// and again from renderWorship whenever the slide changes while presenting.
function refreshPresentationClone() {
  const viewport = elements.worshipViewport
  elements.presentationContent.innerHTML = ''

  const clone = viewport.cloneNode(true) as HTMLElement
  clone.style.width = '90%'
  clone.style.height = '90%'
  clone.style.aspectRatio = state.worshipRatio === '4:3' ? '4/3' : '16/9'
  clone.style.maxWidth = 'none'
  clone.style.maxHeight = 'none'
  clone.querySelectorAll('.nav-slide-btn').forEach((btn) => btn.remove())

  elements.presentationContent.appendChild(clone)
}

// Present Fullscreen slide
function enterPresentation() {
  refreshPresentationClone()
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

// Register a FontFace, evicting any previously-registered faces with the same
// family. Without this, rebuilt fonts (especially the debounced 'live' build)
// accumulate in document.fonts indefinitely.
function registerFontFace(fontFace: FontFace) {
  const stale: FontFace[] = []
  document.fonts.forEach((existing) => {
    if (
      existing.family === fontFace.family ||
      existing.family === `"${fontFace.family}"`
    ) {
      stale.push(existing)
    }
  })
  stale.forEach((existing) => document.fonts.delete(existing))
  document.fonts.add(fontFace)
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
    registerFontFace(fontFace)

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
        applySavedConfig(saved.config)
        await loadGeneratedFont(targetFont, saved.ttf, saved.woff2)
      }
    }
  } catch (err) {
    console.error('Error listing generated fonts:', err)
  }
}

// In dev the SW's stale-while-revalidate serves outdated vite-transformed
// modules (each edit needs two reloads to land) — register only in prod.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
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

// Custom Chinese Font and zi2zi helper functions

const chineseFontEngines: Record<string, any> = {}

async function getChineseFontEngine(fontKey: string): Promise<any> {
  if (chineseFontEngines[fontKey]) return chineseFontEngines[fontKey]

  if (fontKey === 'droid-sans-fallback') {
    const res = await fetch('./resources/fonts/DroidSansFallbackFull.ttf')
    if (!res.ok)
      throw new Error('Failed to fetch base font DroidSansFallbackFull.ttf')
    const buffer = await res.arrayBuffer()
    const font = opentype.parse(buffer)
    const engine = new TextToSVG(font)
    chineseFontEngines[fontKey] = engine
    return engine
  } else {
    const { getChineseFont } = await import('./db.js')
    const fontEntry = await getChineseFont(fontKey)
    if (!fontEntry) {
      throw new Error(`Chinese font not found in DB: ${fontKey}`)
    }
    const buffer = fontEntry.ttf.buffer.slice(
      fontEntry.ttf.byteOffset,
      fontEntry.ttf.byteOffset + fontEntry.ttf.byteLength,
    )
    const font = opentype.parse(buffer)
    const engine = new TextToSVG(font)
    chineseFontEngines[fontKey] = engine
    return engine
  }
}

async function refreshChineseFontsDropdown(selectedName?: string) {
  try {
    const { listChineseFonts } = await import('./db.js')
    const customFonts = await listChineseFonts()

    elements.chineseFontSelect.innerHTML = ''
    elements.managerChineseFontSelect.innerHTML = ''

    const systemFonts = [
      { value: 'droid-sans-fallback', text: 'Droid Sans Fallback (System)' },
    ]

    systemFonts.forEach((f) => {
      const opt = document.createElement('option')
      opt.value = f.value
      opt.textContent = f.text
      elements.chineseFontSelect.appendChild(opt)

      const optM = document.createElement('option')
      optM.value = f.value
      optM.textContent = f.text
      elements.managerChineseFontSelect.appendChild(optM)
    })

    customFonts.forEach((f) => {
      const opt = document.createElement('option')
      opt.value = f.name
      opt.textContent = `${f.displayName}`
      elements.chineseFontSelect.appendChild(opt)

      const optM = document.createElement('option')
      optM.value = f.name
      optM.textContent = `${f.displayName}`
      elements.managerChineseFontSelect.appendChild(optM)
    })

    const target = state.chineseFont || 'droid-sans-fallback'
    elements.chineseFontSelect.value = target

    const managedTarget =
      selectedName || state.managerSelectedChineseFont || 'droid-sans-fallback'
    elements.managerChineseFontSelect.value = managedTarget
    state.managerSelectedChineseFont = managedTarget

    await auditActiveChineseFont()
    await jitRefreshPanelStatus()
  } catch (err) {
    console.error('Failed to refresh Chinese fonts list:', err)
  }
}

async function auditActiveChineseFont() {
  try {
    const fontKey = state.managerSelectedChineseFont
    const isSystem = fontKey === 'droid-sans-fallback'

    elements.btnDeleteChinese.disabled = isSystem
    elements.btnUseChinese.disabled = state.chineseFont === fontKey

    const engine = await getChineseFontEngine(fontKey)
    const font = engine.font

    elements.chineseFontFamilyLbl.textContent =
      font.names.fontFamily?.en || fontKey
    elements.chineseFontEmLbl.textContent = font.unitsPerEm.toString()
    updateChineseFontCoverageInfo(font)

    // The preview box is cosmetic; some fonts (e.g. Droid Sans Fallback Full)
    // fail Chrome's OpenType Sanitizer when loaded via FontFace even though
    // opentype.js parses them fine — fall back to the default family then.
    try {
      const fontName = `manager-chinese-${fontKey}`
      let fontBuffer: ArrayBuffer
      if (isSystem) {
        const res = await fetch('./resources/fonts/DroidSansFallbackFull.ttf')
        if (!res.ok) throw new Error('Failed to load system font file')
        fontBuffer = await res.arrayBuffer()
      } else {
        const { getChineseFont } = await import('./db.js')
        const fontEntry = await getChineseFont(fontKey)
        if (!fontEntry) throw new Error('Font entry not found')
        fontBuffer = fontEntry.ttf.buffer.slice(
          fontEntry.ttf.byteOffset,
          fontEntry.ttf.byteOffset + fontEntry.ttf.byteLength,
        )
      }
      const fontFace = new FontFace(fontName, fontBuffer)
      await fontFace.load()
      registerFontFace(fontFace)
      elements.chineseManagerPreview.style.fontFamily = `'${fontName}', sans-serif`
    } catch {
      elements.chineseManagerPreview.style.fontFamily = 'var(--font-sans)'
    }
  } catch (err) {
    console.error('Failed to audit active Chinese font:', err)
  }
}

async function handleChineseFontUpload(file: File) {
  try {
    showPinyinStatus('Reading Chinese font file...', true)
    const buffer = await file.arrayBuffer()
    const font = opentype.parse(buffer)

    const displayName =
      font.names.fontFamily?.en || file.name.replace(/\.[^/.]+$/, '')
    const name = file.name.replace(/\.[^/.]+$/, '').replace(/\s+/g, '-')

    const { saveChineseFont, deleteJitLora } = await import('./db.js')
    await saveChineseFont({
      name,
      displayName,
      ttf: new Uint8Array(buffer),
      isSystem: false,
      isPatched: false,
      timestamp: Date.now(),
    })
    // a (re-)upload under this name invalidates any style adapter trained
    // on the previous bytes
    await deleteJitLora(name).catch(() => {})
    if (jitReadyFontKey === name) jitReadyFontKey = null
    if (jitActiveSets?.fontKey === name) jitActiveSets = null

    showPinyinStatus('Chinese font uploaded successfully!', false)
    setTimeout(() => showPinyinStatus('', false), 3000)

    state.managerSelectedChineseFont = name
    await refreshChineseFontsDropdown(name)
    updateUI()
  } catch (err: any) {
    console.error('Chinese font upload failed:', err)
    showPinyinStatus(`Upload failed: ${err.message}`, false)
  }
}

function setupChineseFontEvents() {
  const zone = elements.chineseUploadZone
  const fileInput = elements.chineseFileInput

  zone.addEventListener('click', () => fileInput.click())

  fileInput.addEventListener('change', () => {
    const files = fileInput.files
    if (files && files.length > 0) {
      handleChineseFontUpload(files[0])
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
      handleChineseFontUpload(files[0])
    }
  })

  elements.managerChineseFontSelect.addEventListener('change', () => {
    state.managerSelectedChineseFont = elements.managerChineseFontSelect.value
    auditActiveChineseFont()
    jitRefreshPanelStatus()
  })

  elements.btnUseChinese.addEventListener('click', () => {
    state.chineseFont = state.managerSelectedChineseFont
    localFontEngine = null
    updateUI()
    auditActiveChineseFont()
  })

  elements.btnDeleteChinese.addEventListener('click', async () => {
    const fontKey = state.managerSelectedChineseFont
    if (['droid-sans-fallback'].includes(fontKey)) return

    if (confirm(`Are you sure you want to delete Chinese font "${fontKey}"?`)) {
      try {
        const { deleteChineseFont, deleteJitLora } = await import('./db.js')
        await deleteChineseFont(fontKey)
        await deleteJitLora(fontKey).catch(() => {})
        if (jitReadyFontKey === fontKey) jitReadyFontKey = null
        if (jitActiveSets?.fontKey === fontKey) jitActiveSets = null
        if (chineseFontEngines[fontKey]) {
          delete chineseFontEngines[fontKey]
        }
        if (state.chineseFont === fontKey) {
          state.chineseFont = 'droid-sans-fallback'
          localFontEngine = null
        }
        state.managerSelectedChineseFont = 'droid-sans-fallback'
        await refreshChineseFontsDropdown()
        updateUI()
      } catch (err) {
        console.error('Delete Chinese font failed:', err)
      }
    }
  })
}

// --- AI glyph generation (zi2zi-style few-shot style transfer, MX-Font) ---
//
// The model takes a handful of glyphs from the ACTIVE Chinese font as style
// references and a rendering of the wanted character from the bundled
// reference font (Droid Sans Fallback) as content, and produces the character
// in the active font's style. Used to fill missing simplified/traditional
// halves of partial fonts; the deterministic alternative simply remaps the
// codepoint to the existing counterpart glyph (exact style, variant shape).

const zi2zi = new Zi2ziClient()
const zi2ziPool = new Zi2ziPool(zi2zi)
let zi2ziStyleFontKey: string | null = null
let zi2ziPoolStyleFontKey: string | null = null
let lastStyleFactors: StyleFactors | null = null
let lastGenerated: { char: string; ink: Float32Array } | null = null
let batchCancelRequested = false
let lastBatchPreviewAt = 0

// Debug/benchmark hook for automated tests and console experiments.
;(window as any).__zi2zi = {
  client: zi2zi,
  newClient: () => new Zi2ziClient(),
  ensureReady: (fontKey: string) => ensureZi2ziReady(fontKey),
  generate: (char: string) => generateGlyphInk(char),
  trace: (ink: Float32Array, threshold: number, smoothing: number) =>
    traceGrayscaleImage(ink, MODEL_SIZE, MODEL_SIZE, threshold, smoothing),
  renderGlyphTensor,
  pickStyleRefs,
  getEngine: (key: string) => getChineseFontEngine(key),
}

// Console/test harness over the shared style-faithful client (same worker
// the UX uses, so manual experiments observe real app state). Note: unlike
// the old inline harness, prepare/sample TRANSFER their Float32Array
// buffers to the worker — pass fresh copies if you reuse arrays.
;(window as any).__jit = {
  progress: [] as any[],
  init: () => ensureJitInit().then(() => ({ device: jitDevice })),
  parity: (goldensBase: string, mode?: string, batch?: number) =>
    getJitClient().parity(goldensBase, mode, batch),
  prepare: (samples: any[], nullFontIndex: number) =>
    getJitClient().prepare(samples, nullFontIndex),
  train: (opts: any) => getJitClient().train(opts),
  sample: (args: any) => getJitClient().sample(args),
  abort: () => getJitClient().abort(),
  exportLora: () => getJitClient().exportLora(),
  dispose: () => {
    jitClient?.dispose()
    jitClient = null
    jitDevice = null
    jitReadyFontKey = null
  },
}

// ===== Style-faithful fill (in-browser zi2zi-JiT LoRA fine-tuning) =====

// fine-tuned slot in the model's font-embedding table; slot numFonts (1000)
// is the CFG null label — both fixed by the exported jit_config.json
const JIT_FONT_INDEX = 1
const JIT_NULL_FONT_INDEX = 1000
const JIT_CFG = 2.6
const JIT_SEED = 42
const JIT_BATCH_SIZE = 2 // hard cap: larger batches exceed kernel index space

let jitClient: JitClient | null = null
let jitDevice: string | null = null
// font whose LoRA is currently loaded in the worker
let jitReadyFontKey: string | null = null
// the codepoint split the loaded adapter was trained with — generation must
// draw style refs from it (a partially filled font's live coverage would
// leak AI-generated glyphs into the reference picks)
let jitActiveSets: {
  fontKey: string
  trainCps: number[]
  holdoutCps: number[]
} | null = null
let jitPreviewResolve: ((accepted: boolean) => void) | null = null

function getJitClient(): JitClient {
  if (!jitClient) {
    jitClient = new JitClient()
    jitClient.onTrainProgress = (p) => (window as any).__jit.progress.push(p)
  }
  return jitClient
}

async function ensureJitInit(): Promise<JitClient> {
  const client = getJitClient()
  if (!jitDevice) {
    setZi2ziStatus(
      'Loading style-faithful model (~370 MB on first use, cached offline)…',
    )
    const { device } = await client.init(new URL('./', document.baseURI).href)
    jitDevice = device
    if (device !== 'webgpu') {
      setZi2ziStatus(
        'Warning: WebGPU unavailable — style-faithful training would take hours on CPU.',
      )
    }
  }
  return client
}

function jitSamplerSteps(): number {
  return elements.jitQualitySelect.value === 'draft' ? 8 : 20
}

// Renders the train/holdout context for the selected font: rasterizers for
// the user font (targets + style refs) and the content font, plus the
// character split. When an adapter is loaded, the split it was TRAINED with
// (jitActiveSets) takes precedence over recomputing from live coverage.
//
// Content images come from Droid Sans Fallback rather than the offline
// recipe's Source Han Serif (11 MB, not shipped): training and generation
// use the same content font, so the LoRA absorbs the distribution shift —
// an accepted trade-off until a Source Han subset ships.
async function jitBuildContext(fontKey: string) {
  const engine = await getChineseFontEngine(fontKey)
  const contentEngine = await getChineseFontEngine('droid-sans-fallback')
  const userRaster = new JitRasterizer(engine.font, JIT_CONTENT_SIZE)
  const contentRaster = new JitRasterizer(contentEngine.font, JIT_CONTENT_SIZE)
  const preset = presetByKey(elements.jitPresetSelect.value)
  let train: number[]
  let holdout: number[]
  if (jitActiveSets && jitActiveSets.fontKey === fontKey) {
    train = jitActiveSets.trainCps
    holdout = jitActiveSets.holdoutCps
  } else {
    const covered = coveredCodepoints(engine.font)
    ;({ train, holdout } = selectTrainingSet(covered, preset.chars))
  }
  return { engine, userRaster, contentRaster, train, holdout, preset }
}

// Trains a fresh LoRA on the font and persists it; returns false when the
// whole fill flow should stop (user cancelled via the main batch button).
// Stopping via "Stop Training" keeps the partial adapter and continues to
// the preview gate, where the user judges whether it is usable.
async function jitRunTraining(fontKey: string): Promise<boolean> {
  const client = await ensureJitInit()
  if (batchCancelRequested) return false
  // a retrain must compute a fresh split, not inherit the deleted adapter's
  if (jitActiveSets?.fontKey === fontKey) jitActiveSets = null
  const ctx = await jitBuildContext(fontKey)
  if (ctx.train.length < 8) {
    throw new Error('This font has too few CJK glyphs to learn its style from.')
  }

  // Unlike the offline recipe there is no per-epoch resize-and-random-crop
  // augmentation (samples are encoded once); with the small browser presets
  // the regularization loss is an accepted trade-off.
  setZi2ziStatus('Rendering training samples…')
  const samples = []
  const trainedCps: number[] = []
  for (const cp of ctx.train) {
    const image = ctx.userRaster.renderTensor(cp)
    const contentImage = ctx.contentRaster.renderTensor(cp)
    const refs = pickRefsFor(cp, ctx.train)
    const styleImage =
      refs.length > 0 ? ctx.userRaster.renderStyleImage(refs) : null
    if (!image || !contentImage || !styleImage) continue
    samples.push({ image, styleImage, contentImage, fontIndex: JIT_FONT_INDEX })
    trainedCps.push(cp)
  }
  if (samples.length < 8) {
    throw new Error('Too few renderable training samples in this font.')
  }
  if (batchCancelRequested) return false

  elements.jitTrainProgress.style.display = ''
  elements.jitTrainBar.style.width = '0%'
  try {
    client.onPrepareProgress = (done, total) => {
      elements.jitTrainLbl.textContent = `Encoding samples ${done}/${total}…`
      elements.jitTrainBar.style.width = `${Math.round((done / total) * 12)}%`
    }
    // the main batch button doubles as cancel-all; the watch also covers the
    // minutes-long prepare phase (the worker polls the abort flag there)
    const cancelWatch = setInterval(() => {
      if (batchCancelRequested) client.abort().catch(() => {})
    }, 500)
    let aborted: boolean
    try {
      setZi2ziStatus(`Preparing ${samples.length} training samples…`)
      const prep = await client.prepare(samples, JIT_NULL_FONT_INDEX)
      if (prep.aborted) {
        setZi2ziStatus('Training stopped before it began.')
        return false
      }

      const stepsPerEpoch = Math.max(
        1,
        Math.floor(samples.length / JIT_BATCH_SIZE),
      )
      const totalSteps = stepsPerEpoch * ctx.preset.epochs
      const stepTimes: number[] = []
      let lastTick = performance.now()
      client.onTrainProgress = (p) => {
        const globalStep = p.epoch * p.stepsPerEpoch + p.step + 1
        const now = performance.now()
        stepTimes.push(now - lastTick)
        lastTick = now
        if (stepTimes.length > 20) stepTimes.shift()
        const avgMs = stepTimes.reduce((a, b) => a + b, 0) / stepTimes.length
        const etaMin = Math.round(((totalSteps - globalStep) * avgMs) / 60000)
        elements.jitTrainBar.style.width = `${12 + Math.round((globalStep / totalSteps) * 88)}%`
        elements.jitTrainLbl.textContent = `Training ${globalStep}/${totalSteps} — loss ${p.loss.toFixed(3)} — ${etaMin < 1 ? '<1' : '~' + etaMin} min left`
      }
      setZi2ziStatus('Training the style adapter on your font…')
      const res = await client.train({
        epochs: ctx.preset.epochs,
        batchSize: JIT_BATCH_SIZE,
        lr: 8e-4,
        warmupEpochs: 1,
        minLr: 1e-5,
        seed: JIT_SEED,
      })
      aborted = res.aborted
    } finally {
      clearInterval(cancelWatch)
    }
    if (aborted && batchCancelRequested) return false

    setZi2ziStatus('Saving the trained adapter…')
    const { lora } = await client.exportLora()
    const { saveJitLora } = await import('./db.js')
    await saveJitLora({
      fontName: fontKey,
      lora,
      trainedAt: Date.now(),
      presetKey: ctx.preset.key,
      trainChars: samples.length,
      epochs: ctx.preset.epochs,
      trainCps: trainedCps,
      holdoutCps: ctx.holdout,
    })
    jitReadyFontKey = fontKey
    jitActiveSets = {
      fontKey,
      trainCps: trainedCps,
      holdoutCps: ctx.holdout,
    }
    return true
  } finally {
    elements.jitTrainProgress.style.display = 'none'
    client.onPrepareProgress = null
    // restore the console-harness recorder the UI updater displaced
    client.onTrainProgress = (p) => (window as any).__jit.progress.push(p)
  }
}

// Makes sure a LoRA for this font is loaded in the worker, training one if
// none is saved. Returns false if the user cancelled.
async function jitEnsureTrained(fontKey: string): Promise<boolean> {
  if (jitReadyFontKey === fontKey) return true
  const client = await ensureJitInit()
  const { getJitLora } = await import('./db.js')
  const saved = await getJitLora(fontKey)
  if (saved) {
    setZi2ziStatus('Loading the saved style adapter…')
    await client.importLora(saved.lora, JIT_NULL_FONT_INDEX)
    jitReadyFontKey = fontKey
    jitActiveSets =
      saved.trainCps?.length && saved.holdoutCps?.length
        ? {
            fontKey,
            trainCps: saved.trainCps,
            holdoutCps: saved.holdoutCps,
          }
        : null
    return true
  }
  return jitRunTraining(fontKey)
}

// Held-out style check: real glyphs (top) vs generated (bottom). Resolves
// true when the user accepts.
async function jitPreviewGate(fontKey: string): Promise<boolean> {
  const client = await ensureJitInit()
  const ctx = await jitBuildContext(fontKey)
  const steps = jitSamplerSteps()
  elements.jitPreviewGrid.innerHTML = ''
  elements.jitPreview.style.display = 'none'

  const cellSize = 96
  let made = 0
  for (const cp of ctx.holdout) {
    if (batchCancelRequested) return false
    const contentImage = ctx.contentRaster.renderTensor(cp)
    const refs = pickRefsFor(cp, ctx.train)
    const styleImage =
      refs.length > 0 ? ctx.userRaster.renderStyleImage(refs) : null
    if (!contentImage || !styleImage) continue
    setZi2ziStatus(
      `Generating style check ${made + 1}/${ctx.holdout.length} ('${String.fromCodePoint(cp)}')…`,
    )
    const { image } = await client.sample({
      styleImage,
      contentImage,
      fontIndex: JIT_FONT_INDEX,
      steps,
      cfg: JIT_CFG,
      seed: JIT_SEED + cp,
    })
    const ink = sampleToInk(image, JIT_CONTENT_SIZE)

    const cell = document.createElement('div')
    cell.style.cssText =
      'display:flex;flex-direction:column;gap:2px;align-items:center'
    const real = document.createElement('canvas')
    real.width = cellSize
    real.height = cellSize
    real.style.cssText =
      'border:1px solid var(--border-color);border-radius:4px'
    if (ctx.userRaster.renderToCanvas(cp)) {
      const rctx = real.getContext('2d')!
      rctx.imageSmoothingEnabled = true
      rctx.imageSmoothingQuality = 'high'
      rctx.drawImage(
        ctx.userRaster.canvasEl,
        0,
        0,
        JIT_CONTENT_SIZE,
        JIT_CONTENT_SIZE,
        0,
        0,
        cellSize,
        cellSize,
      )
    }
    const gen = document.createElement('canvas')
    gen.width = cellSize
    gen.height = cellSize
    gen.style.cssText = real.style.cssText
    const full = document.createElement('canvas')
    full.width = JIT_CONTENT_SIZE
    full.height = JIT_CONTENT_SIZE
    const fctx = full.getContext('2d')!
    const imgData = fctx.createImageData(JIT_CONTENT_SIZE, JIT_CONTENT_SIZE)
    for (let i = 0; i < ink.length; i++) {
      const v = Math.round((1 - ink[i]) * 255) // ink-high -> dark pixels
      imgData.data[i * 4] = v
      imgData.data[i * 4 + 1] = v
      imgData.data[i * 4 + 2] = v
      imgData.data[i * 4 + 3] = 255
    }
    fctx.putImageData(imgData, 0, 0)
    const gctx = gen.getContext('2d')!
    gctx.imageSmoothingEnabled = true
    gctx.imageSmoothingQuality = 'high'
    gctx.drawImage(
      full,
      0,
      0,
      JIT_CONTENT_SIZE,
      JIT_CONTENT_SIZE,
      0,
      0,
      cellSize,
      cellSize,
    )
    cell.appendChild(real)
    cell.appendChild(gen)
    elements.jitPreviewGrid.appendChild(cell)
    made++
  }
  if (batchCancelRequested) return false
  if (made === 0) {
    throw new Error('Could not generate style-check glyphs.')
  }

  elements.jitPreview.style.display = ''
  setZi2ziStatus('Review the style check, then confirm to fill.')
  return new Promise<boolean>((resolve) => {
    jitPreviewResolve = (accepted) => {
      jitPreviewResolve = null
      elements.jitPreview.style.display = 'none'
      resolve(accepted)
    }
  })
}

// Updates the panel's idle status line (saved adapter? device?) — called on
// mode change and after training.
async function jitRefreshPanelStatus() {
  const fontKey = state.managerSelectedChineseFont
  if (elements.zi2ziModeSelect.value !== 'faithful') {
    elements.jitPanel.style.display = 'none'
    return
  }
  elements.jitPanel.style.display = ''
  if (fontKey === 'droid-sans-fallback') {
    elements.jitStatusLbl.textContent =
      'Select an uploaded font — the bundled font already covers both scripts.'
    elements.btnJitRetrain.style.display = 'none'
    return
  }
  try {
    const { getJitLora } = await import('./db.js')
    const saved = await getJitLora(fontKey)
    if (saved) {
      const when = new Date(saved.trainedAt).toLocaleDateString()
      elements.jitStatusLbl.textContent = `Style adapter trained (${saved.presetKey}, ${saved.trainChars} glyphs, ${when}). Filling reuses it — retrain to start over.`
      elements.btnJitRetrain.style.display = ''
    } else {
      elements.jitStatusLbl.textContent =
        'Trains a small adapter on your font in the browser (WebGPU), then generates missing glyphs in its exact style. The model download is ~370 MB on first use.'
      elements.btnJitRetrain.style.display = 'none'
    }
  } catch {
    elements.btnJitRetrain.style.display = 'none'
  }
}

let variantDataPromise: Promise<VariantData> | null = null
function loadVariantData(): Promise<VariantData> {
  if (!variantDataPromise) {
    variantDataPromise = fetch('./data/variants.json').then((res) => {
      if (!res.ok)
        throw new Error(
          'variants.json not found — run "npm run download:opencc"',
        )
      return res.json()
    })
  }
  return variantDataPromise
}

function coveredCodepoints(font: any): Set<number> {
  const map = font.tables?.cmap?.glyphIndexMap || {}
  const covered = new Set<number>()
  for (const key of Object.keys(map)) {
    if (map[key] > 0) covered.add(Number(key))
  }
  return covered
}

function setZi2ziStatus(msg: string) {
  state.zi2ziStatus = msg
  if (elements.zi2ziStatusLbl) elements.zi2ziStatusLbl.textContent = msg
}

async function ensureZi2ziReady(styleFontKey: string): Promise<void> {
  setZi2ziStatus('Loading MX-Font model (cached for offline use)…')
  const ep = await zi2zi.init()
  if (zi2ziStyleFontKey !== styleFontKey) {
    const engine = await getChineseFontEngine(styleFontKey)
    const { chars, tensors } = pickStyleRefs(engine.font, 6)
    if (tensors.length === 0) {
      throw new Error(
        'The selected font has no usable CJK glyphs to use as style references',
      )
    }
    setZi2ziStatus(`Encoding style references: ${chars.join(' ')}`)
    lastStyleFactors = await zi2zi.setStyle(tensors)
    zi2ziStyleFontKey = styleFontKey
  }
  setZi2ziStatus(`Model ready (${ep === 'webgpu' ? 'GPU accelerated' : 'CPU'})`)
}

// Grows the worker pool for batch generation and keeps every sibling's style
// factors in sync with the seed client's.
async function ensureZi2ziPool(): Promise<number> {
  const size = await zi2ziPool.grow(lastStyleFactors)
  if (
    zi2ziPoolStyleFontKey !== zi2ziStyleFontKey &&
    lastStyleFactors &&
    size > 1
  ) {
    await zi2ziPool.setStyleAll(lastStyleFactors)
  }
  zi2ziPoolStyleFontKey = zi2ziStyleFontKey
  return size
}

// Invalidate the cached style factors when the style-source font changes
function invalidateZi2ziStyle(fontKey: string) {
  if (zi2ziStyleFontKey === fontKey) zi2ziStyleFontKey = null
}

async function generateGlyphInk(
  char: string,
  client: Zi2ziClient = zi2zi,
): Promise<Float32Array> {
  const refEngine = await getChineseFontEngine('droid-sans-fallback')
  const content = renderGlyphTensor(refEngine.font, char)
  if (!content) {
    throw new Error(`Reference font has no outline for '${char}'`)
  }
  return client.generate(content)
}

function renderInkToCanvas(ink: Float32Array, canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!
  const imgData = ctx.createImageData(MODEL_SIZE, MODEL_SIZE)
  for (let i = 0; i < ink.length; i++) {
    const val = Math.min(255, Math.max(0, Math.round(ink[i] * 255)))
    imgData.data[i * 4] = val
    imgData.data[i * 4 + 1] = val
    imgData.data[i * 4 + 2] = val
    imgData.data[i * 4 + 3] = 255
  }
  ctx.putImageData(imgData, 0, 0)
}

function retraceAndPreview() {
  if (!lastGenerated) return
  const svgPath = traceGrayscaleImage(
    lastGenerated.ink,
    MODEL_SIZE,
    MODEL_SIZE,
    state.zi2ziThreshold,
    state.zi2ziSmoothing,
  )
  state.zi2ziGeneratedSvg = svgPath
  state.zi2ziGeneratedChar = lastGenerated.char

  const isCustomFont =
    state.managerSelectedChineseFont !== 'droid-sans-fallback'
  if (svgPath) {
    elements.zi2ziSvgRender.innerHTML = `<path d="${svgPath}" />`
    elements.btnZi2ziInject.disabled = !isCustomFont
  } else {
    elements.zi2ziSvgRender.innerHTML =
      '<text x="14" y="72" fill="var(--text-secondary)" font-size="16">Empty</text>'
    elements.btnZi2ziInject.disabled = true
  }
}

// Finds the codepoint of an existing variant counterpart in the font, used to
// anchor the metrics of injected glyphs (and as alias fill target).
async function findCounterpartCp(
  char: string,
  font: any,
): Promise<number | null> {
  const data = await loadVariantData()
  const covered = coveredCodepoints(font)
  for (const candidates of [data.s2t[char], data.t2s[char]]) {
    for (const cand of candidates || []) {
      if (cand === char) continue
      const cp = cand.codePointAt(0)!
      if (covered.has(cp)) return cp
    }
  }
  return null
}

async function updateChineseFontCoverageInfo(font: any) {
  if (!elements.chineseFontCoverageLbl) return
  try {
    const data = await loadVariantData()
    const covered = coveredCodepoints(font)
    const summary = summarizeCoverage(covered, data)
    elements.chineseFontCoverageLbl.textContent =
      `${summary.simplifiedPresent} simplified / ${summary.traditionalPresent} traditional mapped chars; ` +
      `fillable: ${summary.s2tFillable} simplified, ${summary.t2sFillable} traditional`
  } catch {
    elements.chineseFontCoverageLbl.textContent = 'variant data unavailable'
  }
}

function setupZi2ziEvents() {
  elements.rangeZi2ziThreshold.addEventListener('input', () => {
    state.zi2ziThreshold = parseInt(elements.rangeZi2ziThreshold.value)
    elements.valZi2ziThreshold.textContent = state.zi2ziThreshold.toString()
    retraceAndPreview()
  })

  elements.rangeZi2ziSmoothing.addEventListener('input', () => {
    state.zi2ziSmoothing = parseFloat(elements.rangeZi2ziSmoothing.value)
    elements.valZi2ziSmoothing.textContent = state.zi2ziSmoothing.toFixed(1)
    retraceAndPreview()
  })

  elements.zi2ziInputChar.addEventListener('input', () => {
    elements.zi2ziSrcPreview.textContent = elements.zi2ziInputChar.value.trim()
  })

  elements.btnZi2ziGenerate.addEventListener('click', async () => {
    const char = [...elements.zi2ziInputChar.value.trim()][0]
    if (!char) return

    elements.btnZi2ziGenerate.disabled = true
    elements.btnZi2ziGenerate.innerHTML =
      '<i class="fa-solid fa-circle-notch fa-spin"></i> Generating…'
    try {
      await ensureZi2ziReady(state.managerSelectedChineseFont)
      const ink = await generateGlyphInk(char)
      lastGenerated = { char, ink }
      renderInkToCanvas(ink, elements.zi2ziCanvasOutput)
      retraceAndPreview()
      setZi2ziStatus(
        `Generated '${char}' in the style of ${state.managerSelectedChineseFont}`,
      )
    } catch (err: any) {
      console.error('zi2zi generation failed:', err)
      setZi2ziStatus(`Generation failed: ${err.message}`)
    } finally {
      elements.btnZi2ziGenerate.disabled = false
      elements.btnZi2ziGenerate.innerHTML =
        '<i class="fa-solid fa-wand-magic-sparkles"></i> Generate Stylized Glyph'
    }
  })

  elements.btnZi2ziInject.addEventListener('click', async () => {
    const fontKey = state.managerSelectedChineseFont
    if (fontKey === 'droid-sans-fallback') return
    if (!state.zi2ziGeneratedChar || !state.zi2ziGeneratedSvg) return

    try {
      clearPinyinLogs()
      showPinyinStatus(
        `Injecting generated glyph '${state.zi2ziGeneratedChar}'…`,
        true,
      )

      const { getChineseFont, saveChineseFont } = await import('./db.js')
      const fontEntry = await getChineseFont(fontKey)
      if (!fontEntry) throw new Error('Selected Chinese font not found.')

      const engine = await getChineseFontEngine(fontKey)
      const cp = state.zi2ziGeneratedChar.codePointAt(0)!
      const targetCp = await findCounterpartCp(
        state.zi2ziGeneratedChar,
        engine.font,
      )

      const { patchChineseFontInBrowser } = await import('./compiler.js')
      const updatedBytes = await patchChineseFontInBrowser(
        fontEntry.ttf,
        {
          aliases: [],
          glyphs: [{ cp, svgPath: state.zi2ziGeneratedSvg, targetCp }],
        },
        (msg) => showPinyinStatus(msg.trim(), true),
      )

      await saveChineseFont({
        ...fontEntry,
        ttf: updatedBytes,
        isPatched: true,
        timestamp: Date.now(),
      })
      delete chineseFontEngines[fontKey]
      invalidateZi2ziStyle(fontKey)
      if (state.chineseFont === fontKey) localFontEngine = null

      showPinyinStatus(
        `Glyph '${state.zi2ziGeneratedChar}' injected into ${fontKey}!`,
        false,
      )
      setTimeout(() => showPinyinStatus('', false), 3000)
      await refreshChineseFontsDropdown(fontKey)
      updateUI()
    } catch (err: any) {
      console.error('Injection failed:', err)
      showPinyinStatus(`Injection failed: ${err.message}`, false)
    }
  })

  elements.btnZi2ziBatch.addEventListener('click', async () => {
    if (elements.btnZi2ziBatch.dataset.running === '1') {
      batchCancelRequested = true
      elements.btnZi2ziBatch.innerHTML = 'Cancelling…'
      // a pending style-check gate counts as cancelled too
      jitPreviewResolve?.(false)
      return
    }
    const fontKey = state.managerSelectedChineseFont
    if (fontKey === 'droid-sans-fallback') {
      alert(
        'Upload and select a custom Chinese font first — the bundled font already covers both scripts.',
      )
      return
    }
    await runBatchFill(fontKey)
  })

  elements.zi2ziModeSelect.addEventListener('change', () => {
    jitRefreshPanelStatus()
  })
  elements.btnJitRetrain.addEventListener('click', async () => {
    const fontKey = state.managerSelectedChineseFont
    if (
      !confirm(
        'Discard the saved style adapter for this font and retrain from scratch on the next fill?',
      )
    )
      return
    const { deleteJitLora } = await import('./db.js')
    await deleteJitLora(fontKey)
    if (jitReadyFontKey === fontKey) jitReadyFontKey = null
    if (jitActiveSets?.fontKey === fontKey) jitActiveSets = null
    await jitRefreshPanelStatus()
  })
  elements.btnJitCancelTrain.addEventListener('click', () => {
    elements.jitTrainLbl.textContent = 'Stopping after the current step…'
    jitClient?.abort().catch(() => {})
  })
  elements.btnJitAccept.addEventListener('click', () => {
    jitPreviewResolve?.(true)
  })
  elements.btnJitReject.addEventListener('click', () => {
    jitPreviewResolve?.(false)
  })
  jitRefreshPanelStatus()
}

async function runBatchFill(fontKey: string) {
  const mode = elements.zi2ziModeSelect.value as 'ai' | 'alias' | 'faithful'
  const direction = elements.zi2ziDirectionSelect.value as
    | FillDirection
    | 'auto'

  try {
    const engine = await getChineseFontEngine(fontKey)
    const data = await loadVariantData()
    const covered = coveredCodepoints(engine.font)
    const plan = planVariantFill(covered, data, direction)

    if (plan.items.length === 0) {
      setZi2ziStatus(
        'No fillable characters found — the font may already cover both scripts.',
      )
      return
    }

    const dirLabel = plan.direction === 's2t' ? 'simplified' : 'traditional'
    const modeLabel =
      mode === 'ai'
        ? 'AI style transfer (generated glyph shapes)'
        : mode === 'faithful'
          ? 'style-faithful AI (trains on this font first)'
          : 'variant mapping (reuse counterpart glyphs, exact style)'
    let estimate = ''
    if (mode === 'ai') {
      estimate = `\n\nEstimated time: ~${Math.ceil((plan.items.length * 2) / 60)} min.`
    } else if (mode === 'faithful') {
      const perGlyphSec = jitSamplerSteps() === 8 ? 6 : 13
      const genMin = Math.ceil((plan.items.length * perGlyphSec) / 60)
      const { getJitLora } = await import('./db.js')
      const saved = await getJitLora(fontKey)
      estimate = saved
        ? `\n\nUses the saved style adapter. Estimated generation: ~${genMin} min (cancel anytime — partial fills are saved).`
        : `\n\nTrains on your font first (see Training Effort), then a style check, then ~${genMin} min of generation. Cancel anytime — partial fills are saved.`
    }
    if (
      !confirm(
        `Fill ${plan.items.length} missing ${dirLabel} characters using ${modeLabel}?` +
          estimate,
      )
    ) {
      return
    }

    batchCancelRequested = false
    elements.btnZi2ziBatch.dataset.running = '1'
    elements.btnZi2ziBatch.innerHTML = '<i class="fa-solid fa-stop"></i> Cancel'
    // switching font/mode/preset mid-run would hide the live controls
    // (Stop Training, Accept/Discard) and desync the flow's snapshot
    elements.zi2ziModeSelect.disabled = true
    elements.managerChineseFontSelect.disabled = true
    elements.jitPresetSelect.disabled = true
    clearPinyinLogs()

    const spec: import('./compiler.js').ChineseFontPatchSpec = {
      aliases: [],
      glyphs: [],
    }
    let aliasFallbacks = 0

    if (mode === 'alias') {
      spec.aliases = plan.items.map((item) => ({
        cp: item.cp,
        toCp: item.counterpartCp,
      }))
      setZi2ziStatus(
        `Mapping ${spec.aliases.length} codepoints to counterpart glyphs…`,
      )
    } else if (mode === 'faithful') {
      const trained = await jitEnsureTrained(fontKey)
      await jitRefreshPanelStatus()
      if (!trained) {
        setZi2ziStatus('Style-faithful fill cancelled.')
        return
      }
      const accepted = await jitPreviewGate(fontKey)
      if (!accepted) {
        setZi2ziStatus(
          batchCancelRequested
            ? 'Style-faithful fill cancelled.'
            : 'Style check discarded — adjust Training Effort and retrain if the style is off.',
        )
        return
      }
      // warm Pyodide while glyphs generate so the patch step starts instantly
      import('./compiler.js').then((m) => m.prewarmPyodide()).catch(() => {})
      const client = await ensureJitInit()
      const genCtx = await jitBuildContext(fontKey)
      const steps = jitSamplerSteps()
      let completed = 0
      for (const item of plan.items) {
        if (batchCancelRequested) break
        try {
          const contentImage = genCtx.contentRaster.renderTensor(item.cp)
          if (!contentImage)
            throw new Error('content font has no outline for this character')
          const refs = pickRefsFor(item.cp, genCtx.train)
          const styleImage =
            refs.length > 0 ? genCtx.userRaster.renderStyleImage(refs) : null
          if (!styleImage)
            throw new Error('could not assemble style references')
          const { image } = await client.sample({
            styleImage,
            contentImage,
            fontIndex: JIT_FONT_INDEX,
            steps,
            cfg: JIT_CFG,
            seed: JIT_SEED + item.cp,
          })
          const ink = sampleToInk(image, JIT_CONTENT_SIZE)
          const svgPath = traceGrayscaleImage(
            ink,
            JIT_CONTENT_SIZE,
            JIT_CONTENT_SIZE,
            state.zi2ziThreshold,
            state.zi2ziSmoothing,
            // offline-validated 256px params: speckle floor scales with
            // pixel area, and diffusion edges want the looser 0.8 fit
            { minLoopArea: 8.0, fitError: 0.8 },
          )
          if (!svgPath) throw new Error('empty outline after vectorization')
          spec.glyphs.push({
            cp: item.cp,
            svgPath,
            targetCp: item.counterpartCp,
          })
        } catch (err: any) {
          console.warn(
            `Style-faithful generation failed for '${item.char}', falling back to variant mapping:`,
            err,
          )
          spec.aliases.push({ cp: item.cp, toCp: item.counterpartCp })
          aliasFallbacks++
        }
        completed++
        setZi2ziStatus(
          `[${completed}/${plan.items.length}] Generating style-faithful glyphs… latest: '${item.char}'`,
        )
        updateBatchProgress(completed, plan.items.length)
      }
    } else {
      await ensureZi2ziReady(fontKey)
      // warm Pyodide while glyphs generate so the patch step starts instantly
      import('./compiler.js').then((m) => m.prewarmPyodide()).catch(() => {})
      const poolSize = await ensureZi2ziPool()
      let completed = 0
      await zi2ziPool.run(
        plan.items.length,
        async (client, i) => {
          const item = plan.items[i]
          try {
            const ink = await generateGlyphInk(item.char, client)
            const svgPath = traceGrayscaleImage(
              ink,
              MODEL_SIZE,
              MODEL_SIZE,
              state.zi2ziThreshold,
              state.zi2ziSmoothing,
            )
            if (!svgPath) throw new Error('empty outline after vectorization')
            spec.glyphs.push({
              cp: item.cp,
              svgPath,
              targetCp: item.counterpartCp,
            })
            lastGenerated = { char: item.char, ink }
            // preview rendering costs a few ms per glyph (putImageData +
            // re-trace); throttle it so fast EPs aren't bottlenecked by DOM
            const now = performance.now()
            if (now - lastBatchPreviewAt > 250) {
              lastBatchPreviewAt = now
              renderInkToCanvas(ink, elements.zi2ziCanvasOutput)
              retraceAndPreview()
            }
          } catch (err: any) {
            console.warn(
              `Generation failed for '${item.char}', falling back to variant mapping:`,
              err,
            )
            spec.aliases.push({ cp: item.cp, toCp: item.counterpartCp })
            aliasFallbacks++
          }
          completed++
          setZi2ziStatus(
            `[${completed}/${plan.items.length}] Generating glyphs (${poolSize} ${poolSize > 1 ? 'parallel workers' : 'worker'})… latest: '${item.char}'`,
          )
          updateBatchProgress(completed, plan.items.length)
        },
        () => batchCancelRequested,
      )
      // make sure the preview reflects the final glyph after throttling
      if (lastGenerated) {
        renderInkToCanvas(lastGenerated.ink, elements.zi2ziCanvasOutput)
        retraceAndPreview()
      }
    }

    const totalOps = spec.aliases.length + spec.glyphs.length
    if (totalOps === 0) {
      setZi2ziStatus('Batch cancelled — nothing to patch.')
      return
    }

    setZi2ziStatus(`Patching font with ${totalOps} characters…`)
    const { getChineseFont, saveChineseFont } = await import('./db.js')
    const fontEntry = await getChineseFont(fontKey)
    if (!fontEntry) throw new Error('Font entry not found')

    const { patchChineseFontInBrowser } = await import('./compiler.js')
    const updatedBytes = await patchChineseFontInBrowser(
      fontEntry.ttf,
      spec,
      (msg) => showPinyinStatus(msg.trim(), true),
    )

    await saveChineseFont({
      ...fontEntry,
      ttf: updatedBytes,
      isPatched: true,
      timestamp: Date.now(),
    })
    delete chineseFontEngines[fontKey]
    invalidateZi2ziStyle(fontKey)
    if (state.chineseFont === fontKey) localFontEngine = null

    const summaryParts = [
      spec.glyphs.length ? `${spec.glyphs.length} AI-generated` : '',
      spec.aliases.length ? `${spec.aliases.length} variant-mapped` : '',
      plan.missingNoCounterpart.length
        ? `${plan.missingNoCounterpart.length} skipped (no counterpart in font)`
        : '',
      aliasFallbacks ? `(${aliasFallbacks} fell back to mapping)` : '',
    ].filter(Boolean)
    setZi2ziStatus(
      `${batchCancelRequested ? 'Cancelled — partial fill saved. ' : 'Done! '}${summaryParts.join(', ')}.`,
    )
    showPinyinStatus('', false)
    await refreshChineseFontsDropdown(fontKey)
    updateUI()
  } catch (err: any) {
    console.error('Batch fill failed:', err)
    setZi2ziStatus(`Batch fill failed: ${err.message}`)
  } finally {
    batchCancelRequested = false
    elements.btnZi2ziBatch.dataset.running = ''
    elements.btnZi2ziBatch.innerHTML =
      '<i class="fa-solid fa-fill-drip"></i> Fill Missing Characters'
    elements.zi2ziModeSelect.disabled = false
    elements.managerChineseFontSelect.disabled = false
    elements.jitPresetSelect.disabled = false
    updateBatchProgress(0, 0)
  }
}

function updateBatchProgress(done: number, total: number) {
  if (!elements.zi2ziProgressBar) return
  if (total === 0) {
    elements.zi2ziProgressBar.style.width = '0%'
    elements.zi2ziProgressLbl.textContent = ''
  } else {
    elements.zi2ziProgressBar.style.width = `${Math.round((done / total) * 100)}%`
    elements.zi2ziProgressLbl.textContent = `${done} / ${total}`
  }
}

// Start initialization after all declarations are evaluated
init()

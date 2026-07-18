import type { GlossEntry } from './types.js'

/**
 * English → Chinese gloss dictionary for the English gloss font.
 *
 * This is the word-level analogue of the pinyin dataset: instead of one
 * pinyin per hanzi codepoint, each entry maps an English word (lowercase
 * ASCII) to the Chinese word drawn above it. Because English words have no
 * codepoint of their own, every entry becomes a pre-composed composite glyph
 * at a PUA codepoint plus GSUB calt ligature rules (see src/gloss.ts and
 * scripts/inject-gloss-gsub.py).
 *
 * Authoring rules (enforced by test/gloss.test.ts):
 * - `word` is lowercase a–z only; capitalized usage is handled by generated
 *   title-case variants, and inflected forms are separate entries (GSUB
 *   cannot stem: "loves" is not covered by "love").
 * - `alternates` model polysemy the same way src/polyphonic.ts models
 *   polyphony: a default gloss plus context-triggered readings. The only
 *   supported context is the immediately preceding word (`before`), which
 *   should itself be a vocabulary entry so the trigger also works after that
 *   word has been ligated by its own lookup.
 *
 * Vocabulary mirrors the project's focus: common words plus evangelical
 * worship vocabulary.
 */
export const GLOSS_ENTRIES: GlossEntry[] = [
  // --- worship / faith vocabulary ---
  { word: 'god', gloss: '神' },
  { word: 'lord', gloss: '主' },
  { word: 'jesus', gloss: '耶稣' },
  { word: 'christ', gloss: '基督' },
  { word: 'grace', gloss: '恩典' },
  { word: 'faith', gloss: '信心' },
  { word: 'hope', gloss: '盼望' },
  { word: 'joy', gloss: '喜乐' },
  { word: 'peace', gloss: '平安' },
  { word: 'holy', gloss: '圣洁' },
  { word: 'spirit', gloss: '圣灵' },
  { word: 'heaven', gloss: '天堂' },
  { word: 'glory', gloss: '荣耀' },
  { word: 'praise', gloss: '赞美' },
  { word: 'worship', gloss: '敬拜' },
  { word: 'pray', gloss: '祷告' },
  { word: 'prayer', gloss: '祷告' },
  { word: 'bless', gloss: '祝福' },
  { word: 'blessing', gloss: '祝福' },
  { word: 'amen', gloss: '阿们' },
  { word: 'hallelujah', gloss: '哈利路亚' },
  { word: 'mercy', gloss: '怜悯' },
  { word: 'truth', gloss: '真理' },
  { word: 'light', gloss: '光' },
  { word: 'life', gloss: '生命' },
  { word: 'heart', gloss: '心' },
  { word: 'soul', gloss: '灵魂' },
  { word: 'king', gloss: '王' },
  { word: 'savior', gloss: '救主' },
  { word: 'cross', gloss: '十字架' },
  { word: 'sin', gloss: '罪' },
  { word: 'forgive', gloss: '饶恕' },
  { word: 'eternal', gloss: '永恒' },
  { word: 'salvation', gloss: '救恩' },
  { word: 'church', gloss: '教会' },
  { word: 'bible', gloss: '圣经' },
  { word: 'word', gloss: '话语' },
  { word: 'power', gloss: '能力' },
  { word: 'mighty', gloss: '全能' },
  { word: 'righteous', gloss: '公义' },
  { word: 'kingdom', gloss: '国度' },
  { word: 'angel', gloss: '天使' },
  { word: 'shepherd', gloss: '牧人' },
  { word: 'lamb', gloss: '羔羊' },
  { word: 'redeemer', gloss: '救赎主' },
  { word: 'almighty', gloss: '全能者' },

  // --- general vocabulary ---
  { word: 'hello', gloss: '你好' },
  { word: 'world', gloss: '世界' },
  { word: 'water', gloss: '水' },
  { word: 'river', gloss: '河' },
  { word: 'mountain', gloss: '山' },
  { word: 'sun', gloss: '太阳' },
  { word: 'moon', gloss: '月亮' },
  { word: 'star', gloss: '星星' },
  { word: 'sing', gloss: '唱' },
  { word: 'sings', gloss: '唱' },
  { word: 'singing', gloss: '唱' },
  { word: 'song', gloss: '歌' },
  { word: 'music', gloss: '音乐' },
  { word: 'day', gloss: '日子' },
  { word: 'night', gloss: '夜' },
  { word: 'morning', gloss: '早晨' },
  { word: 'new', gloss: '新' },
  { word: 'good', gloss: '好' },
  { word: 'great', gloss: '伟大' },
  { word: 'people', gloss: '人们' },
  { word: 'child', gloss: '孩子' },
  { word: 'children', gloss: '孩子们' },
  { word: 'father', gloss: '父亲' },
  { word: 'mother', gloss: '母亲' },
  { word: 'friend', gloss: '朋友' },
  { word: 'house', gloss: '房子' },
  { word: 'home', gloss: '家' },
  { word: 'bread', gloss: '饼' },
  { word: 'wine', gloss: '酒' },
  { word: 'fire', gloss: '火' },
  { word: 'wind', gloss: '风' },
  { word: 'rain', gloss: '雨' },
  { word: 'tree', gloss: '树' },
  { word: 'flower', gloss: '花' },
  { word: 'book', gloss: '书' },
  { word: 'hand', gloss: '手' },
  { word: 'eye', gloss: '眼睛' },
  { word: 'voice', gloss: '声音' },
  { word: 'come', gloss: '来' },
  { word: 'go', gloss: '去' },
  { word: 'give', gloss: '给' },
  { word: 'love', gloss: '爱' },
  { word: 'loves', gloss: '爱' },
  { word: 'loved', gloss: '爱' },
  { word: 'thank', gloss: '感谢' },
  { word: 'thanks', gloss: '感谢' },
  { word: 'you', gloss: '你' },
  { word: 'we', gloss: '我们' },
  { word: 'hot', gloss: '热' },

  // --- polysemy demos: default gloss + context-triggered alternates,
  // the word-level analogue of the polyphonic bigram rules ---
  {
    word: 'bank',
    gloss: '银行',
    alternates: [{ gloss: '河岸', before: 'river' }],
  },
  {
    word: 'spring',
    gloss: '春天',
    alternates: [{ gloss: '温泉', before: 'hot' }],
  },
]

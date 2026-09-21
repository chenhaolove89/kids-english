/**
 * 课程引用 → 具体内容条目的运行时适配器。
 * catalog 里的 lesson.ref 只存稳定 ID，页面通过这里解析成 words/hanzi/数学参数，
 * 数据结构变化时只改适配器，页面与服务层不动。
 */
import wordsData from '../data/words.json'
import hanziData from '../data/hanzi.json'
import enSentencesData from '../data/enSentences.json'
import { collectAssetFieldsInPlace } from '../platform/assets.js'
import { isCategoryHidden } from './lowAge.js'

// 语文选项的装饰色（挑战/重练共用同一映射，保证口径一致）
export const OPTION_COLORS = ['#FF8C42', '#4D96FF', '#3BB273', '#9B5DE5', '#F76BA8', '#FF6B6B', '#12B886', '#FAB005']

// 三份数据里所有带资源路径的字段（由 tools 生成，字段名以数据为准）
const WORD_ASSET_FIELDS = ['image', 'audio', 'zhAudio']
const CHAR_ASSET_FIELDS = ['audio', 'wordAudio', 'sentenceAudio', 'emoji', 'sentenceEmoji']
const SENTENCE_ASSET_FIELDS = ['image', 'audio', 'zhAudio']

/**
 * 把三份数据文件里的资源字段统一收口到 assetUrl，由 asset-source.js 在资源源确定后调用一次。
 *
 * 就地改数据单例，不新建对象：index / learn / collection / chinese / review-pools 都是
 * 直接 import 这几份 JSON 的，只有就地改才能覆盖它们。详见 collectAssetFieldsInPlace 的注释。
 * 幂等，重复调用安全。
 */
export function applyAssetBase() {
  collectAssetFieldsInPlace(wordsData.levels, ['icon'])
  for (const cat of wordsData.categories) {
    collectAssetFieldsInPlace([cat], ['icon'])
    collectAssetFieldsInPlace(cat.words, WORD_ASSET_FIELDS)
  }
  collectAssetFieldsInPlace(hanziData.levels, ['icon'])
  for (const lv of hanziData.levels) collectAssetFieldsInPlace(lv.chars, CHAR_ASSET_FIELDS)
  collectAssetFieldsInPlace(enSentencesData.sentences, SENTENCE_ASSET_FIELDS)
}

/** 汉字条目 → 挑战选项对象（main/color 是渲染字段，漏掉会渲染空白） */
export function mapZhOption(h) {
  return { ...h, main: h.char, color: OPTION_COLORS[h.id.charCodeAt(0) % OPTION_COLORS.length] }
}

export function resolveEnCategory(catId) {
  if (isCategoryHidden(catId)) return null
  return wordsData.categories.find((c) => c.id === catId) || null
}

export function resolveEnLevel(levelId) {
  return wordsData.categories
    .filter((c) => c.level === Number(levelId) && !isCategoryHidden(c.id))
    .flatMap((c) => c.words)
}

/** 全部可见英语词（错题重练小池借干扰项用，低龄过滤口径与分类一致） */
export function resolveAllEnWords() {
  return wordsData.categories.filter((c) => !isCategoryHidden(c.id)).flatMap((c) => c.words)
}

export function resolveZhLevel(levelId) {
  const lv = Number(levelId)
  return hanziData.levels.find((l) => Number(l.id) === lv) || hanziData.levels[0] || null
}

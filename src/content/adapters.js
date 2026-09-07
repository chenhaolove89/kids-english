/**
 * 课程引用 → 具体内容条目的运行时适配器。
 * catalog 里的 lesson.ref 只存稳定 ID，页面通过这里解析成 words/hanzi/数学参数，
 * 数据结构变化时只改适配器，页面与服务层不动。
 */
import wordsData from '../data/words.json'
import hanziData from '../data/hanzi.json'
import { isCategoryHidden } from './lowAge.js'

// 语文选项的装饰色（挑战/重练共用同一映射，保证口径一致）
export const OPTION_COLORS = ['#FF8C42', '#4D96FF', '#3BB273', '#9B5DE5', '#F76BA8', '#FF6B6B', '#12B886', '#FAB005']

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

export function resolveZhLevel(levelId) {
  const lv = Number(levelId)
  return hanziData.levels.find((l) => Number(l.id) === lv) || hanziData.levels[0] || null
}

/**
 * 复习调度（纯函数）：简化版 Leitner 盒子。
 * 答错 → 回到盒 0（当天可重练）；连对逐级晋级：1 天 → 3 天 → 7 天后到期。
 * 不追求科学背诵算法的精确性——对孩子「今天错了明天再见到」足够且可解释。
 */

export const REVIEW_BOX_DAYS = [0, 1, 3, 7]
const DAY_MS = 24 * 60 * 60 * 1000

/** 最高盒：已在最高盒再答对一次即毕业出本 */
export const REVIEW_MAX_BOX = REVIEW_BOX_DAYS.length - 1

/**
 * 该条目是否应当从错题本「毕业」。
 * 语义：错题本只留「还没掌握」的条目；连对晋级到最高盒（7 天）后再答对一次，
 * 说明孩子已经掌握，应该出本。原实现没有这一步，掌握的词每 7 天永久复发，
 * 与结果页文案「连对的错题会毕业」不符。
 */
export function isGraduated(entry, correct) {
  return !!correct && !!entry && (entry.box ?? 0) >= REVIEW_MAX_BOX
}

/** 答错（或首次进本）的条目：盒 0、立即到期 */
export function freshEntry(ts, meta = {}) {
  return { box: 0, due: ts, wrongCount: 1, updatedAt: ts, ...meta }
}

/** 一次作答后的盒子流转：答对晋级，答错归零。correct 时条目不存在则返回 null（不进本） */
export function nextEntry(entry, correct, ts) {
  if (correct && !entry) return null
  const box = correct ? Math.min((entry?.box ?? 0) + 1, REVIEW_BOX_DAYS.length - 1) : 0
  return {
    ...(entry || {}),
    box,
    due: ts + REVIEW_BOX_DAYS[box] * DAY_MS,
    wrongCount: (entry?.wrongCount || 0) + (correct ? 0 : 1),
    updatedAt: ts,
  }
}

/** 是否到期可练（无条目视为不到期——错题本只收录错过/练过的词） */
export function isDue(entry, ts) {
  return !!entry && (entry.due || 0) <= ts
}

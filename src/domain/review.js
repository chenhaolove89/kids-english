/**
 * 复习调度（纯函数）：简化版 Leitner 盒子。
 * 答错 → 回到盒 0（当天可重练）；连对逐级晋级：1 天 → 3 天 → 7 天后到期。
 * 不追求科学背诵算法的精确性——对孩子「今天错了明天再见到」足够且可解释。
 */

export const REVIEW_BOX_DAYS = [0, 1, 3, 7]
const DAY_MS = 24 * 60 * 60 * 1000

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

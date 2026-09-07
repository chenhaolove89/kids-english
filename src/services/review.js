/**
 * 错题本服务：答题事件驱动（存储层，Node 可测）。
 * - 任何模式下答错（含旧入口）→ 词进本、盒 0、当天可重练
 * - 已在本的词答对 → 晋级（1/3/7 天后到期）；答错 → 归零
 *
 * buildReviewPool 需要注入 resolvers（按 id 还原完整词卡对象）；
 * 应用侧用 services/review-pools.js（引入数据 JSON，Vite 专用）。
 */
import { getStorage } from '../platform/storage.js'
import { freshEntry, nextEntry, isDue } from '../domain/review.js'

const MAX_ENTRIES = 500

export function createReviewService(store, resolvers = null) {
  function all() {
    return store.get('review', {})
  }

  /**
   * 作答落本。meta: { subject: 'en'|'zh', text: 展示文本, lessonId }
   * 正确但不在本 → 不收录（错题本只收错过的）。
   */
  function recordResult(itemId, correct, meta = {}) {
    if (!itemId) return null
    const allMap = all()
    const ts = Date.now()
    if (correct && !allMap[itemId]) return null
    const entry = allMap[itemId] ? nextEntry(allMap[itemId], correct, ts) : freshEntry(ts, meta)
    if (meta.subject) entry.subject = meta.subject
    if (meta.text) entry.text = meta.text
    if (meta.lessonId) entry.lessonId = meta.lessonId
    allMap[itemId] = entry
    // 超限时裁掉最久没动的条目
    const keys = Object.keys(allMap)
    if (keys.length > MAX_ENTRIES) {
      keys
        .sort((a, b) => (allMap[a].updatedAt || 0) - (allMap[b].updatedAt || 0))
        .slice(0, keys.length - MAX_ENTRIES)
        .forEach((k) => delete allMap[k])
    }
    store.set('review', allMap)
    return entry
  }

  /** 某科目到期条目数 */
  function dueCount(subject, ts = Date.now()) {
    return Object.values(all()).filter((e) => (!subject || e.subject === subject) && isDue(e, ts)).length
  }

  /** 到期条目（新在前） */
  function dueEntries(subject, ts = Date.now()) {
    return Object.entries(all())
      .filter(([, e]) => (!subject || e.subject === subject) && isDue(e, ts))
      .sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0))
      .map(([itemId, e]) => ({ itemId, ...e }))
  }

  /** 常错 TOP（近 windowMs 内更新过、按错误次数），家长周报用 */
  function topWrong(limit = 3, windowMs = 7 * 24 * 60 * 60 * 1000, ts = Date.now()) {
    return Object.entries(all())
      .map(([itemId, e]) => ({ itemId, ...e }))
      .filter((e) => (ts - (e.updatedAt || 0)) <= windowMs && (e.wrongCount || 0) > 0)
      .sort((a, b) => (b.wrongCount || 0) - (a.wrongCount || 0) || (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, limit)
  }

  /** 重练池：到期条目经 resolvers 还原成完整词卡对象，最多 10 个 */
  function buildReviewPool(subject, ts = Date.now()) {
    if (!resolvers) throw new Error('review resolvers 未注入（应使用 services/review-pools.js）')
    const entries = dueEntries(subject, ts)
    const pool = []
    for (const e of entries) {
      const item = resolvers[subject]?.(e.itemId)
      if (item) pool.push(item)
      if (pool.length >= 10) break
    }
    return pool
  }

  return { recordResult, dueCount, dueEntries, topWrong, buildReviewPool }
}

let _svc = null
export function getReviewService() {
  if (!_svc) _svc = createReviewService(getStorage())
  return _svc
}

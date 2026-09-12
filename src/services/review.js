/**
 * 错题本服务：答题事件驱动（存储层，Node 可测）。
 * - 任何模式下答错（含旧入口）→ 词进本、盒 0、当天可重练
 * - 已在本的词答对 → 晋级（1/3/7 天后到期）；答错 → 归零
 * - 连对到最高盒后再答对 → 毕业出本（见 domain/review.js isGraduated）
 *
 * 存储键按科目加命名空间（`en|cat`）：
 * 英语课与语文词语课共用同一批词 id（实测 1420/2000 个词 id 同时属于两科），
 * 只用裸 itemId 当键会让同一单词的两科作答互相覆盖——wrongCount 串在一起、
 * subject 被最后一次作答改写，最后只进一个科目的重练池。
 *
 * buildReviewPool 需要注入 resolvers（按 id 还原完整词卡对象）；
 * 应用侧用 services/review-pools.js（引入数据 JSON，Vite 专用）。
 */
import { getStorage } from '../platform/storage.js'
import { freshEntry, nextEntry, isDue, isGraduated } from '../domain/review.js'

const MAX_ENTRIES = 500
const SUBJECTS = ['en', 'zh', 'math']
// 分隔符不能用 ':'——数学 itemId 本身就是 `math-l3:add:2:3` 这种带冒号的签名
const SEP = '|'

/** 存储键：科目 + 分隔符 + 裸条目 id */
export function reviewKey(subject, itemId) {
  const s = SUBJECTS.includes(subject) ? subject : 'en'
  return `${s}${SEP}${itemId}`
}

function isNamespaced(key) {
  return SUBJECTS.some((s) => key.startsWith(s + SEP))
}

export function createReviewService(store, resolvers = null) {
  // 旧数据（裸 itemId 当键）一次性升级为命名空间键，科目取自条目自身记录的 subject
  let normalized = false

  function normalize(rawMap) {
    const out = {}
    let changed = false
    for (const [k, e] of Object.entries(rawMap || {})) {
      if (isNamespaced(k)) {
        out[k] = e
        continue
      }
      const subj = SUBJECTS.includes(e && e.subject) ? e.subject : 'en'
      out[reviewKey(subj, k)] = { ...e, itemId: k, subject: subj }
      changed = true
    }
    if (changed) store.set('review', out)
    return out
  }

  function all() {
    const rawMap = store.get('review', {})
    if (normalized) return rawMap
    normalized = true
    return normalize(rawMap)
  }

  /** 从存储键取回裸条目 id（旧数据可能把 id 存在条目里） */
  function bareId(key, entry) {
    if (isNamespaced(key)) return key.slice(key.indexOf(SEP) + 1)
    return (entry && entry.itemId) || key
  }

  /**
   * 作答落本。meta: { subject: 'en'|'zh'|'math', text: 展示文本, lessonId, payload: 重练还原所需的数据 }
   * 正确但不在本 → 不收录（错题本只收错过的）。
   * 已在最高盒再答对一次 → 毕业出本（掌握的词不再每周复发）。
   * payload（如数学整题快照）原样随条目存取——buildReviewPool 的 resolver 收到完整条目。
   */
  function recordResult(itemId, correct, meta = {}) {
    if (!itemId) return null
    const allMap = all()
    const ts = Date.now()
    const key = reviewKey(meta.subject, itemId)
    if (correct && !allMap[key]) return null
    if (isGraduated(allMap[key], correct)) {
      delete allMap[key]
      store.set('review', allMap)
      return null
    }
    const entry = allMap[key] ? nextEntry(allMap[key], correct, ts) : freshEntry(ts, meta)
    if (meta.subject) entry.subject = meta.subject
    if (meta.text) entry.text = meta.text
    if (meta.lessonId) entry.lessonId = meta.lessonId
    if (meta.payload) entry.payload = meta.payload
    entry.itemId = itemId
    allMap[key] = entry
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

  /** 到期条目（新在前）。对外一律给出裸 itemId，resolver 与页面只认裸 id */
  function dueEntries(subject, ts = Date.now()) {
    return Object.entries(all())
      .filter(([, e]) => (!subject || e.subject === subject) && isDue(e, ts))
      .sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0))
      .map(([k, e]) => ({ ...e, itemId: bareId(k, e) }))
  }

  /** 常错 TOP（近 windowMs 内更新过、按错误次数），家长周报用 */
  function topWrong(limit = 3, windowMs = 7 * 24 * 60 * 60 * 1000, ts = Date.now()) {
    return Object.entries(all())
      .map(([k, e]) => ({ ...e, itemId: bareId(k, e) }))
      .filter((e) => (ts - (e.updatedAt || 0)) <= windowMs && (e.wrongCount || 0) > 0)
      .sort((a, b) => (b.wrongCount || 0) - (a.wrongCount || 0) || (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, limit)
  }

  /** 重练池：到期条目经 resolvers 还原成完整题目对象（数学传整条目，词卡按 id），最多 10 个 */
  function buildReviewPool(subject, ts = Date.now()) {
    if (!resolvers) throw new Error('review resolvers 未注入（应使用 services/review-pools.js）')
    const entries = dueEntries(subject, ts)
    const pool = []
    for (const e of entries) {
      const item = resolvers[subject]?.(e.itemId, e)
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

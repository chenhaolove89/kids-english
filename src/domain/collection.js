/**
 * 收集图鉴（百宝箱）纯函数层：点亮集合的合并、派生与统计。
 * 不 import 目录/存储，Node 可测。
 *
 * 数据结构（services/collection.js 持久化到存储键 collection）：
 *   { en: { seen: [wordId], mastered: [wordId] },
 *     zh: { seen: [charCodePoint], mastered: [charCodePoint] },
 *     math: { done: [lessonId] } }
 * 两级点亮：学一学完成 → seen（认识）；挑战首答答对 → mastered（掌握）。
 * 集合只增不减（attempts 有裁剪上限，点亮结果必须持久化）。
 */

export function createEmpty() {
  return {
    en: { seen: [], mastered: [] },
    zh: { seen: [], mastered: [] },
    math: { done: [] },
  }
}

/** 归一化任意来源（存储旧值/缺键）的集合，保证三科结构完整 */
export function normalizeColl(coll) {
  const base = createEmpty()
  if (!coll || typeof coll !== 'object') return base
  for (const s of ['en', 'zh']) {
    if (coll[s] && Array.isArray(coll[s].seen)) base[s].seen = [...new Set(coll[s].seen)]
    if (coll[s] && Array.isArray(coll[s].mastered)) base[s].mastered = [...new Set(coll[s].mastered)]
  }
  if (Array.isArray(coll.math?.done)) base.math.done = [...new Set(coll.math.done)]
  return base
}

/**
 * 把 ids 并入 coll[subject][field]（'seen'|'mastered'|math 的 'done'），返回新对象。
 * 掌握必是认识：addIds 到 mastered 时自动补 seen，页面三态判定不用重复查。
 */
export function addIds(coll, subject, field, ids) {
  const next = normalizeColl(coll)
  const list = (ids || []).filter((x) => x !== null && x !== undefined && x !== '')
  if (!list.length) return next
  if (subject === 'math' && field === 'done') {
    next.math.done = [...new Set([...next.math.done, ...list])]
    return next
  }
  if (!next[subject]) return next
  next[subject][field] = [...new Set([...next[subject][field], ...list])]
  if (field === 'mastered') {
    next[subject].seen = [...new Set([...next[subject].seen, ...list])]
  }
  return next
}

/** 从事件流派生某会话的首答正确条目 id（挑战点亮唯一来源） */
export function deriveMastersFromAttempts(attempts, sessionId) {
  return (attempts || [])
    .filter((a) => a && a.sessionId === sessionId && a.firstTry && a.correct && a.itemId !== null && a.itemId !== undefined)
    .map((a) => a.itemId)
}

/** 单条目三态：mastered 掌握 / seen 认识 / locked 未解锁 */
export function litState(id, seenSet, masteredSet) {
  if (masteredSet.has(id)) return 'mastered'
  if (seenSet.has(id)) return 'seen'
  return 'locked'
}

/** 一组 id 的点亮统计（分类卡进度条用） */
export function progressOf(ids, seenSet, masteredSet) {
  let seen = 0
  let mastered = 0
  for (const id of ids) {
    const st = litState(id, seenSet, masteredSet)
    if (st !== 'locked') seen++
    if (st === 'mastered') mastered++
  }
  return { total: ids.length, seen, mastered }
}

export function isCategoryComplete(p) {
  return p.total > 0 && p.mastered >= p.total
}

/**
 * 庆祝判定：本次访问相对上次的新增量。
 * prev/cur 形如 { enSeen, enMastered, zhSeen, zhMastered, mathDone }（缺字段按 0）。
 * 返回 { newSeen, newMastered, total }；负数（清空数据后）按 0 处理。
 */
export function celebration(prev, cur) {
  const d = (k) => Math.max(0, (cur?.[k] || 0) - (prev?.[k] || 0))
  const newSeen = d('enSeen') + d('zhSeen')
  const newMastered = d('enMastered') + d('zhMastered')
  return { newSeen, newMastered, mathNew: d('mathDone'), total: newSeen + newMastered + d('mathDone') }
}

/**
 * 历史回填（纯函数，可注入解析器以便 Node 单测）：
 * 从已完成会话推导初始点亮集合。
 * lessonResolver(lessonId) → { subject, kind, itemIds }（itemIds 仅学一学需要；
 * 隐藏分类/无词表返回 itemIds:null）。挑战的掌握条目一律从 attempts 派生。
 */
export function deriveFromHistory(sessions, attempts, lessonResolver) {
  let coll = createEmpty()
  for (const s of sessions || []) {
    if (!s || s.status !== 'completed' || !s.lessonId) continue
    const lesson = lessonResolver(s.lessonId)
    if (!lesson) continue
    if (lesson.subject === 'math') {
      if (lesson.kind === 'challenge') coll = addIds(coll, 'math', 'done', [s.lessonId])
      continue
    }
    if (lesson.kind === 'learn') {
      if (lesson.itemIds) coll = addIds(coll, lesson.subject, 'seen', lesson.itemIds)
    } else {
      const masters = deriveMastersFromAttempts(attempts, s.sessionId)
      if (masters.length) coll = addIds(coll, lesson.subject, 'mastered', masters)
    }
  }
  return coll
}

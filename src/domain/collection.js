/**
 * 收集图鉴（百宝箱）纯函数层：点亮集合的合并、派生与统计。
 * 不 import 目录/存储，Node 可测。
 *
 * 数据结构（services/collection.js 持久化到存储键 collection）：
 *   { en: { seen: [wordId], mastered: [wordId] },
 *     zh: { seen: [charCodePoint], mastered: [charCodePoint] },
 *     zhWords: { seen: [wordId], mastered: [wordId] },
 *     zhSentences: { seen: [charCodePoint], mastered: [charCodePoint] },
 *     math: { done: [lessonId] } }
 * 两级点亮：学一学完成 → seen（认识）；挑战首答答对 → mastered（掌握）。
 * 集合只增不减（attempts 有裁剪上限，点亮结果必须持久化）。
 */

export function createEmpty() {
  return {
    en: { seen: [], mastered: [] },
    zh: { seen: [], mastered: [] },
    zhWords: { seen: [], mastered: [] },
    zhSentences: { seen: [], mastered: [] },
    math: { done: [] },
  }
}

/** 归一化任意来源（存储旧值/缺键）的集合，保证各科结构完整 */
export function normalizeColl(coll) {
  const base = createEmpty()
  if (!coll || typeof coll !== 'object') return base
  for (const s of ['en', 'zh', 'zhWords', 'zhSentences']) {
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
 * 数学徽章奖杯口径：完成过该关且历史最佳 3 星（首答正确率 ≥90%）。
 * 与英语/语文「分类卡全部掌握 → 🏆」同级：拿到满星才算攻克这一关。
 */
export function isMathTrophy(done, bestStars) {
  return !!done && bestStars >= 3
}

/**
 * 各桶「已点亮」的 id 并集（seen ∪ mastered；数学是已完成关卡）。
 * 庆祝条按它算"本次新点亮几张卡片"，所以必须先并集再去重。
 */
export function litIds(coll) {
  const c = coll || {}
  const union = (bucket) => [...new Set([...(c[bucket]?.seen || []), ...(c[bucket]?.mastered || [])])]
  return {
    en: union('en'),
    zh: union('zh'),
    zhWords: union('zhWords'),
    zhSentences: union('zhSentences'),
    math: [...new Set(c.math?.done || [])],
  }
}

/**
 * 庆祝判定：本次访问相对上次**新点亮了多少张卡片**。
 *
 * 口径修正（产品决定）：按"点亮动作"计数会虚报——一个词从认识变掌握会让
 * seen 与 mastered 同时 +1，文案却写着"N 张卡片"。所以改成按 id 去重后计数：
 * prev/cur 都是 litIds() 的形状（每桶 id 数组，缺字段按空）。
 * 清空数据后 id 只会减少 → 结果为 0（不会出现负数）。
 */
export function celebration(prevLit, curLit) {
  let total = 0
  for (const bucket of ['en', 'zh', 'zhWords', 'zhSentences', 'math']) {
    const prev = new Set(prevLit?.[bucket] || [])
    for (const id of curLit?.[bucket] || []) if (!prev.has(id)) total++
  }
  return { total }
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

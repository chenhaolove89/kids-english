/**
 * 收集图鉴（百宝箱）纯函数层：点亮集合的合并、派生与统计。
 * 不 import 目录/存储，Node 可测。
 *
 * 数据结构（services/collection.js 持久化到存储键 collection）：
 *   { en: { seen: [wordId], mastered: [wordId] },
 *     zh: { seen: [charCodePoint], mastered: [charCodePoint] },
 *     zhWords: { seen: [wordId], mastered: [wordId] },
 *     zhSentences: { seen: [charCodePoint], mastered: [charCodePoint] },
 *     zhPassages: { seen: [passageId], mastered: [passageId] },
 *     math: { done: [lessonId] } }
 * 两级点亮：学一学完成 → seen（认识）；挑战首答答对 → mastered（掌握）。
 * 集合只增不减（attempts 有裁剪上限，点亮结果必须持久化）。
 *
 * zhPassages 的「一格」是**一篇短文**而不是一道题（题目的 itemId 带题号，见 domain/passage.js）：
 *   - seen（认识）：这一篇的挑战做完了（3 题都作答过）；
 *   - mastered（读懂）：这一篇的题**每一条都是首答答对**。
 * 只有读完不算数——「读懂」必须靠作答证明，与「点读一首古诗不点亮图鉴」同一口径。
 */
import { passageLightsFromAttempts } from './passage.js'

export function createEmpty() {
  return {
    en: { seen: [], mastered: [] },
    zh: { seen: [], mastered: [] },
    zhWords: { seen: [], mastered: [] },
    zhSentences: { seen: [], mastered: [] },
    zhPassages: { seen: [], mastered: [] },
    math: { done: [] },
  }
}

/** 归一化任意来源（存储旧值/缺键）的集合，保证各科结构完整 */
export function normalizeColl(coll) {
  const base = createEmpty()
  if (!coll || typeof coll !== 'object') return base
  for (const s of ['en', 'zh', 'zhWords', 'zhSentences', 'zhPassages']) {
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
    zhPassages: union('zhPassages'),
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
  for (const bucket of ['en', 'zh', 'zhWords', 'zhSentences', 'zhPassages', 'math']) {
    const prev = new Set(prevLit?.[bucket] || [])
    for (const id of curLit?.[bucket] || []) if (!prev.has(id)) total++
  }
  return { total }
}

/**
 * 历史回填（纯函数，可注入解析器以便 Node 单测）：
 * 从已完成会话推导初始点亮集合。
 * lessonResolver(lessonId) → { subject, kind, itemIds, passageLevel }（itemIds 仅学一学需要；
 * 隐藏分类/无词表返回 itemIds:null）。挑战的掌握条目一律从 attempts 派生；
 * passageLevel=true 的课（阅读理解短文）按「篇」聚合，见 domain/passage.js。
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
    // 篇章课必须排在 learn 之前：短文课卡在目录里就是 kind=learn（要出现在课程地图上），
    // 而它记的是 challenge 会话。先判 learn 会让回填永远走不到这一支（老用户答过的短文不点亮）。
    if (lesson.passageLevel) {
      // 篇章课：itemId 是题目 id，图鉴的一格是一篇 —— 必须按篇聚合，不能直接用题目 id 点亮
      const { seen, mastered } = passageLightsFromAttempts(attempts, s.sessionId)
      coll = addIds(coll, lesson.subject, 'seen', seen)
      coll = addIds(coll, lesson.subject, 'mastered', mastered)
    } else if (lesson.kind === 'learn') {
      if (lesson.itemIds) coll = addIds(coll, lesson.subject, 'seen', lesson.itemIds)
    } else {
      const masters = deriveMastersFromAttempts(attempts, s.sessionId)
      if (masters.length) coll = addIds(coll, lesson.subject, 'mastered', masters)
    }
  }
  return coll
}

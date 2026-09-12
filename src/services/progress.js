/**
 * 学习进度聚合服务：只依赖存储（可注入），不碰目录数据，Node 可测。
 * 课程元信息（科目名、标题等）由页面/curriculum 服务与目录联查。
 */
import { starsForFirstAttempt } from '../domain/progress.js'
import { getStorage } from '../platform/storage.js'

const STATUS_RANK = { other: 0, paused: 1, completed: 2 }
const rank = (s) => STATUS_RANK[s.status] ?? 0

export function createProgressService(store) {
  /** 按 sessionId 去重的会话视图；同 id 取状态更高/更新的那条（恢复链复用同一 id） */
  function sessionIndex() {
    const byId = new Map()
    for (const s of store.get('sessions', [])) {
      const prev = byId.get(s.sessionId)
      if (!prev || rank(s) >= rank(prev)) byId.set(s.sessionId, s)
    }
    return byId
  }

  /**
   * 每门课的进度：
   * { lessonId, completed, bestStars, learnDone, lastAt }
   * bestStars 只统计 challenge 完成会话（learn 不计星）。
   *
   * 只有 learn / challenge 两种 kind 计入课时完成：
   *  - practice（描红、古诗点读这类"练一练"）会进作答流、周报与最近记录，
   *    但**不算学完一课**、不给星——否则点读一首古诗就把整个阶段（6 首）标成完成。
   */
  function lessonProgressMap() {
    const map = new Map()
    for (const s of sessionIndex().values()) {
      if (!s || !s.lessonId) continue
      const cur =
        map.get(s.lessonId) || { lessonId: s.lessonId, completed: 0, bestStars: 0, learnDone: false, lastAt: 0 }
      if (s.status === 'completed' && s.kind === 'learn') {
        cur.completed++
        cur.learnDone = true
      } else if (s.status === 'completed' && s.kind === 'challenge') {
        cur.completed++
        const stars = starsForFirstAttempt(s.totals?.firstCorrect || 0, s.totals?.questions || 0)
        cur.bestStars = Math.max(cur.bestStars, stars)
      }
      cur.lastAt = Math.max(cur.lastAt, s.startedAt || 0)
      map.set(s.lessonId, cur)
    }
    return map
  }

  /** 最近会话（新在前，按 sessionId 去重取最新一条），家长页「最近记录」用 */
  function recentSessions(limit = 10) {
    const latest = new Map()
    for (const s of store.get('sessions', [])) latest.set(s.sessionId, s)
    return [...latest.values()].slice(-limit).reverse()
  }

  /**
   * 按知识点（skillId）聚合首次作答正确率，最弱的排在前面。
   *
   * 数据其实一直都在：每条 attempt 都带 skillIds（session.js 写入），
   * 171 门课也都有 skillIds（目录生成时写入）——但此前**没有任何消费方**，
   * 所以家长看不到「哪一类词弱、哪种题型弱」。
   *
   * 口径与星级一致：只统计 firstTry 的作答（重试不掺进来），
   * 少于 minAttempts 次作答的知识点不参与排序（1/1 的 0% 是噪声不是结论）。
   */
  function skillBreakdown({ isKnownLesson = null, minAttempts = 3, limit = 8 } = {}) {
    const bySkill = new Map()
    for (const a of store.get('attempts', [])) {
      if (!a || !a.firstTry) continue
      if (isKnownLesson && !isKnownLesson(a.lessonId)) continue
      const skills = Array.isArray(a.skillIds) ? a.skillIds : []
      for (const id of skills) {
        if (!id) continue
        const cur = bySkill.get(id) || { skillId: id, first: 0, firstCorrect: 0 }
        cur.first++
        if (a.correct) cur.firstCorrect++
        bySkill.set(id, cur)
      }
    }
    return [...bySkill.values()]
      .filter((s) => s.first >= minAttempts)
      .map((s) => ({ ...s, accuracy: s.first ? s.firstCorrect / s.first : 0 }))
      .sort((a, b) => a.accuracy - b.accuracy || b.first - a.first)
      .slice(0, limit)
  }

  /**
   * 家长周报（近 7 天）：完成课数 / 获得星 / 练习时长 / 学一学数。
   *
   * 口径三处修正（原实现会给出自相矛盾的数字）：
   * 1) 练习时长不再用「会话墙钟封顶 30 分钟」——挂机/切后台/停在卡片页都会被算进去，
   *    而且真实学习 45 分钟只记 30。改成累计「相邻作答间隔 ≤60s」的时长，
   *    既不虚高，也不截断。
   * 2) 获得星按「每门课本周最好一次」计，而不是把同一课的重玩逐次相加
   *    （原来本周星可以大于总星，因为总星是按每课 max 算的）。
   * 3) 完成课数与 summary 的总览口径统一为「学一学 + 挑战」都算，不再同名不同义。
   *
   * isKnownLesson：内容下线/改名后，历史会话会留下目录里已不存在的 lessonId。
   * 不过滤的话家长页会出现「完成课数」含孤儿、而下面「各科进度」不含的自我矛盾。
   */
  function weeklyReport(now = Date.now(), { isKnownLesson = null } = {}) {
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000
    const allSessions = store.get('sessions', [])
    const known = (s) => !isKnownLesson || isKnownLesson(s.lessonId)
    const inWeek = allSessions.filter((s) => (s.endedAt || 0) >= weekAgo)
    const completed = inWeek.filter((s) => s.status === 'completed' && known(s))

    // 2) 本周星：按 lessonId 取本周内最好的一次挑战成绩，封顶与总星同源
    const weekBestStars = new Map()
    for (const s of completed) {
      if (s.kind !== 'challenge') continue
      const stars = starsForFirstAttempt(s.totals?.firstCorrect || 0, s.totals?.questions || 0)
      const prev = weekBestStars.get(s.lessonId) || 0
      if (stars > prev) weekBestStars.set(s.lessonId, stars)
    }
    let stars = 0
    for (const v of weekBestStars.values()) stars += v

    return {
      // 3) 与 summary.lessonsCompleted 同义：本周完成过的课（学一学 + 挑战）去重
      completedLessons: new Set(completed.map((s) => s.lessonId)).size,
      learnDone: new Set(completed.filter((s) => s.kind === 'learn').map((s) => s.lessonId)).size,
      stars,
      minutes: activeMinutes(store.get('attempts', []), weekAgo, now),
    }
  }

  /**
   * 有效练习时长（分钟）：本周内相邻作答间隔 ≤60s 的片段累加。
   * 会话不再参与计算——它只说明「打开过」，作答间隔才说明「在做题」。
   */
  function activeMinutes(attempts, from, to) {
    const GAP_CAP = 60 * 1000
    let ms = 0
    let prevTs = 0
    for (const a of attempts) {
      const ts = a.ts || 0
      if (ts < from || ts > to) continue
      // attempts 按追加序即为时间序；乱序数据靠 ts 比较兜底
      if (prevTs && ts > prevTs) ms += Math.min(ts - prevTs, GAP_CAP)
      prevTs = ts
    }
    return Math.round(ms / 60000)
  }

  /**
   * 首页/家长页摘要：总星数 / 完成课时数 / 学一学完成数。
   * isKnownLesson：同上，过滤掉目录里已不存在的课，避免「总览完成课数」与
   * 「各科进度 done/total」同屏对不上（前者含孤儿、后者按目录算）。
   */
  function summary({ isKnownLesson = null } = {}) {
    let totalStars = 0
    let lessonsCompleted = 0
    let learnDoneCount = 0
    for (const [lessonId, p] of lessonProgressMap()) {
      if (isKnownLesson && !isKnownLesson(lessonId)) continue
      totalStars += p.bestStars
      if (p.completed > 0) lessonsCompleted++
      if (p.learnDone) learnDoneCount++
    }
    return { totalStars, lessonsCompleted, learnDoneCount }
  }

  return { sessionIndex, lessonProgressMap, summary, recentSessions, weeklyReport, skillBreakdown }
}

let _svc = null
export function getProgressService() {
  if (!_svc) _svc = createProgressService(getStorage())
  return _svc
}

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
   */
  function lessonProgressMap() {
    const map = new Map()
    for (const s of sessionIndex().values()) {
      if (!s || !s.lessonId) continue
      const cur =
        map.get(s.lessonId) || { lessonId: s.lessonId, completed: 0, bestStars: 0, learnDone: false, lastAt: 0 }
      if (s.status === 'completed') {
        cur.completed++
        if (s.kind === 'learn') cur.learnDone = true
        else {
          const stars = starsForFirstAttempt(s.totals?.firstCorrect || 0, s.totals?.questions || 0)
          cur.bestStars = Math.max(cur.bestStars, stars)
        }
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
   * 家长周报（近 7 天）：完成课数 / 获得星 / 练习时长（单次封顶 30 分钟，防挂机虚高）/ 学一学数。
   * 时长来自会话 startedAt→endedAt，退出即落盘，无后台计时。
   */
  function weeklyReport(now = Date.now()) {
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000
    const inWeek = store.get('sessions', []).filter((s) => (s.endedAt || 0) >= weekAgo)
    const completed = inWeek.filter((s) => s.status === 'completed')
    let stars = 0
    for (const s of completed) {
      if (s.kind === 'challenge' && s.totals) {
        stars += starsForFirstAttempt(s.totals.firstCorrect || 0, s.totals.questions || 0)
      }
    }
    const ms = inWeek.reduce((sum, s) => {
      const dur = Math.max(0, (s.endedAt || 0) - (s.startedAt || 0))
      return sum + Math.min(dur, 30 * 60 * 1000)
    }, 0)
    return {
      completedLessons: new Set(completed.filter((s) => s.kind === 'challenge').map((s) => s.lessonId)).size,
      learnDone: new Set(completed.filter((s) => s.kind === 'learn').map((s) => s.lessonId)).size,
      stars,
      minutes: Math.round(ms / 60000),
    }
  }

  /** 首页摘要：总星数 / 完成课时数 / 学一学完成数 */
  function summary() {
    let totalStars = 0
    let lessonsCompleted = 0
    let learnDoneCount = 0
    for (const p of lessonProgressMap().values()) {
      totalStars += p.bestStars
      if (p.completed > 0) lessonsCompleted++
      if (p.learnDone) learnDoneCount++
    }
    return { totalStars, lessonsCompleted, learnDoneCount }
  }

  return { sessionIndex, lessonProgressMap, summary, recentSessions, weeklyReport }
}

let _svc = null
export function getProgressService() {
  if (!_svc) _svc = createProgressService(getStorage())
  return _svc
}

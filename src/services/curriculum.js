/**
 * 课程查询服务：阶段视图、课程跳转地址、继续学习目标。
 * 依赖目录数据（content/catalog）与存储快照，属 Vite 运行时模块（不进 Node 单测）。
 */
import { STAGES, SUBJECTS, getLesson, lessonsForStage, normalizeStage, LESSONS } from '../content/catalog.js'
import { isCategoryHidden } from '../content/lowAge.js'
import { getStorage } from '../platform/storage.js'
import { pickOneExcept } from '../domain/shuffle.js'

export { STAGES, SUBJECTS, normalizeStage }

/** 低龄模式可见性：惊悚/暗黑分类（characters/story）在低龄模式下整课隐藏 */
function isVisible(lesson) {
  if (lesson.status !== 'available') return false
  if (lesson.ref?.kind === 'en-category' && isCategoryHidden(lesson.ref.id)) return false
  return true
}

/** 首页阶段视图：每个科目一个块 { subject, challenge, units, empty } */
export function stageBlocks(stageId) {
  const st = normalizeStage(stageId)
  const available = lessonsForStage(st).filter(isVisible)
  return SUBJECTS.map((subj) => {
    const ls = available.filter((l) => l.subject === subj.id)
    if (!ls.length) return { subject: subj, challenge: null, units: [], empty: true }
    const challenges = ls.filter((l) => l.kind === 'challenge')
    let units
    if (subj.id === 'en') {
      units = ls.filter((l) => l.kind === 'learn')
    } else if (subj.id === 'zh') {
      units = ls.filter((l) => l.kind === 'learn')
    } else {
      // 数学没有独立学一学页：全部练习关卡都作为入口卡（一个阶段可能有多关）
      units = challenges
    }
    return { subject: subj, challenge: challenges[0] || null, units, empty: false }
  })
}

/** 课程 → 页面跳转地址（旧入口页面复用，额外带 lessonId） */
export function lessonUrl(lesson) {
  if (!lesson || !lesson.ref) return ''
  const lid = encodeURIComponent(lesson.id)
  const r = lesson.ref
  // en-category 被 en（词卡）与 zh（词语课）共用，按科目分流
  if (r.kind === 'en-category') {
    if (lesson.subject === 'zh') {
      return lesson.kind === 'challenge'
        ? `/pages/quiz/quiz?subject=zh&cat=${encodeURIComponent(r.id)}&lessonId=${lid}`
        : `/pages/learn/learn?subject=zh&cat=${encodeURIComponent(r.id)}&lessonId=${lid}`
    }
    return `/pages/learn/learn?subject=en&cat=${encodeURIComponent(r.id)}&lessonId=${lid}`
  }
  if (r.kind === 'en-level') return `/pages/quiz/quiz?subject=en&level=${r.id}&lessonId=${lid}`
  // 小短句：同一 learn 页面切到纯句子卡模式（不混排字词）
  if (r.kind === 'zh-sentences') return `/pages/learn/learn?subject=zh&sentences=1&level=${r.id}&lessonId=${lid}`
  // 古诗点读：独立书单+点读页；填字挑战从页内进入，课时记在本课
  if (r.kind === 'zh-poem') return `/pages/poem/poem?stage=${encodeURIComponent(r.id)}&lessonId=${lid}`
  if (r.kind === 'zh-level' && lesson.kind === 'learn')
    return `/pages/learn/learn?subject=zh&level=${r.id}&lessonId=${lid}`
  if (r.kind === 'zh-level') return `/pages/quiz/quiz?subject=zh&level=${r.id}&lessonId=${lid}`
  if (r.kind === 'math-level') return `/pages/math/practice?level=${r.id}&lessonId=${lid}`
  return ''
}

/** 科目内全局顺序（阶段先后 → 学一学在挑战前） */
function subjectOrderIndex(subjectId) {
  return LESSONS.filter((l) => l.subject === subjectId && isVisible(l)).map((l) => l.id)
}

/**
 * 某阶段某科目「下一个该学的课」：优先没完成过的学一学（数学为练习），
 * 全部完成则回到第一个，供首页快速开始使用。
 */
export function nextUpLesson(stageId, subjectId) {
  const st = normalizeStage(stageId)
  const ls = lessonsForStage(st, subjectId).filter(isVisible)
  const pool =
    subjectId === 'math'
      ? ls.filter((l) => l.kind === 'challenge')
      : ls.filter((l) => l.kind === 'learn')
  if (!pool.length) return null
  const done = new Set(
    getStorage()
      .get('sessions', [])
      .filter((s) => s.status === 'completed')
      .map((s) => s.lessonId),
  )
  return pool.find((l) => !done.has(l.id)) || pool[0]
}

/** 首页「今天学什么」：每个科目一行 { subject, next, challenge, randomCount } */
export function stageQuickRows(stageId) {
  const st = normalizeStage(stageId)
  return SUBJECTS.map((subj) => {
    const ls = lessonsForStage(st, subj.id).filter(isVisible)
    return {
      subject: subj,
      next: nextUpLesson(st, subj.id),
      challenge: ls.find((l) => l.kind === 'challenge') || null,
      // 随机来一课的可选池大小（0 时该科不出现骰子按钮）
      randomCount: ls.length,
    }
  })
}

/**
 * 随机来一课：某阶段某科目可见课程里随机抽一课（学一学/挑战都在池内），
 * excludeId 传上一把抽中的课，避免连续重样。
 */
export function randomLesson(stageId, subjectId, excludeId) {
  const ls = lessonsForStage(normalizeStage(stageId), subjectId).filter(isVisible)
  return pickOneExcept(ls, excludeId, (l) => l.id) || null
}

/** 全部对小孩可见的课程（低龄模式过滤后），家长页统计用同一口径 */
export function visibleLessons() {
  return LESSONS.filter(isVisible)
}

export function nextLessonAfter(lessonId) {
  const cur = getLesson(lessonId)
  if (!cur) return null
  const order = subjectOrderIndex(cur.subject)
  const i = order.indexOf(cur.id)
  if (i >= 0 && i < order.length - 1) return getLesson(order[i + 1])
  return null
}

export function firstLesson() {
  return LESSONS.find((l) => isVisible(l)) || null
}

/**
 * 继续学习目标：
 * 1) 活跃会话（没退干净/切走）→ 原课恢复；
 * 2) 最近一次带快照的暂停会话 → 原课恢复（复用 sessionId）；
 * 3) 最近完成课程 → 同科目下一课；
 * 4) 兜底：目录第一课。
 */
export function continueTarget() {
  const store = getStorage()
  const active = store.get('active', null)
  if (active?.session) {
    const lesson = getLesson(active.session.lessonId)
    if (lesson && isVisible(lesson)) {
      return { lesson, mode: 'resume-active', snapshot: active.snapshot || null, sessionId: active.session.sessionId }
    }
  }
  const sessions = store.get('sessions', [])
  const paused = [...sessions].reverse().find((s) => {
    if (s.status !== 'paused' || !s.snapshot) return false
    const lesson = getLesson(s.lessonId)
    return lesson && isVisible(lesson)
  })
  if (paused) {
    const lesson = getLesson(paused.lessonId)
    if (lesson) return { lesson, mode: 'resume-paused', snapshot: paused.snapshot, sessionId: paused.sessionId }
  }
  const completed = sessions.filter((s) => s.status === 'completed')
  const last = completed[completed.length - 1]
  if (last) {
    const nxt = nextLessonAfter(last.lessonId)
    if (nxt && isVisible(nxt)) return { lesson: nxt, mode: 'next', snapshot: null, sessionId: null }
  }
  const first = firstLesson()
  return first ? { lesson: first, mode: 'start', snapshot: null, sessionId: null } : null
}

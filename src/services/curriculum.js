/**
 * 课程查询服务：阶段视图、课程跳转地址、继续学习目标。
 *
 * **纯注入版，可 Node 单测**：目录数据、低龄过滤、存储都由参数注入
 * （应用侧入口见 services/curriculum-app.js）。这是本模块能被测试覆盖的唯一方式——
 * `content/catalog.js` 会 import catalog.json，而 Node ESM 不允许无属性的 JSON import
 * （ERR_IMPORT_ATTRIBUTE_MISSING），一旦本文件直接 import 它，整模块就没法进单测。
 *
 * 这个模块是导航层：地址拼错＝点「继续学习」进不去、draft 课被放出来。
 * 此前它整文件零测试（架构审计点名的最后一处空白）。
 */
import { pickOneExcept } from '../domain/shuffle.js'
import { markPathLocks, isChallengeLocked } from '../domain/path.js'

const sessionAt = (s) => Math.max(Number(s?.endedAt) || 0, Number(s?.startedAt) || 0)

export function createCurriculum({ catalog, isCategoryHidden, store, getProgress = null, isFreeUnlock = null }) {
  const { STAGES, SUBJECTS, LESSONS, getLesson, lessonsForStage, normalizeStage } = catalog
  const hidden = isCategoryHidden || (() => false)
  // 路径软解锁：进度查询与家长「自由探索」开关由应用侧注入（curriculum-app.js）；
  // 未注入时退化为「全开放」，等价于关闭解锁功能。
  const progressOf = getProgress ? (id) => getProgress(id) : () => undefined
  const freeUnlock = () => (isFreeUnlock ? !!isFreeUnlock() : false)

  /** 低龄模式可见性：惊悚/暗黑分类（characters/story）在低龄模式下整课隐藏 */
  function isVisible(lesson) {
    if (!lesson || lesson.status !== 'available') return false
    if (lesson.ref?.kind === 'en-category' && hidden(lesson.ref.id)) return false
    return true
  }

  /**
   * 首页阶段视图：每个科目一个块 { subject, challenge, units, empty, draftCount, challengeLocked }。
   * units 里的每门课带 { locked, isNext }：软解锁路径（domain/path.js）——
   * 第一个未完成的课是「下一课」，其后的课锁定；已完成/拿过星的永远开放。
   */
  function stageBlocks(stageId) {
    const st = normalizeStage(stageId)
    const stageLessons = LESSONS.filter((l) => l.stage === st)
    const available = stageLessons.filter(isVisible)
    const fu = freeUnlock()
    return SUBJECTS.map((subj) => {
      const allSubjectLessons = stageLessons.filter((l) => l.subject === subj.id)
      const ls = available.filter((l) => l.subject === subj.id)
      const draftCount = allSubjectLessons.filter((l) => l.status === 'draft').length
      if (!ls.length) return { subject: subj, challenge: null, units: [], empty: true, draftCount, challengeLocked: false }
      const challenges = ls.filter((l) => l.kind === 'challenge')
      // 古诗课不入锁路径：读诗只记 practice 会话（不算完成），放进路径会把 frontier 永久
      // 卡在古诗上；它像「自由内容」一样始终开放（页内的填字挑战才记课时）。
      // 阅读理解（zh-passage）**要**入路径：它的作答记的是 challenge 会话，算课时完成、
      // 给星，frontier 能正常走过它（与古诗的关键差别就在这）。
      const inPath = (l) => l.ref?.kind !== 'zh-poem'
      let units
      if (subj.id === 'en') {
        units = ls.filter((l) => l.kind === 'learn')
      } else if (subj.id === 'zh') {
        units = ls.filter((l) => l.kind === 'learn')
      } else {
        // 数学没有独立学一学页：全部练习关卡都作为入口卡（一个阶段可能有多关）
        units = challenges
      }
      const { lockedIds, nextId } = markPathLocks(units.filter(inPath), progressOf, { freeUnlock: fu })
      const annotated = units.map((l) => ({ ...l, locked: inPath(l) && lockedIds.has(l.id), isNext: inPath(l) && l.id === nextId }))
      // 挑战钮：该科路径上至少完成一门课才亮（数学全关卡即路径，无独立挑战钮）
      const challengeLocked =
        subj.id === 'math' ? false : isChallengeLocked(units, progressOf, { freeUnlock: fu })
      return { subject: subj, challenge: challenges[0] || null, units: annotated, empty: false, draftCount, challengeLocked }
    })
  }

  /**
   * 全部可见课程的锁定状态：lessonId → { locked, isNext }。
   * 探索页（学英语/学语文/学数学列表）与地图共用同一份口径，避免两处规则漂移。
   */
  function lessonLocks() {
    const out = new Map()
    const fu = freeUnlock()
    for (const stage of STAGES) {
      const available = lessonsForStage(stage.id).filter(isVisible)
      for (const subj of SUBJECTS) {
        const ls = available.filter((l) => l.subject === subj.id)
        const units = subj.id === 'math' ? ls.filter((l) => l.kind === 'challenge') : ls.filter((l) => l.kind === 'learn')
        // 与 stageBlocks 同口径：古诗课不入锁路径、始终开放（阅读理解入路径）
        const inPath = (l) => l.ref?.kind !== 'zh-poem'
        const { lockedIds, nextId } = markPathLocks(units.filter(inPath), progressOf, { freeUnlock: fu })
        for (const l of units) out.set(l.id, { locked: inPath(l) && lockedIds.has(l.id), isNext: inPath(l) && l.id === nextId })
        // 挑战课（en-quiz-l{n} / zh-quiz-l{n}）：路径上没有任何完成记录就锁
        const chLocked = isChallengeLocked(units, progressOf, { freeUnlock: fu })
        for (const l of ls) {
          if (l.kind === 'challenge' && subj.id !== 'math') out.set(l.id, { locked: chLocked, isNext: false })
        }
      }
    }
    return out
  }

  /** 课程 → 页面跳转地址（旧入口页面复用，额外带 lessonId） */
  function lessonUrl(lesson) {
    if (!lesson || !lesson.ref || !isVisible(lesson)) return ''
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
    // 英语小短句：同一页面的英语句子模式（声路与词卡一致，走家长中心所选口音）
    if (r.kind === 'en-sentences') return `/pages/learn/learn?subject=en&sentences=1&stage=${encodeURIComponent(r.id)}&lessonId=${lid}`
    // 古诗点读：独立书单+点读页；填字挑战从页内进入，课时记在本课
    if (r.kind === 'zh-poem') return `/pages/poem/poem?stage=${encodeURIComponent(r.id)}&lessonId=${lid}`
    // 阅读理解：独立书单+读短文+逐题作答页；作答记 challenge 会话（计课时、按首答给星）
    if (r.kind === 'zh-passage') return `/pages/reading/reading?stage=${encodeURIComponent(r.id)}&lessonId=${lid}`
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
   * 随机来一课：某阶段某科目随机抽一课，excludeId 传上一把抽中的课，避免连续重样。
   * 池只含路径上开放（未锁）的学一学课（数学为关卡）——随机不该绕过软解锁路径，
   * 挑战课也留在 🏆 钮里（v1.5 起不再入随机池）。
   */
  function randomLesson(stageId, subjectId, excludeId) {
    const st = normalizeStage(stageId)
    const available = lessonsForStage(st, subjectId).filter(isVisible)
    // 古诗课与锁路径同口径排除：读诗只记 practice 不算完成，放进随机池会被锁态判定卡出
    // （阅读理解记的是 challenge，算完成，留在池里）
    const inPath = (l) => l.ref?.kind !== 'zh-poem'
    const units = subjectId === 'math' ? available.filter((l) => l.kind === 'challenge') : available.filter((l) => l.kind === 'learn' && inPath(l))
    const { lockedIds } = markPathLocks(units, progressOf, { freeUnlock: freeUnlock() })
    const pool = units.filter((l) => !lockedIds.has(l.id))
    return pickOneExcept(pool, excludeId, (l) => l.id) || null
  }

  /** 全部对小孩可见的课程（低龄模式过滤后），家长页统计用同一口径 */
  function visibleLessons() {
    return LESSONS.filter(isVisible)
  }

  function nextLessonAfter(lessonId) {
    const cur = getLesson(lessonId)
    if (!cur) return null
    const order = subjectOrderIndex(cur.subject)
    const i = order.indexOf(cur.id)
    if (i >= 0 && i < order.length - 1) return getLesson(order[i + 1])
    return null
  }

  /** 目录第一课（continueTarget 的兜底，不对外导出） */
  function firstLesson() {
    return LESSONS.find((l) => isVisible(l)) || null
  }

  /**
   * 继续学习目标：
   * 1) 活跃会话（没退干净/切走）→ 原课恢复；
   * 2) 最近一次带快照的暂停会话 → 原课恢复（复用 sessionId）；
   * 3) 最近完成课程 → 同科目下一课；
   * 4) 兜底：目录第一课。
   */
  function continueTarget() {
    const active = store.get('active', null)
    if (active?.session) {
      const lesson = getLesson(active.session.lessonId)
      if (lesson && isVisible(lesson)) {
        return { lesson, mode: 'resume-active', snapshot: active.snapshot || null, sessionId: active.session.sessionId }
      }
    }
    const sessions = store.get('sessions', [])
    // 恢复同一会话会留下旧 paused 日志；先按 sessionId 取事件时间最新状态，
    // 否则「暂停→恢复→完成」后仍可能被旧快照劫回已完成的课程。
    const latestBySession = new Map()
    for (const s of sessions) {
      const prev = latestBySession.get(s.sessionId)
      if (!prev || sessionAt(s) >= sessionAt(prev)) latestBySession.set(s.sessionId, s)
    }
    const timeline = [...latestBySession.values()].sort((a, b) => sessionAt(b) - sessionAt(a))
    const paused = timeline.find((s) => {
      if (s.status !== 'paused' || !s.snapshot) return false
      const lesson = getLesson(s.lessonId)
      return lesson && isVisible(lesson)
    })
    if (paused) {
      const lesson = getLesson(paused.lessonId)
      if (lesson) return { lesson, mode: 'resume-paused', snapshot: paused.snapshot, sessionId: paused.sessionId }
    }
    const completed = timeline.filter((s) => s.status === 'completed')
    const last = completed[0]
    if (last) {
      const nxt = nextLessonAfter(last.lessonId)
      if (nxt && isVisible(nxt) && !lessonLocks().get(nxt.id)?.locked) {
        return { lesson: nxt, mode: 'next', snapshot: null, sessionId: null }
      }
      // 下一课被软解锁锁住（老用户乱序完成时会发生）：退回同科目路径的 frontier，
      // 保证「继续学习」卡与列表锁标永远指向同一门课
      const cur = getLesson(last.lessonId)
      if (cur) {
        const units = lessonsForStage(cur.stage, cur.subject).filter(isVisible).filter((l) => l.kind === 'learn' && l.ref?.kind !== 'zh-poem')
        const { nextId } = markPathLocks(units, progressOf, { freeUnlock: freeUnlock() })
        const frontier = nextId && getLesson(nextId)
        if (frontier && isVisible(frontier)) return { lesson: frontier, mode: 'next', snapshot: null, sessionId: null }
      }
    }
    const first = firstLesson()
    return first ? { lesson: first, mode: 'start', snapshot: null, sessionId: null } : null
  }

  return {
    STAGES,
    SUBJECTS,
    isVisible,
    stageBlocks,
    lessonLocks,
    lessonUrl,
    randomLesson,
    visibleLessons,
    nextLessonAfter,
    continueTarget,
  }
}

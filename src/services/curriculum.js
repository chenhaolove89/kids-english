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

export function createCurriculum({ catalog, isCategoryHidden, store }) {
  const { STAGES, SUBJECTS, LESSONS, getLesson, lessonsForStage, normalizeStage } = catalog
  const hidden = isCategoryHidden || (() => false)

  /** 低龄模式可见性：惊悚/暗黑分类（characters/story）在低龄模式下整课隐藏 */
  function isVisible(lesson) {
    if (!lesson || lesson.status !== 'available') return false
    if (lesson.ref?.kind === 'en-category' && hidden(lesson.ref.id)) return false
    return true
  }

  /** 首页阶段视图：每个科目一个块 { subject, challenge, units, empty } */
  function stageBlocks(stageId) {
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
  function lessonUrl(lesson) {
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
   * 随机来一课：某阶段某科目可见课程里随机抽一课（学一学/挑战都在池内），
   * excludeId 传上一把抽中的课，避免连续重样。
   */
  function randomLesson(stageId, subjectId, excludeId) {
    const ls = lessonsForStage(normalizeStage(stageId), subjectId).filter(isVisible)
    return pickOneExcept(ls, excludeId, (l) => l.id) || null
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

  return {
    STAGES,
    SUBJECTS,
    isVisible,
    stageBlocks,
    lessonUrl,
    randomLesson,
    visibleLessons,
    nextLessonAfter,
    continueTarget,
  }
}

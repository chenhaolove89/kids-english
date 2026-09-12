/**
 * 路径软解锁纯函数：给「下一步学什么」一个默认答案。
 *
 * 规则（与 docs/learning-platform-plan.md 的产品主线一致）：
 * - 科目内按目录顺序排成一条路径；第一个没有完成记录的课是「下一课」（frontier），
 *   它和它之前的课始终开放；它之后的课锁定（弱引导：低龄孩子少做无关决策）。
 * - 有过任何完成记录（学一学完成 / 挑战完成 / 拿过星）的课永远开放——
 *   老用户按旧顺序学过的内容不会被锁回去。
 * - 挑战按钮在该阶段该科至少完成一门课后开放：没学过就挑战等于纯猜。
 * - 家长中心的「自由探索」开关（prefs.freeUnlock）= 全部开放。
 *
 * 这是纯函数：进度查询与偏好由调用方注入，Node 可测（tests/path-unlock.test.js）。
 */

/** 该课是否有任何完成记录 */
export function isLessonDone(progressEntry) {
  return !!progressEntry && (progressEntry.completed > 0 || progressEntry.bestStars > 0 || progressEntry.learnDone === true)
}

/**
 * 按顺序标记一列课程的锁定状态。
 * @param {Array<{id:string}>} ordered 有序课程（学一学路径，不含挑战按钮）
 * @param {(id:string)=>object|undefined} getProgress lessonId → 进度条目
 * @param {{freeUnlock?:boolean}} opts
 * @returns {{lockedIds:Set<string>, nextId:string|null}}
 *   lockedIds 里不含已完成与 frontier；nextId 是推荐入口（frontier）。
 */
export function markPathLocks(ordered, getProgress, { freeUnlock = false } = {}) {
  const lockedIds = new Set()
  if (freeUnlock) return { lockedIds, nextId: null }
  let nextId = null
  let passed = false
  for (const l of ordered) {
    if (passed) {
      lockedIds.add(l.id)
      continue
    }
    if (isLessonDone(getProgress(l.id))) continue
    if (nextId === null) {
      nextId = l.id
      continue
    }
    // frontier 之后的未完成课：锁
    passed = true
    lockedIds.add(l.id)
  }
  return { lockedIds, nextId }
}

/**
 * 挑战按钮是否锁定：该路径上没有任何完成记录 → 锁。
 * 数学关卡本身就是路径（无独立挑战钮），不走这里。
 */
export function isChallengeLocked(ordered, getProgress, { freeUnlock = false } = {}) {
  if (freeUnlock) return false
  return !ordered.some((l) => isLessonDone(getProgress(l.id)))
}

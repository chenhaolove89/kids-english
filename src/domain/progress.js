/**
 * 进度统计纯函数：星级、首答语义、会话聚合。
 * 口径约定（与 docs/learning-platform-plan.md 一致）：
 * - 星级只看「首次作答」正确率：≥90% 3星，≥60% 2星，完成即 1 星。
 * - 「看过/学一学」不计星，不等于掌握。
 * - 答错后重试最终答对：计入最终完成，不计入首次正确。
 */

export function starsForFirstAttempt(firstCorrect, total) {
  if (!total || total <= 0) return 0
  const acc = firstCorrect / total
  if (acc >= 0.9) return 3
  if (acc >= 0.6) return 2
  return 1
}

export function starsText(stars) {
  const n = Math.max(0, Math.min(3, stars | 0))
  return '⭐'.repeat(n) + '☆'.repeat(3 - n)
}

/**
 * 该 (activityId, order) 在本会话（含恢复前的历史 sessionId）里是否从未作答过。
 * attempts 需按时间序（本实现里按追加序即可）。
 */
export function isFirstAttemptFor(attempts, { sessionIds, activityId, order }) {
  const ids = Array.isArray(sessionIds) ? sessionIds : [sessionIds]
  return !attempts.some((a) => ids.includes(a.sessionId) && a.activityId === activityId && a.order === order)
}

/**
 * 聚合一个会话的全部作答：每题（activityId+order）一组，组内第一条判定首答。
 * @returns {{questions:number, firstCorrect:number, attempts:number, correctPicks:number}}
 */
export function sessionTotals(attempts, sessionId) {
  const firstByQuestion = new Map()
  let attemptsN = 0
  let correctPicks = 0
  for (const a of attempts) {
    if (a.sessionId !== sessionId) continue
    attemptsN++
    if (a.correct) correctPicks++
    const key = a.activityId + '|' + String(a.order)
    if (!firstByQuestion.has(key)) firstByQuestion.set(key, !!a.correct)
  }
  let firstCorrect = 0
  for (const ok of firstByQuestion.values()) if (ok) firstCorrect++
  return { questions: firstByQuestion.size, firstCorrect, attempts: attemptsN, correctPicks }
}

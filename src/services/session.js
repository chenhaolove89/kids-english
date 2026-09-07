/**
 * 课时会话服务：一次「开始 → 作答… → 完成/中断」的生命周期与作答事件流。
 * 状态全部落在 platform/storage（带 schemaVersion），服务本身无状态、可注入存储。
 *
 * 事件形状：
 *   Attempt  { attemptId, sessionId, lessonId, activityId, order, answer,
 *              correct, firstTry, skillIds, ts }
 *   Session  { sessionId, lessonId, kind, skillIds, startedAt, status:
 *              'completed'|'paused', endedAt, totals?, snapshot? }
 *
 * 恢复语义：resume 复用原 sessionId（快照 + 事件流天然连续），首答判定跨暂停前后一致。
 * 无会话时（旧入口直开页面）recordAttempt 返回 null，不记录、不报错。
 */
import { getStorage } from '../platform/storage.js'
import { isFirstAttemptFor, sessionTotals } from '../domain/progress.js'

const MAX_ATTEMPTS = 3000
const MAX_SESSIONS = 300

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export function createSessionService(store) {
  function getActive() {
    return store.get('active', null)
  }

  /**
   * 开始会话；resume 时传 reuseSessionId + resumeSnapshot 保持事件流连续。
   */
  function startSession({ lessonId, kind, skillIds = [], reuseSessionId = null, resumeSnapshot = null }) {
    // 残留的活跃会话（无论同课异课）：先落一条 paused 日志保住快照与作答归属，不丢进度
    const lingering = getActive()
    if (lingering && lingering.session) {
      appendSessionLog({
        ...lingering.session,
        status: 'paused',
        endedAt: Date.now(),
        snapshot: lingering.snapshot || null,
      })
    }
    const session = {
      sessionId: reuseSessionId || newId(),
      lessonId,
      kind,
      skillIds,
      startedAt: Date.now(),
    }
    store.set('active', { session, snapshot: resumeSnapshot })
    return getActive()
  }

  /** 中途进度快照（答题位置、已生成的题目等），供恢复用 */
  function saveSnapshot(snapshot) {
    const a = getActive()
    if (a) store.set('active', { ...a, snapshot })
  }

  /**
   * 记录一次作答。firstTry 由事件流推导（该 activityId+order 在本会话首次作答），
   * 页面不需要自己维护「首答」状态。itemId 是本题正确答案的条目 id
   * （英语词 id / 汉字码点 / 数学答案值），错题本靠它定位要复习的词。
   */
  function recordAttempt({ activityId, order, answer, correct, itemId }) {
    const a = getActive()
    if (!a) return null
    const attempts = store.get('attempts', [])
    const firstTry = isFirstAttemptFor(attempts, {
      sessionIds: [a.session.sessionId],
      activityId,
      order,
    })
    const attempt = {
      attemptId: newId(),
      sessionId: a.session.sessionId,
      lessonId: a.session.lessonId,
      activityId,
      order,
      answer: answer === undefined ? null : answer,
      correct: !!correct,
      itemId: itemId === undefined ? null : itemId,
      firstTry,
      skillIds: a.session.skillIds || [],
      ts: Date.now(),
    }
    attempts.push(attempt)
    // 裁剪最老记录时永远保留当前会话的作答——否则长会话恢复后首答判定会被裁没
    let kept = attempts
    if (kept.length > MAX_ATTEMPTS) {
      const activeId = a.session.sessionId
      const mine = kept.filter((x) => x.sessionId === activeId)
      const others = kept.filter((x) => x.sessionId !== activeId).slice(-(MAX_ATTEMPTS - mine.length))
      kept = others.concat(mine)
    }
    store.set('attempts', kept)
    return attempt
  }

  function appendSessionLog(entry) {
    const list = store.get('sessions', [])
    list.push(entry)
    store.set('sessions', list.length > MAX_SESSIONS ? list.slice(-MAX_SESSIONS) : list)
  }

  /** 中断退出：留存快照后清除活跃会话。 */
  function pauseSession() {
    const a = getActive()
    if (!a) return null
    appendSessionLog({ ...a.session, status: 'paused', endedAt: Date.now(), snapshot: a.snapshot || null })
    store.remove('active')
    return a.session
  }

  /** 完成课时：按事件流聚合 totals；重复调用（幂等）返回 null。 */
  function completeSession() {
    const a = getActive()
    if (!a) return null
    const totals = sessionTotals(store.get('attempts', []), a.session.sessionId)
    appendSessionLog({ ...a.session, status: 'completed', endedAt: Date.now(), totals })
    store.remove('active')
    return { ...a.session, totals }
  }

  function clearActive() {
    store.remove('active')
  }

  /**
   * 进入课程页时的会话恢复：
   * 1) 活跃会话就是本课 → 直接续用（含快照）；
   * 2) 有本课的暂停快照 → 复用原 sessionId 恢复；
   * 3) 否则返回 null，调用方自行 startSession 开新会话。
   * 另开他课时若残留其他课程的活跃会话，会先落一条 paused 日志保快照，不丢进度。
   */
  function resumeSessionFor(lessonId) {
    const active = getActive()
    if (active && active.session && active.session.lessonId === lessonId) return active
    const sessions = store.get('sessions', [])
    const paused = [...sessions].reverse().find((s) => s.status === 'paused' && s.snapshot && s.lessonId === lessonId)
    if (paused) {
      return startSession({
        lessonId,
        kind: paused.kind,
        skillIds: paused.skillIds || [],
        reuseSessionId: paused.sessionId,
        resumeSnapshot: paused.snapshot,
      })
    }
    return null
  }

  return {
    getActive,
    startSession,
    saveSnapshot,
    recordAttempt,
    pauseSession,
    completeSession,
    clearActive,
    resumeSessionFor,
  }
}

let _svc = null
export function getSessionService() {
  if (!_svc) _svc = createSessionService(getStorage())
  return _svc
}

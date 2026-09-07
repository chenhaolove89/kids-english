import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createStorage, memoryBackend } from '../src/platform/storage.js'
import { createSessionService } from '../src/services/session.js'
import { createProgressService } from '../src/services/progress.js'

function makeStore() {
  return createStorage({ backend: memoryBackend() })
}

test('recordAttempt：无会话时返回 null（旧入口不记录）', () => {
  const svc = createSessionService(makeStore())
  assert.equal(svc.recordAttempt({ activityId: 'x', order: 0, answer: 'a', correct: true }), null)
})

test('首次作答 firstTry=true，重复作答 firstTry=false（重复点击不伪造首答）', () => {
  const svc = createSessionService(makeStore())
  svc.startSession({ lessonId: 'L1', kind: 'challenge' })
  const a1 = svc.recordAttempt({ activityId: 'quiz', order: 0, answer: 'x', correct: false })
  const a2 = svc.recordAttempt({ activityId: 'quiz', order: 0, answer: 'y', correct: true })
  assert.equal(a1.firstTry, true)
  assert.equal(a2.firstTry, false)
  const a3 = svc.recordAttempt({ activityId: 'quiz', order: 1, answer: 'x', correct: true })
  assert.equal(a3.firstTry, true)
})

test('首次答错重试答对：完成会话的 totals 区分首答与最终', () => {
  const store = makeStore()
  const svc = createSessionService(store)
  svc.startSession({ lessonId: 'L1', kind: 'challenge' })
  svc.recordAttempt({ activityId: 'quiz', order: 0, answer: 'x', correct: false })
  svc.recordAttempt({ activityId: 'quiz', order: 0, answer: 'y', correct: true })
  const done = svc.completeSession()
  assert.equal(done.totals.questions, 1)
  assert.equal(done.totals.firstCorrect, 0)
  assert.equal(done.totals.correctPicks, 1)
  const log = store.get('sessions', [])[0]
  assert.equal(log.status, 'completed')
})

test('completeSession 幂等：重复调用返回 null，不会重复计数', () => {
  const store = makeStore()
  const svc = createSessionService(store)
  svc.startSession({ lessonId: 'L1', kind: 'challenge' })
  svc.recordAttempt({ activityId: 'quiz', order: 0, answer: 'x', correct: true })
  assert.ok(svc.completeSession())
  assert.equal(svc.completeSession(), null)
  assert.equal(store.get('sessions', []).filter((s) => s.status === 'completed').length, 1)
})

test('pauseSession：留存快照并清除活跃会话', () => {
  const store = makeStore()
  const svc = createSessionService(store)
  svc.startSession({ lessonId: 'L1', kind: 'challenge' })
  svc.saveSnapshot({ rounds: [1, 2], roundIdx: 1 })
  const paused = svc.pauseSession()
  assert.equal(paused.lessonId, 'L1')
  assert.equal(svc.getActive(), null)
  const logs = store.get('sessions', [])
  assert.equal(logs.length, 1)
  assert.equal(logs[0].status, 'paused')
  assert.deepEqual(logs[0].snapshot, { rounds: [1, 2], roundIdx: 1 })
})

test('resumeSessionFor：复用 sessionId 恢复，快照与事件流连续', () => {
  const store = makeStore()
  const svc = createSessionService(store)
  const started = svc.startSession({ lessonId: 'L1', kind: 'challenge' })
  svc.recordAttempt({ activityId: 'quiz', order: 0, answer: 'x', correct: false })
  svc.saveSnapshot({ rounds: [1, 2, 3], roundIdx: 1 })
  svc.pauseSession()

  const resumed = svc.resumeSessionFor('L1')
  assert.ok(resumed)
  assert.equal(resumed.session.sessionId, started.session.sessionId, '恢复复用原 sessionId')
  assert.deepEqual(resumed.snapshot, { rounds: [1, 2, 3], roundIdx: 1 })

  // 恢复后第 1 题再答：order=0 已有作答，firstTry 必须为 false（跨暂停一致）
  const a = svc.recordAttempt({ activityId: 'quiz', order: 0, answer: 'y', correct: true })
  assert.equal(a.firstTry, false)
})

test('resumeSessionFor：无历史时返回 null；活跃同课会话直接续用', () => {
  const store = makeStore()
  const svc = createSessionService(store)
  assert.equal(svc.resumeSessionFor('L1'), null)
  svc.startSession({ lessonId: 'L1', kind: 'learn' })
  assert.ok(svc.resumeSessionFor('L1'))
})

test('startSession：残留其他课程活跃会话时先落 paused 保快照', () => {
  const store = makeStore()
  const svc = createSessionService(store)
  svc.startSession({ lessonId: 'L1', kind: 'quiz' })
  svc.saveSnapshot({ idx: 3 })
  svc.startSession({ lessonId: 'L2', kind: 'learn' })
  const logs = store.get('sessions', [])
  assert.equal(logs.length, 1)
  assert.equal(logs[0].lessonId, 'L1')
  assert.equal(logs[0].status, 'paused')
  assert.deepEqual(logs[0].snapshot, { idx: 3 })
  assert.equal(svc.getActive().session.lessonId, 'L2')
})

test('progressService：星级只来自 challenge 完成，learn 不计星；bestStars 取历史最高', () => {
  const store = makeStore()
  const svc = createSessionService(store)
  const prog = createProgressService(store)

  svc.startSession({ lessonId: 'en-quiz-l1', kind: 'challenge' })
  for (let i = 0; i < 9; i++) svc.recordAttempt({ activityId: 'quiz', order: i, answer: 'a', correct: true })
  svc.recordAttempt({ activityId: 'quiz', order: 9, answer: 'a', correct: false })
  svc.recordAttempt({ activityId: 'quiz', order: 9, answer: 'b', correct: true })
  svc.completeSession() // 9/10 首答 → 3 星

  svc.startSession({ lessonId: 'en-quiz-l1', kind: 'challenge' }) // 再玩一次成绩更差
  for (let i = 0; i < 6; i++) svc.recordAttempt({ activityId: 'quiz', order: i, answer: 'a', correct: true })
  svc.completeSession() // 6/10 → 2 星，bestStars 仍取 3

  svc.startSession({ lessonId: 'en-learn-animals', kind: 'learn' })
  svc.completeSession() // 学一学不计星

  const map = prog.lessonProgressMap()
  assert.equal(map.get('en-quiz-l1').bestStars, 3)
  assert.equal(map.get('en-quiz-l1').completed, 2)
  assert.equal(map.get('en-learn-animals').learnDone, true)
  assert.equal(map.get('en-learn-animals').bestStars, 0)

  const s = prog.summary()
  assert.equal(s.totalStars, 3)
  assert.equal(s.lessonsCompleted, 2)
  assert.equal(s.learnDoneCount, 1)
})

test('progressService：暂停→恢复→完成，同一 sessionId 只算一次完成', () => {
  const store = makeStore()
  const svc = createSessionService(store)
  const prog = createProgressService(store)

  svc.startSession({ lessonId: 'math-practice-l1', kind: 'challenge' })
  svc.recordAttempt({ activityId: 'math-gen', order: 0, answer: '3', correct: true })
  svc.saveSnapshot({ qIdx: 1 })
  svc.pauseSession()
  svc.resumeSessionFor('math-practice-l1') // 复用 sessionId
  svc.recordAttempt({ activityId: 'math-gen', order: 1, answer: '5', correct: true })
  svc.completeSession()

  const map = prog.lessonProgressMap()
  assert.equal(map.get('math-practice-l1').completed, 1)
  const totals = store.get('sessions', []).find((s) => s.status === 'completed').totals
  assert.equal(totals.questions, 2)
  assert.equal(totals.firstCorrect, 2)
})

test('weeklyReport：近 7 天完成课数/星/分钟（单次封顶 30 分钟），旧会话不计', () => {
  const store = makeStore()
  const prog = createProgressService(store)
  const DAY = 24 * 60 * 60 * 1000
  const now = 1000 * DAY
  const log = []
  // 本周：完成挑战 9/10 → 2 星，时长 40 分钟 → 封顶 30
  log.push({
    sessionId: 's1', lessonId: 'en-quiz-l1', kind: 'challenge', startedAt: now - 20 * 60000,
    endedAt: now - 20 * 60000 + 40 * 60000, status: 'completed',
    totals: { questions: 10, firstCorrect: 9, attempts: 10, correctPicks: 10 },
  })
  // 本周：完成学一学
  log.push({ sessionId: 's2', lessonId: 'en-learn-animals', kind: 'learn', startedAt: now - DAY, endedAt: now - DAY + 5 * 60000, status: 'completed' })
  // 本周：暂停中（计入时长，不计完成）
  log.push({ sessionId: 's3', lessonId: 'math-practice-l1', kind: 'challenge', startedAt: now - 10 * 60000, endedAt: now - 5 * 60000, status: 'paused' })
  // 8 天前：完成但不计入本周
  log.push({ sessionId: 's4', lessonId: 'en-quiz-l2', kind: 'challenge', startedAt: now - 8 * DAY, endedAt: now - 8 * DAY + 60000, status: 'completed', totals: { questions: 10, firstCorrect: 10, attempts: 10, correctPicks: 10 } })
  store.set('sessions', log)

  const w = prog.weeklyReport(now)
  assert.equal(w.completedLessons, 1)
  assert.equal(w.stars, 3) // 9/10 首答 → 3 星
  assert.equal(w.minutes, 40) // 30（封顶）+ 5（学一学）+ 5（暂停会话）
  assert.equal(w.learnDone, 1)
})

test('recordAttempt 记录 itemId 供错题本定位', () => {
  const store = makeStore()
  const svc = createSessionService(store)
  svc.startSession({ lessonId: 'en-quiz-l1', kind: 'challenge' })
  svc.recordAttempt({ activityId: 'listen-pick', order: 0, answer: 'x', correct: false, itemId: 'cat' })
  const a = store.get('attempts', [])[0]
  assert.equal(a.itemId, 'cat')
})

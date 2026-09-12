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

test('resumeSessionFor：expectKind 不符不复用（挑战中途退出后进学一学，不得混用会话）', () => {
  const store = makeStore()
  const svc = createSessionService(store)
  // 同一课的挑战中途退出（留 paused 快照）
  svc.startSession({ lessonId: 'L1', kind: 'challenge' })
  svc.saveSnapshot({ rounds: [1, 2], roundIdx: 0 })
  svc.pauseSession()
  // 学一学页带 'learn' 期望：不得复用 challenge 会话（否则描红/学习作答污染挑战口径）
  assert.equal(svc.resumeSessionFor('L1', 'learn'), null)
  // 挑战页带 'challenge' 期望：正常恢复
  const resumed = svc.resumeSessionFor('L1', 'challenge')
  assert.ok(resumed)
  assert.equal(resumed.session.kind, 'challenge')
  assert.deepEqual(resumed.snapshot, { rounds: [1, 2], roundIdx: 0 })
  // 不传期望（旧调用）：保持原行为
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

test('progressService：practice（描红/古诗点读）完成不计课时、不给星，但会话与作答都留痕', () => {
  // 口径来自产品决定：练一练要能在家长页看到，但不能把"读一首诗/写一个字"当成学完一课。
  const store = makeStore()
  const svc = createSessionService(store)
  const prog = createProgressService(store)

  svc.startSession({ lessonId: 'zh-poem-qimeng', kind: 'practice' })
  svc.recordAttempt({ activityId: 'poem-read', order: 'yong-e', answer: 'yong-e', correct: true, itemId: null })
  svc.completeSession()

  const p = prog.lessonProgressMap().get('zh-poem-qimeng')
  assert.ok(p, 'practice 会话仍应出现在进度表里（用于 lastAt/最近记录）')
  assert.equal(p.completed, 0, 'practice 不能计入课时完成')
  assert.equal(p.learnDone, false, 'practice 不能标成学一学完成')
  assert.equal(p.bestStars, 0, 'practice 不能给星')

  const s = prog.summary()
  assert.equal(s.lessonsCompleted, 0)
  assert.equal(s.learnDoneCount, 0)
  assert.equal(s.totalStars, 0)

  // 但作答流里有它（周报/累计/练习时长靠 attempts）
  assert.equal(store.get('attempts', []).length, 1)
  assert.equal(store.get('sessions', []).length, 1, '会话记录本身要留着，家长页「最近记录」才看得到')
  assert.equal(prog.recentSessions(5).length, 1)
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

test('weeklyReport：完成课数含学一学、周星按课取最好、时长按作答间隔累计', () => {
  const store = makeStore()
  const prog = createProgressService(store)
  const DAY = 24 * 60 * 60 * 1000
  const now = 1000 * DAY
  const log = []
  // 同一门挑战课本周重玩两次（9/10 与 10/10 都是 3 星）：按课取最好，只算一次 3 星
  log.push({
    sessionId: 's1', lessonId: 'en-quiz-l1', kind: 'challenge', startedAt: now - 20 * 60000,
    endedAt: now - 19 * 60000, status: 'completed',
    totals: { questions: 10, firstCorrect: 9, attempts: 10, correctPicks: 10 },
  })
  log.push({
    sessionId: 's1b', lessonId: 'en-quiz-l1', kind: 'challenge', startedAt: now - 18 * 60000,
    endedAt: now - 17 * 60000, status: 'completed',
    totals: { questions: 10, firstCorrect: 10, attempts: 10, correctPicks: 10 },
  })
  // 另一门挑战 6/10 → 2 星
  log.push({
    sessionId: 's2', lessonId: 'en-quiz-l2', kind: 'challenge', startedAt: now - 16 * 60000,
    endedAt: now - 15 * 60000, status: 'completed',
    totals: { questions: 10, firstCorrect: 6, attempts: 10, correctPicks: 10 },
  })
  // 本周完成学一学（不计星，但算「完成课程」）
  log.push({ sessionId: 's3', lessonId: 'en-learn-animals', kind: 'learn', startedAt: now - DAY, endedAt: now - DAY + 5 * 60000, status: 'completed' })
  // 本周只点读了古诗（practice）：不算「完成课」——否则同屏「完成课程」总数为 0 而这里有数，同名不同义
  log.push({ sessionId: 's6', lessonId: 'zh-poem-qimeng', kind: 'practice', startedAt: now - 2 * DAY, endedAt: now - 2 * DAY + 3 * 60000, status: 'completed' })
  // 挂机用：暂停会话不再计入时长（旧口径按墙钟算，会把挂机算成学习）
  log.push({ sessionId: 's4', lessonId: 'math-practice-l1', kind: 'challenge', startedAt: now - 10 * 60000, endedAt: now - 5 * 60000, status: 'paused' })
  // 8 天前：完成但不计入本周
  log.push({
    sessionId: 's5', lessonId: 'en-quiz-l3', kind: 'challenge', startedAt: now - 8 * DAY,
    endedAt: now - 8 * DAY + 60000, status: 'completed',
    totals: { questions: 10, firstCorrect: 10, attempts: 10, correctPicks: 10 },
  })
  store.set('sessions', log)
  // 作答流：间隔 30s（计 30s）+ 间隔 90s（超 60s 封顶计 60s）
  const t0 = now - 30 * 60000
  store.set('attempts', [{ ts: t0 }, { ts: t0 + 30000 }, { ts: t0 + 120000 }])

  const w = prog.weeklyReport(now)
  // 与 summary 同义：学一学 + 挑战都算，按 lessonId 去重（s1/s1b 同一课）
  assert.equal(w.completedLessons, 3)
  assert.equal(w.learnDone, 1)
  assert.equal(w.stars, 5) // 3（en-quiz-l1 取本周最好）+ 2（en-quiz-l2）
  assert.equal(w.minutes, 2) // 30s + 封顶 60s = 90s
  // 关键不变量：本周星不可能超过总星（旧实现逐会话相加会超过）
  assert.ok(w.stars <= prog.summary().totalStars, `周星 ${w.stars} 不应超过总星 ${prog.summary().totalStars}`)
})

test('attempts 裁剪：单会话作答超过 MAX_ATTEMPTS 时仍然封顶（曾是无界增长）', () => {
  // 直接预置超过上限的历史，避免真的循环写 3000+ 次（原来这一条要跑 6 秒）
  const store = makeStore()
  const svc = createSessionService(store)
  const MAX = 3000
  const seeded = Array.from({ length: MAX + 100 }, (_, i) => ({
    attemptId: `a${i}`, sessionId: 'same', lessonId: 'en-quiz-l1', activityId: 'listen-pick',
    order: i, answer: 'x', correct: true, firstTry: true, itemId: 'cat', ts: i,
  }))
  store.set('attempts', seeded)
  svc.startSession({ lessonId: 'en-quiz-l1', kind: 'challenge', reuseSessionId: 'same' })
  svc.recordAttempt({ activityId: 'listen-pick', order: 99999, answer: 'x', correct: true, itemId: 'cat' })

  const kept = store.get('attempts', [])
  assert.equal(kept.length, MAX, '单会话超限必须裁剪到上限（负 slice 会让裁剪彻底失效）')
  assert.ok(kept.every((a) => a.sessionId === 'same'), '当前会话的作答必须全部保留')
  assert.equal(kept[kept.length - 1].order, 99999, '最新一条必须在')
})

test('attempts 裁剪：优先保留当前会话，旧会话只让位到上限为止', () => {
  const store = makeStore()
  const svc = createSessionService(store)
  const MAX = 3000
  const others = Array.from({ length: 20 }, (_, i) => ({
    attemptId: `o${i}`, sessionId: `old${i}`, lessonId: 'en-quiz-l1', activityId: 'listen-pick',
    order: 0, answer: 'x', correct: true, firstTry: true, itemId: 'cat', ts: i,
  }))
  const mine = Array.from({ length: MAX - 5 }, (_, i) => ({
    attemptId: `m${i}`, sessionId: 'mine', lessonId: 'en-quiz-l1', activityId: 'listen-pick',
    order: i, answer: 'x', correct: true, firstTry: true, itemId: 'cat', ts: 100 + i,
  }))
  store.set('attempts', [...others, ...mine])
  svc.startSession({ lessonId: 'en-quiz-l1', kind: 'challenge', reuseSessionId: 'mine' })
  svc.recordAttempt({ activityId: 'listen-pick', order: 77777, answer: 'x', correct: true, itemId: 'cat' })

  const kept = store.get('attempts', [])
  assert.equal(kept.length, MAX)
  // mine 有 MAX-4 条 → others 只能留 4 条（而不是把 20 条都留下、总量超限）
  assert.equal(kept.filter((a) => a.sessionId === 'mine').length, MAX - 4)
  assert.equal(kept.filter((a) => a.sessionId.startsWith('old')).length, 4)
  assert.ok(kept.some((a) => a.order === 77777), '当前会话最新作答必须在')
})

test('目录里已不存在的课（内容下线/改名）不计入总览与周报，避免同屏自相矛盾', () => {
  const store = makeStore()
  const prog = createProgressService(store)
  const DAY = 24 * 60 * 60 * 1000
  const now = 1000 * DAY
  store.set('sessions', [
    {
      sessionId: 'live', lessonId: 'en-quiz-l1', kind: 'challenge', startedAt: now - 60000,
      endedAt: now - 30000, status: 'completed',
      totals: { questions: 10, firstCorrect: 10, attempts: 10, correctPicks: 10 },
    },
    {
      sessionId: 'orphan', lessonId: 'en-quiz-removed', kind: 'challenge', startedAt: now - 60000,
      endedAt: now - 30000, status: 'completed',
      totals: { questions: 10, firstCorrect: 10, attempts: 10, correctPicks: 10 },
    },
  ])

  // 不过滤（旧行为）：孤儿课也算进去 → 总览数字与「各科进度 done/total」对不上
  assert.equal(prog.summary().lessonsCompleted, 2)
  assert.equal(prog.summary().totalStars, 6)

  // 过滤后：只统计目录里仍存在的课
  const isKnownLesson = (id) => id === 'en-quiz-l1'
  assert.equal(prog.summary({ isKnownLesson }).lessonsCompleted, 1)
  assert.equal(prog.summary({ isKnownLesson }).totalStars, 3)
  assert.equal(prog.weeklyReport(now, { isKnownLesson }).completedLessons, 1)
  assert.equal(prog.weeklyReport(now, { isKnownLesson }).stars, 3)
})

test('skillBreakdown：按知识点聚合首答正确率，最弱在前，重试不掺进来', () => {
  const store = makeStore()
  const prog = createProgressService(store)
  const mk = (skillIds, correct, firstTry = true, lessonId = 'en-learn-animals') => ({
    sessionId: 's1', lessonId, activityId: 'listen-pick', order: 0,
    answer: 'x', correct, firstTry, itemId: 'cat', skillIds, ts: 1,
  })
  store.set('attempts', [
    // 知识点 A：3 题首答对 1 题（弱）
    mk(['skill-a'], true), mk(['skill-a'], false), mk(['skill-a'], false),
    // 知识点 B：4 题首答对 4 题（强）
    mk(['skill-b'], true), mk(['skill-b'], true), mk(['skill-b'], true), mk(['skill-b'], true),
    // 重试：firstTry=false，不得计入任何知识点
    mk(['skill-b'], false, false),
    // 没有 skillIds 的事件不得炸
    { sessionId: 's1', lessonId: 'en-learn-animals', activityId: 'x', order: 1, correct: true, firstTry: true, ts: 1 },
  ])

  const rows = prog.skillBreakdown()
  assert.equal(rows.length, 2)
  assert.equal(rows[0].skillId, 'skill-a', '最弱的排最前')
  assert.equal(rows[0].first, 3)
  assert.equal(rows[0].firstCorrect, 1)
  assert.ok(Math.abs(rows[0].accuracy - 1 / 3) < 1e-9)
  assert.equal(rows[1].skillId, 'skill-b')
  assert.equal(rows[1].first, 4, '重试不计入首答样本')
  assert.equal(rows[1].accuracy, 1)
})

test('skillBreakdown：少于 minAttempts 次作答的知识点不参与（1/1 的 0% 是噪声）', () => {
  const store = makeStore()
  const prog = createProgressService(store)
  store.set('attempts', [
    { sessionId: 's1', lessonId: 'a', activityId: 'k', order: 0, correct: true, firstTry: true, skillIds: ['only-once'], ts: 1 },
    { sessionId: 's1', lessonId: 'a', activityId: 'k', order: 1, correct: false, firstTry: true, skillIds: ['enough'], ts: 2 },
    { sessionId: 's1', lessonId: 'a', activityId: 'k', order: 2, correct: false, firstTry: true, skillIds: ['enough'], ts: 3 },
    { sessionId: 's1', lessonId: 'a', activityId: 'k', order: 3, correct: true, firstTry: true, skillIds: ['enough'], ts: 4 },
  ])
  assert.deepEqual(prog.skillBreakdown().map((r) => r.skillId), ['enough'])
  // 放宽阈值就能看到样本不足的
  assert.deepEqual(prog.skillBreakdown({ minAttempts: 1 }).map((r) => r.skillId).sort(), ['enough', 'only-once'])
})

test('skillBreakdown：过滤目录里已不存在的课，并遵守 limit', () => {
  const store = makeStore()
  const prog = createProgressService(store)
  const many = []
  for (let i = 0; i < 12; i++) {
    for (let k = 0; k < 3; k++) {
      many.push({
        sessionId: 's1', lessonId: i % 2 ? 'gone' : 'live', activityId: 'k', order: k,
        correct: k === 0, firstTry: true, skillIds: [`skill-${i}`], ts: k,
      })
    }
  }
  store.set('attempts', many)
  const isKnownLesson = (id) => id === 'live'
  const rows = prog.skillBreakdown({ isKnownLesson, limit: 100 })
  assert.ok(rows.length > 0)
  assert.ok(rows.every((r) => Number(r.skillId.split('-')[1]) % 2 === 0), '孤儿课的 skill 必须被过滤掉')
  assert.ok(prog.skillBreakdown({ limit: 2 }).length <= 2, 'limit 必须生效')
})

test('recordAttempt 记录 itemId 供错题本定位', () => {
  const store = makeStore()
  const svc = createSessionService(store)
  svc.startSession({ lessonId: 'en-quiz-l1', kind: 'challenge' })
  svc.recordAttempt({ activityId: 'listen-pick', order: 0, answer: 'x', correct: false, itemId: 'cat' })
  const a = store.get('attempts', [])[0]
  assert.equal(a.itemId, 'cat')
})

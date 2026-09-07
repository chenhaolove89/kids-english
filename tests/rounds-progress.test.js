import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildListenPickRounds } from '../src/domain/rounds.js'
import { isRoundPickCorrect } from '../src/domain/judge.js'
import { starsForFirstAttempt, sessionTotals, isFirstAttemptFor } from '../src/domain/progress.js'

function seededRng(seed = 7) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
}

const pool = Array.from({ length: 12 }, (_, i) => ({ id: `w${i}` }))

test('buildListenPickRounds：默认 10 轮、每轮 4 个不重复选项且含答案', () => {
  const rounds = buildListenPickRounds(pool, { rng: seededRng() })
  assert.equal(rounds.length, 10)
  for (const r of rounds) {
    const ids = r.options.map((o) => o.id)
    assert.equal(ids.length, 4)
    assert.equal(new Set(ids).size, 4, '选项不重复')
    assert.ok(ids.includes(r.answer.id), '答案在选项中')
  }
})

test('buildListenPickRounds：池小于 4 也能出轮；空池明确报错不静默', () => {
  const small = buildListenPickRounds(pool.slice(0, 3), { rng: seededRng() })
  assert.equal(small.length, 3)
  for (const r of small) assert.ok(r.options.length >= 3)
  assert.throws(() => buildListenPickRounds([]), /empty-pool/)
})

test('isRoundPickCorrect：round.answer 是条目对象，按 id 判对错', () => {
  const rounds = buildListenPickRounds(pool, { rng: seededRng() })
  for (const r of rounds) {
    assert.equal(isRoundPickCorrect(r, r.answer.id), true, '答案 id 必须判对')
    for (const o of r.options) {
      if (o.id !== r.answer.id) assert.equal(isRoundPickCorrect(r, o.id), false)
    }
  }
  assert.equal(isRoundPickCorrect(null, 'x'), false)
})

test('starsForFirstAttempt：90% 3星 / 60% 2星 / 完成即 1星 / 无题不计', () => {
  assert.equal(starsForFirstAttempt(10, 10), 3)
  assert.equal(starsForFirstAttempt(9, 10), 3)
  assert.equal(starsForFirstAttempt(8, 10), 2)
  assert.equal(starsForFirstAttempt(6, 10), 2)
  assert.equal(starsForFirstAttempt(5, 10), 1)
  assert.equal(starsForFirstAttempt(0, 10), 1)
  assert.equal(starsForFirstAttempt(5, 0), 0)
})

test('sessionTotals：按题聚合，首答决定 firstCorrect，重试计入 correctPicks', () => {
  const attempts = [
    { sessionId: 's1', activityId: 'quiz', order: 0, correct: false },
    { sessionId: 's1', activityId: 'quiz', order: 0, correct: true },
    { sessionId: 's1', activityId: 'quiz', order: 1, correct: true },
    { sessionId: 's1', activityId: 'quiz', order: 1, correct: true },
  ]
  const t = sessionTotals(attempts, 's1')
  assert.equal(t.questions, 2)
  assert.equal(t.firstCorrect, 1) // 第 1 题首答错，第 2 题首答对
  assert.equal(t.attempts, 4)
  assert.equal(t.correctPicks, 3)
})

test('sessionTotals：只统计本会话，不串其他会话', () => {
  const attempts = [
    { sessionId: 's1', activityId: 'quiz', order: 0, correct: true },
    { sessionId: 's2', activityId: 'quiz', order: 0, correct: true },
  ]
  assert.equal(sessionTotals(attempts, 's1').questions, 1)
  assert.equal(sessionTotals(attempts, 's2').questions, 1)
})

test('isFirstAttemptFor：支持会话恢复链（多 sessionId）', () => {
  const attempts = [{ sessionId: 's-old', activityId: 'quiz', order: 2, correct: false }]
  assert.equal(isFirstAttemptFor(attempts, { sessionIds: ['s-new', 's-old'], activityId: 'quiz', order: 2 }), false)
  assert.equal(isFirstAttemptFor(attempts, { sessionIds: ['s-new', 's-old'], activityId: 'quiz', order: 3 }), true)
  assert.equal(isFirstAttemptFor(attempts, { sessionIds: 's-old', activityId: 'quiz', order: 2 }), false)
})

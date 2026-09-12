/**
 * 动力层纯函数：今日小任务软推荐 + 鼓励语轮换。
 * 口径见 src/domain/daily-task.js 与 src/domain/encourage.js。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pickDailyTask, todayKey } from '../src/domain/daily-task.js'
import { pickPraise } from '../src/domain/encourage.js'

const CANDS = [
  { lessonId: 'a', title: 'A挑战', stars: 3, order: 0 },
  { lessonId: 'b', title: 'B挑战', stars: 1, order: 1 },
  { lessonId: 'c', title: 'C挑战', stars: 2, order: 2 },
]

test('今日小任务：有到期错题时不推荐（错题卡已承担）', () => {
  assert.equal(pickDailyTask({ dueTotal: 3, candidates: CANDS, dayKey: '2026-09-12' }), null)
})

test('今日小任务：挑星最少的关卡；满星的不再参与', () => {
  const t = pickDailyTask({ dueTotal: 0, candidates: CANDS, dayKey: '2026-09-12' })
  assert.equal(t.lessonId, 'b')
})

test('今日小任务：同星多关按日期轮换，同一天稳定', () => {
  const cands = [
    { lessonId: 'x', title: 'X', stars: 0, order: 0 },
    { lessonId: 'y', title: 'Y', stars: 0, order: 1 },
    { lessonId: 'z', title: 'Z', stars: 0, order: 2 },
  ]
  const t1 = pickDailyTask({ dueTotal: 0, candidates: cands, dayKey: '2026-09-12' })
  const t2 = pickDailyTask({ dueTotal: 0, candidates: cands, dayKey: '2026-09-12' })
  const t3 = pickDailyTask({ dueTotal: 0, candidates: cands, dayKey: '2026-09-13' })
  assert.equal(t1.lessonId, t2.lessonId, '同一天推荐不跳变')
  assert.ok(t3, '另一天仍有推荐')
})

test('今日小任务：没有可推荐的候选（全满星/空）返回 null', () => {
  assert.equal(pickDailyTask({ dueTotal: 0, candidates: [], dayKey: 'd' }), null)
  assert.equal(pickDailyTask({ dueTotal: 0, candidates: [CANDS[0]], dayKey: 'd' }), null)
})

test('todayKey：本地时区 YYYY-MM-DD', () => {
  assert.match(todayKey(Date.UTC(2026, 8, 12)), /^\d{4}-\d{2}-\d{2}$/)
})

test('鼓励语轮换：随机但不连续重复；单条/空池安全', () => {
  const pool = ['a', 'b', 'c']
  let last = null
  for (let i = 0; i < 50; i++) {
    const k = pickPraise(pool, last)
    assert.ok(pool.includes(k))
    assert.notEqual(k, last, '不应连续重样')
    last = k
  }
  assert.equal(pickPraise(['only'], 'only'), 'only')
  assert.equal(pickPraise([], null), null)
  assert.equal(pickPraise(undefined, null), null)
})

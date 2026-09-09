/**
 * 收集图鉴纯函数测试：点亮集合合并、首答派生、三态统计、庆祝判定与历史回填。
 * 服务层（services/collection.js）依赖 catalog JSON 属 Vite 运行时，回填逻辑已抽到
 * domain/deriveFromHistory 注入 resolver，在这里覆盖。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createEmpty,
  normalizeColl,
  addIds,
  deriveMastersFromAttempts,
  litState,
  progressOf,
  isCategoryComplete,
  isMathTrophy,
  celebration,
  deriveFromHistory,
} from '../src/domain/collection.js'

test('createEmpty：各科结构完整且互不共享引用', () => {
  const a = createEmpty()
  a.en.seen.push('x')
  assert.deepEqual(a.zh.seen, [])
  assert.deepEqual(a.zhWords.seen, [])
  assert.deepEqual(a.zhSentences.seen, [])
  assert.deepEqual(a.math.done, [])
})

test('normalizeColl：脏数据/缺键归一化，数组去重', () => {
  assert.deepEqual(normalizeColl(null), createEmpty())
  assert.deepEqual(normalizeColl({ en: { seen: ['a', 'a'] } }), {
    en: { seen: ['a'], mastered: [] },
    zh: { seen: [], mastered: [] },
    zhWords: { seen: [], mastered: [] },
    zhSentences: { seen: [], mastered: [] },
    math: { done: [] },
  })
})

test('addIds：小短句桶与汉字桶互不混（同是字码点，靠桶隔离）', () => {
  let c = addIds(createEmpty(), 'zhSentences', 'seen', ['4e00'])
  assert.deepEqual(c.zhSentences.seen, ['4e00'])
  assert.deepEqual(c.zh.seen, [], '句子点亮不得进汉字桶')
  c = addIds(c, 'zh', 'seen', ['4e00'])
  assert.deepEqual(c.zhSentences.seen, ['4e00'])
  assert.deepEqual(c.zh.seen, ['4e00'])
})

test('addIds：语文词语桶与汉字桶互不混（zhWords 独立）', () => {
  let c = addIds(createEmpty(), 'zhWords', 'seen', ['red'])
  assert.deepEqual(c.zhWords.seen, ['red'])
  assert.deepEqual(c.zh.seen, [], '词语点亮不得进汉字桶')
  c = addIds(c, 'zh', 'seen', ['4e00'])
  assert.deepEqual(c.zhWords.seen, ['red'])
  assert.deepEqual(c.zh.seen, ['4e00'])
})

test('addIds：去重合并、只增不减、过滤空值', () => {
  let c = addIds(createEmpty(), 'en', 'seen', ['red', 'blue', null, '', 'red'])
  assert.deepEqual(c.en.seen, ['red', 'blue'])
  c = addIds(c, 'en', 'seen', ['red', 'green'])
  assert.deepEqual(c.en.seen, ['red', 'blue', 'green'])
})

test('addIds 到 mastered 自动补 seen（掌握必是认识）', () => {
  const c = addIds(createEmpty(), 'zh', 'mastered', ['4e00'])
  assert.deepEqual(c.zh.mastered, ['4e00'])
  assert.deepEqual(c.zh.seen, ['4e00'])
})

test('addIds：数学徽章按课程 id 记录', () => {
  const c = addIds(createEmpty(), 'math', 'done', ['math-practice-l1', 'math-practice-l1'])
  assert.deepEqual(c.math.done, ['math-practice-l1'])
})

test('deriveMastersFromAttempts：仅首答且答对且有条目 id', () => {
  const attempts = [
    { sessionId: 's1', firstTry: true, correct: true, itemId: 'red' },
    { sessionId: 's1', firstTry: false, correct: true, itemId: 'blue' },
    { sessionId: 's1', firstTry: true, correct: false, itemId: 'cat' },
    { sessionId: 's1', firstTry: true, correct: true, itemId: null },
    { sessionId: 's2', firstTry: true, correct: true, itemId: 'dog' },
  ]
  assert.deepEqual(deriveMastersFromAttempts(attempts, 's1'), ['red'])
})

test('litState 三态：mastered 优先于 seen', () => {
  const seen = new Set(['a', 'b'])
  const mastered = new Set(['b'])
  assert.equal(litState('a', seen, mastered), 'seen')
  assert.equal(litState('b', seen, mastered), 'mastered')
  assert.equal(litState('c', seen, mastered), 'locked')
})

test('progressOf / isCategoryComplete：seen 含 mastered，集齐按 mastered', () => {
  const seen = new Set(['a', 'b', 'c'])
  const mastered = new Set(['a', 'b'])
  const p = progressOf(['a', 'b', 'c', 'd'], seen, mastered)
  assert.deepEqual(p, { total: 4, seen: 3, mastered: 2 })
  assert.equal(isCategoryComplete(p), false)
  assert.equal(isCategoryComplete(progressOf(['a', 'b'], seen, mastered)), true)
  assert.equal(isCategoryComplete({ total: 0, seen: 0, mastered: 0 }), false, '空分类不算集齐')
})

test('isMathTrophy：完成且最佳 3 星才给奖杯，缺一不可', () => {
  assert.equal(isMathTrophy(true, 3), true)
  assert.equal(isMathTrophy(true, 2), false, '2 星只是完成过，不算攻克')
  assert.equal(isMathTrophy(false, 3), false, '没完成过不给杯')
  assert.equal(isMathTrophy(true, 0), false)
  assert.equal(isMathTrophy(false, 0), false)
})

test('celebration：只统计正增量，清空后（负数）归零', () => {
  const prev = { enSeen: 10, enMastered: 2, zhSeen: 5, zhMastered: 1, mathDone: 1 }
  const cur = { enSeen: 14, enMastered: 4, zhSeen: 5, zhMastered: 1, mathDone: 2 }
  assert.deepEqual(celebration(prev, cur), { newSeen: 4, newMastered: 2, mathNew: 1, total: 7 })
  const cleared = { enSeen: 0, enMastered: 0, zhSeen: 0, zhMastered: 0, mathDone: 0 }
  assert.equal(celebration(prev, cleared).total, 0)
})

test('deriveFromHistory：学一学进 seen、挑战首答进 mastered、数学进徽章、脏会话跳过', () => {
  const sessions = [
    { sessionId: 'a', lessonId: 'en-learn-colors', kind: 'learn', status: 'completed' },
    { sessionId: 'b', lessonId: 'en-challenge-l1', kind: 'challenge', status: 'completed' },
    { sessionId: 'c', lessonId: 'math-practice-l1', kind: 'challenge', status: 'completed' },
    { sessionId: 'd', lessonId: 'en-learn-colors', kind: 'learn', status: 'paused' },
    { sessionId: 'e', lessonId: 'ghost-lesson', kind: 'learn', status: 'completed' },
  ]
  const attempts = [
    { sessionId: 'b', firstTry: true, correct: true, itemId: 'red' },
    { sessionId: 'b', firstTry: true, correct: false, itemId: 'blue' },
  ]
  const resolver = (id) => {
    if (id === 'en-learn-colors') return { subject: 'en', kind: 'learn', itemIds: ['red', 'blue'] }
    if (id === 'en-challenge-l1') return { subject: 'en', kind: 'challenge', itemIds: null }
    if (id === 'math-practice-l1') return { subject: 'math', kind: 'challenge', itemIds: null }
    return null
  }
  const c = deriveFromHistory(sessions, attempts, resolver)
  assert.deepEqual(c.en.seen, ['red', 'blue'])
  assert.deepEqual(c.en.mastered, ['red'])
  assert.deepEqual(c.math.done, ['math-practice-l1'])
})

test('deriveFromHistory：隐藏分类（itemIds=null）不点亮', () => {
  const sessions = [{ sessionId: 'h', lessonId: 'en-learn-story', kind: 'learn', status: 'completed' }]
  const c = deriveFromHistory(sessions, [], () => ({ subject: 'en', kind: 'learn', itemIds: null }))
  assert.deepEqual(c.en.seen, [])
})

/**
 * 错题本按科目隔离：英语课与语文词语课共用同一批词 id
 * （实测 1420/2000 个词 id 同时属于两科），只用裸 itemId 当存储键会让
 * 同一单词的两科作答互相覆盖：wrongCount 串在一起、subject 被最后一次作答改写，
 * 最后只进一个科目的重练池、另一个科目的错题凭空消失。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createStorage, memoryBackend } from '../src/platform/storage.js'
import { createReviewService, reviewKey } from '../src/services/review.js'

function makeStore() {
  return createStorage({ backend: memoryBackend() })
}

test('同一个词 id 在英语与语文各自独立记账，互不覆盖', () => {
  const store = makeStore()
  const svc = createReviewService(store)

  // 英语答错两次
  svc.recordResult('cat', false, { subject: 'en', text: 'cat' })
  svc.recordResult('cat', false, { subject: 'en', text: 'cat' })
  // 语文（词语课：同一个词 id，中文释义）答错一次
  svc.recordResult('cat', false, { subject: 'zh', text: '猫' })

  const all = store.get('review', {})
  assert.equal(all[reviewKey('en', 'cat')].wrongCount, 2)
  assert.equal(all[reviewKey('zh', 'cat')].wrongCount, 1)
  assert.equal(all[reviewKey('en', 'cat')].subject, 'en')
  assert.equal(all[reviewKey('zh', 'cat')].subject, 'zh')
  assert.equal(all[reviewKey('zh', 'cat')].text, '猫')

  // 两科各自的重练池都能拿到这道题
  assert.equal(svc.dueCount('en'), 1)
  assert.equal(svc.dueCount('zh'), 1)
  assert.equal(svc.dueCount('math'), 0)
})

test('对外一律给出裸 itemId：resolver 与页面不认命名空间前缀', () => {
  const store = makeStore()
  const calls = []
  const svc = createReviewService(store, {
    en: (id) => { calls.push(id); return { id, en: id } },
    math: (id) => { calls.push(id); return { id, kind: 'add' } },
  })
  svc.recordResult('cat', false, { subject: 'en', text: 'cat' })
  const mathId = 'math-l3:add:2:3'
  svc.recordResult(mathId, false, { subject: 'math', text: '2 + 3 = ?' })

  const enDue = svc.dueEntries('en')
  assert.equal(enDue[0].itemId, 'cat', 'dueEntries 必须还原裸 id')
  const mathDue = svc.dueEntries('math')
  assert.equal(mathDue[0].itemId, mathId, '带冒号的数学签名 id 也必须原样还原')

  const pool = svc.buildReviewPool('en')
  assert.equal(pool.length, 1)
  assert.deepEqual(calls, ['cat'], 'resolver 只应收到裸 id')

  assert.equal(svc.topWrong(5)[0].itemId.length > 0, true)
  assert.ok(!svc.topWrong(5).some((e) => e.itemId.includes('|')), 'topWrong 不应泄漏命名空间分隔符')
})

test('旧数据（裸 itemId 当键）自动升级为命名空间键且不丢条目', () => {
  const be = memoryBackend()
  const store = createStorage({ backend: be })
  // 模拟旧版本落下的数据：裸键 + 条目里自带 subject
  store.set('review', {
    cat: { box: 1, due: Date.now() - 1, wrongCount: 3, updatedAt: Date.now(), subject: 'zh', text: '猫' },
    dog: { box: 0, due: Date.now() - 1, wrongCount: 1, updatedAt: Date.now(), subject: 'en', text: 'dog' },
    legacyNoSubject: { box: 0, due: Date.now() - 1, wrongCount: 1, updatedAt: Date.now() },
  })

  const svc = createReviewService(store)
  // 读一次即完成升级并落盘
  assert.equal(svc.dueCount('zh'), 1, 'cat 应归到语文')
  assert.equal(svc.dueCount('en'), 2, 'dog 与缺 subject 的条目应归到英语')

  const all = store.get('review', {})
  assert.ok(all[reviewKey('zh', 'cat')], 'cat 的键应已命名空间化')
  assert.ok(all[reviewKey('en', 'dog')])
  assert.ok(all[reviewKey('en', 'legacyNoSubject')], '缺 subject 的旧条目按 en 兜底，不能丢')
  assert.equal(all.cat, undefined, '裸键应已被清理')
  assert.equal(all[reviewKey('zh', 'cat')].itemId, 'cat', '裸 id 应存回条目里')
  assert.equal(all[reviewKey('zh', 'cat')].wrongCount, 3, '计数不能丢')
})

test('升级是幂等的：重复读取不会重复改写或丢条目', () => {
  const store = makeStore()
  store.set('review', { cat: { box: 0, due: Date.now() - 1, wrongCount: 1, updatedAt: Date.now(), subject: 'en' } })
  const a = createReviewService(store)
  assert.equal(a.dueCount('en'), 1)
  const snapshot = JSON.stringify(store.get('review', {}))
  // 新建一个服务实例（模拟第二次进入页面 / review-pools 的另一个实例）
  const b = createReviewService(store)
  assert.equal(b.dueCount('en'), 1)
  assert.equal(JSON.stringify(store.get('review', {})), snapshot, '第二次读取不应再改写')
})

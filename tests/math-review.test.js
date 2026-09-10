/**
 * 数学错题本：题目签名/展示文本/条目 id（mathgen）+ 数学条目进本、原题重放、晋级归零（review 服务）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildQuestions, makeQuestion, mathText, mathItemId, MATH_LEVELS } from '../src/domain/mathgen.js'
import { createStorage, memoryBackend } from '../src/platform/storage.js'
import { createReviewService } from '../src/services/review.js'

function makeStore() {
  return createStorage({ backend: memoryBackend() })
}

test('mathgen sig：每个关卡所有题型都有 sig，且以题型名开头', () => {
  const seenKinds = new Set()
  for (const lv of Object.keys(MATH_LEVELS)) {
    for (let i = 0; i < 300; i++) {
      const q = makeQuestion(Number(lv))
      assert.ok(q.sig, `L${lv} ${q.kind} 缺 sig`)
      assert.ok(q.sig.startsWith(q.kind + ':'), `sig 应以题型开头：${q.sig}`)
      seenKinds.add(q.kind)
    }
  }
  assert.deepEqual(
    [...seenKinds].sort(),
    ['add', 'add20', 'addBig', 'addDec', 'addFrac', 'compare', 'compareNum', 'count', 'div', 'listen', 'missing', 'missingBig', 'mixed2', 'mul', 'pattern', 'sequence', 'sub', 'sub20', 'subBig', 'subDec', 'wordAdd', 'wordMul', 'wordSub'],
  )
})

test('mathItemId：关卡前缀 + 签名，纯答案不再当条目 id', () => {
  const q = makeQuestion(3, { rng: () => 0.0001 })
  const id = mathItemId(3, q)
  assert.match(id, /^math-l3:[a-z0-9]+:/)
  assert.equal(mathItemId(2, { kind: 'add', answer: '7' }), '', '无签名的旧快照不产生 id')
})

test('mathText：算式原样，图形/听音/比一比给人话', () => {
  assert.equal(mathText({ kind: 'add20', display: '3 + 4 = ?' }), '3 + 4 = ?')
  assert.equal(mathText({ kind: 'add', answer: '4', leftEmojis: [1, 2, 3], rightEmojis: [1] }), '看图加法：3 + 1 = ?')
  assert.equal(mathText({ kind: 'sub', answer: '2', leftEmojis: [1, 2, 3, 4], rightEmojis: [1, 2] }), '看图减法：4 − 2 = ?')
  assert.equal(mathText({ kind: 'count', answer: '5' }), '数一数：一共 5 个')
  assert.equal(mathText({ kind: 'listen', answer: '12' }), '听音识数：12')
  assert.equal(
    mathText({ kind: 'compare', answer: '0', groups: [{ n: 3 }, { n: 7 }], seq: ['/static/audio/zh-more.mp3'] }),
    '比多少：哪边多（3 和 7）',
  )
  assert.equal(
    mathText({ kind: 'compareNum', answer: '1', groups: [{ n: 5 }, { n: 9 }], seq: ['/static/audio/zh-smaller.mp3'] }),
    '比大小：哪个数小（5 和 9）',
  )
  assert.equal(mathText(null), '')
})

test('buildQuestions：按 sig 去重后「比一比」不再被压到每套最多 2 道', () => {
  const questions = buildQuestions(2, { count: 10 })
  assert.equal(questions.length, 10)
  const compareN = questions.filter((q) => q.kind === 'compare').length
  assert.ok(compareN <= 10, 'sanity')
  // sig 全组唯一
  const sigs = new Set(questions.map((q) => q.sig))
  assert.equal(sigs.size, 10, '同组内 sig 不重复')
})

test('数学错题进本 → 原题重放 → 答对晋级（明天到期）→ 答错归零', () => {
  const store = makeStore()
  const review = createReviewService(store, {
    math: (id, entry) => (entry?.payload ? { ...entry.payload, reviewItemId: id } : null),
  })
  const q = { kind: 'add20', display: '3 + 4 = ?', answer: '7', sig: 'add20:3:4', options: [] }
  const itemId = mathItemId(3, q)

  // 答错进本：盒 0 当天到期，payload 完整保存
  review.recordResult(itemId, false, { subject: 'math', text: mathText(q), payload: q })
  assert.equal(review.dueCount('math'), 1)
  const pool = review.buildReviewPool('math')
  assert.equal(pool.length, 1)
  assert.equal(pool[0].reviewItemId, itemId)
  assert.equal(pool[0].display, '3 + 4 = ?')
  assert.equal(pool[0].sig, 'add20:3:4')

  // 重练答对：晋级盒 1，明天到期 → 今天不再出现
  review.recordResult(itemId, true, { subject: 'math', payload: q })
  assert.equal(review.dueCount('math'), 0)
  const entry = store.get('review', {})[itemId]
  assert.equal(entry.box, 1)
  assert.equal(entry.wrongCount, 1)

  // 又答错：归零当天到期，wrongCount 累计
  review.recordResult(itemId, false, { subject: 'math', payload: q })
  assert.equal(review.dueCount('math'), 1)
  const entry2 = store.get('review', {})[itemId]
  assert.equal(entry2.box, 0)
  assert.equal(entry2.wrongCount, 2)
  assert.equal(entry2.subject, 'math')
})

test('数学答对但不在本 → 不收录（错题本只收错过的）', () => {
  const store = makeStore()
  const review = createReviewService(store, {})
  const q = { kind: 'mul', answer: '12', sig: 'mul:3:4' }
  review.recordResult(mathItemId(4, q), true, { subject: 'math', payload: q })
  assert.equal(review.dueCount('math'), 0)
  assert.deepEqual(store.get('review', {}), {})
})

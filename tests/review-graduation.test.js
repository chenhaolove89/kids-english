/**
 * 错题本「毕业」语义：连对晋级到最高盒后再答对一次即出本。
 *
 * 背景：结果页文案一直写「连对的错题会毕业，答错明天再见」，但实现只把 due 推到 7 天后，
 * 条目永远留在本里、每 7 天复发一次，孩子掌握的词会永久出现在错题重练里。
 * 这条测试把「毕业」钉成契约，避免再次只改文案不改行为。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createStorage, memoryBackend } from '../src/platform/storage.js'
import { createReviewService, reviewKey } from '../src/services/review.js'
import { REVIEW_BOX_DAYS, REVIEW_MAX_BOX, isGraduated, freshEntry, nextEntry, isDue } from '../src/domain/review.js'

const DAY = 24 * 60 * 60 * 1000

function makeStore() {
  return createStorage({ backend: memoryBackend() })
}

test('isGraduated：只在「已在最高盒 + 本次答对」时为真', () => {
  const top = { box: REVIEW_MAX_BOX }
  assert.equal(isGraduated(top, true), true)
  assert.equal(isGraduated(top, false), false, '最高盒答错要归零重来，不能毕业')
  assert.equal(isGraduated({ box: 0 }, true), false)
  assert.equal(isGraduated(undefined, true), false, '不在本的词答对本来就不收录')
})

test('盒子流转：0→1→3→7 天晋级，答错归零（与文案一致）', () => {
  const ts = 1000
  let e = freshEntry(ts)
  assert.equal(e.box, 0)
  assert.equal(isDue(e, ts), true, '刚错的当天就可重练')
  const days = []
  for (let i = 0; i < REVIEW_MAX_BOX; i++) {
    e = nextEntry(e, true, ts)
    days.push(e.box)
  }
  assert.deepEqual(days, [1, 2, 3].slice(0, REVIEW_MAX_BOX))
  assert.equal(e.box, REVIEW_MAX_BOX)
  assert.equal(isDue(e, ts + REVIEW_BOX_DAYS[REVIEW_MAX_BOX] * DAY - 1), false, '未到 7 天不得到期')
  assert.equal(isDue(e, ts + REVIEW_BOX_DAYS[REVIEW_MAX_BOX] * DAY), true)
  // 答错 → 归零立即到期
  e = nextEntry(e, false, ts)
  assert.equal(e.box, 0)
  assert.equal(isDue(e, ts), true)
})

test('服务层：连对到最高盒后再答对一次即出本，不再计入待复习', () => {
  const store = makeStore()
  const svc = createReviewService(store)
  const now = Date.now()
  const key = reviewKey('en', 'cat')

  // 答错进本（服务内部用真实时钟落 due，因此到期判定也按真实时钟问）
  svc.recordResult('cat', false, { subject: 'en', text: 'cat' })
  assert.equal(svc.dueCount('en'), 1, '刚答错的词当天就应到期可重练')

  // 连对晋级：0→1→3→7 天，仍在本里
  for (let i = 0; i < REVIEW_MAX_BOX; i++) {
    svc.recordResult('cat', true, { subject: 'en', text: 'cat' })
  }
  assert.ok(store.get('review', {})[key], '晋级到最高盒时仍应留在本里')
  assert.equal(store.get('review', {})[key].box, REVIEW_MAX_BOX)

  // 最高盒再答对一次 → 毕业出本
  const ret = svc.recordResult('cat', true, { subject: 'en', text: 'cat' })
  assert.equal(ret, null)
  assert.equal(store.get('review', {})[key], undefined, '毕业的条目必须从存储里删掉')
  assert.equal(svc.dueCount('en', now + 999 * DAY), 0, '毕业后无论多久都不再到期')
})

test('毕业只作用于该条目，不影响同本其他错题', () => {
  const store = makeStore()
  const svc = createReviewService(store)
  svc.recordResult('cat', false, { subject: 'en', text: 'cat' })
  svc.recordResult('dog', false, { subject: 'en', text: 'dog' })
  for (let i = 0; i <= REVIEW_MAX_BOX; i++) svc.recordResult('cat', true, { subject: 'en', text: 'cat' })
  const all = store.get('review', {})
  assert.equal(all[reviewKey('en', 'cat')], undefined)
  assert.ok(all[reviewKey('en', 'dog')], 'dog 还在本里')
  assert.equal(svc.dueCount('en'), 1)
})

test('答错会清零盒数：升到最高盒后答错，必须重新连对才能毕业', () => {
  const store = makeStore()
  const svc = createReviewService(store)
  svc.recordResult('cat', false, { subject: 'en', text: 'cat' })
  for (let i = 0; i < REVIEW_MAX_BOX; i++) svc.recordResult('cat', true, { subject: 'en', text: 'cat' })
  svc.recordResult('cat', false, { subject: 'en', text: 'cat' }) // 归零
  assert.equal(store.get('review', {})[reviewKey('en', 'cat')].box, 0)
  // 此时答对只是回到盒 1，不能毕业
  svc.recordResult('cat', true, { subject: 'en', text: 'cat' })
  assert.ok(store.get('review', {})[reviewKey('en', 'cat')], '归零后答对不应毕业')
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { freshEntry, nextEntry, isDue, REVIEW_BOX_DAYS } from '../src/domain/review.js'
import { createReviewService } from '../src/services/review.js'
import { createStorage, memoryBackend } from '../src/platform/storage.js'
import { getLowAgeMode, setLowAgeMode, isCategoryHidden, LOW_AGE_HIDDEN_CATEGORIES } from '../src/content/lowAge.js'

const DAY = 24 * 60 * 60 * 1000

function makeStore() {
  return createStorage({ backend: memoryBackend() })
}

test('review 域：答错进盒0当天到期，连对按 1/3/7 天晋级，答错归零', () => {
  const t0 = 1000 * DAY
  let e = freshEntry(t0)
  assert.equal(e.box, 0)
  assert.ok(isDue(e, t0))
  e = nextEntry(e, true, t0 + DAY) // 答对 → 盒1，明天（t0+2天）到期
  assert.equal(e.box, 1)
  assert.ok(!isDue(e, t0 + DAY + 1))
  assert.ok(isDue(e, t0 + 2 * DAY))
  e = nextEntry(e, true, t0 + 2 * DAY)
  assert.equal(e.box, 2)
  e = nextEntry(e, true, t0 + 3 * DAY)
  assert.equal(e.box, 3)
  assert.equal(REVIEW_BOX_DAYS[3], 7)
  e = nextEntry(e, false, t0 + 4 * DAY) // 答错归零
  assert.equal(e.box, 0)
  assert.equal(e.wrongCount, 2)
  assert.ok(isDue(e, t0 + 4 * DAY))
})

test('review 域：答对但不在本 → 不收录', () => {
  assert.equal(nextEntry(undefined, true, 0), null)
})

test('review 服务：答错进本、答对晋级、按科目计数、到期池还原完整词卡', () => {
  const store = makeStore()
  const resolvers = {
    en: (id) => (['cat', 'dog'].includes(id) ? { id, en: id, image: '/i.png', audio: '/a.mp3' } : null),
    // 与真实契约一致：zh resolver 必须补渲染字段 main/color（否则挑战选项渲染空白）
    zh: (id) => (id === '4e00' ? { id, char: '一', main: '一', color: '#FF8C42', audio: '/z.mp3' } : null),
  }
  const svc = createReviewService(store, resolvers)
  assert.equal(svc.recordResult('cat', true, { subject: 'en' }), null, '首答就对不进本')

  svc.recordResult('cat', false, { subject: 'en', text: 'cat', lessonId: 'en-quiz-l1' })
  svc.recordResult('4e00', false, { subject: 'zh', text: '一', lessonId: 'zh-quiz-l1' })
  assert.equal(svc.dueCount('en'), 1)
  assert.equal(svc.dueCount('zh'), 1)
  assert.equal(svc.dueCount(), 2)

  // 答对晋级：明天到期，今天不再算待复习
  svc.recordResult('cat', true, { subject: 'en' })
  assert.equal(svc.dueCount('en'), 0)

  // 到期池：zh 的错字能还原成完整选项对象（main/color 缺失会渲染空白选项）
  const pool = svc.buildReviewPool('zh')
  assert.equal(pool.length, 1)
  assert.equal(pool[0].char, '一')
  assert.equal(pool[0].main, '一', '渲染字段 main 必须存在')
  assert.ok(pool[0].color, '渲染字段 color 必须存在')
  assert.ok(pool[0].audio, '字对象带音频路径')

  // en 错词重练池：cat 已晋级不在池，dog 在
  svc.recordResult('dog', false, { subject: 'en', text: 'dog' })
  const enPool = svc.buildReviewPool('en')
  assert.ok(enPool.some((x) => x.id === 'dog' && x.en === 'dog' && x.image && x.audio))
  assert.ok(!enPool.some((x) => x.id === 'cat'))
})

test('review 服务：topWrong 按错误次数排序', () => {
  const store = makeStore()
  const svc = createReviewService(store)
  svc.recordResult('a', false, { subject: 'en', text: 'a' })
  svc.recordResult('b', false, { subject: 'en', text: 'b' })
  svc.recordResult('b', false, { subject: 'en', text: 'b' })
  svc.recordResult('c', false, { subject: 'en', text: 'c' })
  const top = svc.topWrong(2).map((e) => e.itemId)
  assert.equal(top[0], 'b')
  assert.equal(top.length, 2)
})

test('低龄模式：默认开启；characters/story 被隐藏，关闭后恢复', () => {
  setLowAgeMode(true)
  assert.equal(getLowAgeMode(), true)
  assert.ok(isCategoryHidden('characters'))
  assert.ok(isCategoryHidden('story'))
  assert.ok(!isCategoryHidden('animals'))
  setLowAgeMode(false)
  assert.equal(getLowAgeMode(), false)
  assert.ok(!isCategoryHidden('characters'))
  setLowAgeMode(true) // 还原默认，避免影响其他用例
})

test('低龄模式隐藏集合只含惊悚分类', () => {
  assert.deepEqual([...LOW_AGE_HIDDEN_CATEGORIES].sort(), ['characters', 'story'])
})

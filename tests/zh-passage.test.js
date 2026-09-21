/**
 * 语文阅读理解短文的**产品接线**测试（内容源契约在 tests/zh-reading.test.js）。
 *
 * 覆盖三件事，它们都是"静默失效"型缺陷（不报错，只是孩子答了却不亮 / 课卡点不开）：
 *   1) 题目稳定 id 的约定与反向解析（图鉴与作答事件共用一份约定）；
 *   2) 目录里短文课卡只出现在有短文的学段，且能被解析成页面地址（入软解锁路径）；
 *   3) 图鉴分桶按「篇」聚合：题目 id 不会漏进桶里，答错一题就不算读懂。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { questionId, passageIdOf, passageLightsFromAttempts } from '../src/domain/passage.js'
import { createStorage, memoryBackend } from '../src/platform/storage.js'
import { createCollectionService } from '../src/services/collection.js'
import { createCurriculum } from '../src/services/curriculum.js'
import { createProgressService } from '../src/services/progress.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const catalogJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/content/catalog.json'), 'utf8'))
const source = JSON.parse(fs.readFileSync(path.join(ROOT, 'content-packages', 'curriculum.json'), 'utf8'))
const passages = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/zhPassages.json'), 'utf8'))
const passagesSrc = JSON.parse(fs.readFileSync(path.join(ROOT, 'content-packages', 'zh-passages.json'), 'utf8'))

/* ---------------- 1. 题目稳定 id 的约定 ---------------- */

test('questionId/passageIdOf：约定可逆，非本约定的 id 返回空串', () => {
  assert.equal(questionId('ps-g12-1', 0), 'ps-g12-1-q0')
  assert.equal(questionId('ps-g34-5', 2), 'ps-g34-5-q2')
  assert.equal(passageIdOf('ps-g12-1-q0'), 'ps-g12-1')
  assert.equal(passageIdOf('ps-g34-5-q12'), 'ps-g34-5', '题号可以是多位')
  for (const bad of ['', null, undefined, 'red', 'ps-g12-1', 'ps-g12-1-q', '4e00']) {
    assert.equal(passageIdOf(bad), '', `应拒绝 ${JSON.stringify(bad)}`)
  }
})

test('passageLightsFromAttempts：按篇聚合，只有全部首答答对才算读懂', () => {
  const mk = (pid, qi, correct, firstTry = true) => ({
    sessionId: 's1',
    itemId: questionId(pid, qi),
    correct,
    firstTry,
  })
  // 全对 → 认识 + 读懂
  const all = passageLightsFromAttempts([mk('ps-g12-1', 0, true), mk('ps-g12-1', 1, true), mk('ps-g12-1', 2, true)], 's1')
  assert.deepEqual(all, { seen: ['ps-g12-1'], mastered: ['ps-g12-1'] })

  // 有一题首答答错 → 只算认识
  const one = passageLightsFromAttempts([mk('ps-g12-1', 0, true), mk('ps-g12-1', 1, false), mk('ps-g12-1', 2, true)], 's1')
  assert.deepEqual(one, { seen: ['ps-g12-1'], mastered: [] })

  // 「答错后重试答对」不算读懂（firstTry=false）
  const retry = passageLightsFromAttempts([mk('ps-g12-1', 0, true, false)], 's1')
  assert.deepEqual(retry, { seen: ['ps-g12-1'], mastered: [] })

  // 两篇各自独立；别的会话/非法 id 一律不计
  const mixed = passageLightsFromAttempts(
    [
      mk('ps-g12-1', 0, true),
      mk('ps-g12-2', 0, false),
      { sessionId: 'other', itemId: questionId('ps-g12-3', 0), correct: true, firstTry: true },
      { sessionId: 's1', itemId: 'red', correct: true, firstTry: true },
      null,
    ],
    's1',
  )
  assert.deepEqual(mixed, { seen: ['ps-g12-1', 'ps-g12-2'], mastered: ['ps-g12-1'] })
  assert.deepEqual(passageLightsFromAttempts(null, 's1'), { seen: [], mastered: [] })
})

/* ---------------- 2. 课程目录与页面地址 ---------------- */

test('短文课卡：只在配置开放的学段建课，且每个开放学段都有短文', () => {
  const configured = (source.zhPassages?.stages || []).map(String)
  assert.ok(configured.length > 0, 'curriculum.zhPassages.stages 不能为空')
  const cards = catalogJson.lessons.filter((l) => l.ref?.kind === 'zh-passage')
  assert.deepEqual(cards.map((l) => String(l.ref.id)).sort(), [...configured].sort(), '课卡与配置的学段一一对应')
  // 启蒙/五六年级没有短文 → 不该出现点不开的课卡
  assert.ok(!configured.includes('qimeng') && !configured.includes('g56'))
  for (const l of cards) {
    assert.equal(l.subject, 'zh')
    assert.equal(l.kind, 'learn', '短文课要作为学一学卡出现在课程地图上')
    assert.ok(l.title && l.subtitle && l.icon && l.skillIds?.length, `${l.id} 课程卡字段齐全`)
    const list = passages.passages.filter((p) => String(p.stage) === String(l.ref.id))
    assert.ok(list.length > 0, `${l.id} 指向的学段没有短文`)
    assert.equal(l.subtitle, `${list.length} 篇短文`, `${l.id} 副标题与篇数一致`)
  }
})

test('短文课能生成页面地址（带 stage 与 lessonId），且进入软解锁路径', () => {
  const catalog = {
    STAGES: catalogJson.stages,
    SUBJECTS: catalogJson.subjects,
    LESSONS: catalogJson.lessons,
    getLesson: (id) => catalogJson.lessons.find((l) => l.id === id) || null,
    lessonsForStage: (st, subjectId = null) =>
      catalogJson.lessons.filter((l) => l.stage === st && l.status === 'available' && (!subjectId || l.subject === subjectId)),
    normalizeStage: (id) => (catalogJson.stages.some((s) => s.id === id) ? id : catalogJson.stages[0].id),
  }
  const store = createStorage({ backend: memoryBackend() })
  const prog = createProgressService(store)
  const c = createCurriculum({
    catalog,
    isCategoryHidden: () => false,
    store,
    getProgress: (id) => prog.lessonProgressMap().get(id),
  })
  for (const l of catalogJson.lessons.filter((x) => x.ref?.kind === 'zh-passage')) {
    const url = c.lessonUrl(l)
    assert.match(url, /^\/pages\/reading\/reading\?stage=[a-z0-9]+&lessonId=/)
    assert.ok(url.includes(`lessonId=${encodeURIComponent(l.id)}`), 'lessonId 必须带上（否则不记录进度）')
  }
  // 与古诗的关键差别：短文记的是 challenge 会话（算完成），所以它在软解锁路径里、会被标 locked/next，
  // 而古诗课永远不入路径（读诗不算完成，放进去会把 frontier 卡死）
  const locks = c.lessonLocks()
  const passage = catalogJson.lessons.find((l) => l.ref?.kind === 'zh-passage')
  const poem = catalogJson.lessons.find((l) => l.ref?.kind === 'zh-poem')
  assert.equal(locks.get(passage.id).locked, true, '全新档案下路径末端的短文课应是锁着的（不是"点不开又没锁"）')
  assert.equal(locks.get(poem.id).locked, false, '古诗课始终开放')
})

/* ---------------- 3. 图鉴分桶（服务层） ---------------- */

// 与真实目录逐字一致：短文课卡是 kind=learn（要作为学一学卡出现在课程地图上、
// 进软解锁路径），而页面记的是 challenge 会话——这个错位正是图鉴会静默不亮的坑。
const PASSAGE_LESSON = { id: 'zh-passage-g12', subject: 'zh', kind: 'learn', ref: { kind: 'zh-passage', id: 'g12' } }
const STUB_RESOLVERS = {
  getLesson: (id) => (id === PASSAGE_LESSON.id ? PASSAGE_LESSON : null),
  resolveEnCategory: () => null,
  resolveZhLevel: () => null,
}

test('短文挑战完成：题目 id 按篇聚合进 zhPassages，绝不把题目 id 写进桶', () => {
  const store = createStorage({ backend: memoryBackend() })
  const svc = createCollectionService(store, STUB_RESOLVERS)
  const mk = (qi, correct, firstTry = true) => ({
    sessionId: 's1',
    lessonId: PASSAGE_LESSON.id,
    activityId: 'passage-question',
    order: qi,
    itemId: questionId('ps-g12-1', qi),
    correct,
    firstTry,
  })
  store.set('attempts', [mk(0, true), mk(1, true), mk(2, false)])
  svc.recordChallengeDone({ lessonId: PASSAGE_LESSON.id, sessionId: 's1', kind: 'challenge' })
  const c = store.get('collection')
  assert.deepEqual(c.zhPassages.seen, ['ps-g12-1'], '做过这一篇 → 认识')
  assert.deepEqual(c.zhPassages.mastered, [], '错了一题不算读懂')
  assert.ok(
    c.zhPassages.seen.every((id) => !/-q\d+$/.test(id)),
    '桶里绝不能出现题目 id（页面按篇查，写了就永远不亮）',
  )
  assert.equal(svc.counts().zhPassagesSeen, 1)
  assert.equal(svc.counts().zhPassagesMastered, 0)

  // 全对再答一次（新会话）→ 读懂
  store.set('attempts', [
    { sessionId: 's2', lessonId: PASSAGE_LESSON.id, activityId: 'passage-question', order: 0, itemId: questionId('ps-g12-1', 0), correct: true, firstTry: true },
    { sessionId: 's2', lessonId: PASSAGE_LESSON.id, activityId: 'passage-question', order: 1, itemId: questionId('ps-g12-1', 1), correct: true, firstTry: true },
    { sessionId: 's2', lessonId: PASSAGE_LESSON.id, activityId: 'passage-question', order: 2, itemId: questionId('ps-g12-1', 2), correct: true, firstTry: true },
  ])
  svc.recordChallengeDone({ lessonId: PASSAGE_LESSON.id, sessionId: 's2', kind: 'challenge' })
  assert.deepEqual(store.get('collection').zhPassages.mastered, ['ps-g12-1'])
  assert.equal(svc.counts().zhPassagesMastered, 1)
})

test('短文课不按"整课"点亮：学一学完成事件不会把整个学段算学会', () => {
  const store = createStorage({ backend: memoryBackend() })
  const svc = createCollectionService(store, STUB_RESOLVERS)
  svc.recordLearnDone({ lessonId: PASSAGE_LESSON.id, sessionId: 's1', kind: 'learn' })
  assert.equal(store.get('collection'), null, '一篇文章一篇点亮，学一学口径对短文不适用')
})

test('回归：短文课卡是 learn、会话是 challenge——课卡 kind 不得挡住图鉴点亮', () => {
  // 曾经的实现把「课必须是 challenge」当守卫，于是短文的完成事件被静默丢掉：
  // 孩子答完 3 题、会话落了库、图鉴一格不亮，没有任何报错。
  const store = createStorage({ backend: memoryBackend() })
  const svc = createCollectionService(store, STUB_RESOLVERS)
  const session = { sessionId: 's9', lessonId: PASSAGE_LESSON.id, kind: 'challenge' }
  store.set(
    'attempts',
    [0, 1, 2].map((qi) => ({
      sessionId: 's9',
      lessonId: PASSAGE_LESSON.id,
      activityId: 'passage-question',
      order: qi,
      itemId: questionId('ps-g12-3', qi),
      correct: true,
      firstTry: true,
    })),
  )
  svc.recordChallengeDone(session)
  assert.deepEqual(store.get('collection').zhPassages.mastered, ['ps-g12-3'])

  // 反例：同一门课收到 learn 会话（不该有，但真出现时不能当成挑战点亮）
  const store2 = createStorage({ backend: memoryBackend() })
  const svc2 = createCollectionService(store2, STUB_RESOLVERS)
  store2.set('attempts', [{ sessionId: 's10', lessonId: PASSAGE_LESSON.id, order: 0, itemId: questionId('ps-g12-3', 0), correct: true, firstTry: true }])
  svc2.recordChallengeDone({ sessionId: 's10', lessonId: PASSAGE_LESSON.id, kind: 'learn' })
  assert.equal(store2.get('collection'), null)
})

test('古诗填字的挑战会话依旧不点亮任何桶（不受短文分支影响）', () => {
  // 古诗课也是 learn 课卡 + challenge 会话，但它没有图鉴桶，题目 id 是「字在句中位置」，
  // 点亮汉字桶就是假的掌握。短文分支必须只认 ref.kind=zh-passage。
  const POEM = { id: 'zh-poem-g12', subject: 'zh', kind: 'learn', ref: { kind: 'zh-poem', id: 'g12' } }
  const store = createStorage({ backend: memoryBackend() })
  const svc = createCollectionService(store, {
    getLesson: (id) => (id === POEM.id ? POEM : null),
    resolveEnCategory: () => null,
    resolveZhLevel: () => null,
  })
  store.set('attempts', [{ sessionId: 'p1', lessonId: POEM.id, order: 0, itemId: 'ps-g12-1-0-3', correct: true, firstTry: true }])
  svc.recordChallengeDone({ sessionId: 'p1', lessonId: POEM.id, kind: 'challenge' })
  assert.equal(store.get('collection'), null, '古诗填字不得点亮任何图鉴桶')
})

/* ---------------- 4. 生成物与源一致 ---------------- */

test('src/data/zhPassages.json 是源文件的运行时投影（正文与题目逐字一致）', () => {
  assert.deepEqual(
    passages.passages.map((p) => p.id),
    passagesSrc.passages.map((p) => p.id),
  )
  for (const p of passages.passages) {
    const src = passagesSrc.passages.find((x) => x.id === p.id)
    assert.ok(src, `${p.id} 在源里不存在`)
    assert.equal(p.stage, src.stage)
    assert.equal(p.title, src.title)
    assert.deepEqual(p.lines, src.lines)
    assert.deepEqual(p.questions, src.questions)
  }
})

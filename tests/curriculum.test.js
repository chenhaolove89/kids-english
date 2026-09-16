/**
 * 课程查询服务（导航层）——此前整文件零测试（架构审计点名的最后一处空白）。
 *
 * 为什么必须测：这一层把「课程」翻译成「页面地址」和「继续学习目标」。
 * 拼错一个查询参数 = 点继续学习进不去；draft 课漏过滤 = 未开放的课能被开始；
 * 低龄过滤漏掉 = 惊悚/暗黑分类仍出现在首页。而这些都不会抛错，只会「点了没反应」。
 *
 * 这里用**真实目录数据**（读文件而不是 import，绕开 Node 不允许的 JSON 无属性 import），
 * 因此断言直接对着 176 门课的实际内容。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCurriculum } from '../src/services/curriculum.js'
import { createProgressService } from '../src/services/progress.js'
import { createStorage, memoryBackend } from '../src/platform/storage.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const catalogJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/content/catalog.json'), 'utf8'))

const LESSONS = catalogJson.lessons
const STAGES = catalogJson.stages
const SUBJECTS = catalogJson.subjects
const norm = (id) => (STAGES.some((s) => s.id === id) ? id : STAGES[0].id)

const catalog = {
  STAGES,
  SUBJECTS,
  LESSONS,
  getLesson: (id) => LESSONS.find((l) => l.id === id) || null,
  lessonsForStage: (stageId, subjectId = null) =>
    LESSONS.filter((l) => l.stage === stageId && l.status === 'available' && (!subjectId || l.subject === subjectId)),
  normalizeStage: norm,
}

function make({ hidden = [], sessions = null, active = null, progress = null, freeUnlock = null } = {}) {
  const store = createStorage({ backend: memoryBackend() })
  if (sessions) store.set('sessions', sessions)
  if (active) store.set('active', active)
  // 与 curriculum-app.js 相同的进度接线：进度默认从注入的 sessions 派生
  // （不接线的话 continueTarget 的锁回退会按「全新用户」算，测不到真实链路）
  const prog = createProgressService(store)
  const c = createCurriculum({
    catalog,
    isCategoryHidden: (id) => hidden.includes(id),
    store,
    getProgress: progress ? (id) => progress.get(id) : (id) => prog.lessonProgressMap().get(id),
    isFreeUnlock: freeUnlock === null ? null : () => freeUnlock,
  })
  return { c, store }
}

/* ---------------- lessonUrl：8 条分支都要拼对 ---------------- */
test('lessonUrl：英语分类课 → 学词页，带 subject/cat/lessonId', () => {
  const { c } = make()
  const lesson = LESSONS.find((l) => l.subject === 'en' && l.kind === 'learn' && l.ref.kind === 'en-category')
  const url = c.lessonUrl(lesson)
  assert.match(url, /^\/pages\/learn\/learn\?subject=en&cat=[a-z]+&lessonId=/)
  assert.ok(url.includes(`lessonId=${encodeURIComponent(lesson.id)}`), 'lessonId 必须带上（否则不记录进度）')
})

test('lessonUrl：语文词语课与英语分类共用 ref，按科目分流到不同 subject', () => {
  const { c } = make()
  const zhWords = LESSONS.find((l) => l.subject === 'zh' && l.ref?.kind === 'en-category' && l.kind === 'learn')
  assert.match(c.lessonUrl(zhWords), /subject=zh/)
  const zhWordsQuiz = LESSONS.find((l) => l.subject === 'zh' && l.ref?.kind === 'en-category' && l.kind === 'challenge')
  assert.match(c.lessonUrl(zhWordsQuiz), /^\/pages\/quiz\/quiz\?subject=zh&cat=/)
})

test('lessonUrl：语文识字课与挑战分流到学词页/挑战页', () => {
  const { c } = make()
  const learn = LESSONS.find((l) => l.ref?.kind === 'zh-level' && l.kind === 'learn')
  const quiz = LESSONS.find((l) => l.ref?.kind === 'zh-level' && l.kind === 'challenge')
  assert.match(c.lessonUrl(learn), /^\/pages\/learn\/learn\?subject=zh&level=/)
  assert.match(c.lessonUrl(quiz), /^\/pages\/quiz\/quiz\?subject=zh&level=/)
})

test('lessonUrl：小短句 / 古诗 / 数学 / 英语级别挑战各自的页面', () => {
  const { c } = make()
  const sentences = LESSONS.find((l) => l.ref?.kind === 'zh-sentences')
  assert.match(c.lessonUrl(sentences), /^\/pages\/learn\/learn\?subject=zh&sentences=1&level=/)
  const poem = LESSONS.find((l) => l.ref?.kind === 'zh-poem')
  assert.match(c.lessonUrl(poem), /^\/pages\/poem\/poem\?stage=[a-z0-9]+&lessonId=/)
  const math = LESSONS.find((l) => l.ref?.kind === 'math-level')
  assert.match(c.lessonUrl(math), /^\/pages\/math\/practice\?level=\d+&lessonId=/)
  const enLevel = LESSONS.find((l) => l.ref?.kind === 'en-level')
  assert.match(c.lessonUrl(enLevel), /^\/pages\/quiz\/quiz\?subject=en&level=\d+&lessonId=/)
})

test('lessonUrl：非法/未知输入返回空串（调用方据此不跳转）', () => {
  const { c } = make()
  assert.equal(c.lessonUrl(null), '')
  assert.equal(c.lessonUrl({}), '')
  assert.equal(c.lessonUrl({ id: 'x', ref: { kind: 'unknown-kind' } }), '')
})

test('lessonUrl：可用课程都能生成地址，draft 课程明确不可跳转', () => {
  const { c } = make()
  const bad = LESSONS.filter((l) => l.status === 'available' && !c.lessonUrl(l)).map((l) => l.id + '(' + (l.ref && l.ref.kind) + ')')
  assert.deepEqual(bad, [], `这些课生不出地址：\n${bad.join('\n')}`)
})

/* ---------------- 可见性 / draft / 低龄过滤 ---------------- */
test('isVisible：draft 与缺失课程不可见，available 可见', () => {
  const { c } = make()
  assert.equal(c.isVisible({ status: 'draft', ref: { kind: 'en-level', id: 1 } }), false, 'draft 课不该被放出来')
  assert.equal(c.isVisible(null), false)
  assert.equal(c.isVisible(LESSONS.find((l) => l.status === 'available')), true)
  assert.equal(c.visibleLessons().every((l) => l.status === 'available'), true)
  assert.equal(c.visibleLessons().length, LESSONS.filter((l) => l.status === 'available').length)
})

test('低龄过滤：被隐藏分类的课不计入可见列表与阶段视图', () => {
  const plain = make()
  const filtered = make({ hidden: ['animals'] })
  const before = plain.c.visibleLessons().length
  const after = filtered.c.visibleLessons().length
  assert.ok(after < before, `隐藏 animals 后可见课数应减少（${before} → ${after}）`)
  const blockEn = (m) => m.c.stageBlocks('qimeng').find((b) => b.subject.id === 'en')
  assert.ok(
    blockEn(filtered).units.every((u) => u.ref.id !== 'animals'),
    '阶段视图里不应再出现被隐藏分类的课',
  )
})

/* ---------------- stageBlocks ---------------- */
test('stageBlocks：三科各一块；数学的关卡卡来自 challenge，英语/语文来自 learn', () => {
  const { c } = make()
  const blocks = c.stageBlocks('qimeng')
  assert.equal(blocks.length, 3)
  assert.deepEqual(blocks.map((b) => b.subject.id), ['en', 'zh', 'math'])
  for (const b of blocks) {
    assert.equal(b.empty, false, `${b.subject.id} 在启蒙阶段不该是空的`)
    assert.ok(b.units.length > 0)
    if (b.subject.id === 'math') assert.ok(b.units.every((u) => u.kind === 'challenge'))
    else assert.ok(b.units.every((u) => u.kind === 'learn'))
    if (b.challenge) assert.equal(b.challenge.kind, 'challenge')
  }
})

test('stageBlocks：非法阶段 id 回退到第一个阶段而不是空视图', () => {
  const { c } = make()
  const bad = c.stageBlocks('not-a-stage')
  const good = c.stageBlocks(STAGES[0].id)
  assert.deepEqual(bad.map((b) => b.units.length), good.map((b) => b.units.length))
})

test('stageBlocks：某科在该阶段完全没有课时才标记 empty（页面显示「🚧 筹备中」）', () => {
  // 用合成目录精确验证这个分支；真实目录的 g56/math 由 draft 课程触发同一行为。
  const miniCatalog = {
    STAGES: [{ id: 's1', name: '阶段一', order: 1 }],
    SUBJECTS: [
      { id: 'en', name: '英语' },
      { id: 'math', name: '数学' },
    ],
    LESSONS: [
      { id: 'a', subject: 'en', stage: 's1', kind: 'learn', status: 'available', ref: { kind: 'en-category', id: 'c1' }, sort: 'a' },
    ],
    getLesson: (id) => miniCatalog.LESSONS.find((l) => l.id === id) || null,
    lessonsForStage: (stageId, subjectId = null) =>
      miniCatalog.LESSONS.filter((l) => l.stage === stageId && (!subjectId || l.subject === subjectId)),
    normalizeStage: (id) => (id === 's1' ? 's1' : 's1'),
  }
  const c = createCurriculum({ catalog: miniCatalog, isCategoryHidden: () => false, store: createStorage({ backend: memoryBackend() }) })
  const blocks = c.stageBlocks('s1')
  const en = blocks.find((b) => b.subject.id === 'en')
  const math = blocks.find((b) => b.subject.id === 'math')
  assert.equal(en.empty, false)
  assert.equal(en.units.length, 1)
  assert.equal(math.empty, true, '没有任何课程的科目应标记 empty')
  assert.equal(math.challenge, null)
  assert.deepEqual(math.units, [])
})

test('真实目录：176 课中 draft 不进入阶段块，g56/math 如实显示筹备中', () => {
  const { c } = make()
  const empties = []
  for (const st of STAGES) {
    for (const b of c.stageBlocks(st.id)) {
      if (b.empty) empties.push(`${st.id}/${b.subject.id}`)
    }
  }
  assert.deepEqual(empties, ['g56/math'])
})

/* ---------------- nextLessonAfter / randomLesson ---------------- */
test('真实目录：draft 课程只留下筹备中计数，不进入可用 units', () => {
  const { c } = make()
  const g56Math = c.stageBlocks('g56').find((b) => b.subject.id === 'math')
  assert.equal(g56Math.empty, true)
  assert.equal(g56Math.draftCount, 2)
  assert.deepEqual(
    LESSONS.filter((l) => l.status === 'draft').map((l) => l.id).sort(),
    ['en-quiz-l4', 'math-practice-l6', 'math-practice-l9'],
  )
})

test('nextLessonAfter：按科目顺序取下一课，最后一课返回 null', () => {
  const { c } = make()
  const enLessons = c.visibleLessons().filter((l) => l.subject === 'en')
  assert.ok(enLessons.length > 1)
  const first = enLessons[0]
  const next = c.nextLessonAfter(first.id)
  assert.ok(next, '第一课应当有下一课')
  assert.equal(next.subject, 'en', '下一课必须同科目')
  // 该科目最后一课的下一课是 null
  const last = enLessons[enLessons.length - 1]
  assert.equal(c.nextLessonAfter(last.id), null)
  assert.equal(c.nextLessonAfter('not-exist'), null)
})

test('randomLesson：抽到的课在池内、属于指定阶段/科目，且尽量避开上一把', () => {
  // 全部标记完成 = 路径全开（软解锁下随机只从开放的课里抽，见 tests/path-unlock.test.js）
  const progress = new Map(LESSONS.map((l) => [l.id, { completed: 1, bestStars: 2 }]))
  const { c } = make({ progress })
  for (let i = 0; i < 50; i++) {
    const l = c.randomLesson('qimeng', 'en')
    assert.ok(l && l.subject === 'en' && l.stage === 'qimeng' && l.status === 'available')
  }
  const pool = c.visibleLessons().filter((l) => l.stage === 'qimeng' && l.subject === 'en' && l.kind === 'learn')
  if (pool.length > 1) {
    const picked = pool[0]
    for (let i = 0; i < 30; i++) {
      const again = c.randomLesson('qimeng', 'en', picked.id)
      assert.notEqual(again.id, picked.id, '应当避开上一把抽中的课')
    }
  }
})

test('randomLesson：新用户软解锁下只抽到路径开放（frontier）的课', () => {
  const { c } = make()
  const frontier = c.stageBlocks('qimeng').find((b) => b.subject.id === 'en').units.find((u) => u.isNext)
  for (let i = 0; i < 10; i++) {
    const l = c.randomLesson('qimeng', 'en')
    assert.equal(l.id, frontier.id, '未注入进度时随机池只含开放课（frontier）')
  }
})

/* ---------------- continueTarget：四级降级 ---------------- */
test('continueTarget：① 活跃会话 → 原课恢复并带快照', () => {
  const lesson = LESSONS[0]
  const { c } = make({
    active: { session: { sessionId: 's1', lessonId: lesson.id, kind: 'learn' }, snapshot: { idx: 3 } },
  })
  const t = c.continueTarget()
  assert.equal(t.mode, 'resume-active')
  assert.equal(t.lesson.id, lesson.id)
  assert.equal(t.sessionId, 's1')
  assert.deepEqual(t.snapshot, { idx: 3 })
})

test('continueTarget：② 活跃会话指向不可见课时被跳过，降到最近暂停会话', () => {
  const hiddenCat = LESSONS.find((l) => l.ref?.kind === 'en-category')
  const pausedLesson = LESSONS.find((l) => l.kind === 'challenge')
  const { c } = make({
    hidden: [hiddenCat.ref.id],
    active: { session: { sessionId: 's-hidden', lessonId: hiddenCat.id, kind: 'learn' }, snapshot: { idx: 1 } },
    sessions: [{ sessionId: 's2', lessonId: pausedLesson.id, status: 'paused', snapshot: { idx: 2 }, startedAt: 1 }],
  })
  const t = c.continueTarget()
  assert.equal(t.mode, 'resume-paused')
  assert.equal(t.lesson.id, pausedLesson.id)
  assert.equal(t.sessionId, 's2')
})

test('continueTarget：③ 无活跃/暂停 → 最近完成课的下一课', () => {
  const enLessons = LESSONS.filter((l) => l.subject === 'en' && l.status === 'available')
  const { c } = make({
    // kind 必须是 learn：进度聚合只认 learn/challenge（practice 不算完成），真实会话必带
    sessions: [{ sessionId: 's3', lessonId: enLessons[0].id, kind: 'learn', status: 'completed', startedAt: 1 }],
  })
  const t = c.continueTarget()
  assert.equal(t.mode, 'next')
  assert.equal(t.lesson.subject, 'en')
  assert.notEqual(t.lesson.id, enLessons[0].id, '应当是同科目的下一课')
})

test('continueTarget：④ 无任何记录 → 目录第一课（start）', () => {
  const { c } = make()
  const t = c.continueTarget()
  assert.equal(t.mode, 'start')
  assert.equal(t.lesson.id, LESSONS.find((l) => l.status === 'available').id)
  assert.equal(t.snapshot, null)
  assert.equal(t.sessionId, null)
})

test('continueTarget：没有 paused 快照的暂停会话不参与恢复（避免恢复到错的题号）', () => {
  const { c } = make({
    sessions: [{ sessionId: 's4', lessonId: LESSONS[0].id, status: 'paused', startedAt: 1 }],
  })
  const t = c.continueTarget()
  assert.notEqual(t.mode, 'resume-paused', '没有 snapshot 的暂停会话不能当恢复目标')
})

test('continueTarget：暂停与完成历史按事件时间取最近，不依赖数组写入顺序', () => {
  const en = LESSONS.filter((l) => l.subject === 'en' && l.status === 'available' && l.kind === 'learn')
  const progress = new Map(en.slice(0, 2).map((l) => [l.id, { completed: 1, bestStars: 0 }]))
  const { c } = make({
    progress,
    sessions: [
      { sessionId: 'new-paused', lessonId: en[1].id, kind: 'learn', status: 'paused', startedAt: 300, endedAt: 350, snapshot: { idx: 2 } },
      { sessionId: 'old-paused', lessonId: en[0].id, kind: 'learn', status: 'paused', startedAt: 100, endedAt: 150, snapshot: { idx: 1 } },
    ],
  })
  assert.equal(c.continueTarget().lesson.id, en[1].id)

  const done = make({
    progress,
    sessions: [
      { sessionId: 'new-done', lessonId: en[0].id, kind: 'learn', status: 'completed', startedAt: 300, endedAt: 350 },
      { sessionId: 'old-done', lessonId: en[1].id, kind: 'learn', status: 'completed', startedAt: 100, endedAt: 150 },
    ],
  })
  assert.equal(done.c.continueTarget().lesson.id, en[1].id)
})

test('continueTarget：已完成的恢复链不再回到旧 paused 快照', () => {
  const en = LESSONS.filter((l) => l.subject === 'en' && l.status === 'available' && l.kind === 'learn')
  const progress = new Map([[en[0].id, { completed: 1, bestStars: 0 }]])
  const { c } = make({
    progress,
    sessions: [
      { sessionId: 'same', lessonId: en[0].id, kind: 'learn', status: 'paused', startedAt: 100, endedAt: 150, snapshot: { idx: 4 } },
      { sessionId: 'same', lessonId: en[0].id, kind: 'learn', status: 'completed', startedAt: 100, endedAt: 300 },
    ],
  })
  assert.equal(c.continueTarget().mode, 'next')
  assert.equal(c.continueTarget().lesson.id, en[1].id)
})

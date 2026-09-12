/**
 * 路径软解锁：domain/path.js 纯函数 + services/curriculum.js 注入集成。
 * 口径见 src/domain/path.js：第一个未完成的课是「下一课」，其后锁定；
 * 已完成（完成会话/拿过星/学完）的永远开放；家长「自由探索」全放开。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { markPathLocks, isChallengeLocked, isLessonDone } from '../src/domain/path.js'
import { createCurriculum } from '../src/services/curriculum.js'
import { createProgressService } from '../src/services/progress.js'
import { createStorage, memoryBackend } from '../src/platform/storage.js'

function fakeCatalog() {
  const lessons = []
  let n = 0
  const mk = (subject, stage, kind, sort) => {
    const id = `${subject}-${kind}-${stage}-${sort}`
    lessons.push({ id, subject, stage, kind, sort, ref: { kind: 'x', id: sort }, status: 'available' })
    return lessons[lessons.length - 1]
  }
  for (const sort of ['a', 'b', 'c', 'd']) mk('en', 's1', 'learn', sort)
  mk('en', 's1', 'challenge', 'l1')
  for (const sort of ['l1', 'l2']) mk('math', 's1', 'challenge', sort)
  const byStage = (st) => lessons.filter((l) => l.stage === st)
  return {
    STAGES: [{ id: 's1', order: 1 }],
    SUBJECTS: [
      { id: 'en', name: 'EN' },
      { id: 'math', name: 'Math' },
    ],
    LESSONS: lessons,
    getLesson: (id) => lessons.find((l) => l.id === id) || null,
    lessonsForStage: (st, subjectId) => byStage(st).filter((l) => !subjectId || l.subject === subjectId),
    normalizeStage: (s) => s,
  }
}

function setup(doneIds = [], { freeUnlock = false } = {}) {
  const store = createStorage({ backend: memoryBackend() })
  const prog = createProgressService(store)
  // 造完成会话：learn 完成 / challenge 完成（带首答正确数）
  doneIds.forEach(([lessonId, kind, first], i) => {
    const sessionId = `s${i}`
    const attempts = []
    if (kind === 'challenge') {
      for (let q = 0; q < 10; q++) attempts.push({ sessionId, lessonId, activityId: 'listen-pick', order: q, firstTry: true, correct: q < (first ?? 10) })
    }
    store.set('sessions', [...store.get('sessions', []), { sessionId, lessonId, kind, status: 'completed', startedAt: 1, endedAt: 2, attempts: undefined }])
    if (attempts.length) store.set('attempts', [...store.get('attempts', []), ...attempts.map((a) => ({ ...a, ts: 1 }))])
  })
  const cat = fakeCatalog()
  const curriculum = createCurriculum({
    catalog: cat,
    isCategoryHidden: () => false,
    store,
    getProgress: (id) => prog.lessonProgressMap().get(id),
    isFreeUnlock: () => freeUnlock,
  })
  return { curriculum, store, prog }
}

test('新用户：第一课是「下一课」，其余锁定', () => {
  const { curriculum } = setup()
  const blocks = curriculum.stageBlocks('s1')
  const en = blocks.find((b) => b.subject.id === 'en')
  assert.equal(en.units[0].isNext, true)
  assert.equal(en.units[0].locked, false)
  for (const u of en.units.slice(1)) {
    assert.equal(u.locked, true, `${u.id} 应锁定`)
    assert.equal(u.isNext, false)
  }
  // 挑战钮：路径上没有完成记录 → 锁
  assert.equal(en.challengeLocked, true)
})

test('完成第一课后：frontier 前移，已完成的保持开放', () => {
  const { curriculum } = setup([['en-learn-s1-a', 'learn']])
  const en = curriculum.stageBlocks('s1').find((b) => b.subject.id === 'en')
  assert.equal(en.units[0].locked, false, '已完成课保持开放')
  assert.equal(en.units[1].isNext, true)
  assert.equal(en.units[2].locked, true)
  // 有完成记录 → 挑战解锁
  assert.equal(en.challengeLocked, false)
})

test('学一学完成与挑战拿星都算「完成过」；纯挑战 1 星也算', () => {
  assert.equal(isLessonDone({ completed: 1 }), true)
  assert.equal(isLessonDone({ bestStars: 1 }), true)
  assert.equal(isLessonDone({ learnDone: true }), true)
  assert.equal(isLessonDone(undefined), false)
  assert.equal(isLessonDone({ completed: 0, bestStars: 0 }), false)
  const ordered = [{ id: 'x' }]
  assert.equal(isChallengeLocked(ordered, (id) => ({ bestStars: 1 })), false)
  assert.equal(isChallengeLocked(ordered, () => undefined), true)
})

test('自由探索开关：全部开放、无 frontier', () => {
  const { curriculum } = setup([], { freeUnlock: true })
  const en = curriculum.stageBlocks('s1').find((b) => b.subject.id === 'en')
  for (const u of en.units) {
    assert.equal(u.locked, false)
    assert.equal(u.isNext, false)
  }
  assert.equal(en.challengeLocked, false)
})

test('数学块：关卡即路径，阶段内顺序解锁；挑战钮不额外锁', () => {
  const { curriculum } = setup([['math-challenge-s1-l1', 'challenge', 10]])
  const math = curriculum.stageBlocks('s1').find((b) => b.subject.id === 'math')
  assert.equal(math.units[0].locked, false)
  assert.equal(math.units[1].isNext, true)
  assert.equal(math.challengeLocked, false, '数学无独立挑战钮，永远不额外锁')
})

test('随机来一课只从开放的课里抽', () => {
  const { curriculum } = setup([['en-learn-s1-a', 'learn']])
  const seen = new Set()
  for (let i = 0; i < 30; i++) {
    const l = curriculum.randomLesson('s1', 'en', null)
    assert.ok(l, '应抽到课')
    seen.add(l.id)
  }
  // a（已完成）与 b（frontier）开放；c/d 锁定不应出现
  assert.ok(!seen.has('en-learn-s1-c'), '锁定的课不应被随机抽到')
  assert.ok(!seen.has('en-learn-s1-d'), '锁定的课不应被随机抽到')
})

test('lessonLocks：探索页能查到每门课的锁，挑战课按「有完成」判定', () => {
  const { curriculum } = setup()
  const locks = curriculum.lessonLocks()
  assert.equal(locks.get('en-learn-s1-a').isNext, true)
  assert.equal(locks.get('en-learn-s1-b').locked, true)
  assert.equal(locks.get('en-challenge-s1-l1').locked, true, '没有完成记录时挑战锁定')
  const done = setup([['en-learn-s1-a', 'learn']]).curriculum.lessonLocks()
  assert.equal(done.get('en-challenge-s1-l1').locked, false)
})

test('进度没注入时按全新用户算（frontier=第一课，不阻塞旧调用方）', () => {
  const store = createStorage({ backend: memoryBackend() })
  const curriculum = createCurriculum({ catalog: fakeCatalog(), store })
  const en = curriculum.stageBlocks('s1').find((b) => b.subject.id === 'en')
  assert.equal(en.units[0].locked, false)
  assert.equal(en.units[0].isNext, true)
  assert.equal(en.units[1].locked, true)
})

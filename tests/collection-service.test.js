/**
 * 收集图鉴服务（「我的百宝箱」点亮）——之前整个文件零测试。
 *
 * 为什么值得单独测：它是唯一同时读 sessions + attempts 两个事件流、
 * 再写第三个存储键 collection 的地方。它静默失效的表现是「孩子学了但图鉴不亮」，
 * 没有报错、没有崩页，靠手点很难发现。
 *
 * 解析器由测试注入桩数据，因此不需要（也不能）引入数据 JSON。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createStorage, memoryBackend } from '../src/platform/storage.js'
import { createCollectionService } from '../src/services/collection.js'

/* ---------- 桩目录/数据 ---------- */
const LESSONS = {
  'en-learn-animals': { id: 'en-learn-animals', subject: 'en', kind: 'learn', ref: { kind: 'en-category', id: 'animals' } },
  'en-quiz-animals': { id: 'en-quiz-animals', subject: 'en', kind: 'challenge', ref: { kind: 'en-category', id: 'animals' } },
  'zh-learn-l1': { id: 'zh-learn-l1', subject: 'zh', kind: 'learn', ref: { kind: 'zh-level', id: 1 } },
  'zh-quiz-l1': { id: 'zh-quiz-l1', subject: 'zh', kind: 'challenge', ref: { kind: 'zh-level', id: 1 } },
  'zh-words-food': { id: 'zh-words-food', subject: 'zh', kind: 'learn', ref: { kind: 'en-category', id: 'food' } },
  'zh-words-quiz-food': { id: 'zh-words-quiz-food', subject: 'zh', kind: 'challenge', ref: { kind: 'en-category', id: 'food' } },
  'zh-sentences-l1': { id: 'zh-sentences-l1', subject: 'zh', kind: 'learn', ref: { kind: 'zh-sentences', id: 1 } },
  'math-practice-l1': { id: 'math-practice-l1', subject: 'math', kind: 'challenge', ref: { kind: 'math-level', id: 1 } },
  'math-learn-l1': { id: 'math-learn-l1', subject: 'math', kind: 'learn', ref: { kind: 'math-level', id: 1 } },
}

const RESOLVERS = {
  getLesson: (id) => LESSONS[id] || null,
  resolveEnCategory: (id) =>
    id === 'animals' ? { words: [{ id: 'cat' }, { id: 'dog' }] } : id === 'food' ? { words: [{ id: 'rice' }, { id: 'soup' }] } : null,
  resolveZhLevel: (id) => {
    if (String(id) !== '1') return null
    return {
      chars: [
        { id: '4e00', sentenceAudio: '/a.mp3' },
        { id: '4e8c', sentenceAudio: '' },
        { id: '4e09', sentenceAudio: '/b.mp3' },
      ],
    }
  },
}

function makeSvc(extra = {}) {
  const store = createStorage({ backend: memoryBackend() })
  for (const [k, v] of Object.entries(extra)) store.set(k, v)
  return { store, svc: createCollectionService(store, RESOLVERS) }
}

/**
 * 作答事件工厂：同一 (session, order) 的第一条 firstTry=true，之后的重复作答为 false。
 * 必须这样建模——否则「重试答对」会被当成首答答对，测不出真正的口径问题。
 */
function attemptFactory() {
  const seen = new Set()
  return (sessionId, itemId, correct, order) => {
    const key = `${sessionId}|${order}`
    const firstTry = !seen.has(key)
    seen.add(key)
    return {
      attemptId: `${key}-${itemId}`,
      sessionId, lessonId: 'x', activityId: 'listen-pick', order,
      answer: itemId, correct, firstTry, itemId, ts: 1,
    }
  }
}

test('未注入解析器时明确抛错，而不是静默不点亮', () => {
  const store = createStorage({ backend: memoryBackend() })
  assert.throws(() => createCollectionService(store), /resolvers 未注入/)
})

test('学一学完成：英语分类课全部词进 seen（认识）', () => {
  const { store, svc } = makeSvc()
  svc.recordLearnDone({ lessonId: 'en-learn-animals', sessionId: 's1', kind: 'learn' })
  assert.deepEqual(store.get('collection').en.seen.sort(), ['cat', 'dog'])
  assert.deepEqual(store.get('collection').en.mastered, [], '学一学不等于掌握')
  assert.equal(svc.counts().enSeen, 2)
})

test('学一学完成：语文识字课进 zh 桶，小短句进 zhSentences 桶且只收有句音的', () => {
  const { store, svc } = makeSvc()
  svc.recordLearnDone({ lessonId: 'zh-learn-l1', sessionId: 's1', kind: 'learn' })
  assert.deepEqual(store.get('collection').zh.seen, ['4e00', '4e8c', '4e09'])

  svc.recordLearnDone({ lessonId: 'zh-sentences-l1', sessionId: 's2', kind: 'learn' })
  // 4e8c 没有 sentenceAudio → 不进小短句桶（与页面过滤口径一致）
  assert.deepEqual(store.get('collection').zhSentences.seen, ['4e00', '4e09'])
  assert.equal(svc.counts().zhSentencesSeen, 2)
})

test('语文词语课（ref=en-category）进 zhWords 桶，与识字课分开统计', () => {
  const { store, svc } = makeSvc()
  svc.recordLearnDone({ lessonId: 'zh-words-food', sessionId: 's1', kind: 'learn' })
  const c = store.get('collection')
  assert.deepEqual(c.zhWords.seen.sort(), ['rice', 'soup'])
  assert.deepEqual(c.zh.seen, [], '词语课不应混进识字桶')
})

test('学一学不因数学课产生点亮（数学无词表）', () => {
  const { store, svc } = makeSvc()
  svc.recordLearnDone({ lessonId: 'math-learn-l1', sessionId: 's1', kind: 'learn' })
  assert.equal(store.get('collection'), null, '数学学一学不应写任何点亮数据')
})

test('挑战完成：只把该会话首答答对的条目进 mastered（重试答对不算掌握）', () => {
  const attempt = attemptFactory()
  const { store, svc } = makeSvc({
    attempts: [
      attempt('s1', 'cat', true, 0),
      attempt('s1', 'dog', false, 1),
      attempt('s1', 'dog', true, 1), // 重试答对：firstTry=false，不算掌握
      attempt('other', 'cat', true, 0), // 别的会话不计
    ],
  })
  svc.recordChallengeDone({ lessonId: 'en-quiz-animals', sessionId: 's1', kind: 'challenge' })
  assert.deepEqual(store.get('collection').en.mastered, ['cat'])
  assert.equal(svc.counts().enMastered, 1)
})

test('挑战完成：没有任何首答答对时不写入（不产生空点亮）', () => {
  const attempt = attemptFactory()
  const { store, svc } = makeSvc({ attempts: [attempt('s1', 'cat', false, 0)] })
  svc.recordChallengeDone({ lessonId: 'en-quiz-animals', sessionId: 's1', kind: 'challenge' })
  assert.equal(store.get('collection'), null)
})

test('挑战完成：数学课点亮该课徽章（无词表，完成即点亮）', () => {
  const { store, svc } = makeSvc()
  svc.recordChallengeDone({ lessonId: 'math-practice-l1', sessionId: 's1', kind: 'challenge' })
  assert.deepEqual(store.get('collection').math.done, ['math-practice-l1'])
  assert.equal(svc.counts().mathDone, 1)
})

test('学一学课不会因为收到完成事件就进 mastered（kind 必须匹配）', () => {
  const attempt = attemptFactory()
  const { store, svc } = makeSvc({ attempts: [attempt('s1', 'cat', true, 0)] })
  svc.recordChallengeDone({ lessonId: 'en-learn-animals', sessionId: 's1', kind: 'learn' })
  assert.equal(store.get('collection'), null)
})

test('未知课程 id 安全跳过，不炸也不写', () => {
  const { store, svc } = makeSvc()
  svc.recordLearnDone({ lessonId: 'not-exist', sessionId: 's1', kind: 'learn' })
  svc.recordChallengeDone({ lessonId: 'not-exist', sessionId: 's1', kind: 'challenge' })
  svc.recordLearnDone(null)
  assert.equal(store.get('collection'), null)
})

test('recordCharPracticed：描红按单字点亮，只亮这一个字、不进掌握', () => {
  // 产品决定（描红接入进度）：写完一个字就点亮那个字，而不是整门识字课。
  const { svc, store } = makeSvc()
  assert.equal(svc.recordCharPracticed('4e00'), true)
  const c = store.get('collection')
  assert.deepEqual(c.zh.seen, ['4e00'])
  assert.deepEqual(c.zh.mastered, [], '描红练的是书写，不能算认读掌握')
  assert.deepEqual(c.en.seen, [], '不该串到英语桶')

  // 第二个字是追加，不会把第一个字冲掉
  svc.recordCharPracticed('4e8c')
  assert.deepEqual(store.get('collection').zh.seen.sort(), ['4e00', '4e8c'])
})

test('recordCharPracticed：拒绝非码点输入（直链带别的参数时不能往图鉴里塞脏数据）', () => {
  const { svc, store } = makeSvc()
  for (const bad of ['', 'cat', '一', '../../etc', null, undefined, 'zzzz', 42]) {
    assert.equal(svc.recordCharPracticed(bad), false, `应拒绝 ${JSON.stringify(bad)}`)
  }
  assert.equal(store.get('collection'), null, '拒绝时不应写入任何东西')
  // 大小写与前后空格要能容忍（URL 参数可能带）
  assert.equal(svc.recordCharPracticed(' 4E00 '), true)
  assert.deepEqual(store.get('collection').zh.seen, ['4e00'])
})

test('点亮只增不减：重复完成不会丢已有点亮', () => {
  const { svc, store } = makeSvc()
  svc.recordLearnDone({ lessonId: 'en-learn-animals', sessionId: 's1', kind: 'learn' })
  svc.recordLearnDone({ lessonId: 'zh-learn-l1', sessionId: 's2', kind: 'learn' })
  svc.recordLearnDone({ lessonId: 'en-learn-animals', sessionId: 's3', kind: 'learn' })
  const c = store.get('collection')
  assert.deepEqual(c.en.seen.sort(), ['cat', 'dog'])
  assert.deepEqual(c.zh.seen, ['4e00', '4e8c', '4e09'])
})

test('首次读取且存储无该键：从历史 sessions+attempts 一次性回填并落盘', () => {
  const attempt = attemptFactory()
  const { store, svc } = makeSvc({
    sessions: [
      { sessionId: 'l1', lessonId: 'en-learn-animals', kind: 'learn', status: 'completed', startedAt: 1 },
      { sessionId: 'q1', lessonId: 'en-quiz-animals', kind: 'challenge', status: 'completed', startedAt: 2 },
    ],
    attempts: [attempt('q1', 'cat', true, 0)],
  })
  const c = svc.get()
  assert.deepEqual(c.en.seen.sort(), ['cat', 'dog'], '老用户的学一学进度不能丢')
  assert.deepEqual(c.en.mastered, ['cat'])
  // 必须落盘：attempts 有裁剪上限，回填结果不能每次重新推导
  assert.ok(store.get('collection'), '回填结果必须持久化')
})

test('已有 collection 键时不再回填（不回退用户已有点亮）', () => {
  const { store, svc } = makeSvc({
    collection: { en: { seen: ['only-this'], mastered: [] } },
    sessions: [{ sessionId: 'l1', lessonId: 'en-learn-animals', kind: 'learn', status: 'completed' }],
  })
  assert.deepEqual(svc.get().en.seen, ['only-this'])
  assert.deepEqual(store.get('collection').en.seen, ['only-this'])
})

test('counts 覆盖所有桶且形状稳定（庆祝条依赖这些字段）', () => {
  const { svc } = makeSvc()
  const c = svc.counts()
  for (const k of [
    'enSeen', 'enMastered', 'zhSeen', 'zhMastered',
    'zhWordsSeen', 'zhWordsMastered', 'zhSentencesSeen', 'zhSentencesMastered', 'mathDone',
  ]) {
    assert.equal(typeof c[k], 'number', `counts 缺字段 ${k}`)
  }
})

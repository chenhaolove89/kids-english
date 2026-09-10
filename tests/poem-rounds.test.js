/**
 * 古诗填字出轮：听句选字。判题走统一 isRoundPickCorrect（选项 id = answer.id）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildPoemFillRounds } from '../src/domain/rounds.js'
import { isRoundPickCorrect } from '../src/domain/judge.js'

const pool = [
  { id: 'yong-e-1-0', char: '曲', lineText: '曲项向天歌。', lineAudio: '/static/audio-poem/yong-e-l1.mp3' },
  { id: 'yong-e-2-4', char: '水', lineText: '白毛浮绿水，', lineAudio: '/static/audio-poem/yong-e-l2.mp3' },
  { id: 'jing-ye-si-0-2', char: '明', lineText: '床前明月光，', lineAudio: '/static/audio-poem/jing-ye-si-l0.mp3' },
  { id: 'chun-xiao-3-0', char: '花', lineText: '花落知多少。', lineAudio: '/static/audio-poem/chun-xiao-l3.mp3' },
  { id: 'hua-0-3', char: '色', lineText: '远看山有色，', lineAudio: '/static/audio-poem/hua-l0.mp3' },
]

test('古诗填字：prompt 挖空目标字、选项全为单字、含答案', () => {
  const rounds = buildPoemFillRounds(pool, { count: 5, rng: () => 0.5 })
  assert.equal(rounds.length, 5)
  for (const r of rounds) {
    assert.equal(r.kind, 'poem-fill')
    assert.ok(r.prompt.includes('□'), `prompt 挖空: ${r.prompt}`)
    assert.ok(!r.prompt.includes(r.answer.char), '目标字不得出现在 prompt 里')
    assert.equal(r.audio, r.answer.lineAudio)
    assert.equal(r.options.length, 4)
    const labels = r.options.map((o) => o.label)
    assert.equal(new Set(labels).size, 4, '选项字互不相同')
    assert.ok(labels.includes(r.answer.char), '选项含答案字')
    for (const o of labels) assert.match(o, /^[\u4e00-\u9fff]$/, `选项必须是单个汉字: ${o}`)
  }
})

test('古诗填字：判题统一走 answer.id（与听音选图同一份实现）', () => {
  const [r] = buildPoemFillRounds(pool, { count: 1, rng: () => 0.5 })
  const right = r.options.find((o) => o.id === r.answer.id)
  const wrong = r.options.find((o) => o.id !== r.answer.id)
  assert.ok(right && wrong, '答案选项在选项列表里')
  assert.equal(isRoundPickCorrect(r, right.id), true)
  assert.equal(isRoundPickCorrect(r, wrong.id), false)
})

test('古诗填字：重复字诗池不产生同字选项（同字干扰项会被去重）', () => {
  const dupPool = [
    { id: 'a-0-0', char: '鹅', lineText: '鹅，鹅，鹅，', lineAudio: '/x/l0.mp3' },
    { id: 'a-1-0', char: '曲', lineText: '曲项向天歌。', lineAudio: '/x/l1.mp3' },
    { id: 'a-2-0', char: '毛', lineText: '白毛浮绿水，', lineAudio: '/x/l2.mp3' },
    { id: 'a-3-0', char: '掌', lineText: '红掌拨清波。', lineAudio: '/x/l3.mp3' },
    { id: 'a-0-1', char: '鹅', lineText: '鹅，鹅，鹅，', lineAudio: '/x/l0.mp3' },
  ]
  const rounds = buildPoemFillRounds(dupPool, { count: 5, rng: () => 0.3 })
  for (const r of rounds) {
    const labels = r.options.map((o) => o.label)
    assert.equal(new Set(labels).size, labels.length, '同字不得重复出现在一轮选项里')
  }
})

test('古诗填字：count 截断与空池报错', () => {
  assert.equal(buildPoemFillRounds(pool, { count: 3, rng: () => 0.5 }).length, 3)
  assert.throws(() => buildPoemFillRounds([], {}), /empty-pool/)
  // 只有一个不同字的池无判别力，必须报错而不是出全同字选项
  assert.throws(() => buildPoemFillRounds([{ id: 'x-0-0', char: '鹅', lineText: '鹅，鹅，鹅，', lineAudio: '/x.mp3' }], {}), /degenerate-pool/)
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildListenPickRounds, buildZhCharRounds, ZH_CHAR_KINDS } from '../src/domain/rounds.js'
import { isRoundPickCorrect } from '../src/domain/judge.js'

function seededRng(seed = 7) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
}

// 覆盖同音字（一/衣 同 yī）与同部首形近字，出题必须避开双正确选项
const POOL = [
  { id: '4e00', char: '一', pinyin: 'yī', word: '一起', audio: '/a.mp3', color: '#e4573d' },
  { id: '4e8c', char: '二', pinyin: 'èr', word: '二月', audio: '/b.mp3', color: '#3bb273' },
  { id: '4e09', char: '三', pinyin: 'sān', word: '三个', audio: '/c.mp3', color: '#4a90d9' },
  { id: '56db', char: '四', pinyin: 'sì', word: '四季', audio: '/d.mp3', color: '#c99b52' },
  { id: '4e94', char: '五', pinyin: 'wǔ', word: '五星', audio: '/e.mp3', color: '#9b59b6' },
  { id: '4e03', char: '七', pinyin: 'qī', word: '七天', audio: '/f.mp3', color: '#e4573d' },
  { id: '4e03a', char: '衣', pinyin: 'yī', word: '衣服', audio: '/g.mp3', color: '#3bb273' },
]

test('buildZhCharRounds：池 7 条出 7 轮、kind 均匀混出且都在白名单内', () => {
  const rounds = buildZhCharRounds(POOL, { rng: seededRng() })
  assert.equal(rounds.length, 7, '出轮数 = min(count, 池大小)')
  const kinds = new Set(rounds.map((r) => r.kind))
  assert.deepEqual([...kinds].sort(), [...ZH_CHAR_KINDS].sort(), '四种题型都应出现')
  for (const r of rounds) assert.ok(ZH_CHAR_KINDS.includes(r.kind))
})

test('buildZhCharRounds：大池出满 10 轮', () => {
  const big = POOL.concat(Array.from({ length: 8 }, (_, i) => ({ id: `x${i}`, char: `字${i}`, pinyin: `p${i}`, word: `词${i}`, audio: '' })))
  assert.equal(buildZhCharRounds(big, { rng: seededRng() }).length, 10)
})

test('listen-pick 轮沿用旧结构：选项是池对象引用、含答案、不重复', () => {
  const rounds = buildZhCharRounds(POOL, { rng: seededRng() })
  for (const r of rounds.filter((x) => x.kind === 'listen-pick')) {
    const ids = r.options.map((o) => o.id)
    assert.equal(new Set(ids).size, ids.length, '选项不重复')
    assert.ok(ids.includes(r.answer.id))
    for (const o of r.options) assert.ok(POOL.includes(o), 'listen-pick 选项必须是池对象引用')
  }
})

test('char-to-pinyin：选项是 {id,label} 拼音文本、互不相同、不含同音干扰', () => {
  const rounds = buildZhCharRounds(POOL, { rng: seededRng() })
  for (const r of rounds.filter((x) => x.kind === 'char-to-pinyin')) {
    const labels = r.options.map((o) => o.label)
    assert.equal(new Set(labels).size, labels.length, '拼音选项不得重复（同音字陷阱）')
    assert.ok(labels.includes(r.answer.pinyin), '答案拼音必须在选项中')
    for (const o of r.options) {
      assert.equal(typeof o.label, 'string')
      if (o.id !== r.answer.id) assert.notEqual(o.label, r.answer.pinyin, '干扰项拼音必须与答案不同')
    }
  }
})

test('pinyin-to-char：prompt 是拼音、选项是字、干扰项不得与答案同音', () => {
  const rounds = buildZhCharRounds(POOL, { rng: seededRng() })
  for (const r of rounds.filter((x) => x.kind === 'pinyin-to-char')) {
    assert.equal(r.prompt, r.answer.pinyin)
    const labels = r.options.map((o) => o.label)
    assert.equal(new Set(labels).size, labels.length)
    assert.ok(labels.includes(r.answer.char))
    for (const o of r.options) {
      const entry = POOL.find((p) => p.id === o.id)
      assert.equal(entry.char, o.label, '选项 label 必须是该条目的字')
      if (o.id !== r.answer.id) assert.notEqual(entry.pinyin, r.answer.pinyin, '同音字不能当干扰项（两个正确答案）')
    }
  }
})

test('char-to-word：选项是组词文本、互不相同、含答案组词', () => {
  const rounds = buildZhCharRounds(POOL, { rng: seededRng() })
  for (const r of rounds.filter((x) => x.kind === 'char-to-word')) {
    const labels = r.options.map((o) => o.label)
    assert.equal(new Set(labels).size, labels.length, '组词选项不得重复')
    assert.ok(labels.includes(r.answer.word))
    for (const o of r.options) assert.equal(typeof o.label, 'string')
  }
})

test('判题：四种题型统一按 id 走 isRoundPickCorrect', () => {
  const rounds = buildZhCharRounds(POOL, { rng: seededRng() })
  for (const r of rounds) {
    assert.equal(isRoundPickCorrect(r, r.answer.id), true, `${r.kind} 答案必须判对`)
    for (const o of r.options) {
      if (o.id !== r.answer.id) assert.equal(isRoundPickCorrect(r, o.id), false)
    }
  }
})

test('小池降级：池 3 条仍出轮、拼音题选项数可能少于 4 但不为空', () => {
  const small = buildZhCharRounds(POOL.slice(0, 3), { rng: seededRng() })
  assert.equal(small.length, 3)
  for (const r of small) {
    assert.ok(r.options.length >= 2, '每轮至少 2 个选项')
    assert.ok(r.options.length <= 3)
  }
  assert.throws(() => buildZhCharRounds([]), /empty-pool/)
})

test('同音字池：衣(yī)做答案时，拼音类题不把一(yī)放进选项', () => {
  // 连续跑多种子，只要出现衣的拼音题就校验（洗牌顺序依赖种子，多试几次提高命中率）
  for (let seed = 1; seed <= 40; seed++) {
    const rounds = buildZhCharRounds(POOL, { rng: seededRng(seed) })
    for (const r of rounds) {
      if (r.kind !== 'pinyin-to-char' || r.answer.char !== '衣') continue
      const ids = r.options.map((o) => o.id)
      assert.ok(!ids.includes('4e00'), '同音字「一」不得出现在「衣」的拼音题选项')
    }
  }
})

test('listen-pick 回归：原 buildListenPickRounds 行为不变', () => {
  const rounds = buildListenPickRounds(POOL, { rng: seededRng() })
  assert.equal(rounds.length, 7, 'listen-pick 出轮数 = min(count, 池大小)')
  for (const r of rounds) {
    assert.equal(r.options.length, 4)
    assert.ok(!('kind' in r), '旧出轮器不带 kind，快照结构兼容')
  }
})

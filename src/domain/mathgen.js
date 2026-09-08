/**
 * 数学题目生成：从 pages/math/practice.vue 原样抽出（2026-09 v1.2.0），出题规则与音频序列保持一致。
 * 纯函数：不依赖 uni / DOM / Howler；rng 可注入，audioBase 可换（CDN/分包阶段改传入值即可）。
 * 生成的题目必须可 JSON 序列化——中断恢复靠它做题目快照。
 */
import { shuffle, pickOne } from './shuffle.js'

export const MATH_LEVELS = {
  1: { id: 1, name: '认识数字', color: '#3BB273', bg: '#E3F6E8' },
  2: { id: 2, name: '十以内加减', color: '#4D96FF', bg: '#E3EEFF' },
  3: { id: 3, name: '二十以内', color: '#FF8C42', bg: '#FFEDD9' },
  4: { id: 4, name: '乘除进阶', color: '#9B5DE5', bg: '#F0E6FB' },
}

const KINDS_BY_LEVEL = {
  1: ['count', 'listen', 'sequence'],
  2: ['add', 'sub', 'compare'],
  3: ['add20', 'sub20', 'missing', 'compareNum'],
  4: ['mul', 'div'],
}

// 点数/加减的物品池：挑孩子一眼就喜欢的（水果零食、玩具、动物、交通工具），
// 每题随机取一种，配合练习页的彩色卡片拼贴排版
const EMOJIS = ['🍎', '🍓', '🍇', '🍉', '🍭', '🍩', '🍪', '🍦', '🧸', '🚗', '🚀', '⚽', '🎁', '🎈', '⭐', '🌸', '🌻', '🐤', '🐶', '🐱', '🐰', '🦄', '🐠', '🍀']

/** 非法/越界关卡一律安全回退到第 1 关，路由参数不可信 */
export function normalizeMathLevel(lvId) {
  const n = Number(lvId)
  return MATH_LEVELS[n] ? n : 1
}

function rnd(rng, n) {
  return Math.floor(rng() * n)
}

// 生成数字题选项：正确答案 + 相近干扰项（不给 0：数 1 个苹果时出现「0」对低龄儿童造成困扰）
function numOptions(answer, count, rng) {
  const set = new Set([answer])
  const deltas = [1, -1, 2, -2, 10, -10, 5, -5]
  let di = 0
  while (set.size < count && di < deltas.length) {
    const v = answer + deltas[di++]
    if (v > 0) set.add(v)
  }
  while (set.size < count) {
    const v = 1 + rnd(rng, 100)
    set.add(v)
  }
  return shuffle([...set], rng).map((v) => ({ id: String(v), label: String(v) }))
}

function emojisOf(n, rng, emoji) {
  const e = emoji || pickOne(EMOJIS, rng)
  return Array.from({ length: n }, () => e)
}

export function makeQuestion(lvId, { rng = Math.random, audioBase = '/static/audio' } = {}) {
  const level = normalizeMathLevel(lvId)
  const kind = pickOne(KINDS_BY_LEVEL[level], rng)
  const A = (p) => `${audioBase}/${p}`
  const qz = { kind }

  if (kind === 'count') {
    const n = 1 + rnd(rng, 9)
    qz.emojiList = emojisOf(n, rng)
    qz.seq = [A('zh-countit.mp3'), A('zh-total.mp3')]
    qz.options = numOptions(n, 3, rng)
    qz.answer = String(n)
    qz.sig = `count:${n}`
  } else if (kind === 'listen') {
    const n = 1 + rnd(rng, 19)
    qz.seq = [A('zh-listen.mp3'), A(`n${n}.mp3`)]
    qz.options = numOptions(n, 4, rng)
    qz.answer = String(n)
    qz.sig = `listen:${n}`
  } else if (kind === 'sequence') {
    const start = 1 + rnd(rng, 10)
    const step = pickOne([1, 2], rng)
    const nums = [start, start + step, start + step * 2, start + step * 3]
    const hideIdx = 1 + rnd(rng, 2)
    qz.answer = String(nums[hideIdx])
    qz.display = nums.map((v, i) => (i === hideIdx ? '?' : String(v))).join('  ')
    qz.seq = [A('zh-missing.mp3')]
    qz.options = numOptions(nums[hideIdx], 4, rng)
    qz.sig = `sequence:${start}:${step}:${hideIdx}`
  } else if (kind === 'add') {
    const e = pickOne(EMOJIS, rng) // 同题同物：两组放一起才像"合起来数"
    const a = 1 + rnd(rng, 9)
    const b = 1 + rnd(rng, 10 - a)
    qz.leftEmojis = emojisOf(a, rng, e)
    qz.rightEmojis = emojisOf(b, rng, e)
    qz.answer = String(a + b)
    qz.seq = [A(`n${a}.mp3`), A('zh-plus.mp3'), A(`n${b}.mp3`), A('zh-howmany.mp3')]
    qz.options = numOptions(a + b, 3, rng)
    qz.sig = `add:${a}:${b}`
  } else if (kind === 'sub') {
    const e = pickOne(EMOJIS, rng)
    const a = 2 + rnd(rng, 9)
    const b = 1 + rnd(rng, a - 1)
    qz.leftEmojis = emojisOf(a, rng, e)
    qz.rightEmojis = emojisOf(b, rng, e)
    qz.takeAway = b
    qz.answer = String(a - b)
    qz.seq = [A(`n${a}.mp3`), A('zh-minus.mp3'), A(`n${b}.mp3`), A('zh-howmany.mp3')]
    qz.options = numOptions(a - b, 3, rng)
    qz.sig = `sub:${a}:${b}`
  } else if (kind === 'compare') {
    const e = pickOne(EMOJIS, rng) // 两边同物，比多少才直观
    const a = 1 + rnd(rng, 9)
    let b = 1 + rnd(rng, 9)
    while (b === a) b = 1 + rnd(rng, 9)
    const more = rng() < 0.5
    qz.groups = [
      { emojis: emojisOf(a, rng, e), n: a },
      { emojis: emojisOf(b, rng, e), n: b },
    ]
    if (rng() < 0.5) qz.groups.reverse()
    const target = qz.groups.findIndex((g) => g.n === (more ? Math.max(a, b) : Math.min(a, b)))
    qz.answer = String(target)
    qz.seq = [more ? A('zh-more.mp3') : A('zh-less.mp3')]
    // 签名与两边渲染顺序无关：同一道「谁多谁少」只认数字与问法
    qz.sig = `compare:${more ? 'more' : 'less'}:${Math.max(a, b)}:${Math.min(a, b)}`
  } else if (kind === 'add20') {
    const a = 3 + rnd(rng, 16)
    const b = 1 + rnd(rng, Math.max(1, 20 - a))
    qz.answer = String(a + b)
    qz.display = `${a} + ${b} = ?`
    qz.seq = [A(`n${a}.mp3`), A('zh-plus.mp3'), A(`n${b}.mp3`), A('zh-howmany.mp3')]
    qz.options = numOptions(a + b, 4, rng)
    qz.sig = `add20:${a}:${b}`
  } else if (kind === 'sub20') {
    const a = 8 + rnd(rng, 13)
    const b = 1 + rnd(rng, a - 2)
    qz.answer = String(a - b)
    qz.display = `${a} − ${b} = ?`
    qz.seq = [A(`n${a}.mp3`), A('zh-minus.mp3'), A(`n${b}.mp3`), A('zh-howmany.mp3')]
    qz.options = numOptions(a - b, 4, rng)
    qz.sig = `sub20:${a}:${b}`
  } else if (kind === 'missing') {
    const a = 2 + rnd(rng, 12)
    // 与 add20 同法收界：和不超过 20，符合「二十以内」关卡名义
    const b = 1 + rnd(rng, Math.max(1, 20 - a))
    qz.answer = String(b)
    qz.display = `${a} + ? = ${a + b}`
    qz.seq = [A(`n${a}.mp3`), A('zh-plus.mp3'), A('zh-ji.mp3'), A('zh-equals.mp3'), A(`n${a + b}.mp3`)]
    qz.options = numOptions(b, 4, rng)
    qz.sig = `missing:${a}:${b}`
  } else if (kind === 'compareNum') {
    const a = 1 + rnd(rng, 19)
    let b = 1 + rnd(rng, 19)
    while (b === a) b = 1 + rnd(rng, 19)
    const bigger = rng() < 0.5
    qz.groups = [
      { n: a },
      { n: b },
    ]
    if (rng() < 0.5) qz.groups.reverse()
    const target = qz.groups.findIndex((g) => g.n === (bigger ? Math.max(a, b) : Math.min(a, b)))
    qz.answer = String(target)
    qz.seq = [bigger ? A('zh-bigger.mp3') : A('zh-smaller.mp3')]
    qz.sig = `compareNum:${bigger ? 'big' : 'small'}:${Math.max(a, b)}:${Math.min(a, b)}`
  } else if (kind === 'mul') {
    const a = 2 + rnd(rng, 8)
    const b = 2 + rnd(rng, 8)
    qz.answer = String(a * b)
    qz.display = `${a} × ${b} = ?`
    qz.seq = [A(`n${a}.mp3`), A('zh-times.mp3'), A(`n${b}.mp3`), A('zh-howmany.mp3')]
    qz.options = numOptions(a * b, 4, rng)
    qz.sig = `mul:${a}:${b}`
  } else if (kind === 'div') {
    const b = 2 + rnd(rng, 8)
    const c = 2 + rnd(rng, 8)
    const a = b * c
    qz.answer = String(c)
    qz.display = `${a} ÷ ${b} = ?`
    qz.seq = [A(`n${a}.mp3`), A('zh-divided.mp3'), A(`n${b}.mp3`), A('zh-howmany.mp3')]
    qz.options = numOptions(c, 4, rng)
    qz.sig = `div:${a}:${b}`
  }
  return qz
}

/** 错题本展示文本：优先算式原样，图形/听音题给人话描述（家长周报「最常错」用） */
export function mathText(q) {
  if (!q) return ''
  if (q.display) return q.display
  const kind = q.kind
  if (kind === 'count') return `数一数：一共 ${q.answer} 个`
  if (kind === 'listen') return `听音识数：${q.answer}`
  if (kind === 'add') return `看图加法：${q.leftEmojis?.length ?? '?'} + ${q.rightEmojis?.length ?? '?'} = ?`
  if (kind === 'sub') return `看图减法：${q.leftEmojis?.length ?? '?'} − ${q.rightEmojis?.length ?? '?'} = ?`
  if (kind === 'compare') {
    const [g1, g2] = q.groups || []
    const ask = (q.seq?.[0] || '').includes('more') ? '多' : '少'
    return `比多少：哪边${ask}（${g1?.n ?? '?'} 和 ${g2?.n ?? '?'}）`
  }
  if (kind === 'compareNum') {
    const [g1, g2] = q.groups || []
    const ask = (q.seq?.[0] || '').includes('bigger') ? '大' : '小'
    return `比大小：哪个数${ask}（${g1?.n ?? '?'} 和 ${g2?.n ?? '?'}）`
  }
  return q.sig || kind
}

/** 错题本条目 id：关卡 + 题目签名，跨题不碰撞（纯答案 '13' 会把加减听音混为一谈） */
export function mathItemId(levelId, q) {
  return q?.sig ? `math-l${normalizeMathLevel(levelId)}:${q.sig}` : ''
}

/**
 * 出一组题（默认 10 题），同组内去重。
 * 题目按 sig（题型+参数）去重——「比一比」题没有算式，按答案去重会让每套最多剩 2 道；
 * 极端情况下生成空间过小会死循环，故加尝试上限，超过上限接受当前组（不会少于 1 题）。
 */
export function buildQuestions(lvId, { count = 10, rng = Math.random, audioBase = '/static/audio' } = {}) {
  const list = []
  const used = new Set()
  let guard = 0
  while (list.length < count && guard < count * 50) {
    guard++
    const qz = makeQuestion(lvId, { rng, audioBase })
    const key = qz.sig || qz.kind + '|' + qz.answer + '|' + (qz.display || '')
    if (used.has(key)) continue
    used.add(key)
    list.push(qz)
  }
  return list
}

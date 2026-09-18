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
  5: { id: 5, name: '万以内加减', color: '#12B886', bg: '#E2F6EF' },
  6: { id: 6, name: '小数与分数', color: '#D6336C', bg: '#FBE3EC' },
  7: { id: 7, name: '图形规律', color: '#E8A33D', bg: '#FCF1DD' },
  8: { id: 8, name: '应用题', color: '#5C7CFA', bg: '#E8EDFF' },
  9: { id: 9, name: '四则混合', color: '#0CA678', bg: '#E0F5EC' },
  // 10-16 为按学段补铺的关卡（时间测量、周长面积、分数初步、百分数比例、统计，以及启蒙的形状识别）。
  // 名称与 tools/validate-content.mjs 的 MATH_LEVELS 表必须逐字一致（tests/content.test.js 钉住这份契约）。
  10: { id: 10, name: '认识形状', color: '#845EF7', bg: '#EFE9FE' },
  11: { id: 11, name: '认识时间', color: '#F76707', bg: '#FFEDE0' },
  12: { id: 12, name: '长度与测量', color: '#0B7285', bg: '#E0F3F6' },
  13: { id: 13, name: '周长与面积', color: '#C2255C', bg: '#FCE4EE' },
  14: { id: 14, name: '分数初步', color: '#E8590C', bg: '#FDEBE0' },
  15: { id: 15, name: '百分数与比例', color: '#5F3DC4', bg: '#EBE6FB' },
  16: { id: 16, name: '统计与数据', color: '#087F5B', bg: '#DFF3EC' },
}

const KINDS_BY_LEVEL = {
  1: ['count', 'listen', 'sequence'],
  2: ['add', 'sub', 'compare'],
  3: ['add20', 'sub20', 'missing', 'compareNum'],
  4: ['mul', 'div'],
  // 5/6 关是算式题（三位数、小数、分数都没有现成音轨），用「请选一选」当统一语音提示
  5: ['addBig', 'subBig', 'missingBig'],
  6: ['addDec', 'subDec', 'addFrac'],
  // 7 图形规律 / 8 应用题 / 9 四则混合：同样无逐数音轨，统一走提示音
  7: ['pattern'],
  8: ['wordAdd', 'wordSub', 'wordMul'],
  9: ['mixed2'],
  // 10 启蒙：纯图形辨别（配图选形状），3-6 岁不依赖识字
  10: ['shapeSame', 'shapeOdd'],
  // 11-12 一二年级：认识钟面 + 长度单位（都走长句/算式分支，无逐条音轨）
  11: ['clockRead', 'clockSet'],
  12: ['unitPick', 'unitConv'],
  // 13-14 三四年级：周长面积（长方形/正方形）、分数初步（几分之几、同分母减法）
  13: ['perimeter', 'area'],
  14: ['fracOf', 'fracSubSame'],
  // 15-16 五六年级：百分数与按比分配、平均数与表格读数据
  15: ['percent', 'ratioShare'],
  16: ['average', 'dataRead'],
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

// 三位数选项：干扰项按位值取（差 1/10/100），比 ±2 更像真实算错（漏进位、退位错）
function bigOptions(answer, count, rng) {
  const set = new Set([answer])
  const deltas = [1, -1, 10, -10, 100, -100, 2, -2]
  let di = 0
  while (set.size < count && di < deltas.length) {
    const v = answer + deltas[di++]
    if (v > 0) set.add(v)
  }
  while (set.size < count) set.add(1 + rnd(rng, Math.max(2, answer * 2)))
  return shuffle([...set], rng).map((v) => ({ id: String(v), label: String(v) }))
}

// 小数统一用「十分位整数」运算与出选项，最后格式化——避免 0.1+0.2 这类浮点误差
const fmtTenths = (t) => (t / 10).toFixed(1)
// 十分位非零：否则会出 5.0 + 2.0 这种整数式小数题，孩子学不到小数
// 末尾为 0 时的 +1 修正必须留在 [lo, hi] 内：此前不检查上界，减法题里
// b = decTenths(rng, 1, a-1) 会在 a-1 是整十分位时被顶成 b === a
// →「6.1 − 6.1 = ?」答案 0.0（实测 20 万题命中 183 次）
function decTenths(rng, lo, hi) {
  const t = lo + rnd(rng, Math.max(1, hi - lo + 1))
  if (t % 10 !== 0) return t
  if (t + 1 <= hi) return t + 1
  return t - 1 >= lo ? t - 1 : t
}
function decOptions(answerTenths, count, rng) {
  const set = new Set([answerTenths])
  const deltas = [1, -1, 10, -10, 5, -5, 2, -2]
  let di = 0
  while (set.size < count && di < deltas.length) {
    const v = answerTenths + deltas[di++]
    if (v > 0) set.add(v)
  }
  while (set.size < count) set.add(1 + rnd(rng, 200))
  return shuffle([...set], rng).map((t) => ({ id: fmtTenths(t), label: fmtTenths(t) }))
}

// 同分母分数选项：干扰项覆盖典型错法——分子 ±1，以及「分母也相加」（1/5+2/5 写成 3/10）
// 去重必须按**分数值**而不是字符串：sum=2 时「分母翻倍」的 2/(2den) 与 (sum-1)/den 是同一个值
// （实测 3/8−1/8 会给出 2/16 与 1/8 两个等价选项），按字符串去重抓不到。
function fracValueKey(n, d) {
  const g = (x, y) => (y ? g(y, x % y) : x)
  const k = g(n, d) || 1
  return `${n / k}/${d / k}`
}
function fracOptions(sum, den, count, rng) {
  const mk = (n, d) => ({ id: `${n}/${d}`, label: `${n}/${d}` })
  const cands = [mk(sum, den), mk(sum + 1, den), mk(sum - 1, den), mk(sum, den + den)]
  const seen = new Set()
  const list = []
  for (const c of cands) {
    const [n, d] = c.id.split('/').map(Number)
    // n >= d 一律不要：sum 到顶时 sum+1 = den 会给出 5/5（值 = 1）这种假分数干扰项——
    // 这一批题型的结果一律保持真分数，假分数是五年级下册内容（L6 的 addFrac 与 L14 共用这个 helper，
    // 实测 addFrac 曾有 29.5% 的题带 9/9 这类选项）
    if (n < 1 || n >= d || seen.has(fracValueKey(n, d))) continue
    seen.add(fracValueKey(n, d))
    list.push(c)
    if (list.length === count) break
  }
  // 分子靠边时上面的候选不够，用 1..den-1 兜底补足（保证选项数达标且不重复）
  for (let k = 1; list.length < count && k < den; k++) {
    if (seen.has(fracValueKey(k, den))) continue
    seen.add(fracValueKey(k, den))
    list.push(mk(k, den))
  }
  return shuffle(list, rng)
}

// ---- 10 关「认识形状」：纯图形，3-6 岁不依赖识字 ----
// 只用单码点图形（带变体选择符的 emoji 在不同系统上可能渲染成两个字符，槽位会错）。
// **同一形状只能出现一次**：曾经同时放了 🟦(蓝方块) 与 🟨(黄方块)，按「形状」本义都是正方形
// → 「找一样的形状」出现双答案（实测 20% 的题选项里同时有这两种方块），「找不同」实际在考颜色。
// 也没有长方形的 emoji（这是后续改用自绘图形的原因之一），现在这一关不含长方形。
const SHAPES = ['⭕', '🔺', '🟦', '🔷', '⭐']

// ---- 11 关「认识时间」：Noto 的钟面 emoji 覆盖 12 个整点与 12 个半点 ----
// 1F550 起是 1:00..12:00，再往后 12 个是 1:30..12:30
function clockEmoji(hour, half) {
  return String.fromCodePoint(0x1f550 + (hour - 1) + (half ? 12 : 0))
}
const clockLabel = (hour, half) => `${hour}:${half ? '30' : '00'}`

// ---- 12 关「长度与测量」：都是教材原话里的量感例子（厘米/米），千米只当干扰项 ----
const LENGTH_ITEMS = [
  ['铅笔长约 15', '厘米'],
  ['课桌高约 70', '厘米'],
  ['数学书宽约 18', '厘米'],
  ['一块橡皮长约 4', '厘米'],
  ['爸爸身高约 175', '厘米'],
  ['教室的长约 8', '米'],
  ['教室的门高约 2', '米'],
  ['一层楼高约 3', '米'],
  ['一棵大树高约 10', '米'],
  ['操场跑道一圈约 400', '米'],
]
const LENGTH_UNITS = ['厘米', '米', '千米']

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
  } else if (kind === 'addBig') {
    // 三位数加三位数（3-4 年级）：和不超过 9999，符合「万以内」关卡名义
    const a = 100 + rnd(rng, 900)
    const b = 100 + rnd(rng, 900)
    qz.answer = String(a + b)
    qz.display = `${a} + ${b} = ?`
    qz.seq = [A('zh-choose.mp3')]
    qz.options = bigOptions(a + b, 4, rng)
    qz.sig = `addBig:${a}:${b}`
  } else if (kind === 'subBig') {
    const a = 200 + rnd(rng, 800)
    const b = 100 + rnd(rng, Math.max(1, a - 100))
    qz.answer = String(a - b)
    qz.display = `${a} − ${b} = ?`
    qz.seq = [A('zh-choose.mp3')]
    qz.options = bigOptions(a - b, 4, rng)
    qz.sig = `subBig:${a}:${b}`
  } else if (kind === 'missingBig') {
    const a = 100 + rnd(rng, 800)
    const b = 100 + rnd(rng, 900)
    qz.answer = String(b)
    qz.display = `${a} + ? = ${a + b}`
    qz.seq = [A('zh-choose.mp3')]
    qz.options = bigOptions(b, 4, rng)
    qz.sig = `missingBig:${a}:${b}`
  } else if (kind === 'addDec') {
    // 一位小数加法（5-6 年级）：十分位整数运算，和不超过 20.0
    const a = decTenths(rng, 11, 100)
    const b = decTenths(rng, 1, Math.max(1, 200 - a))
    qz.answer = fmtTenths(a + b)
    qz.display = `${fmtTenths(a)} + ${fmtTenths(b)} = ?`
    qz.seq = [A('zh-choose.mp3')]
    qz.options = decOptions(a + b, 4, rng)
    qz.sig = `addDec:${a}:${b}`
  } else if (kind === 'subDec') {
    const a = decTenths(rng, 20, 199)
    const b = decTenths(rng, 1, a - 1)
    qz.answer = fmtTenths(a - b)
    qz.display = `${fmtTenths(a)} − ${fmtTenths(b)} = ?`
    qz.seq = [A('zh-choose.mp3')]
    qz.options = decOptions(a - b, 4, rng)
    qz.sig = `subDec:${a}:${b}`
  } else if (kind === 'addFrac') {
    // 同分母分数加法：限定和小于分母，结果保持真分数、不用约分
    const den = 5 + rnd(rng, 8)
    const n1 = 1 + rnd(rng, Math.max(1, den - 3))
    const n2 = 1 + rnd(rng, Math.max(1, den - n1 - 1))
    qz.answer = `${n1 + n2}/${den}`
    qz.display = `${n1}/${den} + ${n2}/${den} = ?`
    qz.seq = [A('zh-choose.mp3')]
    qz.options = fracOptions(n1 + n2, den, 4, rng)
    qz.sig = `addFrac:${n1}:${n2}:${den}`
  } else if (kind === 'pattern') {
    // 图形规律（启蒙）：二元循环模式接下一个，看 4 个图形找周期
    const glyphs = ['●', '▲', '■', '★', '◆', '♥']
    const [g1, g2] = shuffle(glyphs, rng).slice(0, 2)
    const pattern = pickOne([[g1, g2], [g1, g1, g2], [g1, g2, g2]], rng)
    const shown = Array.from({ length: 4 }, (_, i) => pattern[i % pattern.length])
    qz.answer = pattern[4 % pattern.length]
    qz.display = shown.join(' ') + '  ?'
    qz.seq = [A('zh-choose.mp3')]
    const distractors = shuffle(glyphs.filter((g) => g !== qz.answer), rng).slice(0, 3)
    qz.options = shuffle([qz.answer, ...distractors], rng).map((g) => ({ id: g, label: g }))
    qz.sig = `pattern:${pattern.join('')}`
  } else if (kind === 'wordAdd' || kind === 'wordSub' || kind === 'wordMul') {
    // 应用题（3-4 年级）：生活场景一步题，考读题理解
    const NAMES = ['小明', '小红', '小刚', '小丽', '乐乐', '悦悦']
    const THINGS = ['颗糖', '本书', '支铅笔', '个苹果', '张贴纸', '块饼干']
    const name = pickOne(NAMES, rng)
    const thing = pickOne(THINGS, rng)
    let a, b, ans
    if (kind === 'wordAdd') {
      a = 12 + rnd(rng, 60)
      b = 8 + rnd(rng, 40)
      ans = a + b
      qz.display = `${name}有 ${a} ${thing}，爸爸又买来 ${b} ${thing}，现在一共有多少${thing}？`
    } else if (kind === 'wordSub') {
      a = 30 + rnd(rng, 60)
      b = 5 + rnd(rng, Math.max(1, a - 10))
      ans = a - b
      qz.display = `${name}有 ${a} ${thing}，送给同学 ${b} ${thing}，还剩多少${thing}？`
    } else {
      a = 3 + rnd(rng, 8)
      b = 4 + rnd(rng, 8)
      ans = a * b
      qz.display = `每盒装 ${a} ${thing}，${b} 盒一共装多少${thing}？`
    }
    qz.answer = String(ans)
    qz.seq = [A('zh-choose.mp3')]
    qz.options = numOptions(ans, 4, rng)
    qz.sig = `${kind}:${a}:${b}`
  } else if (kind === 'mixed2') {
    // 四则混合（5-6 年级）：两级运算，考运算顺序（先乘除、有括号先算）
    const form = pickOne(['mulAdd', 'subMul', 'paren'], rng)
    let ans
    if (form === 'mulAdd') {
      const a = 3 + rnd(rng, 12)
      const b = 3 + rnd(rng, 12)
      const c = 5 + rnd(rng, 40)
      ans = a * b + c
      qz.display = `${a} × ${b} + ${c} = ?`
    } else if (form === 'subMul') {
      const b = 2 + rnd(rng, 9)
      const c = 3 + rnd(rng, 9)
      const a = b * c + 10 + rnd(rng, 20)
      ans = a - b * c
      qz.display = `${a} − ${b} × ${c} = ?`
    } else {
      const a = 2 + rnd(rng, 20)
      const b = 2 + rnd(rng, 20)
      const c = 2 + rnd(rng, 9)
      ans = (a + b) * c
      qz.display = `(${a} + ${b}) × ${c} = ?`
    }
    qz.answer = String(ans)
    qz.seq = [A('zh-choose.mp3')]
    qz.options = bigOptions(ans, 4, rng)
    qz.sig = `mixed2:${form}:${qz.display}`
  } else if (kind === 'shapeSame') {
    // 找一样的形状（启蒙）：目标图形 + 3 个不同图形，纯视觉配对，选项就是图形本身。
    // 题面不写「?」：L7 图形规律也用「… ?」且同为启蒙学段，孩子会把「找一样」读成「下一个是什么」。
    const target = pickOne(SHAPES, rng)
    const others = shuffle(SHAPES.filter((s) => s !== target), rng).slice(0, 3)
    qz.display = target
    qz.seq = [A('zh-choose.mp3')]
    qz.answer = target
    qz.options = shuffle([target, ...others], rng).map((s) => ({ id: s, label: s }))
    // 签名带干扰项集合：只按目标图形签名时图形种类凑不满一关 10 题（去重会截短）。
    // 干扰项必须先排序再拼，否则同一局会出现两道题面与选项集合完全一样的题（实测 17.3% 的局）。
    qz.sig = `shapeSame:${target}:${[...others].sort().join('')}`
  } else if (kind === 'shapeOdd') {
    // 找不同（启蒙）：3 个一样 + 1 个不一样。
    // 选项只给「题面里出现过的那两个」（不一样的那个 + 一样的那个）：多放一个题面里没有的图形，
    // 按字面它也「和谁都不一样」，与「哪一个不一样」的问法打架。两个大按钮对 3-6 岁也更好点。
    const [common, odd] = shuffle(SHAPES, rng).slice(0, 2)
    const shown = shuffle([common, common, common, odd], rng)
    qz.display = shown.join(' ')
    qz.seq = [A('zh-choose.mp3')]
    qz.answer = odd
    qz.common = common
    qz.options = shuffle([odd, common], rng).map((s) => ({ id: s, label: s }))
    qz.sig = `shapeOdd:${common}:${odd}`
  } else if (kind === 'clockRead') {
    // 读钟面（一二年级）：给钟面选时间，干扰项是孩子最常犯的两种错（整点/半点混、看错一格）
    const hour = 1 + rnd(rng, 12)
    const half = rng() < 0.5
    const label = clockLabel(hour, half)
    const nextHour = (hour % 12) + 1
    const prevHour = ((hour + 10) % 12) + 1
    const wrong = [clockLabel(hour, !half), clockLabel(nextHour, half), clockLabel(prevHour, half)]
    qz.display = `${clockEmoji(hour, half)} 是几点？`
    qz.seq = [A('zh-choose.mp3')]
    qz.answer = label
    qz.options = shuffle([label, ...new Set(wrong)]).map((t) => ({ id: t, label: t }))
    qz.sig = `clockRead:${label}`
  } else if (kind === 'clockSet') {
    // 拨钟面（一二年级）：给时间选钟面，与读钟面互为反向练习
    const hour = 1 + rnd(rng, 12)
    const half = rng() < 0.5
    const label = clockLabel(hour, half)
    const nextHour = (hour % 12) + 1
    const prevHour = ((hour + 10) % 12) + 1
    const clocks = [
      clockEmoji(hour, half),
      clockEmoji(hour, !half),
      clockEmoji(nextHour, half),
      clockEmoji(prevHour, half),
    ]
    qz.display = `${label} 是哪个钟？`
    qz.seq = [A('zh-choose.mp3')]
    qz.answer = clockEmoji(hour, half)
    qz.options = shuffle([...new Set(clocks)]).map((c) => ({ id: c, label: c }))
    qz.sig = `clockSet:${label}`
  } else if (kind === 'unitPick') {
    // 填长度单位（一二年级）：教材里的量感例句，千米只作干扰项、从不作答案
    const [sentence, unit] = pickOne(LENGTH_ITEMS, rng)
    qz.display = `${sentence}（  ）`
    qz.seq = [A('zh-choose.mp3')]
    qz.answer = unit
    qz.options = shuffle([...LENGTH_UNITS]).map((u) => ({ id: u, label: u }))
    qz.longText = true
    qz.sig = `unitPick:${sentence}`
  } else if (kind === 'unitConv') {
    // 米与厘米换算（一二年级）：1 米 = 100 厘米，两个方向随机
    const meters = 1 + rnd(rng, 9)
    const forward = rng() < 0.5
    qz.answer = forward ? String(meters * 100) : String(meters)
    qz.display = forward ? `${meters} 米 = ? 厘米` : `${meters * 100} 厘米 = ? 米`
    qz.seq = [A('zh-choose.mp3')]
    // 反向（厘米→米）答案是一位数，bigOptions 的 ±100 位值会给出「100 厘米 = ? 米」的
    // 101 / 11 / 2 这种数量级离谱的选项（不像真实错法，还把题变简单）。
    // 改用孩子真会犯的错：忘除（×100）、除以 10，以及 +1（meters=1 时 -1 为 0 会被过滤掉，
    // 其余时候排在第 5 位被 slice 丢弃，所以实际只会出现 +1）
    qz.options = forward
      ? bigOptions(Number(qz.answer), 4, rng)
      : shuffle(
          [...new Set([meters, meters * 100, meters * 10, meters + 1, meters - 1].filter((v) => v > 0))].slice(0, 4),
          rng
        ).map((v) => ({ id: String(v), label: String(v) }))
    qz.sig = `unitConv:${forward ? 'm2cm' : 'cm2m'}:${meters}`
  } else if (kind === 'perimeter') {
    // 周长（三四年级）：长方形 (长+宽)×2、正方形 边长×4
    const square = rng() < 0.4
    let a, b
    if (square) {
      // 排除边长 4：边长 4 的正方形周长与面积都是 16，孩子分不清这两个概念在算什么
      do { a = 2 + rnd(rng, 14) } while (a === 4)
      qz.display = `边长 ${a} 厘米的正方形，周长是多少厘米？`
      qz.answer = String(a * 4)
    } else {
      // 长方形的「长」必须不短于「宽」（教材定义），且不能相等（那是正方形）；
      // 再排除周长与面积数值相同的情形（长 6 宽 3 都是 18），否则两个概念无法区分
      do {
        a = 2 + rnd(rng, 19)
        b = 2 + rnd(rng, 19)
      } while (a <= b || (a + b) * 2 === a * b)
      qz.display = `长 ${a} 厘米、宽 ${b} 厘米的长方形，周长是多少厘米？`
      qz.answer = String((a + b) * 2)
    }
    qz.seq = [A('zh-choose.mp3')]
    qz.options = bigOptions(Number(qz.answer), 4, rng)
    qz.longText = true
    qz.sig = `perimeter:${square ? 'sq' : 'rect'}:${a}:${b || ''}`
  } else if (kind === 'area') {
    // 面积（三四年级）：长方形 长×宽、正方形 边长×边长
    const square = rng() < 0.4
    let a, b
    if (square) {
      do { a = 2 + rnd(rng, 12) } while (a === 4) // 边长 4 周长=面积=16，见上
      qz.display = `边长 ${a} 厘米的正方形，面积是多少平方厘米？`
      qz.answer = String(a * a)
    } else {
      do {
        a = 2 + rnd(rng, 12)
        b = 2 + rnd(rng, 12)
      } while (a <= b || (a + b) * 2 === a * b)
      qz.display = `长 ${a} 厘米、宽 ${b} 厘米的长方形，面积是多少平方厘米？`
      qz.answer = String(a * b)
    }
    qz.seq = [A('zh-choose.mp3')]
    qz.options = bigOptions(Number(qz.answer), 4, rng)
    qz.longText = true
    qz.sig = `area:${square ? 'sq' : 'rect'}:${a}:${b || ''}`
  } else if (kind === 'fracOf') {
    // 几分之几（三四年级）：平均分成几份、取了几份。
    // 干扰项只用**同分母真分数**（分子 ±1、以及"剩下的那份"）：
    // 「分子分母颠倒」会给出 7/6 这类假分数，那是五年级下册内容，而且「平均分成 6 份取 7 份」本身不可能。
    // 分母下限取 5：真分数只有 1/den..(den-1)/den 这些，den=3 时凑不满 4 个选项（会排版成 2+1）。
    const den = 5 + rnd(rng, 5)
    const n = 1 + rnd(rng, den - 1)
    const answer = `${n}/${den}`
    const opts = [answer]
    for (const k of [n + 1, n - 1, den - n]) {
      if (k >= 1 && k < den && k !== n && !opts.includes(`${k}/${den}`)) opts.push(`${k}/${den}`)
      if (opts.length === 4) break
    }
    for (let k = 1; opts.length < 4 && k < den; k++) {
      if (!opts.includes(`${k}/${den}`)) opts.push(`${k}/${den}`)
    }
    qz.display = `把一个蛋糕平均分成 ${den} 份，吃了 ${n} 份，吃了几分之几？`
    qz.seq = [A('zh-choose.mp3')]
    qz.answer = answer
    qz.options = shuffle(opts, rng).map((c) => ({ id: c, label: c }))
    qz.longText = true
    qz.sig = `fracOf:${n}:${den}`

  } else if (kind === 'fracSubSame') {
    // 同分母分数减法（三四年级）：分母不变、分子相减，结果保持真分数
    const den = 5 + rnd(rng, 8)
    const n1 = 2 + rnd(rng, den - 2)
    const n2 = 1 + rnd(rng, n1 - 1)
    qz.answer = `${n1 - n2}/${den}`
    qz.display = `${n1}/${den} − ${n2}/${den} = ?`
    qz.seq = [A('zh-choose.mp3')]
    qz.options = fracOptions(n1 - n2, den, 4, rng)
    qz.sig = `fracSubSame:${n1}:${n2}:${den}`
  } else if (kind === 'percent') {
    // 求一个数的百分之几（五六年级）：取值保证结果是整数，答案不出现 0。
    // 基数的池子里**不能有 100**：100 的 p% 就等于 p，孩子可以照抄题面里的数直接得分（实测占 12.4%）。
    // 基数必须都能被 4 整除（p=25/75 时要除得尽）：30 的 25% = 7.5，会把小数题混进来。
    const p = pickOne([10, 20, 25, 50, 75], rng)
    const n = pickOne([20, 40, 60, 80, 120, 160, 200, 240, 300, 400], rng)
    const ans = (n * p) / 100
    qz.display = `${n} 的 ${p}% 是多少？`
    qz.seq = [A('zh-choose.mp3')]
    qz.answer = String(ans)
    qz.options = numOptions(ans, 4, rng)
    qz.longText = true
    qz.sig = `percent:${n}:${p}`
  } else if (kind === 'ratioShare') {
    // 按比分配（五六年级）：总数按 a : b 分成几份，问其中一份是多少
    const big = 2 + rnd(rng, 3)
    const small = 1 + rnd(rng, big - 1)
    const parts = big + small
    const per = 2 + rnd(rng, 12)
    const total = parts * per
    const askBig = rng() < 0.5
    const ans = (askBig ? big : small) * per
    qz.display = `${total} 颗糖按 ${big} : ${small} 分给两人，${askBig ? '多' : '少'}的一份是多少颗？`
    qz.seq = [A('zh-choose.mp3')]
    qz.answer = String(ans)
    qz.options = numOptions(ans, 4, rng)
    qz.longText = true
    qz.sig = `ratioShare:${total}:${big}:${small}:${askBig ? 'big' : 'small'}`
  } else if (kind === 'average') {
    // 平均数（五六年级）：偏移量成对相消，保证平均数是整数、不出小数
    const base = 10 + rnd(rng, 80)
    const offs = pickOne([[5, -5, 2, -2], [4, -4, 1, -1], [6, -6, 3, -3], [8, -8, 2, -2]], rng)
    const nums = shuffle([base + offs[0], base + offs[1], base + offs[2], base + offs[3]], rng)
    const sum = nums.reduce((a, b) => a + b, 0)
    qz.display = `四次成绩是 ${nums.join('、')}，平均分是多少？`
    qz.seq = [A('zh-choose.mp3')]
    qz.answer = String(sum / 4)
    qz.options = numOptions(sum / 4, 4, rng)
    qz.longText = true
    qz.sig = `average:${nums.join('-')}`
  } else if (kind === 'dataRead') {
    // 读数据（五六年级）：三个数量各不相同，问最多或最少的那一项。
    // 量词与问法随对象表一起给（「小猫 3 只」不是「3 个」，「哪个班最少」不是「哪种」）——
    // 给孩子的题面用错量词就是错的，不能拿"能看懂"当理由放过。
    const [names, unit, ask] = pickOne(
      [
        [['苹果', '桃子', '梨'], '个', '哪种'],
        [['小猫', '小狗', '小兔'], '只', '哪种'],
        [['红球', '黄球', '蓝球'], '个', '哪种'],
        [['一班', '二班', '三班'], '人', '哪个班'],
      ],
      rng
    )
    // 不放回地取三个数：必须两两不同，"最多/最少"才有唯一答案（相等就有两个正确答案）
    const pool = shuffle(Array.from({ length: 12 }, (_, i) => i + 1), rng)
    const vals = pool.slice(0, 3)
    const askMax = rng() < 0.5
    const target = askMax ? Math.max(...vals) : Math.min(...vals)
    const idx = vals.indexOf(target)
    const table = names.map((nm, i) => `${nm} ${vals[i]} ${unit}`).join('，')
    qz.display = `${table}，${ask}${askMax ? '最多' : '最少'}？`
    qz.seq = [A('zh-choose.mp3')]
    qz.answer = names[idx]
    qz.unit = unit
    qz.options = names.map((nm) => ({ id: nm, label: nm }))
    qz.longText = true
    qz.sig = `dataRead:${askMax ? 'max' : 'min'}:${table}`
  }
  return qz
}

/** 错题本展示文本：优先算式原样，图形/听音题给人话描述（家长周报「最常错」用） */
export function mathText(q) {
  if (!q) return ''
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
  // 图形/钟面题：display 本身是图形或"几点"这种半句话，直接丢给家长等于没说，给人话描述。
  // **这些分支必须排在下面 `if (q.display)` 之前**——它们都有 display，落在通用兜底后面就永远走不到
  // （一开始就是这么写的，第二轮复核实测发现四处改写全是死代码）。
  if (kind === 'pattern') return `图形规律：下一个是 ${q.answer}`
  if (kind === 'shapeSame') return `认形状：找出和 ${q.display} 一样的图形`
  if (kind === 'shapeOdd') return `找不同：${q.display} 里不一样的是 ${q.answer}`
  if (kind === 'clockRead') return `读钟面：${q.display.replace(' 是几点？', '')} 是 ${q.answer}`
  if (kind === 'clockSet') return `拨钟面：${q.display.replace(' 是哪个钟？', '')} 是哪个钟`
  if (kind === 'unitPick') return `填单位：${q.display.replace('（  ）', `（${q.answer}）`)}`
  // 其余题型（算式、应用题、长句题）显示 display 原文最准确
  if (q.display) return q.display
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

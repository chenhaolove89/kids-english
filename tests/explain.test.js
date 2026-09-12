/**
 * 答错讲解文案（domain/explain.js）——路线图里"答错后的讲解环"的实现。
 *
 * 这些断言的价值不在"函数能跑"，而在三条容易悄悄退化的口径：
 *   1) 能用题目数据就必须用（算式把 ? 填上、应用题把数拎出来），不能编；
 *   2) 文案要短、面向 5~10 岁（揭晓区一行小字，长了会挤压布局）；
 *   3) 拿不准时返回空串（调用方保留兜底），**宁可不说也不能说错**——
 *      讲错一道题的解法比不讲解伤害大得多。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mathExplain, roundExplain } from '../src/domain/explain.js'

/* ---------------- 数学：算式类 ---------------- */
test('算式题把 ? 填成答案（讲解的核心：让孩子看到完整算式）', () => {
  assert.equal(mathExplain({ kind: 'add20', display: '8 + 7 = ?', answer: '15' }), '算式是 8 + 7 = 15')
  assert.equal(mathExplain({ kind: 'sub20', display: '17 − 9 = ?', answer: '8' }), '算式是 17 − 9 = 8')
  assert.equal(mathExplain({ kind: 'addBig', display: '342 + 158 = ?', answer: '500' }), '算式是 342 + 158 = 500')
  assert.equal(mathExplain({ kind: 'mul', display: '6 × 7 = ?', answer: '42' }), '算式是 6 × 7 = 42')
  assert.equal(mathExplain({ kind: 'div', display: '42 ÷ 6 = ?', answer: '7' }), '算式是 42 ÷ 6 = 7')
  assert.equal(mathExplain({ kind: 'addDec', display: '1.3 + 0.4 = ?', answer: '1.7' }), '小数点对齐： 1.3 + 0.4 = 1.7')
  assert.equal(mathExplain({ kind: 'addFrac', display: '1/4 + 2/4 = ?', answer: '3/4' }), '分母不变、分子相加： 1/4 + 2/4 = 3/4')
  assert.equal(mathExplain({ kind: 'mixed2', display: '(3 + 4) × 5 = ?', answer: '35' }), '先乘除、后加减（有括号先算括号）： (3 + 4) × 5 = 35')
})

test('缺数题给出"补上缺的数"而不是干巴巴的答案', () => {
  assert.equal(mathExplain({ kind: 'missing', display: '8 + ? = 15', answer: '7' }), '补上缺的数： 8 + ? = 7'.replace('8 + ? = 7', '8 + 7 = 15'))
  assert.equal(mathExplain({ kind: 'missingBig', display: '120 + ? = 300', answer: '180' }), '补上缺的数： 120 + 180 = 300')
})

test('数列与图形规律：填上后就是规律本身', () => {
  assert.equal(mathExplain({ kind: 'sequence', display: '1  3  5  ?', answer: '7' }), '找规律： 1  3  5  7')
  assert.equal(mathExplain({ kind: 'pattern', display: '● ▲ ● ▲  ?', answer: '●' }), '找规律： ● ▲ ● ▲  ●')
})

/* ---------------- 数学：图形/故事类 ---------------- */
test('点数与听音题：说明"一共几个 / 听到的是几"', () => {
  assert.equal(mathExplain({ kind: 'count', answer: '6', emojiList: ['🍎'] }), '数一数：一共 6 个')
  assert.equal(mathExplain({ kind: 'listen', answer: '12' }), '听到的是 12')
})

test('看图加减：用两边的数量讲清合起来/划掉', () => {
  assert.equal(mathExplain({ kind: 'add', answer: '5', leftEmojis: ['a', 'b', 'c'], rightEmojis: ['d', 'e'] }), '左边 3 个、右边 2 个，合起来是 5 个')
  assert.equal(mathExplain({ kind: 'sub', answer: '3', leftEmojis: ['a', 'b', 'c', 'd', 'e'], takeAway: 2 }), '一共 5 个，划掉 2 个，还剩 3 个')
  // 数据不全时宁可不说
  assert.equal(mathExplain({ kind: 'add', answer: '5' }), '')
  assert.equal(mathExplain({ kind: 'sub', answer: '3' }), '')
})

test('比大小：说清两边各几个 + 问的是多/少（比多少）还是大/小（比数字）', () => {
  const more = { kind: 'compare', answer: '0', sig: 'compare:more:5:3', groups: [{ n: 5, emojis: [] }, { n: 3, emojis: [] }] }
  assert.equal(mathExplain(more), '左边 5 个、右边 3 个，多的那边是答案')
  const less = { kind: 'compare', answer: '1', sig: 'compare:less:8:2', groups: [{ n: 8 }, { n: 2 }] }
  assert.equal(mathExplain(less), '左边 8 个、右边 2 个，少的那边是答案')
  // compareNum 的 sig 用的是 big/small（与 emoji 题的 more/less 不同词汇，踩过这个坑）
  const big = { kind: 'compareNum', answer: '0', sig: 'compareNum:big:12:11', groups: [{ n: 12 }, { n: 11 }] }
  assert.equal(mathExplain(big), '左边 12 个、右边 11 个，大的那边是答案')
  const small = { kind: 'compareNum', answer: '1', sig: 'compareNum:small:19:4', groups: [{ n: 19 }, { n: 4 }] }
  assert.equal(mathExplain(small), '左边 19 个、右边 4 个，小的那边是答案')
  // sig 万一改了就靠题干音频兜底（孩子实际听到的就是它）
  const byAudio = { kind: 'compareNum', answer: '0', groups: [{ n: 9 }, { n: 3 }], seq: ['/static/audio/zh-bigger.mp3'] }
  assert.equal(mathExplain(byAudio), '左边 9 个、右边 3 个，大的那边是答案')
  // 两条线索都没有时才退化成不指明方向
  const unknown = { kind: 'compareNum', answer: '1', groups: [{ n: 8 }, { n: 2 }] }
  assert.equal(mathExplain(unknown), '左边 8 个、右边 2 个，点答案那一边')
  assert.equal(mathExplain({ kind: 'compare', answer: '0', sig: 'compare:more:5:3', groups: [{ n: 5 }] }), '')
})

test('应用题：从句子里拎出数，给出算式（不编数）', () => {
  const add = { kind: 'wordAdd', answer: '68', display: '小明有 45 颗糖，爸爸又买来 23 颗糖，现在一共有多少颗糖？' }
  assert.equal(mathExplain(add), '算式是 45 + 23 = 68')
  const sub = { kind: 'wordSub', answer: '22', display: '小红有 45 颗糖，送给同学 23 颗糖，还剩多少颗糖？' }
  assert.equal(mathExplain(sub), '算式是 45 − 23 = 22')
  const mul = { kind: 'wordMul', answer: '35', display: '每盒装 5 颗糖，7 盒一共装多少颗糖？' }
  assert.equal(mathExplain(mul), '算式是 5 × 7 = 35')
  // 句子里只有 1 个数（异常数据）→ 不猜
  assert.equal(mathExplain({ kind: 'wordAdd', answer: '68', display: '小明有 45 颗糖，又买来一些，现在有多少？' }), '')
})

test('拿不准就返回空串（调用方保留兜底文案，绝不讲错）', () => {
  for (const bad of [null, undefined, {}, { kind: 'unknown-kind', answer: '1' }, { kind: 'add20' }]) {
    assert.equal(mathExplain(bad), '', `应返回空串：${JSON.stringify(bad)}`)
  }
})

/* ---------------- 讲解文案的可用性口径 ---------------- */
test('所有生成的讲解都够短（揭晓区是一行小字）且不含否定/贬义词', () => {
  const samples = [
    { kind: 'add20', display: '8 + 7 = ?', answer: '15' },
    { kind: 'missingBig', display: '1234 + ? = 5678', answer: '4444' },
    { kind: 'mixed2', display: '(12 + 34) × 56 = ?', answer: '2576' },
    { kind: 'addFrac', display: '11/12 + 7/12 = ?', answer: '18/12' },
    { kind: 'wordAdd', answer: '999', display: '小明有 456 颗糖，爸爸又买来 543 颗糖，现在一共有多少颗糖？' },
    { kind: 'compare', answer: '0', sig: 'compare:more:9:1', groups: [{ n: 9 }, { n: 1 }] },
  ]
  for (const q of samples) {
    const text = mathExplain(q)
    assert.ok(text.length > 0, `不该为空：${JSON.stringify(q)}`)
    assert.ok(text.length <= 40, `太长（${text.length} 字）：${text}`)
    assert.ok(!/错|笨|又错|不对/.test(text), `含否定词：${text}`)
  }
})

/* ---------------- 挑战题（语文/英语） ---------------- */
test('语文四题型：看字选拼音 / 看拼音选字 / 看字组词 / 听音选字', () => {
  assert.equal(roundExplain({ kind: 'char-to-pinyin', answer: { char: '妈', pinyin: 'mā' } }), '「妈」读 mā')
  assert.equal(roundExplain({ kind: 'pinyin-to-char', answer: { char: '妈', pinyin: 'mā' } }), 'mā 是「妈」')
  assert.equal(roundExplain({ kind: 'char-to-word', answer: { char: '妈', word: '妈妈' } }), '「妈」可以组成「妈妈」')
  assert.equal(roundExplain({ kind: 'listen-pick', answer: { char: '妈', pinyin: 'mā' } }), '听到的是「妈」')
})

test('英语听音选图：给出单词与中文（家长也能确认孩子听到的是什么）', () => {
  assert.equal(roundExplain({ kind: 'listen-pick', answer: { en: 'cat', zh: '猫' } }), '听到的是 cat（猫）')
  assert.equal(roundExplain({ kind: 'listen-pick', answer: { en: 'cat' } }), '听到的是 cat')
})

test('古诗填字：把整句和缺的字一起说出来', () => {
  assert.equal(roundExplain({ kind: 'poem-fill', answer: { char: '汗', lineText: '汗滴禾下土。' } }), '这一句是「汗滴禾下土。」，缺的是「汗」')
  assert.equal(roundExplain({ kind: 'poem-fill', answer: { char: '汗' } }), '缺的是「汗」')
})

test('挑战题缺字段时返回空串（不输出半个句子）', () => {
  assert.equal(roundExplain(null), '')
  assert.equal(roundExplain({ kind: 'char-to-pinyin', answer: { char: '妈' } }), '')
  assert.equal(roundExplain({ kind: 'char-to-word', answer: { char: '妈' } }), '')
  assert.equal(roundExplain({ kind: 'listen-pick', answer: {} }), '')
})

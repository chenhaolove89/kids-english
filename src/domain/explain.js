/**
 * 答错后的"讲解"文案（纯函数，可 Node 单测）。
 *
 * 现状是揭晓只告诉孩子"答案是这个"，不解释**为什么**（README 路线图里
 * 「答错后的讲解环」一直是未完成项）。这一层按题型生成一句孩子能懂的话。
 *
 * 口径（写给 5~10 岁孩子，也写给家长看）：
 *  - 一句话说完，尽量 ≤ 24 个汉字（揭晓区是一行小字，太长会换行挤压）；
 *  - 不用"错/笨/又"这类否定词，直接讲清道理；
 *  - 能用题目里的数据就用（算式把 ? 填上、应用题把数拎出来），不做主观发挥；
 *  - 拿不准就返回空串，调用方保留原有兜底文案（宁可不讲，不要讲错）。
 */

/** 有算式的题型：把 display 里的 ? 填成答案就是最好的讲解 */
const EQUATION_LEAD = {
  add20: '算式是',
  sub20: '算式是',
  addBig: '算式是',
  subBig: '算式是',
  mul: '算式是',
  div: '算式是',
  missing: '补上缺的数：',
  missingBig: '补上缺的数：',
  addDec: '小数点对齐：',
  subDec: '小数点对齐：',
  addFrac: '分母不变、分子相加：',
  sequence: '找规律：',
  pattern: '找规律：',
  mixed2: '先乘除、后加减（有括号先算括号）：',
}

/** 从应用题句子里拎出参与运算的数（"小明有 45 颗糖，爸爸又买来 23 颗糖" → [45,23]） */
function storyNumbers(display) {
  const nums = String(display || '').match(/\d+/g)
  return nums && nums.length >= 2 ? [nums[0], nums[1]] : null
}

/**
 * 数学题讲解。@returns {string} 空串表示没有可靠文案
 */
export function mathExplain(q) {
  if (!q || !q.kind) return ''
  const kind = q.kind
  const ans = q.answer === undefined || q.answer === null ? '' : String(q.answer)

  // 1) 带算式的题型：把 ? 填上（sequence/pattern 的 display 也是"…  ?"）
  if (ans && typeof q.display === 'string' && q.display.includes('?')) {
    const filled = q.display.replace('?', ans)
    return `${EQUATION_LEAD[kind] || '算式是'} ${filled}`
  }

  // 2) 图形题与故事题：逐类给一句话
  if (kind === 'count') return `数一数：一共 ${ans} 个`
  if (kind === 'listen') return `听到的是 ${ans}`
  if (kind === 'add') {
    const l = q.leftEmojis?.length
    const r = q.rightEmojis?.length
    if (l === undefined || r === undefined) return ''
    return `左边 ${l} 个、右边 ${r} 个，合起来是 ${ans} 个`
  }
  if (kind === 'sub') {
    const l = q.leftEmojis?.length
    if (l === undefined || q.takeAway === undefined) return ''
    return `一共 ${l} 个，划掉 ${q.takeAway} 个，还剩 ${ans} 个`
  }
  if (kind === 'compare' || kind === 'compareNum') {
    const groups = Array.isArray(q.groups) ? q.groups : []
    if (groups.length < 2) return ''
    const side = (i) => (i === 0 ? '左边' : i === 1 ? '右边' : `第 ${i + 1} 个`)
    // 问的是"谁多"（compare，emoji 比多少）还是"谁大"（compareNum，比数字）写在 sig 里：
    //   compare:more:5:3 / compare:less:… 与 compareNum:big:12:11 / compareNum:small:…
    // sig 万一变了就用题干音频兜底（zh-more/zh-less/zh-bigger/zh-smaller 就是孩子实际听到的）。
    const sig = String(q.sig || '')
    const seq = (q.seq || []).join(' ')
    const tag =
      ['more', 'less', 'big', 'small'].find((t) => sig.includes(t)) ||
      (seq.match(/zh-(more|less|bigger|smaller)/) || [])[1] ||
      null
    const counts = groups.map((g) => (g && g.n !== undefined ? g.n : Array.isArray(g?.emojis) ? g.emojis.length : '?'))
    const base = `${side(0)} ${counts[0]} 个、${side(1)} ${counts[1]} 个`
    const ask =
      tag === 'more' ? '多的那边是答案' : tag === 'less' ? '少的那边是答案' : tag === 'big' ? '大的那边是答案' : tag === 'small' ? '小的那边是答案' : tag === 'bigger' ? '大的那边是答案' : tag === 'smaller' ? '小的那边是答案' : '点答案那一边'
    return `${base}，${ask}`
  }
  if (kind === 'wordAdd' || kind === 'wordSub' || kind === 'wordMul') {
    const nums = storyNumbers(q.display)
    if (!nums) return ''
    const [a, b] = nums
    const op = kind === 'wordAdd' ? '+' : kind === 'wordSub' ? '−' : '×'
    return `算式是 ${a} ${op} ${b} = ${ans}`
  }
  return ''
}

/**
 * 挑战题（语文/英语）讲解。round 形如 { kind, answer, prompt }（见 domain/rounds.js）。
 * answer 是池里的对象：英语词卡有 en/zh，汉字卡有 char/pinyin/word。
 * @returns {string} 空串表示没有可靠文案
 */
export function roundExplain(round) {
  if (!round || !round.answer) return ''
  const a = round.answer
  const kind = round.kind || 'listen-pick'
  if (kind === 'char-to-pinyin') return a.char && a.pinyin ? `「${a.char}」读 ${a.pinyin}` : ''
  if (kind === 'pinyin-to-char') return a.pinyin && a.char ? `${a.pinyin} 是「${a.char}」` : ''
  if (kind === 'char-to-word') return a.char && a.word ? `「${a.char}」可以组成「${a.word}」` : ''
  if (kind === 'poem-fill') {
    if (!a.char) return ''
    return a.lineText ? `这一句是「${a.lineText}」，缺的是「${a.char}」` : `缺的是「${a.char}」`
  }
  // 听音选图 / 听音选字：把听到的内容说清楚（英语词附中文，方便家长确认）
  if (a.en && a.zh) return `听到的是 ${a.en}（${a.zh}）`
  if (a.char) return `听到的是「${a.char}」`
  if (a.en) return `听到的是 ${a.en}`
  return ''
}

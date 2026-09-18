/**
 * 中文音频的 phoneme 槽位纯逻辑：把「文本 + 逐字注音」变成 Azure SSML 的 <phoneme> 标记。
 *
 * 为什么单独成模块：这段逻辑原本长在 tools/gen-zh-azure.mjs 里，而该脚本顶层会直接
 * main()（import 即执行、读 argv、读凭据），所以槽位展开一直没法进单测。2026-09-10
 * 那次「整首 phoneme 槽位必须逐字符展开」的缺陷（`flat()` 把 null 行算成长度 1，
 * 导致整首长度校验不过、整首诗退化成默认读音）是人工审计抓到的，不是门禁抓到的——
 * 抽出来之后由 tests/pinyin-slots.test.js 钉住。
 *
 * 槽位语义：数组长度必须与文本**逐字符**（码点）对应，元素为 null 表示该字走默认读音。
 * 长度一旦对不上，buildSsml 会整条退回纯文本（宁可不注，不能注错位）。
 */

const TONE_MARKS = { '\u0304': '1', '\u0301': '2', '\u030c': '3', '\u0300': '4' }

/**
 * 拼音 → SAPI 音素串（如 `jiāo` → `jiao 1`）。
 * ü 的分音符单独处理：ǜ 分解为 u + 0308 + 声调，要把前面的 u 换成 v 才是 Azure 认的写法。
 */
export function toSapi(py) {
  const nfd = py.normalize('NFD')
  let tone = '5'
  let base = ''
  for (const ch of nfd) {
    if (TONE_MARKS[ch]) tone = TONE_MARKS[ch]
    else if (ch === '\u0308') base = base.replace(/u$/, 'v')
    else base += ch
  }
  if (!/^[a-zv]+$/.test(base)) throw new Error(`异常拼音: ${py}`)
  return base + ' ' + tone
}

/**
 * 一行文本的槽位。marks 是「字 → 拼音」的表（poems.json 的 ttsPinyin[行]）。
 * 无该行注音、或该行一个字都没注上 → 返回 null（整行走默认读音）。
 */
export function pinyinSlots(line, marks) {
  if (!marks) return null
  const slots = [...line].map((ch) => (marks[ch] ? marks[ch] : null))
  return slots.some((s) => s) ? slots : null
}

/**
 * 整首诗的槽位：必须**逐字符**展开后拼接，null 行按该行字符数占位。
 *
 * 这里是 2026-09-10 那个缺陷的正身：改用 `lines.map(pinyinSlots).flat()` 会让
 * 「整行没注音」的行只贡献 1 个元素（flat 只摊平数组，不补 null），拼接结果比整首
 * 少几十个字符 → buildSsml 的长度校验不过 → 整首退回默认读音，多音字全错。
 *
 * @param {string[]} lines 逐行文本
 * @param {Record<string, Record<string,string>>} ttsPinyin 行 → 字 → 拼音
 */
export function poemFullSlots(lines, ttsPinyin) {
  const marks = ttsPinyin || {}
  const full = []
  for (const line of lines) {
    const lineMarks = marks[line]
    for (const ch of [...line]) full.push(lineMarks && lineMarks[ch] ? lineMarks[ch] : null)
  }
  return full.some(Boolean) ? full : null
}

/**
 * 组装 SSML。<phoneme> 只包非 null 槽位，其余字原样交给语句模型。
 * 槽位长度与文本对不上时整条走默认读音——错位的注音比不注更糟。
 */
export function buildSsml(text, pinyin, voice) {
  const chars = [...text]
  const body =
    pinyin && pinyin.length === chars.length
      ? chars.map((ch, i) => (pinyin[i] ? `<phoneme alphabet="sapi" ph="${toSapi(pinyin[i])}">${ch}</phoneme>` : ch)).join('')
      : text
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="zh-CN"><voice name="${voice}">${body}</voice></speak>`
}

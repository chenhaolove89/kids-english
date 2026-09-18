/**
 * phoneme 槽位展开的回归测试（补 P2 门禁盲区）。
 *
 * 背景：2026-09-10 抓到的缺陷是「整首 phoneme 槽位必须逐字符展开」——用
 * `lines.map(pinyinSlots).flat()` 拼接时，**整行没注音**的行会退化为 null，
 * 而 `flat()` 只摊平数组、不按句长补 null，于是整首槽位比文本短几十个字符。
 * buildSsml 的长度校验因此不过 → 整首诗静默退回默认读音 → 多音字全读错。
 * 当时是靠人工审计发现的，不是门禁。本文件把这段逻辑钉成契约。
 *
 * 第二个契约是**数据**：poems.json 的 ttsPinyin 必须与 lines 逐字对应
 * （键是整行原文、注音字必须真的在该行内），否则注音会静默错位。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSsml, pinyinSlots, poemFullSlots, toSapi } from '../tools/lib/pinyin-slots.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const VOICE = 'zh-CN-XiaoyiNeural'
const phonemeCount = (ssml) => (ssml.match(/<phoneme /g) || []).length
const { poems } = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'poems.json'), 'utf8'))

test('toSapi：音节与声调之间必须有空格，ü 写成 v，无调号按轻声 5', () => {
  assert.equal(toSapi('jiāo'), 'jiao 1')
  assert.equal(toSapi('háng'), 'hang 2')
  assert.equal(toSapi('qū'), 'qu 1')
  assert.equal(toSapi('lǜ'), 'lv 4') // ǜ 分解为 u + 分音符 + 四声
  assert.equal(toSapi('de'), 'de 5')
  assert.throws(() => toSapi('abc!'), /异常拼音/)
})

test('pinyinSlots：整行没注音返回 null，部分注音按字符数展开且长度与文本一致', () => {
  assert.equal(pinyinSlots('曲项向天歌', undefined), null)
  assert.equal(pinyinSlots('曲项向天歌', {}), null)
  assert.equal(pinyinSlots('曲项向天歌', { 曲: null }), null)

  const slots = pinyinSlots('曲项向天歌', { 曲: 'qū' })
  assert.equal(slots.length, 5)
  assert.equal(slots[0], 'qū')
  assert.deepEqual(slots.slice(1), [null, null, null, null])

  // 表里有该行没有的字：忽略，不能撑长槽位
  assert.equal(pinyinSlots('曲项向天歌', { 曲: 'qū', 鹅: 'é' }).length, 5)
})

test('poemFullSlots：未注音的行按整行字符数占位，整首槽位长度等于整首字符数', () => {
  const lines = ['鹅，鹅，鹅，', '曲项向天歌。']
  const full = poemFullSlots(lines, { '曲项向天歌。': { 曲: 'qū' } })
  const firstLen = [...lines[0]].length

  assert.equal(full.length, [...lines.join('')].length)
  // 整行未注音 → 按该行字符数补 null，而不是缩成 1 个（老缺陷正是这里）
  assert.deepEqual(full.slice(0, firstLen), Array(firstLen).fill(null))
  assert.equal(full[firstLen], 'qū')

  assert.equal(poemFullSlots(lines, {}), null)
  assert.equal(poemFullSlots(lines, undefined), null)
})

test('阳性对照：旧 flat() 写法会漏掉未注音行的占位，整首退化成默认读音', () => {
  const lines = ['鹅，鹅，鹅，', '曲项向天歌。']
  const marks = { '曲项向天歌。': { 曲: 'qū' } }
  const text = lines.join('')
  const existing = [...text].length

  // 重构前的写法（缺陷本身）
  const buggy = lines.map((line) => pinyinSlots(line, marks[line])).flat()
  assert.notEqual(buggy.length, existing, 'flat() 写法长度必须对不上——否则本文件抓不住这个缺陷')
  assert.equal(phonemeCount(buildSsml(text, buggy, VOICE)), 0, '长度不符 → 整首退回纯文本（多音字读错）')

  // 现在的写法
  const fixed = poemFullSlots(lines, marks)
  assert.equal(fixed.length, existing)
  assert.equal(phonemeCount(buildSsml(text, fixed, VOICE)), 1)
})

test('buildSsml：槽位与文本长度不符时整条退回纯文本，只包非 null 槽位', () => {
  assert.equal(phonemeCount(buildSsml('曲项向天歌', ['qū'], VOICE)), 0)
  assert.equal(phonemeCount(buildSsml('曲项向天歌', null, VOICE)), 0)

  const ok = buildSsml('曲项向天歌', [null, null, null, null, 'gē'], VOICE)
  assert.equal(phonemeCount(ok), 1)
  assert.match(ok, /<phoneme alphabet="sapi" ph="ge 1">歌<\/phoneme>/)
  assert.match(ok, /曲项向天/)
})

test('数据契约：poems.json 的 ttsPinyin 与 lines 逐字对应，且都能转成 SAPI', () => {
  assert.ok(poems.length > 0)
  let annotated = 0
  let plain = 0

  for (const p of poems) {
    const table = p.ttsPinyin || {}
    const keys = Object.keys(table)
    if (keys.length === 0) plain++
    else annotated++

    for (const line of keys) {
      assert.ok(p.lines.includes(line), `${p.id} 的注音键不是 lines 里的整行：${JSON.stringify(line)}`)
      for (const [ch, py] of Object.entries(table[line] || {})) {
        assert.ok([...line].includes(ch), `${p.id} 行「${line}」里没有要注音的字「${ch}」`)
        assert.doesNotThrow(() => toSapi(py), `${p.id} 的「${ch}」拼音异常：${py}`)
      }
    }

    const full = poemFullSlots(p.lines, p.ttsPinyin)
    if (full) {
      assert.equal(full.length, [...p.lines.join('')].length, `${p.id} 整首槽位长度与文本不符`)
      assert.ok(full.some(Boolean), `${p.id} 整首槽位全为 null 时应当返回 null 走默认读音`)
    }
  }

  // 两条路径都要被真实数据覆盖：整首注音（走 phoneme）与整首默认读音
  assert.ok(annotated > 0, '应当有诗整首走 phoneme')
  assert.ok(plain > 0, '应当有诗整首走默认读音（只有多音字行才注音）')
})

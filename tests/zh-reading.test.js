/**
 * 语文阅读理解：源数据契约 + 篇章逐字注音契约。
 *
 * 注音是这批内容的重点（用户要求「严格注音」）：篇章里凡 pypinyin 词库中多读的字，
 * 都必须在 tools/zh-passage-pinyin.json 里有明确读音，且读音必须是该字的合法读音之一。
 * 这条完整性由 tools/zh_passage_annotate.py --check 执行（它持有词库），本文件调用它，
 * 并另外把「人工校订过的那几处」逐条钉住——机器给的语境读音在这几处是错的，
 * 重新生成时若丢了 OVERRIDES，必须在这里红，而不是让孩子听到错音。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { poemFullSlots, buildSsml, toSapi } from '../tools/lib/pinyin-slots.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = JSON.parse(fs.readFileSync(path.join(ROOT, 'content-packages', 'zh-passages.json'), 'utf8'))
const pinyin = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'zh-passage-pinyin.json'), 'utf8'))
const VOICE = 'zh-CN-XiaoyiNeural'

/** 按「第几次出现」取某行里某个字的读音（与注音器 OVERRIDES 的定位口径一致） */
function readingAt(passageId, lineIndex, ch, occurrence = 1) {
  const line = src.passages.find((p) => p.id === passageId).lines[lineIndex]
  const slots = pinyin[passageId]?.[line]
  if (!slots) return null
  let n = 0
  for (let i = 0; i < line.length; i++) {
    if (line[i] !== ch) continue
    n++
    if (n === occurrence) return slots[i]
  }
  return null
}

test('源数据契约：10 篇、学段与题目结构完整、答案合法且选项不重复', () => {
  assert.equal(src.passages.length, 10)
  const ids = new Set()
  const titles = new Set()
  for (const p of src.passages) {
    assert.match(p.id, /^ps-(g12|g34)-\d+$/)
    assert.ok(['g12', 'g34'].includes(p.stage), `${p.id} 学段非法`)
    assert.ok(!ids.has(p.id) && !titles.has(p.title), `${p.id}/${p.title} 重复`)
    ids.add(p.id)
    titles.add(p.title)
    assert.ok(p.lines.length >= 5, `${p.id} 行数过少`)
    assert.ok(p.lines.every((l) => l.trim().length > 0), `${p.id} 有空行`)
    // 短文长度按学段分档：一二年级 100-150 字，三四年级 280-330 字
    const chars = [...p.lines.join('')].length
    if (p.stage === 'g12') assert.ok(chars >= 90 && chars <= 160, `${p.id} 字数 ${chars} 超出低年级区间`)
    else assert.ok(chars >= 260 && chars <= 340, `${p.id} 字数 ${chars} 超出中年级区间`)
    assert.equal(p.questions.length, 3, `${p.id} 应为 3 题`)
    for (const q of p.questions) {
      assert.ok(q.q && q.q.trim().length >= 4, `${p.id} 题干过短`)
      assert.ok(q.options.length >= 3 && q.options.length <= 4, `${p.id} 选项数应为 3-4`)
      assert.equal(new Set(q.options).size, q.options.length, `${p.id} 选项重复：${q.options.join('/')}`)
      assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length, `${p.id} 答案下标越界`)
      assert.ok(q.point, `${p.id} 缺考点标注`)
      // 干扰项不能与答案同文（否则等于两个正确答案）
      assert.ok(q.options.every((o, i) => i === q.answer || o !== q.options[q.answer]), `${p.id} 有与答案同文的干扰项`)
    }
  }
  // 两个学段各 5 篇
  for (const st of ['g12', 'g34']) {
    assert.equal(src.passages.filter((p) => p.stage === st).length, 5, `${st} 应为 5 篇`)
  }
})

test('注音表形状：槽位与行等长，可拼成整篇 SSML，且 phoneme 落在正确位置', () => {
  for (const p of src.passages) {
    const table = pinyin[p.id]
    assert.ok(table, `${p.id} 缺注音表`)
    for (const line of p.lines) {
      const slots = table[line]
      if (!slots) continue
      assert.equal(slots.length, [...line].length, `${p.id}「${line.slice(0, 12)}…」槽位与行不等长`)
      for (const py of slots) if (py) assert.doesNotThrow(() => toSapi(py), `${p.id} 注音不可转换: ${py}`)
    }
    // 整篇：逐字符展开后长度必须等于整篇字符数（长度不符 buildSsml 会整条退回默认读音）
    const text = p.lines.join('')
    const slots = poemFullSlots(p.lines, table)
    assert.ok(slots, `${p.id} 整篇没有注音`)
    assert.equal(slots.length, [...text].length, `${p.id} 整篇槽位长度与正文不符`)
    const ssml = buildSsml(text, slots, VOICE)
    const n = (ssml.match(/<phoneme /g) || []).length
    assert.ok(n > 0, `${p.id} SSML 里没有 phoneme 标签`)
    // 抽查：注音必须包在被注的那个字上，位置不能错位
    const firstIdx = slots.findIndex(Boolean)
    const ch = [...text][firstIdx]
    assert.ok(ssml.includes(`>${ch}</phoneme>`), `${p.id} phoneme 没有包住对应汉字`)
  }
})

test('一/不 与轻声虚词不注音（变调与轻声交给语句模型，硬标反而错）', () => {
  for (const p of src.passages) {
    for (const line of p.lines) {
      const slots = pinyin[p.id]?.[line]
      if (!slots) continue
      for (let i = 0; i < line.length; i++) {
        if ('一不'.includes(line[i]) || '的了着地得们子个儿吧呢啊呀吗么没'.includes(line[i])) {
          assert.equal(slots[i], null, `${p.id}「${line}」里的「${line[i]}」不该注音`)
        }
      }
    }
  }
})

test('用户实测报的那处：「偏了偏」两处都必须标 piān', () => {
  // 引擎在「V了V」这种重叠结构里自己读错了：第二个「偏」被读成 piàn。
  // 「偏」只有一个读音，按"只注多音字"的老口径根本注不到它——这条就是那次口径缺陷的回归。
  assert.equal(readingAt('ps-g34-1', 5, '偏', 1), 'piān', '「往我这边偏了偏」第一个「偏」')
  assert.equal(readingAt('ps-g34-1', 5, '偏', 2), 'piān', '第二个「偏」曾被引擎读成 piàn')
  assert.equal(readingAt('ps-g34-1', 13, '偏', 1), 'piān', '「往她那边偏了偏」第一个「偏」')
  assert.equal(readingAt('ps-g34-1', 13, '偏', 2), 'piān', '第二个「偏」')
  assert.equal(readingAt('ps-g34-1', 10, '笑', 1), 'xiào', '「她笑了笑」')
  assert.equal(readingAt('ps-g34-1', 10, '笑', 2), 'xiào', '「笑了笑」第二个「笑」')
})

test('轻声位置有意留给引擎，形容词叠词则必须全调标注', () => {
  // 称谓/动词叠词的第二音节是轻声（nǎi nai / bà ba / mō mo），硬标全调比引擎更不标准 → 留空
  assert.equal(readingAt('ps-g12-2', 0, '奶', 2), null, '「奶奶」第二音节留给引擎读轻声')
  assert.equal(readingAt('ps-g12-5', 0, '爸', 2), null, '「爸爸」第二音节留给引擎')
  assert.equal(readingAt('ps-g12-2', 4, '摸', 2), null, '「摸摸」第二音节留给引擎')
  // 形容词/副词叠词标准就是两音节全调，必须自己标（交给引擎是碰运气）
  assert.equal(readingAt('ps-g12-4', 0, '硬', 1), 'yìng', '「硬硬的」第一个')
  assert.equal(readingAt('ps-g12-4', 0, '硬', 2), 'yìng', '「硬硬的」第二个')
  assert.equal(readingAt('ps-g34-5', 1, '卷', 2), 'juǎn', '「卷卷的壳」第二个卷')
  assert.equal(readingAt('ps-g12-5', 7, '直', 2), 'zhí', '「直直地站着」第二个直')
})

test('人工校订的读音逐条钉住（机器给的语境读音在这些地方是错的）', () => {
  // 这些是复核 pypinyin 输出时逐条纠出来的，重新生成注音表时若丢了 OVERRIDES 必须在这里红
  assert.equal(readingAt('ps-g34-5', 1, '背', 1), 'bèi', '「它背上」= bèi')
  assert.equal(readingAt('ps-g34-5', 1, '背', 2), 'bēi', '「背着一个壳」= bēi（动词）')
  assert.equal(readingAt('ps-g34-5', 1, '背', 3), 'bēi', '「像背着一座小房子」= bēi')
  assert.equal(readingAt('ps-g34-5', 1, '卷', 1), 'juǎn', '「卷卷的壳」= juǎn')
  assert.equal(readingAt('ps-g12-3', 5, '倒', 1), 'dǎo', '「镜子倒了」= dǎo')
  assert.equal(readingAt('ps-g12-5', 0, '种', 1), 'zhòng', '「种了一棵小树」= zhòng')
  assert.equal(readingAt('ps-g34-4', 0, '结', 1), 'jiē', '「结出小绒球」= jiē')
  assert.equal(readingAt('ps-g34-3', 5, '缝', 1), 'féng', '「缝了一个袖口」= féng')
  assert.equal(readingAt('ps-g12-4', 4, '落', 1), 'luò', '「从云里落下来」= luò')
  assert.equal(readingAt('ps-g34-2', 3, '落', 1), 'luò', '「翻着跟头落下来」= luò')
})

test('注音完整性与合法性：多音字全覆盖，且读音都是该字的合法读音', () => {
  // 这条由注音器自己执行（它持有 pypinyin 词库）；node 侧复算不出词库，所以调用它。
  // 前置同 gen:zh-pron（python + pypinyin）；缺前置要报错而不是静默跳过。
  let out
  try {
    out = execFileSync('python', [path.join('tools', 'zh_passage_annotate.py'), '--check'], {
      cwd: ROOT,
      encoding: 'utf8',
    })
  } catch (e) {
    throw new Error(`注音自检失败（需要 python + pypinyin，与 gen:zh-pron 同前置）：\n${e.stdout || ''}${e.stderr || e.message}`)
  }
  assert.match(out, /✓ 注音完整/, `注音自检未通过：${out}`)
})

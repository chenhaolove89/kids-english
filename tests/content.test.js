/**
 * 内容目录回归测试：直接校验生成的 src/content/catalog.json 与数据文件的一致性。
 * 防止有人手改生成文件、或数据重生成后目录过期。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'content', 'catalog.json'), 'utf8'))
const words = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'words.json'), 'utf8'))
const hanzi = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'hanzi.json'), 'utf8'))
const source = JSON.parse(fs.readFileSync(path.join(ROOT, 'content-packages', 'curriculum.json'), 'utf8'))

test('目录结构完整：stages/subjects/lessons 与源一致', () => {
  assert.deepEqual(catalog.stages, source.stages)
  assert.deepEqual(catalog.subjects, source.subjects)
  assert.ok(catalog.lessons.length > 0)
  assert.match(catalog.contentVersion, /^[0-9a-f]{10}$/)
})

test('课程 ID 全局唯一且字段齐全', () => {
  const ids = catalog.lessons.map((l) => l.id)
  assert.equal(new Set(ids).size, ids.length, 'ID 不得重复')
  for (const l of catalog.lessons) {
    assert.ok(l.id && l.subject && l.stage && l.kind && l.title && l.ref?.kind, `课程字段齐全: ${l.id}`)
    assert.ok(['learn', 'challenge'].includes(l.kind))
    assert.ok(['available', 'draft'].includes(l.status))
  }
})

test('课程引用可解析：ref 都能落到真实数据', () => {
  const enCats = new Set(words.categories.map((c) => c.id))
  const zhLevels = new Set(hanzi.levels.map((l) => Number(l.id)))
  for (const l of catalog.lessons) {
    const r = l.ref
    if (r.kind === 'en-category') assert.ok(enCats.has(r.id), `${l.id} 引用分类 ${r.id} 不存在`)
    if (r.kind === 'en-level') assert.ok([1, 2, 3, 4].includes(Number(r.id)), `${l.id} 引用级别非法`)
    if (r.kind === 'zh-level') assert.ok(zhLevels.has(Number(r.id)), `${l.id} 引用级别非法`)
    if (r.kind === 'math-level') assert.ok([1, 2, 3, 4].includes(Number(r.id)), `${l.id} 引用级别非法`)
  }
})

test('阶段覆盖：每个阶段都有可用课程；启蒙/低年级三科齐全', () => {
  const stageIds = catalog.stages.map((s) => s.id)
  for (const st of stageIds) {
    const n = catalog.lessons.filter((l) => l.stage === st && l.status === 'available').length
    assert.ok(n > 0, `stage ${st} 无可用课程`)
  }
  for (const st of ['qimeng', 'g12']) {
    for (const subj of ['en', 'zh', 'math']) {
      const n = catalog.lessons.filter((l) => l.stage === st && l.subject === subj && l.status === 'available').length
      assert.ok(n > 0, `stage ${st} 科目 ${subj} 无可用课程`)
    }
  }
})

test('科目映射与源配置一致：难度与年级解耦但映射存在', () => {
  for (const [subj, conf] of Object.entries(source.mapping)) {
    for (const st of Object.values(conf.levelStage)) {
      assert.ok(catalog.stages.some((s) => s.id === st), `${subj} 映射到未知 stage ${st}`)
    }
  }
  // 数学 L2/L3 同属 g12（二十以内属一二年级），这是有意的教学映射
  assert.equal(source.mapping.math.levelStage['2'], source.mapping.math.levelStage['3'])
})

test('语文小短句课：开放级别逐字有例句音，未开放级别一门没有', () => {
  const open = new Set((source.zhSentences?.levels || []).map(Number))
  const sentLessons = catalog.lessons.filter((l) => l.ref?.kind === 'zh-sentences')
  assert.equal(sentLessons.length, open.size, '开放级别数与课程数一致')
  for (const l of sentLessons) {
    assert.equal(l.subject, 'zh')
    assert.equal(l.kind, 'learn')
    assert.ok(open.has(Number(l.ref.id)), `${l.id} 引用了未开放级别`)
    const lv = hanzi.levels.find((x) => Number(x.id) === Number(l.ref.id))
    assert.ok(lv, `${l.id} 引用的级别存在`)
    assert.equal(l.subtitle, `${lv.chars.length} 个句子`, `${l.id} 句数与该级别字数一致`)
    for (const h of lv.chars) {
      assert.ok(h.sentence && h.sentence.includes(h.char), `字 ${h.char} 例句缺失或不含目标字`)
      assert.ok(h.sentenceAudio, `字 ${h.char} 缺例句音字段`)
      const abs = path.join(ROOT, 'src', h.sentenceAudio.replace(/^\//, ''))
      assert.ok(fs.existsSync(abs), `字 ${h.char} 例句音不存在: ${h.sentenceAudio}`)
      assert.ok(fs.statSync(abs).size >= 900, `字 ${h.char} 例句音过小（疑似 TTS 失败）`)
    }
  }
})

test('语文词语课：覆盖分类成对出现、跳过分类一门没有', () => {
  const skip = new Set(source.zhWords?.skipCategories || [])
  const zhLearn = catalog.lessons.filter((l) => l.id.startsWith('zh-words-') && l.kind === 'learn')
  const zhQuiz = catalog.lessons.filter((l) => l.id.startsWith('zh-words-quiz-'))
  const covered = words.categories.filter((c) => !skip.has(c.id))
  assert.equal(zhLearn.length, covered.length, '每个覆盖分类恰一门词语学一学')
  assert.equal(zhQuiz.length, covered.length, '每个覆盖分类恰一门词语挑战')
  for (const l of [...zhLearn, ...zhQuiz]) {
    assert.equal(l.subject, 'zh')
    assert.ok(!skip.has(l.ref.id), `${l.id} 引用了应跳过的分类 ${l.ref.id}`)
    assert.ok(catalog.stages.some((s) => s.id === l.stage), `${l.id} stage 合法`)
  }
})

test('语文词语音频：覆盖分类每词 zhAudio 存在且非空（TTS 失败会产出极小 mp3）', () => {
  const skip = new Set(source.zhWords?.skipCategories || [])
  const covered = words.categories.filter((c) => !skip.has(c.id)).flatMap((c) => c.words)
  assert.ok(covered.length > 1000, `词语课覆盖词数异常: ${covered.length}`)
  for (const w of covered) {
    assert.ok(w.zhAudio, `词 ${w.id} 缺 zhAudio 字段`)
    const abs = path.join(ROOT, 'src', w.zhAudio.replace(/^\//, ''))
    assert.ok(fs.existsSync(abs), `词 ${w.id} 中文配音文件不存在: ${w.zhAudio}`)
    assert.ok(fs.statSync(abs).size >= 900, `词 ${w.id} 中文配音过小（疑似 TTS 失败）: ${w.zhAudio}`)
  }
})

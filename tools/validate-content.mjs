#!/usr/bin/env node
/**
 * 课程内容校验 + 目录打包
 *
 * 源：content-packages/curriculum.json（人工维护的阶段/科目/映射配置）
 *     content-packages/zh-passages.json（人工维护的阅读理解短文源）
 *     src/data/words.json、hanzi.json（gen-assets 工具链生成，禁止手改）
 * 出：src/content/catalog.json（展开后的课程目录，运行时唯一消费入口）
 *     src/data/zhPassages.json（短文的运行时数据，页面 import 这一份）
 *
 * 用法：
 *   node tools/validate-content.mjs           校验并重新生成上面两个产物
 *   node tools/validate-content.mjs --check   只校验；任一产物与源不一致则退出码 1
 *
 * 校验不过任何一条都不写文件、退出码 1。生成的两个 JSON 提交进仓库。
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { writeFileAtomic } from './lib/fs-atomic.mjs'
import { isUsableAsset } from './lib/asset-check.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'content-packages', 'curriculum.json')
const WORDS = path.join(ROOT, 'src', 'data', 'words.json')
const HANZI = path.join(ROOT, 'src', 'data', 'hanzi.json')
const OUT = path.join(ROOT, 'src', 'content', 'catalog.json')

const errors = []
const fail = (msg) => errors.push(msg)

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'))
}

const source = readJson(SRC)
const words = readJson(WORDS)
const hanzi = readJson(HANZI)

// ---------- 基础结构 ----------
const stageIds = new Set((source.stages || []).map((s) => s.id))
if (!source.stages?.length) fail('stages 不能为空')
source.stages?.forEach((s) => {
  if (!s.id || !s.name) fail(`stage 缺 id/name: ${JSON.stringify(s)}`)
  if (typeof s.order !== 'number') fail(`stage ${s.id} 缺 order`)
})
const subjectIds = new Set((source.subjects || []).map((s) => s.id))
if (!['en', 'zh', 'math'].every((id) => subjectIds.has(id))) fail('subjects 必须包含 en/zh/math')

const mapping = source.mapping || {}
for (const subject of ['en', 'zh', 'math']) {
  const m = mapping[subject]
  if (!m?.levelStage) fail(`mapping.${subject}.levelStage 缺失`)
  for (const [lv, st] of Object.entries(m.levelStage || {})) {
    if (!stageIds.has(st)) fail(`mapping.${subject} level ${lv} 指向未知 stage ${st}`)
  }
}

const configuredStatuses = source.lessonStatus || {}
if (!configuredStatuses || typeof configuredStatuses !== 'object' || Array.isArray(configuredStatuses)) {
  fail('lessonStatus 必须是「课程 ID → available/draft」对象')
}
for (const [id, status] of Object.entries(configuredStatuses)) {
  if (!['available', 'draft'].includes(status)) fail(`课程 ${id} lessonStatus 非法: ${status}`)
}

// ---------- 展开课程 ----------
const lessons = []
const seenIds = new Set()
const pushLesson = (l) => {
  if (!l.id || seenIds.has(l.id)) fail(`课程 ID 缺失或重复: ${l.id}`)
  if (l.id) seenIds.add(l.id)
  if (!stageIds.has(l.stage)) fail(`课程 ${l.id} stage 非法: ${l.stage}`)
  if (!['learn', 'challenge'].includes(l.kind)) fail(`课程 ${l.id} kind 非法: ${l.kind}`)
  if (!l.ref?.kind) fail(`课程 ${l.id} 缺 ref`)
  const status = configuredStatuses[l.id] ?? l.status ?? 'available'
  if (!['available', 'draft'].includes(status)) fail(`课程 ${l.id} status 非法: ${status}`)
  const normalized = { status: 'available', ...l }
  normalized.status = status
  lessons.push(normalized)
}

const enCatById = new Map(words.categories.map((c) => [c.id, c]))
const enLevelById = new Map(words.levels.map((l) => [l.id, l]))
const zhLevelById = new Map(hanzi.levels.map((l) => [l.id, l]))

// 英语：每个分类一条「学一学」课；每个级别一条「挑战」课
for (const c of words.categories) {
  const stage = mapping.en.levelStage[String(c.level)]
  if (!stage) { fail(`英语分类 ${c.id} level ${c.level} 无 stage 映射`); continue }
  if (!c.words?.length) fail(`英语分类 ${c.id} 词数为空`)
  c.words?.forEach((w) => {
    if (!w.id || !w.audio || !w.image) fail(`英语分类 ${c.id} 的词 ${w.id} 缺 id/audio/image`)
    // 资产必须真实存在且大小写精确一致（Windows 不分区大小写会掩盖 404，Linux/CDN 上必炸）
    for (const [label, p] of [['audio', w.audio], ['image', w.image]]) {
      if (!p) continue
      const abs = path.join(ROOT, 'src', p.replace(/^\//, ''))
      if (!fs.existsSync(abs)) { fail(`词 ${w.id} ${label} 不存在: ${p}`); continue }
      const real = fs.readdirSync(path.dirname(abs)).find((f) => f === path.basename(abs))
      if (real === undefined) fail(`词 ${w.id} ${label} 大小写不匹配: ${p}（磁盘无精确同名文件）`)
    }
  })
  pushLesson({
    id: `en-learn-${c.id}`,
    subject: 'en',
    stage,
    kind: 'learn',
    title: `${c.zh} · ${c.en}`,
    subtitle: `${c.words?.length || 0} 个单词`,
    icon: c.icon,
    color: c.color,
    bg: c.bg,
    sort: c.id,
    ref: { kind: 'en-category', id: c.id },
    skillIds: [`en-word-${c.id}`],
  })
}
for (const lv of [1, 2, 3, 4]) {
  const stage = mapping.en.levelStage[String(lv)]
  const meta = enLevelById.get(lv) || {}
  if (!stage) { fail(`英语级别 ${lv} 无 stage 映射`); continue }
  pushLesson({
    id: `en-quiz-l${lv}`,
    subject: 'en',
    stage,
    kind: 'challenge',
    title: `${mapping.en.levelLabel[String(lv)] || meta.zh || '词汇'}挑战`,
    subtitle: '听音选图 · 10 题',
    icon: meta.icon || '/static/img/level-1.png',
    color: meta.color || '#FF8C42',
    bg: meta.bg || '#FFF3E4',
    sort: `l${lv}`,
    ref: { kind: 'en-level', id: lv },
    skillIds: [`en-word-l${lv}`],
  })
}

// 语文：每个级别「学一学」+「挑战」（级名本身含「挑战」时不再追加，避免「挑战进阶挑战」）
const quizTitle = (name) => (name.includes('挑战') ? name : `${name}挑战`)
for (const lv of hanzi.levels) {
  const stage = mapping.zh.levelStage[String(lv.id)]
  if (!stage) { fail(`语文级别 ${lv.id} 无 stage 映射`); continue }
  if (!lv.chars?.length) fail(`语文级别 ${lv.id} 字数为空`)
  pushLesson({
    id: `zh-learn-l${lv.id}`,
    subject: 'zh',
    stage,
    kind: 'learn',
    title: lv.zh,
    subtitle: `${lv.chars.length} 个汉字`,
    icon: lv.icon,
    color: lv.color,
    bg: lv.bg,
    sort: `l${lv.id}`,
    ref: { kind: 'zh-level', id: lv.id },
    skillIds: [`zh-char-l${lv.id}`],
  })
  pushLesson({
    id: `zh-quiz-l${lv.id}`,
    subject: 'zh',
    stage,
    kind: 'challenge',
    title: quizTitle(lv.zh),
    subtitle: '混合题型 · 10 题',
    icon: lv.icon,
    color: lv.color,
    bg: lv.bg,
    sort: `l${lv.id}`,
    ref: { kind: 'zh-level', id: lv.id },
    skillIds: [`zh-char-l${lv.id}`],
  })
}

// 语文小短句：只念例句、不混排字词的独立卡片。开放级别配置在 curriculum.zhSentences
// （目前只开启蒙 level 1），数据源是 hanzi 每字的 sentence/sentenceAudio/sentenceEmoji
// （tools/hanzi-sentences.csv + tools/hanzi-sentence-emoji.csv + Azure 音轨）。
// 英语句子层（tools/en-sentences.csv → src/data/enSentences.json，由 npm run gen:assets 生成）。
// 每个有句子的阶段一张「学一学」课卡；句音走主音频目录（美音 audio/、英音 audio-gb/），
// 中文释义音走 audio-zh/，所以口音切换、音量表、资源审计都复用现有机制。
const EN_SENTENCES_FILE = path.join(ROOT, 'src', 'data', 'enSentences.json')
const enSentences = fs.existsSync(EN_SENTENCES_FILE) ? (readJson(EN_SENTENCES_FILE).sentences || []) : []
const enSentenceStages = new Set(enSentences.map((x) => x.stage))
for (const stage of enSentenceStages) {
  const list = enSentences.filter((x) => x.stage === stage)
  for (const x of list) {
    const abs = (p2) => path.join(ROOT, 'src', p2.replace(/^\//, ''))
    for (const [label, p2] of [['句图', x.image], ['句音(美)', x.audio], ['中文释义音', x.zhAudio]]) {
      if (!fs.existsSync(abs(p2))) fail(`英语句子 ${x.id} ${label}不存在: ${p2}`)
    }
    const gb = x.audio.replace('/audio/', '/audio-gb/')
    if (!fs.existsSync(abs(gb))) fail(`英语句子 ${x.id} 英式句音不存在: ${gb}`)
  }
  pushLesson({
    id: `en-sentences-${stage}`,
    subject: 'en',
    stage,
    kind: 'learn',
    // 标题按学段区分，和用户定的阶梯一致（一二=小短句 / 三四=稍长句 / 五六=长句）
    title: `英语${stage === 'g12' ? '小短句' : stage === 'g34' ? '稍长句' : '长句'}`,
    subtitle: `${list.length} 个句子`,
    icon: '/static/img/cat-sentences.png',
    color: '#0CA678',
    bg: '#E0F5EC',
    // 排在同阶段分类课之后：词 → 句 的难度递进
    sort: 'zz-en-sentences',
    ref: { kind: 'en-sentences', id: stage },
    skillIds: [`en-sentence-${stage}`],
  })
}

const sentenceLevels = new Set((source.zhSentences?.levels || []).map(Number))
for (const lv of hanzi.levels) {
  if (!sentenceLevels.has(Number(lv.id))) continue
  const stage = mapping.zh.levelStage[String(lv.id)]
  if (!stage) { fail(`语文级别 ${lv.id} 无 stage 映射`); continue }
  const chars = lv.chars.filter((h) => h.sentence && h.sentenceAudio && h.sentenceEmoji)
  if (chars.length !== lv.chars.length) {
    fail(`语文级别 ${lv.id} 有 ${lv.chars.length - chars.length} 个字缺例句/例句音/句意图（小短句课要求逐字齐全）`)
    continue
  }
  for (const h of chars) {
    for (const [label, p] of [['例句音', h.sentenceAudio], ['句意图', h.sentenceEmoji]]) {
      const abs = path.join(ROOT, 'src', p.replace(/^\//, ''))
      if (!fs.existsSync(abs)) { fail(`字 ${h.char} ${label}不存在: ${p}`); continue }
      const real = fs.readdirSync(path.dirname(abs)).find((f) => f === path.basename(abs))
      if (real === undefined) fail(`字 ${h.char} ${label}大小写不匹配: ${p}`)
    }
  }
  pushLesson({
    id: `zh-sentences-l${lv.id}`,
    subject: 'zh',
    stage,
    kind: 'learn',
    title: `小短句 · ${lv.zh}`,
    subtitle: `${chars.length} 个句子`,
    icon: '/static/img/cat-sentences.png',
    color: '#8A6BD1',
    bg: '#F1ECFB',
    // 排序落在识字课与词语课之后：字 → 词 → 句 的难度递进
    sort: 'zz-sentences',
    ref: { kind: 'zh-sentences', id: lv.id },
    skillIds: [`zh-sentence-l${lv.id}`],
  })
}

// 古诗点读：诗目在 src/data/poems.json 手工维护（data 目录里唯一的非生成文件，
// 无生成器会覆盖它；改诗必须重走文本审计门禁）。
// 每个有诗的阶段一张「学一学」课卡；句音/整首音按命名约定落到 static/audio-poem/，
// 这里逐条校验存在性。文本经两轮独立审计（2026-09-10），改诗必须重走审计门禁。
const POEMS_FILE = path.join(ROOT, 'src', 'data', 'poems.json')
const poemStageIds = new Set()
if (fs.existsSync(POEMS_FILE)) {
  const poemsSource = readJson(POEMS_FILE).poems || []
  const seenPoems = new Set()
  const byStage = new Map()
  const LINE_OK = /^[\u4e00-\u9fff][\u4e00-\u9fff，。！？、]*[\u4e00-\u9fff，。！？]$/
  for (const p of poemsSource) {
    if (!p.id || !/^[a-z0-9-]+$/.test(p.id)) { fail(`古诗 id 非法: ${p.id}`); continue }
    if (seenPoems.has(p.id)) { fail(`古诗 id 重复: ${p.id}`); continue }
    seenPoems.add(p.id)
    if (!p.title || !String(p.title).trim()) fail(`古诗 ${p.id} 缺标题`)
    if (!!p.author !== !!p.dynasty) fail(`古诗 ${p.id} author/dynasty 必须同时有或同时无（教材不署名的整组留空）`)
    if (!stageIds.has(p.stage)) { fail(`古诗 ${p.id} stage 非法: ${p.stage}`); continue }
    if (!Array.isArray(p.lines) || p.lines.length < 2 || p.lines.length > 8) { fail(`古诗 ${p.id} 行数异常: ${p.lines?.length}`); continue }
    p.lines.forEach((line, i) => {
      if (typeof line !== 'string' || !LINE_OK.test(line)) fail(`古诗 ${p.id} 第 ${i + 1} 句含非法字符或格式异常: ${line}`)
    })
    // 音轨命名约定：{id}-full.mp3 + {id}-l{行号}.mp3（gen-zh-azure --poems 生成）
    const audioPaths = [`/static/audio-poem/${p.id}-full.mp3`, ...p.lines.map((_, i) => `/static/audio-poem/${p.id}-l${i}.mp3`)]
    for (const ap of audioPaths) {
      const abs = path.join(ROOT, 'src', ap.replace(/^\//, ''))
      if (!fs.existsSync(abs)) { fail(`古诗 ${p.title} 音轨不存在: ${ap}（先跑 node tools/gen-zh-azure.mjs --poems）`); continue }
      const real = fs.readdirSync(path.dirname(abs)).find((f) => f === path.basename(abs))
      if (real === undefined) fail(`古诗 ${p.title} 音轨大小写不匹配: ${ap}`)
    }
    // phoneme 标注：key 必须与某行全文一致，标注字必须在行内，拼音只允许字母+声调符号
    for (const [lineText, marks] of Object.entries(p.ttsPinyin || {})) {
      if (!p.lines.includes(lineText)) { fail(`古诗 ${p.id} ttsPinyin key 与任何一句都不匹配: ${lineText}`); continue }
      for (const [ch, py] of Object.entries(marks)) {
        if (!lineText.includes(ch)) fail(`古诗 ${p.id} ttsPinyin 标注字不在句中: ${ch}`)
        if (!/^[a-zǎáàāěéèēǐíìīǒóòōǔúùūǘǚǜü]+$/i.test(py)) fail(`古诗 ${p.id} ttsPinyin 拼音格式异常: ${ch}=${py}`)
      }
    }
    if (!byStage.has(p.stage)) byStage.set(p.stage, [])
    byStage.get(p.stage).push(p)
  }
  for (const [stage, list] of byStage) {
    poemStageIds.add(stage)
    pushLesson({
      id: `zh-poem-${stage}`,
      subject: 'zh',
      stage,
      kind: 'learn',
      title: '必背古诗 · 点读',
      subtitle: `${list.length} 首`,
      icon: '/static/img/hz-8bd7.png',
      color: '#B4532A',
      bg: '#F9EDE4',
      // 排序落在识字/词语/小短句之后：字 → 词 → 句 → 篇
      sort: 'zz-poem',
      ref: { kind: 'zh-poem', id: stage },
      skillIds: [`zh-poem-${stage}`],
    })
  }
}

// ---------- 语文阅读理解短文 ----------
// 源：content-packages/zh-passages.json（人工维护的唯一真源），逐字注音在
// tools/zh-passage-pinyin.json，整篇朗读音轨按命名约定落到 static/audio-zh/<id>.mp3。
// 这批内容此前只被音频生成器引用，没有任何门禁看着它：改了源忘重生成音轨、
// 答案不在选项里（机器判题只比 id，会变成没有正确答案的死题）都会静默上线。
// 课卡照古诗的做法：每个开放学段一张（开放哪些学段配在 curriculum.zhPassages.stages），
// 启蒙/五六年级没有短文就不建课卡——免得课程地图上出现点不开的卡。
const PASSAGES = path.join(ROOT, 'content-packages', 'zh-passages.json')
const PASSAGE_PINYIN = path.join(ROOT, 'tools', 'zh-passage-pinyin.json')
const PASSAGES_OUT = path.join(ROOT, 'src', 'data', 'zhPassages.json')
const passagesSrc = readJson(PASSAGES)
const passagePinyin = readJson(PASSAGE_PINYIN)
const passageIds = new Set()
const passageByStage = new Map()
for (const p of passagesSrc.passages || []) {
  const tag = `短文 ${p.id}`
  if (!p.id || passageIds.has(p.id)) fail(`${tag} id 缺失或重复`)
  passageIds.add(p.id)
  if (!stageIds.has(p.stage)) fail(`${tag} stage 非法: ${p.stage}`)
  if (!p.title || !p.kind) fail(`${tag} 缺 title/kind`)
  if (!p.lines?.length) fail(`${tag} 正文为空`)
  const qs = p.questions || []
  if (qs.length !== 3) fail(`${tag} 必须恰好 3 道题（现 ${qs.length}）`)
  qs.forEach((q, i) => {
    const qt = `${tag} 第 ${i + 1} 题`
    if (!q.q) fail(`${qt} 缺题干`)
    const opts = q.options || []
    if (opts.length < 2) fail(`${qt} 选项少于 2 个`)
    if (new Set(opts).size !== opts.length) fail(`${qt} 选项有重复`)
    // answer 是 0 基下标，不是选项文本：越界等于这道题没有正确答案，孩子怎么点都错
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= opts.length) {
      fail(`${qt} answer 越界或不是下标: ${JSON.stringify(q.answer)}（选项 ${opts.length} 个）`)
    }
    if (!q.point) fail(`${qt} 缺考点标注`)
  })
  // 整篇朗读音轨：由 gen-zh-azure --passages 产出；缺了孩子只能干读
  const audio = path.join(ROOT, 'src', 'static', 'audio-zh', `${p.id}.mp3`)
  if (!fs.existsSync(audio)) fail(`${tag} 缺整篇朗读音轨: static/audio-zh/${p.id}.mp3`)
  else if (!isUsableAsset(audio, 'audio')) fail(`${tag} 音轨不可用（空文件或合成中断的半截）: ${p.id}.mp3`)
  // 注音表按行给槽位数组，长度必须等于该行字符数：对不上整条退回默认读音，多音字全错
  const table = passagePinyin[p.id]
  if (!table) fail(`${tag} 注音表里没有这一篇（跑 npm run gen:zh-passage）`)
  else {
    for (const line of p.lines) {
      const slots = table[line]
      if (!Array.isArray(slots)) {
        fail(`${tag} 注音表缺行或不是槽位数组: ${line.slice(0, 12)}…`)
        continue
      }
      if (slots.length !== [...line].length) {
        fail(`${tag} 注音槽位数与行字符数不符: ${slots.length} vs ${[...line].length}（${line.slice(0, 12)}…）`)
      }
    }
  }
  if (!passageByStage.has(p.stage)) passageByStage.set(p.stage, [])
  passageByStage.get(p.stage).push(p)
}

const passageStageIds = new Set()
for (const stage of (source.zhPassages?.stages || []).map(String)) {
  if (!stageIds.has(stage)) {
    fail(`zhPassages.stages 里有未知学段: ${stage}`)
    continue
  }
  const list = passageByStage.get(stage) || []
  if (!list.length) {
    fail(`zhPassages.stages 声明了 ${stage}，但这一学段一篇短文都没有`)
    continue
  }
  passageStageIds.add(stage)
  pushLesson({
    id: `zh-passage-${stage}`,
    subject: 'zh',
    stage,
    kind: 'learn',
    title: '阅读理解 · 读短文',
    subtitle: `${list.length} 篇短文`,
    icon: '/static/img/hz-8bfb.png',
    color: '#2F8F5B',
    bg: '#E3F6E8',
    // 排序落在识字/词语/小短句之后：字 → 词 → 句 → 篇 的难度递进
    sort: 'zzz-passage',
    ref: { kind: 'zh-passage', id: stage },
    skillIds: [`zh-passage-${stage}`],
  })
}

// 语文词语课：复用英语分类的图片与中文释义做「看图识词」。
// 英语教学构词类（字母/Sight words/词族/拼读/介词/会话）不进中文课，取舍配置在 curriculum.zhWords
const zhSkip = new Set(source.zhWords?.skipCategories || [])
for (const c of words.categories) {
  if (zhSkip.has(c.id)) continue
  const stage = mapping.zh.levelStage[String(c.level)]
  if (!stage) { fail(`语文词语分类 ${c.id} level ${c.level} 无 stage 映射`); continue }
  if (!c.words?.length) fail(`语文词语分类 ${c.id} 词数为空`)
  c.words?.forEach((w) => {
    if (!w.zh || !w.zh.trim()) { fail(`语文词语分类 ${c.id} 的词 ${w.id} 缺中文释义`); return }
    if (!w.zhAudio) { fail(`语文词语分类 ${c.id} 的词 ${w.id} 缺 zhAudio（检查 gen-assets 与 curriculum.zhWords 是否一致）`); return }
    const abs = path.join(ROOT, 'src', w.zhAudio.replace(/^\//, ''))
    if (!fs.existsSync(abs)) { fail(`词 ${w.id} zhAudio 不存在: ${w.zhAudio}（先跑 npm run gen:learn-zh）`); return }
    const real = fs.readdirSync(path.dirname(abs)).find((f) => f === path.basename(abs))
    if (real === undefined) fail(`词 ${w.id} zhAudio 大小写不匹配: ${w.zhAudio}`)
  })
  pushLesson({
    id: `zh-words-${c.id}`,
    subject: 'zh',
    stage,
    kind: 'learn',
    title: `词语 · ${c.zh}`,
    subtitle: `${c.words?.length || 0} 个词语`,
    icon: c.icon,
    color: c.color,
    bg: c.bg,
    sort: `zw-${c.id}`,
    ref: { kind: 'en-category', id: c.id },
    skillIds: [`zh-word-${c.id}`],
  })
  pushLesson({
    id: `zh-words-quiz-${c.id}`,
    subject: 'zh',
    stage,
    kind: 'challenge',
    title: `${c.zh}词语挑战`,
    subtitle: '听音识图 · 10 题',
    icon: c.icon,
    color: c.color,
    bg: c.bg,
    sort: `zw-${c.id}`,
    ref: { kind: 'en-category', id: c.id },
    skillIds: [`zh-word-${c.id}`],
  })
}

// 数学：每个级别一条「练习」课（生成器型，运行时按参数出题）
// name/color/bg 必须与 src/domain/mathgen.js 的 MATH_LEVELS 逐字一致（tests/content.test.js 钉住这份契约）；
// 这里另外给出课程卡片的副标题与关卡图标。
const MATH_LEVELS = {
  1: { name: '认识数字', desc: '点数、听音认数、找规律', color: '#3BB273', bg: '#E3F6E8', icon: '/static/img/level-1.png' },
  2: { name: '十以内加减', desc: '看图数一数，算一算', color: '#4D96FF', bg: '#E3EEFF', icon: '/static/img/level-2.png' },
  3: { name: '二十以内', desc: '进位加减、比大小、找搭档', color: '#FF8C42', bg: '#FFEDD9', icon: '/static/img/level-3.png' },
  4: { name: '乘除进阶', desc: '乘法口诀、平均分', color: '#9B5DE5', bg: '#F0E6FB', icon: '/static/img/level-4.png' },
  5: { name: '万以内加减', desc: '三位数加减、填空', color: '#12B886', bg: '#E2F6EF', icon: '/static/img/level-5.png' },
  6: { name: '小数与分数', desc: '小数加减、同分母分数', color: '#D6336C', bg: '#FBE3EC', icon: '/static/img/level-6.png' },
  7: { name: '图形规律', desc: '看图找规律，接下一个', color: '#E8A33D', bg: '#FCF1DD', icon: '/static/img/level-7.png' },
  8: { name: '应用题', desc: '读一读小故事，算一算', color: '#5C7CFA', bg: '#E8EDFF', icon: '/static/img/level-8.png' },
  9: { name: '四则混合', desc: '先乘除，有括号先算', color: '#0CA678', bg: '#E0F5EC', icon: '/static/img/level-9.png' },
  10: { name: '认识形状', desc: '找一样的、找不同', color: '#845EF7', bg: '#EFE9FE', icon: '/static/img/level-10.png' },
  11: { name: '认识时间', desc: '看钟面说时间、按时间找钟面', color: '#F76707', bg: '#FFEDE0', icon: '/static/img/level-11.png' },
  12: { name: '长度与测量', desc: '填对长度单位、米和厘米换一换', color: '#0B7285', bg: '#E0F3F6', icon: '/static/img/level-12.png' },
  13: { name: '周长与面积', desc: '长方形和正方形的周长、面积', color: '#C2255C', bg: '#FCE4EE', icon: '/static/img/level-13.png' },
  14: { name: '分数初步', desc: '几分之几、同分母减法', color: '#E8590C', bg: '#FDEBE0', icon: '/static/img/level-14.png' },
  15: { name: '百分数与比例', desc: '求百分之几、按比分一分', color: '#5F3DC4', bg: '#EBE6FB', icon: '/static/img/level-15.png' },
  16: { name: '统计与数据', desc: '算平均数、比一比谁最多', color: '#087F5B', bg: '#DFF3EC', icon: '/static/img/level-16.png' },
}
const MATH_LEVEL_IDS = Object.keys(MATH_LEVELS).map(Number)
for (const [lv, meta] of Object.entries(MATH_LEVELS)) {
  const stage = mapping.math.levelStage[String(lv)]
  if (!stage) { fail(`数学级别 ${lv} 无 stage 映射`); continue }
  pushLesson({
    id: `math-practice-l${lv}`,
    subject: 'math',
    stage,
    kind: 'challenge',
    title: meta.name,
    subtitle: meta.desc,
    icon: meta.icon,
    color: meta.color,
    bg: meta.bg,
    // 两位补零：'l10' 按字典序会排到 'l2' 前面，数学关卡顺序（= 解锁路径）会整体错位
    sort: `l${String(lv).padStart(2, '0')}`,
    ref: { kind: 'math-level', id: Number(lv) },
    skillIds: [`math-l${lv}`],
  })
}

// 引用完整性：ref 必须能在数据里解析
for (const l of lessons) {
  const r = l.ref
  if (r.kind === 'en-category' && !enCatById.has(r.id)) fail(`课程 ${l.id} 引用不存在的分类 ${r.id}`)
  if (r.kind === 'en-level' && !enLevelById.has(Number(r.id))) fail(`课程 ${l.id} 引用不存在的英语级别 ${r.id}`)
  if (r.kind === 'zh-level' && !zhLevelById.has(Number(r.id))) fail(`课程 ${l.id} 引用不存在的语文级别 ${r.id}`)
  if (r.kind === 'zh-sentences' && !zhLevelById.has(Number(r.id))) fail(`课程 ${l.id} 引用不存在的语文级别 ${r.id}`)
  if (r.kind === 'zh-poem' && !poemStageIds.has(r.id)) fail(`课程 ${l.id} 引用不存在的古诗阶段 ${r.id}`)
  if (r.kind === 'zh-passage' && !passageStageIds.has(r.id)) fail(`课程 ${l.id} 引用不存在（或未开放）的短文阶段 ${r.id}`)
  if (r.kind === 'math-level' && !MATH_LEVEL_IDS.includes(Number(r.id))) fail(`课程 ${l.id} 引用不存在的数学级别 ${r.id}`)
}

for (const id of Object.keys(configuredStatuses)) {
  if (!seenIds.has(id)) fail(`lessonStatus 引用了不存在的课程 ${id}`)
}

// 每个 stage 至少要有一科可用，否则映射一定配错了
for (const st of source.stages) {
  const n = lessons.filter((l) => l.stage === st.id && l.status === 'available').length
  if (n === 0) fail(`stage ${st.id} 没有任何可用课程`)
}

// ---------- 语文阅读理解短文 ----------
// （校验与课卡生成见上方「语文阅读理解短文」段：课卡要在引用完整性检查之前进 lessons）

if (errors.length) {
  console.error(`✗ 课程内容校验失败（${errors.length} 处）：`)
  errors.forEach((e) => console.error('  - ' + e))
  process.exit(1)
}

// ---------- 打包 ----------
/**
 * 规范化 JSON：对象键排序后序列化。
 * 只为了「同样内容 → 同样字符串」，这样 contentVersion 不会因为键顺序或重跑而变。
 */
function canonicalJson(v) {
  if (Array.isArray(v)) return '[' + v.map(canonicalJson).join(',') + ']'
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonicalJson(v[k])).join(',') + '}'
  }
  return JSON.stringify(v === undefined ? null : v)
}

/**
 * contentVersion 必须只由**内容**决定，不能掺墙钟时间。
 * 原实现用 `words.generatedAt`（每次 gen:assets 都写新的当前时间），于是
 * 「什么都没改、只是重跑了一次生成」也会让版本变化 → SW 缓存代次整代失效
 * → 客户端把全部音频图片重新下一遍（真金白银的流量，且与"增量生成"的承诺相反）。
 */
const contentVersion = crypto
  .createHash('sha1')
  .update(`${canonicalJson(words)}|${canonicalJson(hanzi)}|${canonicalJson(source)}|${canonicalJson(lessons)}|${canonicalJson(passagesSrc)}`)
  .digest('hex')
  .slice(0, 10)

// 排序：阶段先后 → 科目 → 学一学在挑战前 → 级别/分类
const KIND_RANK = { learn: 0, challenge: 1 }
for (const l of lessons) {
  l.stageOrder = source.stages.find((s) => s.id === l.stage)?.order ?? 0
}
lessons.sort((a, b) =>
  a.stageOrder - b.stageOrder ||
  a.subject.localeCompare(b.subject) ||
  KIND_RANK[a.kind] - KIND_RANK[b.kind] ||
  String(a.sort).localeCompare(String(b.sort)) ||
  a.id.localeCompare(b.id),
)
for (const l of lessons) delete l.stageOrder

const catalog = {
  // 必须可复现：--check 靠全文比对判断目录是否过期，禁止写墙钟时间。
  // contentVersion 同样只由内容决定（见上），所以「内容没变 → 版本不变 → 客户端不重下」。
  contentVersion,
  stages: source.stages,
  subjects: source.subjects,
  lessons,
}

const emitted = JSON.stringify(catalog, null, 2) + '\n'

/**
 * 短文运行时数据：页面只 import 这一份（与 poems.json 同构，双引号字符串，
 * 发布脚本改 /static/ 时能命中）。真源仍是 content-packages/zh-passages.json——
 * 页面直接 import 源文件会让「改了源忘了重新校验」无法被发现。
 * note/stages 是给维护者看的，不进产物。
 */
const passagesEmitted = JSON.stringify({ version: passagesSrc.version || 1, passages: passagesSrc.passages }, null, 2) + '\n'

/** 读已有产物并归一化行尾：Windows 下 core.autocrlf=true 检出会把 LF 转成 CRLF */
function readNormalized(p) {
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n') : ''
}

if (process.argv.includes('--check')) {
  if (readNormalized(OUT) !== emitted) {
    console.error('✗ src/content/catalog.json 与课程源不一致，请运行 npm run build:content')
    process.exit(1)
  }
  if (readNormalized(PASSAGES_OUT) !== passagesEmitted) {
    console.error('✗ src/data/zhPassages.json 与短文源不一致，请运行 npm run build:content')
    process.exit(1)
  }
  console.log(`✓ 内容校验通过（check）：${lessons.length} 门课，contentVersion ${contentVersion}`)
  process.exit(0)
}

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.mkdirSync(path.dirname(PASSAGES_OUT), { recursive: true })
// 原子写入：中途失败不留半截 JSON（半截目录会让运行时的课程数据整体 fallback 为空）
writeFileAtomic(OUT, emitted)
writeFileAtomic(PASSAGES_OUT, passagesEmitted)
console.log(`✓ 内容校验通过，已生成 src/content/catalog.json：${lessons.length} 门课，contentVersion ${contentVersion}`)

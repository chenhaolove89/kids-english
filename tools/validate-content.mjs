#!/usr/bin/env node
/**
 * 课程内容校验 + 目录打包
 *
 * 源：content-packages/curriculum.json（人工维护的阶段/科目/映射配置）
 *     src/data/words.json、hanzi.json（gen-assets 工具链生成，禁止手改）
 * 出：src/content/catalog.json（展开后的课程目录，运行时唯一消费入口）
 *
 * 用法：
 *   node tools/validate-content.mjs           校验并重新生成 catalog.json
 *   node tools/validate-content.mjs --check   只校验；catalog 与源不一致则退出码 1
 *
 * 校验不过任何一条都不写文件、退出码 1。生成的 catalog.json 提交进仓库。
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

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

// ---------- 展开课程 ----------
const lessons = []
const seenIds = new Set()
const pushLesson = (l) => {
  if (!l.id || seenIds.has(l.id)) fail(`课程 ID 缺失或重复: ${l.id}`)
  if (l.id) seenIds.add(l.id)
  if (!stageIds.has(l.stage)) fail(`课程 ${l.id} stage 非法: ${l.stage}`)
  if (!['learn', 'challenge'].includes(l.kind)) fail(`课程 ${l.id} kind 非法: ${l.kind}`)
  if (!l.ref?.kind) fail(`课程 ${l.id} 缺 ref`)
  if (l.status && !['available', 'draft'].includes(l.status)) fail(`课程 ${l.id} status 非法: ${l.status}`)
  lessons.push({ status: 'available', ...l })
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
// （目前只开启蒙 level 1），数据源是 hanzi 每字的 sentence/sentenceAudio
// （tools/hanzi-sentences.csv + Azure 音轨）。
const sentenceLevels = new Set((source.zhSentences?.levels || []).map(Number))
for (const lv of hanzi.levels) {
  if (!sentenceLevels.has(Number(lv.id))) continue
  const stage = mapping.zh.levelStage[String(lv.id)]
  if (!stage) { fail(`语文级别 ${lv.id} 无 stage 映射`); continue }
  const chars = lv.chars.filter((h) => h.sentence && h.sentenceAudio)
  if (chars.length !== lv.chars.length) {
    fail(`语文级别 ${lv.id} 有 ${lv.chars.length - chars.length} 个字缺例句或例句音（小短句课要求逐字齐全）`)
    continue
  }
  for (const h of chars) {
    const abs = path.join(ROOT, 'src', h.sentenceAudio.replace(/^\//, ''))
    if (!fs.existsSync(abs)) { fail(`字 ${h.char} 例句音不存在: ${h.sentenceAudio}（先跑 npm run gen:zh-azure）`); continue }
    const real = fs.readdirSync(path.dirname(abs)).find((f) => f === path.basename(abs))
    if (real === undefined) fail(`字 ${h.char} 例句音大小写不匹配: ${h.sentenceAudio}`)
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
const MATH_LEVELS = {
  1: { name: '认识数字', desc: '点数、听音认数、找规律', color: '#3BB273', bg: '#E3F6E8', icon: '/static/img/level-1.png' },
  2: { name: '十以内加减', desc: '看图数一数，算一算', color: '#4D96FF', bg: '#E3EEFF', icon: '/static/img/level-2.png' },
  3: { name: '二十以内', desc: '进位加减、比大小、找搭档', color: '#FF8C42', bg: '#FFEDD9', icon: '/static/img/level-3.png' },
  4: { name: '乘除进阶', desc: '乘法口诀、平均分', color: '#9B5DE5', bg: '#F0E6FB', icon: '/static/img/level-4.png' },
}
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
    sort: `l${lv}`,
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
  if (r.kind === 'math-level' && ![1, 2, 3, 4].includes(Number(r.id))) fail(`课程 ${l.id} 引用不存在的数学级别 ${r.id}`)
}

// 每个 stage 至少要有一科可用，否则映射一定配错了
for (const st of source.stages) {
  const n = lessons.filter((l) => l.stage === st.id && l.status === 'available').length
  if (n === 0) fail(`stage ${st.id} 没有任何可用课程`)
}

if (errors.length) {
  console.error(`✗ 课程内容校验失败（${errors.length} 处）：`)
  errors.forEach((e) => console.error('  - ' + e))
  process.exit(1)
}

// ---------- 打包 ----------
const contentVersion = crypto
  .createHash('sha1')
  .update(`${words.generatedAt}|${hanzi.generatedAt}|${source.version}|${lessons.length}`)
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
  // 必须可复现：--check 靠全文比对判断目录是否过期，禁止写墙钟时间
  generatedAt: words.generatedAt && words.generatedAt >= (hanzi.generatedAt || '') ? words.generatedAt : hanzi.generatedAt || '',
  contentVersion,
  stages: source.stages,
  subjects: source.subjects,
  lessons,
}

const emitted = JSON.stringify(catalog, null, 2) + '\n'

if (process.argv.includes('--check')) {
  // Windows 下 core.autocrlf=true 检出会把 LF 转成 CRLF，比对前必须归一化，否则门禁假阳性
  const existing = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n') : ''
  if (existing !== emitted) {
    console.error('✗ src/content/catalog.json 与课程源不一致，请运行 npm run build:content')
    process.exit(1)
  }
  console.log(`✓ 内容校验通过（check）：${lessons.length} 门课，contentVersion ${contentVersion}`)
  process.exit(0)
}

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, emitted, 'utf8')
console.log(`✓ 内容校验通过，已生成 src/content/catalog.json：${lessons.length} 门课，contentVersion ${contentVersion}`)

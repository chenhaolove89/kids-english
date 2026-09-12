/**
 * 合并词表：tools/words-base.csv（原始300词，只读） + tools/words-extra/*.csv（新增）
 * → 生成 tools/words.csv（gen-assets.mjs 的输入；内容真的有变化时才把上一版备份到 words.prev.csv）
 * 校验：7列 / id 全局唯一（新行自动 slug 化）/ 同一等级内 en 不重复 /
 *       分类合法 / emoji 或 draw 至少一项 / MOVES 分类迁移 / 全表汇总输出
 * 用法：node tools/merge-words.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeFileAtomic } from './lib/fs-atomic.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BASE = path.join(ROOT, 'tools/words-base.csv')
const EXTRA_DIR = path.join(ROOT, 'tools/words-extra')
const OUT = path.join(ROOT, 'tools/words.csv')

export const LEVELS = {
  1: { zh: '启蒙起步', en: 'Level 1', color: '#3BB273', bg: '#E3F6E8', icon: '1f331' },
  2: { zh: '日常生活', en: 'Level 2', color: '#4D96FF', bg: '#E3EEFF', icon: '1f3e0' },
  3: { zh: '快乐探索', en: 'Level 3', color: '#FF8C42', bg: '#FFEDD9', icon: '1f9ed' },
  4: { zh: '挑战进阶', en: 'Level 4', color: '#9B5DE5', bg: '#F0E6FB', icon: '1f680' },
}

const LEVEL_OF = {
  colors: 1, numbers: 1, shapes: 1, body: 1, alphabet: 1, animals: 1, fruits: 1, toys: 1,
  food: 2, vegetables: 2, desserts: 2, drinks: 2, clothes: 2, home: 2, kitchen: 2, school: 2, family: 2, emotions: 2,
  vehicles: 3, nature: 3, ocean: 3, insects: 3, birds: 3, places: 3, time: 3, countries: 3, farm: 3, forest: 3, city: 3,
  sports: 4, music: 4, jobs: 4, space: 4, characters: 4, tools: 4, electronics: 4, health: 4, festivals: 4,
  actions: 4, adjectives: 4, opposites: 4, sightwords: 4, wordfamilies: 4, digraphs: 4,
  story: 4, prepositions: 4, ordinals: 4, subjects: 4, mathwords: 4, routine: 4, greetings: 4, conversation: 4,
}

// 个别词调整分类（旧分类体系 → 新分类体系）
const MOVES = {
  kite: 'toys',     // sports → toys
  pencil: 'school', // home → school
  crayon: 'school',
  scissors: 'school',
  book: 'school',
  // 2026-09-10 内容审计（8 条）：归位到孩子/家长直觉的分类
  milk: 'drinks',         // food → drinks（牛奶是饮品）
  milkshake: 'drinks',    // desserts → drinks（奶昔是饮品）
  backpack: 'school',     // clothes → school（书包是学习用品）
  umbrella: 'clothes',    // nature → clothes（雨伞是随身物品，不是自然）
  paint: 'school',        // toys → school（颜料是美术用品）
  party: 'festivals',     // toys → festivals（派对是活动场景）
  gift: 'festivals',      // toys → festivals（礼物贴节日场景）
  policeofficer: 'jobs',  // characters → jobs（警察是职业不是装扮角色）
}

function slug(id) {
  return id.replace(/[^\p{L}\p{N}-]+/gu, '')
}

function readCSV(file) {
  const text = fs.readFileSync(file, 'utf8')
  let lines = text.replace(/^\uFEFF/, '').trim().split(/\r?\n/).filter((l) => l.trim())
  if (lines[0] && lines[0].toLowerCase().startsWith('id,')) lines = lines.slice(1)
  return lines.map((l, i) => ({ file: path.basename(file), line: i + 1, cols: l.split(',') }))
}

if (!fs.existsSync(BASE)) {
  console.error('未找到 tools/words-base.csv：请先复制 cp tools/words.csv tools/words-base.csv')
  process.exit(1)
}

const rows = [...readCSV(BASE)]
for (const f of fs.readdirSync(EXTRA_DIR).filter((f) => f.endsWith('.csv')).sort()) {
  rows.push(...readCSV(path.join(EXTRA_DIR, f)))
}

const errors = []
const byId = new Map()
const enByLevel = new Map()
const catCount = new Map()

for (const { file, line, cols } of rows) {
  const where = `${file}:${line}`
  if (cols.length !== 7) { errors.push(`${where} 列数=${cols.length}`); continue }
  const [rawId, en, zh, , rawCat] = cols
  const id = slug(rawId.trim())
  const category = MOVES[id] ?? rawCat.trim()
  if (!id || !en.trim() || !zh.trim() || !category) { errors.push(`${where} 必填字段为空`); continue }
  if (!(category in LEVEL_OF)) { errors.push(`${where} 未知分类 ${category}`); continue }
  if (!cols[5].trim() && !cols[6].trim()) { errors.push(`${where} 无 emoji 也无 draw`); continue }
  if (byId.has(id)) { errors.push(`${where} id 重复: ${id}（先出现于 ${byId.get(id)}）`); continue }
  const level = LEVEL_OF[category]
  const enKeyFull = `${level}|${en.trim().toLowerCase()}`
  if (enByLevel.has(enKeyFull)) { errors.push(`${where} 同级 en 重复: "${en}"（L${level}，先出现于 ${enByLevel.get(enKeyFull)}）`); continue }
  byId.set(id, where)
  enByLevel.set(enKeyFull, where)
  catCount.set(category, (catCount.get(category) || 0) + 1)
  cols[0] = id
  cols[4] = category
}

console.log('=== 每分类词数 ===')
const groups = { 1: [], 2: [], 3: [], 4: [] }
for (const [cat, n] of [...catCount.entries()].sort((a, b) => LEVEL_OF[a[0]] - LEVEL_OF[b[0]] || a[0].localeCompare(b[0]))) {
  groups[LEVEL_OF[cat]].push(`${cat}:${n}`)
}
let total = 0
for (const lv of [1, 2, 3, 4]) {
  const n = groups[lv].reduce((s, g) => s + Number(g.split(':')[1]), 0)
  total += n
  console.log(`L${lv} ${LEVELS[lv].zh}（${n} 词）: ${groups[lv].join('  ')}`)
}
console.log(`总计: ${total} 词`)

if (errors.length) {
  console.log(`\n=== ${errors.length} 个问题 ===`)
  errors.forEach((e) => console.log('✗ ' + e))
  process.exitCode = 1
} else {
  const out = ['id,en,zh,phonetic,category,emoji,draw', ...rows.map(({ cols }) => cols.join(','))].join('\n') + '\n'
  const prev = path.join(ROOT, 'tools/words.prev.csv')
  const before = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null
  const changed = before !== out
  // 备份语义：words.prev.csv 保存的是「上一版」。
  // 原实现无条件把当前 words.csv 拷成 prev —— 连跑两次就把 prev 覆盖成当前版本，
  // 等于没有备份；首次生成（还没有 words.csv）时也没有可备份的东西。
  if (changed && before !== null) {
    try {
      writeFileAtomic(prev, before)
      console.log('（内容有变化，已把上一版备份到 tools/words.prev.csv）')
    } catch (e) {
      console.log(`⚠ 备份 tools/words.prev.csv 失败: ${e.message}`)
    }
  } else if (!changed) {
    console.log('（内容未变化，保留原有 tools/words.prev.csv 备份）')
  }
  // 原子落盘：中途失败不会留下半截词表
  writeFileAtomic(OUT, out)
  console.log(`\n✓ 已写出 ${path.relative(ROOT, OUT)}（${rows.length} 行）`)
}

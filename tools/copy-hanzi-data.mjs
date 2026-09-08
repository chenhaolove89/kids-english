#!/usr/bin/env node
/**
 * 拷贝描红用笔顺数据：node_modules/hanzi-writer-data/{char}.json → src/static/hanzi-data/{码点}.json
 * 用码点命名避免中文文件名在 URL/发布路径上的编码风险，运行时由 charDataLoader 换算。
 * 缺数据的字只打印清单不阻塞（页面对缺失字隐藏描红入口，白名单见 tests/write-data.test.js）。
 * 用法：node tools/copy-hanzi-data.mjs [--force]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC_DIR = path.join(ROOT, 'node_modules', 'hanzi-writer-data')
const OUT_DIR = path.join(ROOT, 'src', 'static', 'hanzi-data')
const FORCE = process.argv.includes('--force')

const hanzi = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'hanzi.json'), 'utf8'))
const chars = hanzi.levels.flatMap((l) => l.chars.map((c) => c.char))

fs.mkdirSync(OUT_DIR, { recursive: true })

let copied = 0
let skipped = 0
const missing = []
for (const ch of chars) {
  const cp = ch.codePointAt(0).toString(16).padStart(4, '0')
  const out = path.join(OUT_DIR, `${cp}.json`)
  if (!FORCE && fs.existsSync(out)) {
    skipped++
    continue
  }
  const src = path.join(SRC_DIR, `${ch}.json`)
  if (!fs.existsSync(src)) {
    missing.push(`${ch}(${cp})`)
    continue
  }
  const data = JSON.parse(fs.readFileSync(src, 'utf8'))
  if (!Array.isArray(data.strokes) || data.strokes.length === 0) {
    missing.push(`${ch}(${cp}) [无笔画]`)
    continue
  }
  fs.writeFileSync(out, JSON.stringify(data))
  copied++
}

console.log(`描红数据：新拷 ${copied}，已有 ${skipped}，缺失 ${missing.length} / 共 ${chars.length} 字`)
if (missing.length) {
  console.log('缺失清单（页面将隐藏这些字的描红入口）:')
  console.log('  ' + missing.join(', '))
}
if (copied === 0 && skipped === 0) {
  console.error('一个字都没落盘，请检查 hanzi-writer-data 是否安装')
  process.exit(1)
}

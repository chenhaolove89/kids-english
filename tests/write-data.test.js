/**
 * 描红数据回归：297 个课内字都要有笔顺数据文件（码点命名），
 * JSON 可解析且笔画数 >0（坏文件会让描红页整页不可用）。
 * 新增课内字后必须重跑 node tools/copy-hanzi-data.mjs，本测试就是防漏闸。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const hanzi = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'hanzi.json'), 'utf8'))
const DATA_DIR = path.join(ROOT, 'src', 'static', 'hanzi-data')

// 个别生僻字 hanzi-writer-data 可能缺数据：确认后把码点加进白名单（页面自动隐藏入口）
const MISSING_WHITELIST = new Set()

test('每个课内字都有笔顺数据：存在、可解析、笔画数 >0', () => {
  const chars = hanzi.levels.flatMap((l) => l.chars)
  assert.ok(chars.length >= 297, `课内字数异常: ${chars.length}`)
  const missing = []
  for (const h of chars) {
    const cp = h.id
    if (MISSING_WHITELIST.has(cp)) continue
    const p = path.join(DATA_DIR, `${cp}.json`)
    assert.ok(fs.existsSync(p), `字 ${h.char}(${cp}) 缺笔顺数据，重跑 node tools/copy-hanzi-data.mjs`)
    const data = JSON.parse(fs.readFileSync(p, 'utf8'))
    assert.ok(Array.isArray(data.strokes) && data.strokes.length > 0, `字 ${h.char}(${cp}) 笔画数据为空`)
    assert.ok(Array.isArray(data.medians) && data.medians.length === data.strokes.length, `字 ${h.char}(${cp}) medians 与 strokes 数不一致`)
  }
  assert.deepEqual(missing, [])
})

test('笔顺数据按码点命名：无中文文件名（URL 编码风险）', () => {
  const files = fs.readdirSync(DATA_DIR)
  assert.ok(files.length >= 297)
  for (const f of files) {
    assert.match(f, /^[0-9a-f]{4}\.json$/, `文件名必须是 4 位码点: ${f}`)
  }
})

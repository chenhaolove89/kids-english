/**
 * 原子写入：半截 JSON / 半截 CSV 是「进度清零」的经典成因
 * （下游解析失败只能 fallback 到空值），所以生成脚本一律先写临时文件再 rename。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { writeFileAtomic } from '../tools/lib/fs-atomic.mjs'

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-'))
}

test('writeFileAtomic：正常写入并覆盖旧内容', () => {
  const dir = tmpDir()
  const f = path.join(dir, 'a.json')
  fs.writeFileSync(f, 'old')
  writeFileAtomic(f, '{"new":1}')
  assert.equal(fs.readFileSync(f, 'utf8'), '{"new":1}')
  // 不留临时文件
  assert.deepEqual(fs.readdirSync(dir), ['a.json'])
})

test('writeFileAtomic：目标不存在时也能创建', () => {
  const dir = tmpDir()
  const f = path.join(dir, 'nested.json')
  writeFileAtomic(f, 'x')
  assert.equal(fs.readFileSync(f, 'utf8'), 'x')
})

test('writeFileAtomic：写入失败时抛错且不留下临时文件', () => {
  const dir = tmpDir()
  // 用一个目录当目标：rename 到已存在的目录会失败（Windows 与 POSIX 都报错）
  const target = path.join(dir, 'adir')
  fs.mkdirSync(target)
  assert.throws(() => writeFileAtomic(target, 'data'))
  const leftovers = fs.readdirSync(dir).filter((n) => n.includes('.tmp-'))
  assert.deepEqual(leftovers, [], `失败后残留临时文件: ${leftovers.join(', ')}`)
})

test('writeFileAtomic：并发/重复写入不会留垃圾（同进程 pid 相同）', () => {
  const dir = tmpDir()
  const f = path.join(dir, 'b.txt')
  for (let i = 0; i < 5; i++) writeFileAtomic(f, `v${i}`)
  assert.equal(fs.readFileSync(f, 'utf8'), 'v4')
  assert.deepEqual(fs.readdirSync(dir), ['b.txt'])
})

/**
 * 静态资源可用性判定：生成器（gen-assets）与资源审计（audit-assets）共用同一口径。
 *
 * 背景：两处原来都只查 existsSync / size > 0，于是「TTS 中断留下的半截 mp3」
 * 会被增量生成永久跳过、也被审计永久放行——孩子听到断音，两道门禁却全绿。
 * 这里把阈值钉成契约，并验证「坏文件会被判为不可用」。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { assetState, isUsableAsset, kindOf, MIN_BYTES } from '../tools/lib/asset-check.mjs'

function tmpFile(name, bytes) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-'))
  const f = path.join(dir, name)
  fs.writeFileSync(f, Buffer.alloc(bytes, 0x41))
  return f
}

test('kindOf：按扩展名分类', () => {
  assert.equal(kindOf('a.mp3'), 'audio')
  assert.equal(kindOf('a.MP3'), 'audio')
  assert.equal(kindOf('a.png'), 'image')
  assert.equal(kindOf('a.svg'), 'image')
  assert.equal(kindOf('a.json'), 'json')
  assert.equal(kindOf('a.webmanifest'), 'json')
  assert.equal(kindOf('a.bin'), 'other')
})

test('assetState：缺失 / 空 / 截断 / 正常四态', () => {
  assert.equal(assetState(path.join(os.tmpdir(), 'definitely-not-here-9137.mp3')), 'missing')
  assert.equal(assetState(tmpFile('empty.mp3', 0)), 'empty')
  // 截断：非空但低于阈值（真实场景是 TTS 中断写了一半）
  assert.equal(assetState(tmpFile('half.mp3', 100)), 'truncated')
  assert.equal(assetState(tmpFile('half.png', 10)), 'truncated')
  // 正常：一条最短的口语音频也有几 KB
  assert.equal(assetState(tmpFile('ok.mp3', MIN_BYTES.audio + 1)), 'ok')
  assert.equal(assetState(tmpFile('ok.png', MIN_BYTES.image + 1)), 'ok')
})

test('目录不算可用资源（避免把 /static/audio 这类目录前缀判成已就绪）', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'assetdir-'))
  assert.equal(assetState(dir), 'missing')
})

test('阈值必须大于 0，否则等于退回旧口径（只查存在）', () => {
  for (const [kind, min] of Object.entries(MIN_BYTES)) {
    assert.ok(min > 0, `${kind} 的最小字节数必须 > 0`)
  }
  assert.ok(MIN_BYTES.audio >= 400, '音频阈值太松：半截 mp3 会漏过')
})

test('isUsableAsset 只认正常态', () => {
  assert.equal(isUsableAsset(tmpFile('ok.mp3', 2000)), true)
  assert.equal(isUsableAsset(tmpFile('bad.mp3', 12)), false)
  assert.equal(isUsableAsset(tmpFile('zero.png', 0)), false)
})

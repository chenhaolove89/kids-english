/**
 * 分层门禁作为测试跑：让「依赖只许向下」在 npm test 里就失败，
 * 而不是等到有人把 domain 接上 uni、或页面绕过 storage 直连本地存储才发现。
 * 规则实现见 tools/check-layering.mjs（同一份逻辑，CLI 与测试共用）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { collectViolations } from '../tools/check-layering.mjs'

test('分层门禁：domain 纯净、无反向依赖、存储已收口', () => {
  const violations = collectViolations()
  assert.deepEqual(
    violations,
    [],
    `发现 ${violations.length} 处分层违规：\n${violations.map((v) => `  [${v.rule}] ${v.file} — ${v.detail}`).join('\n')}`,
  )
})

test('分层门禁自身有效：能识别出违规样本', () => {
  // 防止规则写错导致「永远通过」。构造临时目录跑一遍检查器。
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'layering-'))
  try {
    fs.mkdirSync(path.join(dir, 'domain'), { recursive: true })
    fs.mkdirSync(path.join(dir, 'pages'), { recursive: true })
    fs.mkdirSync(path.join(dir, 'services'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'domain', 'bad.js'), 'export const x = uni.getStorageSync("a")\n')
    fs.writeFileSync(path.join(dir, 'pages', 'bad.vue'), '<script>uni.setStorageSync("a", 1)</script>\n')
    fs.writeFileSync(path.join(dir, 'services', 'bad.js'), "import x from '@/pages/map/map.vue'\n")
    fs.writeFileSync(path.join(dir, 'domain', 'ok.js'), 'export const y = 1\n')
    const found = collectViolations(dir)
    assert.ok(found.some((v) => v.rule.includes('domain 禁止依赖 uni')), '应识别 domain 里的 uni')
    assert.ok(found.some((v) => v.rule.includes('本地存储必须走')), '应识别页面直连存储')
    assert.ok(found.some((v) => v.rule.includes('下层禁止依赖 pages')), '应识别 services 反向依赖页面')
    assert.ok(!found.some((v) => v.file.endsWith('domain/ok.js')), '干净文件不应报违规')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

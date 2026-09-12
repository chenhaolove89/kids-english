/**
 * 分层门禁：把 docs/architecture.md 的「依赖只许向下」从注释变成退出码。
 *
 * 规则（README/docs.architecture.md 声明）：
 *   pages → services → domain，pages/services → platform；domain 不碰任何平台代码。
 *
 * 为什么需要它：仓库有 43 个源文件、7 个页面，分层全靠人自觉。
 * 一旦有人在 domain 里 import uni、在页面里直接调 uni.setStorageSync、
 * 或让 services 反向依赖 pages，跨端（小程序/App）与 Node 测试的前提就没了，
 * 而这种腐化是渐进的、review 时最容易漏的。
 *
 * 用法：node tools/check-layering.mjs（退出码 1 表示违规）
 * 也作为 tests/layering.test.js 的一部分跑在 npm test 里。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'src')

// 唯一允许直连 uni 存储 API 的位置（存储收口点）
const STORAGE_ENTRY = 'platform/storage.js'

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === 'static' || e.name === 'data' || e.name === 'node_modules') continue
      walk(p, out)
    } else if (/\.(js|vue|mjs)$/.test(e.name)) out.push(p)
  }
  return out
}

/** 去掉注释，避免注释里提到 uni / pages 被误判 */
function stripComments(src) {
  let out = ''
  let i = 0
  let quote = null
  while (i < src.length) {
    const c = src[i]
    const c2 = src[i + 1]
    if (quote) {
      out += c
      if (c === '\\') {
        out += src[i + 1] ?? ''
        i += 2
        continue
      }
      if (c === quote) quote = null
      i++
      continue
    }
    if (c === '/' && c2 === '*') {
      const end = src.indexOf('*/', i + 2)
      i = end === -1 ? src.length : end + 2
      continue
    }
    if (c === '/' && c2 === '/') {
      const end = src.indexOf('\n', i)
      i = end === -1 ? src.length : end
      continue
    }
    if (src.startsWith('<!--', i)) {
      const end = src.indexOf('-->', i + 4)
      i = end === -1 ? src.length : end + 3
      continue
    }
    if (c === '"' || c === "'" || c === '`') quote = c
    out += c
    i++
  }
  return out
}

/** 收集全部分层违规；返回 [{ file, rule, detail }] */
export function collectViolations(srcDir = SRC) {
  const violations = []
  const files = walk(srcDir)

  // 报告用路径：在工作区内显示相对路径，临时目录等外部路径显示绝对路径
  const rel = (f) => {
    const r = path.relative(ROOT, f)
    return (r.startsWith('..') ? f : r).replace(/\\/g, '/')
  }
  // 层 = srcDir 下的第一段目录名
  const inSrc = (f) => path.relative(srcDir, f).replace(/\\/g, '/')

  for (const f of files) {
    const inner = inSrc(f)
    const layer = inner.split('/')[0] || ''
    const r = rel(f)
    const code = stripComments(fs.readFileSync(f, 'utf8'))

    // 1) domain 必须纯净：不碰平台/框架
    if (layer === 'domain') {
      for (const [rule, re] of [
        ['domain 禁止依赖 uni', /\buni\./],
        ['domain 禁止依赖 vue', /from\s+['"]vue['"]/],
        ['domain 禁止依赖 howler', /from\s+['"]howler['"]/],
        ['domain 禁止碰 DOM', /\b(document|window|localStorage)\b/],
      ]) {
        const m = code.match(re)
        if (m) violations.push({ file: r, rule, detail: `命中 ${m[0]}` })
      }
    }

    // 2) services / domain / content / platform 不得反向依赖页面
    if (['services', 'domain', 'content', 'platform'].includes(layer)) {
      const m = code.match(/from\s+['"][^'"]*(?:@\/pages|\/pages\/)[^'"]*['"]/)
      if (m) violations.push({ file: r, rule: '下层禁止依赖 pages', detail: m[0] })
      if (/from\s+['"]vue['"]/.test(code)) {
        violations.push({ file: r, rule: 'services/domain/content/platform 禁止依赖 vue', detail: 'from "vue"' })
      }
    }

    // 3) 存储必须收口：除 platform/storage.js 外，任何地方不得直连 uni 存储 API
    if (inner !== STORAGE_ENTRY) {
      const m = code.match(/\buni\.(set|get|remove)StorageSync\b/)
      if (m) {
        violations.push({ file: r, rule: '本地存储必须走 platform/storage.js', detail: `直接调用 uni.${m[1]}StorageSync` })
      }
    }
  }

  return violations
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const violations = collectViolations()
  if (!violations.length) {
    console.log('✓ 分层门禁通过：domain 纯净、无反向依赖、存储已收口')
  } else {
    console.error(`✗ 分层门禁失败：${violations.length} 处违规`)
    for (const v of violations) console.error(`  [${v.rule}] ${v.file} — ${v.detail}`)
    process.exitCode = 1
  }
}

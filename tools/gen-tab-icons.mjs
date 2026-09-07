#!/usr/bin/env node
/**
 * 生成底部 tabBar 图标：从 Noto Emoji（与 gen-assets 同源 CDN）下载 PNG
 * 到 src/static/tab/。图标是给不识字的小朋友看的：🏠 首页 / 📚 课程 / 👪 家长。
 * 用法：node tools/gen-tab-icons.mjs（网络变更后可重跑，覆盖下载）
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'src', 'static', 'tab')
const BASE = 'https://cdn.jsdelivr.net/gh/googlefonts/noto-emoji@v2.047/png/512'

const ICONS = [
  { file: 'home.png', emoji: '🏠' },
  { file: 'map.png', emoji: '📚' },
  { file: 'parent.png', emoji: '👪' },
]

const toCode = (emoji) =>
  [...emoji].map((c) => c.codePointAt(0).toString(16).padStart(4, '0')).join('_')

fs.mkdirSync(OUT, { recursive: true })
for (const ic of ICONS) {
  const url = `${BASE}/emoji_u${toCode(ic.emoji)}.png`
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) {
    console.error(`✗ 下载失败 (${res.status}): ${url}`)
    process.exit(1)
  }
  const buf = Buffer.from(await res.arrayBuffer())
  fs.writeFileSync(path.join(OUT, ic.file), buf)
  console.log(`✓ ${ic.file} ← ${ic.emoji} (${(buf.length / 1024).toFixed(1)}KB)`)
}
console.log('完成：src/static/tab/')

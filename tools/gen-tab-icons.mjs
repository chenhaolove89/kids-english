#!/usr/bin/env node
/**
 * 生成底部 tabBar 双态图标（同源 Noto Emoji + pngjs 像素处理）：
 *   {name}.png      未选中：整图重着色为暖灰剪影（文字色 #a2917d 同族）
 *   {name}-on.png   选中：彩色圆底 + 白色描形（每 Tab 一个身份色，比纯文字变色醒目）
 * 图标给不识字的小朋友看：📚 课程 / ⭐ 收集 / 👪 家长。
 * 用法：node tools/gen-tab-icons.mjs [--force]（默认源文件缺失才下载 emoji）
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'src', 'static', 'tab')
const BASE = 'https://cdn.jsdelivr.net/gh/googlefonts/noto-emoji@v2.047/png/512'
const SIZE = 96 // uni h5 tabbar 图标约 26px CSS，96px 覆盖 3x 屏

const ICONS = [
  { file: 'map', emoji: '📚', color: [0xff, 0x8c, 0x42] },
  { file: 'collection', emoji: '⭐', color: [0xf7, 0xb5, 0x00] },
  // 家长：👪 一家四口缩到 96px 剪影化后糊成实心方块（2026-09 视觉验收抓到），
  // 👥 双人剪影天生就是头+肩造型，缩小后仍然成形
  { file: 'parent', emoji: '👥', color: [0x3b, 0xb2, 0x73] },
]
// 未选中剪影色（暖灰，与 tabBar 文字色 #a2917d 同族）
const GRAY = [0xb4, 0xa6, 0x96]

const toCode = (emoji) =>
  [...emoji].map((c) => c.codePointAt(0).toString(16).padStart(4, '0')).join('_')

async function fetchEmoji(emoji, cachePath, force) {
  if (!force && fs.existsSync(cachePath)) return
  const url = `${BASE}/emoji_u${toCode(emoji)}.png`
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) {
    console.error(`✗ 下载失败 (${res.status}): ${url}`)
    process.exit(1)
  }
  fs.writeFileSync(cachePath, Buffer.from(await res.arrayBuffer()))
}

/** 512px Noto PNG → SIZE px（box 降采样，emoji 平铺色块足够平滑） */
function resize(png) {
  const out = new PNG({ width: SIZE, height: SIZE })
  const sx = png.width / SIZE
  const sy = png.height / SIZE
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      // 取源像素 2x2 邻域平均：alpha 先平均避免边缘锯齿
      let a = 0
      let r = 0
      let g = 0
      let b = 0
      let n = 0
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const px = Math.min(png.width - 1, Math.floor((x + dx * 0.5) * sx))
        const py = Math.min(png.height - 1, Math.floor((y + dy * 0.5) * sy))
        const i = (py * png.width + px) * 4
        const pa = png.data[i + 3]
        a += pa
        if (pa > 0) {
          r += png.data[i] * pa
          g += png.data[i + 1] * pa
          b += png.data[i + 2] * pa
        }
        n++
      }
      const o = (y * SIZE + x) * 4
      if (a > 0) {
        out.data[o] = Math.round(r / a)
        out.data[o + 1] = Math.round(g / a)
        out.data[o + 2] = Math.round(b / a)
      }
      out.data[o + 3] = Math.round(a / n)
    }
  }
  return out
}

/** 全图按 target 色重着色：保留 alpha 形状，颜色统一（亮度和源色无关） */
function recolor(png, [tr, tg, tb]) {
  for (let i = 0; i < png.data.length; i += 4) {
    if (png.data[i + 3] > 0) {
      png.data[i] = tr
      png.data[i + 1] = tg
      png.data[i + 2] = tb
    }
  }
  return png
}

/** 选中态：SIZE 圆底（身份色）+ 居中 62px 白色描形 */
function selectedIcon(glyph, [r, g, b]) {
  const out = new PNG({ width: SIZE, height: SIZE })
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const o = (y * SIZE + x) * 4
      const dx = x - SIZE / 2 + 0.5
      const dy = y - SIZE / 2 + 0.5
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist <= SIZE / 2 - 1) {
        out.data[o] = r
        out.data[o + 1] = g
        out.data[o + 2] = b
        out.data[o + 3] = 255
      }
    }
  }
  const inner = Math.round(SIZE * 0.62)
  const ox = Math.round((SIZE - inner) / 2)
  const oy = ox
  for (let y = 0; y < inner; y++) {
    for (let x = 0; x < inner; x++) {
      // glyph 是 SIZE×SIZE：步长必须用 glyph.width，用 inner 会把读位错乱成横向条纹
      const si = (y * glyph.width + x) * 4
      const sa = glyph.data[si + 3]
      if (sa === 0) continue
      const di = ((oy + y) * SIZE + ox + x) * 4
      // 白色描形按源 alpha 与圆底 alpha 合成
      const da = out.data[di + 3] / 255
      const wa = (sa / 255) * 1
      out.data[di] = Math.round(255 * wa + out.data[di] * (1 - wa))
      out.data[di + 1] = Math.round(255 * wa + out.data[di + 1] * (1 - wa))
      out.data[di + 2] = Math.round(255 * wa + out.data[di + 2] * (1 - wa))
      out.data[di + 3] = Math.round(255 * (wa + da * (1 - wa)))
    }
  }
  return out
}

const force = process.argv.includes('--force')
fs.mkdirSync(OUT, { recursive: true })
for (const ic of ICONS) {
  const raw = path.join(OUT, `${ic.file}-raw.png`)
  await fetchEmoji(ic.emoji, raw, force)
  const glyph = resize(PNG.sync.read(fs.readFileSync(raw)))
  // 未选中：暖灰剪影；选中：彩色圆底 + 白色描形（recolor 只改 RGB 不动 alpha，描形按 alpha 合成）
  fs.writeFileSync(path.join(OUT, `${ic.file}.png`), PNG.sync.write(recolor(glyph, GRAY)))
  fs.writeFileSync(path.join(OUT, `${ic.file}-on.png`), PNG.sync.write(selectedIcon(glyph, ic.color)))
  fs.rmSync(raw, { force: true })
  console.log(`✓ ${ic.file}.png（暖灰）+ ${ic.file}-on.png（彩色圆底）← ${ic.emoji}`)
}
console.log('完成：src/static/tab/')

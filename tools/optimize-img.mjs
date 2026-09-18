/**
 * 图片量化压缩：src/static/img 下超过阈值的 PNG 用 sharp palette 模式
 * （libimagequant，256 色 + alpha）重编码，肉眼不可辨差异，体积约省一半。
 * 尺寸不变、文件名不变，validate:content 的存在性校验不受影响。
 *
 * 收敛（2026-09-17 修正旧注释）：palette 量化**不是不动点**——已经压过的图再压仍会略小，
 * 单轮衰减约 0.55 倍（同一批图连跑 5 轮分别改写 34/27/17/9/4 张）。所以每张都压到
 * 「再压也不小于 128B」为止（见 tools/lib/image-converge.mjs）。旧注释写的「天然幂等」是错的：
 * 按那个说法跑，每次重跑都会改写几百张文件 → 静态树内容哈希变 → SW 换代 → 老用户重下图。
 * 收敛之后重复跑才是真正的空转（不写一个字节）。
 *
 * 用法：
 *   node tools/optimize-img.mjs                  # 全量；已收敛的文件自动跳过
 *   node tools/optimize-img.mjs --dry-run        # 只报告会改哪些、能省多少，不落盘
 *   node tools/optimize-img.mjs --min-gain 30    # 只压首轮能省 30% 以上的（补课"从没压过"的图，不薅余量）
 *   node tools/optimize-img.mjs --only cat-*.png,level-1?.png   # 只压匹配相对路径的图
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { convergeEncode, firstPassGainRatio, matchesGlob, DEFAULT_MIN_GAIN } from './lib/image-converge.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const IMG_DIR = path.join(ROOT, 'src', 'static', 'img')
const MIN_BYTES = 6 * 1024 // 6KB 以下没油水，不值得重编码
const QUALITY = 88

const argv = new Set(process.argv.slice(2))
const DRY_RUN = argv.has('--dry-run')
const MIN_GAIN_PCT = (() => {
  const i = process.argv.indexOf('--min-gain')
  if (i < 0) return 0
  const n = Number(process.argv[i + 1])
  return Number.isFinite(n) && n > 0 ? n : 0
})()
const ONLY = (() => {
  const i = process.argv.indexOf('--only')
  if (i < 0 || !process.argv[i + 1]) return null
  return process.argv[i + 1].split(',').map((s) => s.trim()).filter(Boolean)
})()

const encode = (buf) => sharp(buf).png({ palette: true, quality: QUALITY, effort: 9 }).toBuffer()

let scanned = 0, written = 0, skipped = 0, saved = 0, totalPasses = 0
const preview = []
const cappedFiles = []

async function compress(file) {
  const rel = path.relative(IMG_DIR, file).split(path.sep).join('/')
  if (ONLY && !ONLY.some((p) => matchesGlob(rel, p))) return
  const stat = fs.statSync(file)
  if (stat.size <= MIN_BYTES) { skipped++; return }
  scanned++

  const buf = fs.readFileSync(file)
  // --min-gain：先单轮试压一次判断「这张像从没压过，还是只剩余量」，不达标直接放过
  if (MIN_GAIN_PCT > 0) {
    const one = await encode(buf)
    if (firstPassGainRatio(buf, one) * 100 < MIN_GAIN_PCT) { skipped++; return }
  }

  const { buffer, passes, saved: gain, capped } = await convergeEncode(buf, encode, { minGain: DEFAULT_MIN_GAIN })
  totalPasses += passes
  // 撞上限＝还没收敛，写下去等于保证下次运行还会改写它（churn 源头）。宁可不动、如实报告。
  if (capped) { cappedFiles.push({ rel, from: stat.size, to: buffer.length, passes }); return }
  if (gain <= 0) { skipped++; return }
  if (DRY_RUN) {
    preview.push({ rel, from: stat.size, to: buffer.length, gain, passes })
    written++
    saved += gain
    return
  }
  fs.writeFileSync(file, buffer)
  written++
  saved += gain
}

async function walk(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name)
    if (f.isDirectory()) await walk(p)
    else if (/\.png$/i.test(f.name)) await compress(p)
  }
}

console.time('optimize-img')
await walk(IMG_DIR)
console.timeEnd('optimize-img')

if (cappedFiles.length) {
  console.warn(`⚠ ${cappedFiles.length} 张跑到轮次上限仍未收敛，已跳过（不落盘，避免下次运行又改写它）：`)
  for (const f of cappedFiles.slice(0, 5)) console.warn(`   ${f.rel} ${f.from} → ${f.to}（${f.passes} 轮）`)
  if (cappedFiles.length > 5) console.warn(`   …… 另有 ${cappedFiles.length - 5} 张`)
}

if (DRY_RUN) {
  // 报告按收益从大到小，先看最值钱的，避免被一堆几百字节的噪声淹没
  preview.sort((a, b) => b.gain - a.gain)
  for (const p of preview.slice(0, 20)) {
    console.log(`  ${p.rel} ${p.from} → ${p.to}（省 ${(p.gain / 1024).toFixed(1)}KB，${p.passes} 轮）`)
  }
  if (preview.length > 20) console.log(`  …… 另有 ${preview.length - 20} 张`)
  console.log(`--dry-run：未落盘。${written} 张可压、共可省 ${(saved / 1024 / 1024).toFixed(2)}MB`)
} else {
  console.log(
    `压缩 ${written} 张，跳过 ${skipped} 张（已小/已收敛/无收益），共节省 ${(saved / 1024 / 1024).toFixed(2)}MB` +
      `（平均 ${(totalPasses / Math.max(1, scanned)).toFixed(1)} 轮/张）`,
  )
}

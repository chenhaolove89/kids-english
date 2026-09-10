/**
 * 图片量化压缩：src/static/img 下大于阈值的 PNG 用 sharp palette 模式
 * （libimagequant，256 色 + alpha）重编码，肉眼不可辨差异，体积约省一半。
 * 只在压缩结果确实更小时才覆盖（已压过的再压不会变更小 → 天然幂等），
 * 尺寸不变、文件名不变，validate:content 的存在性校验不受影响。
 * 内容批次新增图片后跑一次：npm run opt:img
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const IMG_DIR = path.join(ROOT, 'src', 'static', 'img')
const MIN_BYTES = 6 * 1024 // 6KB 以下没油水，不值得重编码
const QUALITY = 88

let files = 0, saved = 0, skipped = 0

async function compress(file) {
  const stat = fs.statSync(file)
  if (stat.size <= MIN_BYTES) { skipped++; return }
  const buf = fs.readFileSync(file)
  const out = await sharp(buf)
    .png({ palette: true, quality: QUALITY, effort: 9 })
    .toBuffer()
  if (out.length < stat.size - 128) { // 省不足 128B 视为无收益，保留原文件避免无意义 diff
    fs.writeFileSync(file, out)
    files++
    saved += stat.size - out.length
  } else {
    skipped++
  }
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
console.log(`压缩 ${files} 张，跳过 ${skipped} 张（已小/无收益），共节省 ${(saved / 1024 / 1024).toFixed(1)}MB`)

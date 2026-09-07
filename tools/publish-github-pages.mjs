/**
 * 生成 GitHub Pages 发布目录（子路径部署版）：
 * 复制 dist/build/web → tmp/gh-publish/，并把产物里的根绝对路径 /static/...
 * 改写为相对路径 ./static/...（GitHub Pages 挂在仓库子路径下，不改则图片音频全 404）。
 * 只改构建产物文本，不动 src 源码。
 * 用法：npm run build:h5 之后 → node tools/publish-github-pages.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'dist/build/h5')
const OUT = path.join(ROOT, 'tmp/gh-publish')

if (!fs.existsSync(path.join(SRC, 'index.html'))) {
  console.error('未找到 dist/build/h5/index.html，请先 npm run build:h5')
  process.exit(1)
}

// 已发布过则保留 .git 增量更新（整目录删除在 Windows 上易被占用报 EPERM）
const gitDir = path.join(OUT, '.git')
if (fs.existsSync(OUT)) {
  for (const f of fs.readdirSync(OUT)) {
    if (f === '.git') continue
    fs.rmSync(path.join(OUT, f), { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
  }
} else {
  fs.mkdirSync(OUT, { recursive: true })
}
fs.cpSync(SRC, OUT, { recursive: true, force: true })

const files = []
;(function walk(d) {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name)
    if (f.isDirectory()) walk(p)
    else files.push(p)
  }
})(OUT)

let changed = 0
for (const f of files) {
  const ext = path.extname(f).toLowerCase()
  if (!['.html', '.js', '.css', '.json', '.webmanifest'].includes(ext)) continue
  let text = fs.readFileSync(f, 'utf8')
  const before = text
  text = text.replaceAll('"/static/', '"./static/')
  if (ext === '.webmanifest') {
    text = text.replaceAll('"start_url": "/"', '"start_url": "./"')
    text = text.replaceAll('"scope": "/"', '"scope": "./"')
  }
  if (text !== before) { fs.writeFileSync(f, text); changed++ }
}

// GitHub Pages 默认跑 Jekyll，会跳过下划线开头的文件（如 _plugin-*.js）→ 404。
// 加空 .nojekyll 禁用 Jekyll。
fs.writeFileSync(path.join(OUT, '.nojekyll'), '')

// webmanifest 内的路径相对 manifest 自身（位于 static/）解析，需再退一级
for (const f of files) {
  if (path.extname(f).toLowerCase() !== '.webmanifest') continue
  let text = fs.readFileSync(f, 'utf8')
  text = text.replaceAll('"./static/', '"./')
  text = text.replaceAll('"start_url": "/"', '"start_url": "../"')
  text = text.replaceAll('"start_url": "./"', '"start_url": "../"')
  text = text.replaceAll('"scope": "/"', '"scope": "../"')
  fs.writeFileSync(f, text)
}

const leftover = files.filter((f) => {
  const ext = path.extname(f).toLowerCase()
  return ['.html', '.js', '.css', '.json', '.webmanifest'].includes(ext) && fs.readFileSync(f, 'utf8').includes('"/static/')
})

console.log(`扫描 ${files.length} 个文件，改写 ${changed} 个`)
if (leftover.length) {
  console.error('仍残留 /static/ 绝对路径:', leftover.join(', '))
  process.exit(1)
}
console.log('✓ 全部路径已相对化:', OUT)

/**
 * 生成 GitHub Pages 发布目录（子路径部署版）：
 * 复制 dist/build/h5 → 目标目录，并把产物里的根绝对路径 /static/...
 * 改写为相对路径 ./static/...（GitHub Pages 挂在仓库子路径下，不改则图片音频全 404）。
 * 只改构建产物文本，不动 src 源码。
 *
 * 双目标（2026-09-08 起）：
 *   默认 preview —— 抢先版：源码仓 kids-english 的 gh-pages 分支，日常都发这里；
 *   --target release —— 正式发布仓 kids-english-web，仅在用户明确要求同步时使用。
 * 两种产物都自动携带 LICENSE 与 LICENSE-CONTENT.md，两仓开源策略保持一致。
 * 用法：npm run build:h5 之后 → node tools/publish-github-pages.mjs [--target release]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'dist/build/h5')
const target = process.argv.includes('--target') ? process.argv[process.argv.indexOf('--target') + 1] : 'preview'
if (!['preview', 'release'].includes(target)) {
  console.error('未知 --target：', target, '（可用 preview | release）')
  process.exit(1)
}
const OUT = path.join(ROOT, target === 'release' ? 'tmp/gh-publish' : 'tmp/gh-preview')

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
  // 三种引号形态都要改写：双引号（JSON/压缩后的 JS 字符串）、反引号（页面里模板字符串
  // 拼的运行时路径，如 /static/audio-zh/${id}.mp3——漏掉就是线上 404）、单引号兜底
  text = text.replaceAll('"/static/', '"./static/')
  text = text.replaceAll('`/static/', '`./static/')
  text = text.replaceAll("'/static/", "'./static/")
  if (ext === '.webmanifest') {
    text = text.replaceAll('"start_url": "/"', '"start_url": "./"')
    text = text.replaceAll('"scope": "/"', '"scope": "./"')
  }
  if (text !== before) { fs.writeFileSync(f, text); changed++ }
}

// GitHub Pages 默认跑 Jekyll，会跳过下划线开头的文件（如 _plugin-*.js）→ 404。
// 加空 .nojekyll 禁用 Jekyll。
fs.writeFileSync(path.join(OUT, '.nojekyll'), '')

// 许可随行：两个部署仓都带同一套 PolyForm + CC BY-NC 声明，与源码仓策略一致
for (const f of ['LICENSE', 'LICENSE-CONTENT.md']) {
  if (fs.existsSync(path.join(ROOT, f))) fs.copyFileSync(path.join(ROOT, f), path.join(OUT, f))
}

// PWA 运行时缓存：sw.js 写在产物根（scope=站点根），index.html 注入注册。
// 缓存代次取 contentVersion——内容批次更新后旧代整清，配合 SWR 双保险。
// 仅注入发布产物，dev 不装 SW（避免缓存干扰开发调试）。
const swTemplate = fs.readFileSync(path.join(ROOT, 'tools', 'sw-template.js'), 'utf8')
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'content', 'catalog.json'), 'utf8'))
fs.writeFileSync(path.join(OUT, 'sw.js'), swTemplate.replaceAll('__VERSION__', 'kx-' + catalog.contentVersion))
const indexPath = path.join(OUT, 'index.html')
let indexHtml = fs.readFileSync(indexPath, 'utf8')
if (!indexHtml.includes('serviceWorker')) {
  const regScript = '<script>if("serviceWorker" in navigator){window.addEventListener("load",function(){navigator.serviceWorker.register("./sw.js").catch(function(){})})}</script>'
  const closeAt = indexHtml.lastIndexOf('</body>')
  if (closeAt === -1) {
    console.error('index.html 未找到 </body>，SW 注册注入失败')
    process.exit(1)
  }
  indexHtml = indexHtml.slice(0, closeAt) + regScript + indexHtml.slice(closeAt)
  fs.writeFileSync(indexPath, indexHtml)
}

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
  if (!['.html', '.js', '.css', '.json', '.webmanifest'].includes(ext)) return false
  return /["'`]\/static\//.test(fs.readFileSync(f, 'utf8'))
})

console.log(`扫描 ${files.length} 个文件，改写 ${changed} 个`)
if (leftover.length) {
  console.error('仍残留 /static/ 绝对路径:', leftover.join(', '))
  process.exit(1)
}
console.log('✓ 全部路径已相对化:', OUT)

/**
 * 离线可用性验证（对**发布产物**跑真实浏览器）。
 *
 * 为什么单独一个工具：service worker 只存在于发布产物（tools/publish-github-pages.mjs 写
 * sw.js 并往 index.html 注入注册），构建目录里根本没有，所以 npm run smoke:h5（跑构建目录）
 * 永远测不到它。而"车上/飞机上没有网也能打开"正是这个 PWA 的存在意义。
 *
 * 覆盖：
 *   1) SW 注册 → 安装 → 接管（clients.claim）
 *   2) 缓存代次建立：外壳 + /assets/ + /static/ 三个缓存
 *   3) **断网刷新仍能打开**（外壳从缓存来）
 *   4) 断网仍能取到已缓存的静态资源（音频/笔顺数据）
 *   5) 换代：版本变化后旧缓存代次被清掉（避免旧图/旧音频残留）
 *
 * 前置：npm run build:h5 && node tools/publish-github-pages.mjs
 * 用法：node tools/verify-offline.mjs
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { fileURLToPath } from 'node:url'
import { launchChrome } from './lib/cdp.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PUBLISH_DIR = path.join(ROOT, 'tmp', 'gh-preview')
const PORT = Number(process.env.OFFLINE_PORT || 4175)
const CDP_PORT = Number(process.env.OFFLINE_CDP_PORT || 9241)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const results = []
let failures = 0
function check(name, cond, detail = '') {
  results.push(`${cond ? '✔' : '✖'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!cond) failures++
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.mp3': 'audio/mpeg',
  '.ico': 'image/x-icon',
}

/**
 * 极简静态服务器（只服务指定目录，带 Range 支持）。
 * Range 必须实现：否则"206 不能被当成完整文件缓存"这条安全前提根本无从验证——
 * 浏览器/媒体元素正是带 Range 取音频的。
 */
function serve(dir, port) {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split('?')[0].split('#')[0])
    const file = path.join(dir, urlPath === '/' ? 'index.html' : urlPath)
    if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404, { 'content-type': 'text/plain' })
      return res.end('not found')
    }
    const type = MIME[path.extname(file)] || 'application/octet-stream'
    const size = fs.statSync(file).size
    const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || '').trim())
    if (range) {
      let start
      let end
      if (range[1] === '' && range[2] !== '') {
        start = Math.max(0, size - Number(range[2]))
        end = size - 1
      } else {
        start = Number(range[1] || 0)
        end = range[2] === '' ? size - 1 : Math.min(Number(range[2]), size - 1)
      }
      if (start > end || start >= size) {
        res.writeHead(416, { 'content-range': 'bytes */' + size })
        return res.end()
      }
      res.writeHead(206, {
        'content-type': type,
        'content-range': `bytes ${start}-${end}/${size}`,
        'content-length': String(end - start + 1),
        'accept-ranges': 'bytes',
      })
      return fs.createReadStream(file, { start, end }).pipe(res)
    }
    res.writeHead(200, { 'content-type': type, 'content-length': String(size), 'accept-ranges': 'bytes' })
    fs.createReadStream(file).pipe(res)
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', reject)
      resolve(server)
    })
  })
}

/** 彻底关闭并等端口释放（不等的话同端口再起会 EADDRINUSE / 拿到旧响应） */
function closeServer(server) {
  return new Promise((resolve) => {
    if (!server) return resolve()
    server.close(() => resolve())
    server.closeAllConnections?.()
  })
}

const BASE = `http://127.0.0.1:${PORT}`

async function main() {
  if (!fs.existsSync(path.join(PUBLISH_DIR, 'sw.js'))) {
    console.error(`未找到发布产物：${PUBLISH_DIR}\\sw.js\n请先运行：npm run build:h5 && node tools/publish-github-pages.mjs`)
    process.exit(2)
  }
  const swText = fs.readFileSync(path.join(PUBLISH_DIR, 'sw.js'), 'utf8')
  const version = (swText.match(/const VERSION = '([^']+)'/) || [])[1]
  if (!version) {
    console.error('sw.js 里没有 VERSION 占位符（发布脚本没替换？）')
    process.exit(2)
  }

  // 换代验证用的副本：把版本号改掉，模拟"内容变了 → 新代次"
  const rotatedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kx-rotated-'))
  fs.cpSync(PUBLISH_DIR, rotatedDir, { recursive: true, force: true })
  const nextVersion = version + '-next'
  fs.writeFileSync(path.join(rotatedDir, 'sw.js'), swText.replaceAll(version, nextVersion))

  let server = await serve(PUBLISH_DIR, PORT)
  const cdp = await launchChrome({ port: CDP_PORT })
  try {
    await cdp.send('Network.enable')
    await cdp.send('Page.enable')

    // ---------- 1. 首次在线访问：注册并接管 ----------
    await cdp.setViewport(390, 844)
    await cdp.navigate(`${BASE}/#/pages/map/map`)
    let controlled = false
    for (let i = 0; i < 40 && !controlled; i++) {
      await sleep(300)
      controlled = await cdp.eval(`return !!(navigator.serviceWorker && navigator.serviceWorker.controller)`)
    }
    check('service worker 注册并接管页面（controller 存在）', controlled)
    if (!controlled) {
      const reg = await cdp.eval(`
        if (!navigator.serviceWorker) return 'no sw api'
        const rs = await navigator.serviceWorker.getRegistrations()
        return rs.length ? JSON.stringify({ scope: rs[0].scope, active: !!rs[0].active, installing: !!rs[0].installing, waiting: !!rs[0].waiting }) : 'no registration'
      `)
      check('SW 注册状态诊断', false, String(reg))
    }

    // ---------- 2. 缓存代次与外壳 ----------
    const caches1 = await cdp.eval(`return await caches.keys()`)
    check(
      `缓存代次带内容版本（${version}）`,
      Array.isArray(caches1) && caches1.some((n) => n.endsWith(version)),
      (caches1 || []).join(', '),
    )
    const shell = await cdp.eval(`
      const name = (await caches.keys()).find((n) => n.startsWith('kx-pages-'))
      if (!name) return { ok: false }
      const cache = await caches.open(name)
      const keys = await cache.keys()
      return { ok: true, urls: keys.map((r) => new URL(r.url).pathname) }
    `)
    check('应用外壳已预缓存（安装即缓存 ./ 与 index.html）', shell.ok && shell.urls.length > 0, (shell.urls || []).join(', '))

    // ---------- 3. 在线取一个静态资源，确保进 static 缓存 ----------
    const audioUrl = await cdp.eval(`
      const res = await fetch('./static/audio/dog.mp3')
      const buf = await res.arrayBuffer()
      return { ok: res.ok, bytes: buf.byteLength, status: res.status }
    `)
    check('在线能取到音频（为离线验证准备缓存）', audioUrl.ok && audioUrl.bytes > 1000, `${audioUrl.status} ${audioUrl.bytes}B`)
    await sleep(600) // 等 cache.put 落地（挂在 waitUntil 上）
    const staticCache = await cdp.eval(`
      const name = (await caches.keys()).find((n) => n.startsWith('kx-static-'))
      if (!name) return { name: null, count: 0, has: false }
      const cache = await caches.open(name)
      const keys = await cache.keys()
      return { name, count: keys.length, has: keys.some((r) => r.url.endsWith('dog.mp3')) }
    `)
    check('静态资源进 static 缓存（音频走缓存优先）', staticCache.has, `${staticCache.name}：${staticCache.count} 条`)

    // ---------- 3b. 带 Range 的在线请求不能把 206 半截内容写进缓存 ----------
    // 这是上面 range 支持的**安全前提**：一旦把 206 当完整响应存下来，
    // 之后离线播放就会拿到被截断的文件（比不能播更隐蔽）。
    // 选一个真实存在、且上面没缓存过的音频（别写死文件名——写错会变成 404 假失败）。
    const audioDir = path.join(PUBLISH_DIR, 'static', 'audio')
    const probeName = fs
      .readdirSync(audioDir)
      .filter((f) => f.endsWith('.mp3') && f !== 'dog.mp3')
      .sort()[0]
    check('能选到一个未缓存的音频用于 Range 探测', !!probeName, String(probeName))
    const probeUrl = `./static/audio/${probeName}`
    const notCached = await cdp.eval(`
      const res = await fetch(${JSON.stringify(probeUrl)}, { headers: { Range: 'bytes=0-99' } })
      return { status: res.status, bytes: (await res.arrayBuffer()).byteLength }
    `)
    await sleep(600)
    const partialCached = await cdp.eval(`
      const name = (await caches.keys()).find((n) => n.startsWith('kx-static-'))
      if (!name) return false
      const cache = await caches.open(name)
      const keys = await cache.keys()
      return keys.some((r) => r.url.endsWith(${JSON.stringify(probeName)}))
    `)
    check(
      '在线 Range 请求（206）不会被缓存成"完整文件"',
      notCached.status === 206 && notCached.bytes === 100 && !partialCached,
      `${probeName}: status=${notCached.status} bytes=${notCached.bytes} 被缓存=${partialCached}`,
    )

    // ---------- 3c. PWA manifest 完整性 ----------
    // manifest 里的 URL 是**相对 manifest 自身**解析的，而它位于 /static/ 下：
    //  - start_url / scope 必须落在应用根，否则装到桌面后打开的是 /static/ 目录（或导航跑出作用域）；
    //  - 图标路径若写成绝对 /static/...，发布脚本的相对化会把它改成 ./static/... →
    //    从 /static/ 出发变成 /static/static/... → 404，图标丢失。
    // 所以这里在"发布产物"上按 URI 规则实际解析一遍。
    {
      const mPath = path.join(PUBLISH_DIR, 'static', 'manifest.webmanifest')
      let mani = null
      try {
        mani = JSON.parse(fs.readFileSync(mPath, 'utf8'))
      } catch (e) {
        /* 下面断言会报 */
      }
      const origin = new URL(BASE).href
      const manifestUrl = new URL('static/manifest.webmanifest', origin)
      const appRoot = new URL('./', origin)
      const startUrl = mani ? new URL(mani.start_url, manifestUrl) : null
      const scope = mani && mani.scope ? new URL(mani.scope, manifestUrl) : manifestUrl ? new URL('./', manifestUrl) : null
      check(
        'PWA manifest 可解析且声明了名字',
        !!mani && typeof mani.name === 'string' && mani.name.length > 0,
        mani ? `${mani.name} / ${mani.short_name}` : '解析失败',
      )
      check(
        'manifest 的 start_url 落在应用根（不是 /static/）',
        !!startUrl && startUrl.href === appRoot.href,
        startUrl ? `${mani.start_url} → ${startUrl.pathname}（应为 ${appRoot.pathname}）` : '',
      )
      check(
        'manifest 的 scope 覆盖整个应用',
        !!scope && scope.href === appRoot.href,
        scope ? `${mani.scope || '(默认)'} → ${scope.pathname}（应为 ${appRoot.pathname}）` : '',
      )
      const icons = (mani && mani.icons) || []
      const missingIcons = icons.filter((ic) => {
        const rel = new URL(ic.src, manifestUrl).pathname.replace(new URL(BASE).pathname, '')
        return !fs.existsSync(path.join(PUBLISH_DIR, rel))
      })
      check(
        'manifest 声明的图标在产物里都存在且路径可达',
        icons.length > 0 && missingIcons.length === 0,
        icons.length ? `${icons.length} 个：${icons.map((i) => i.src).join(', ')}${missingIcons.length ? ' 缺失 ' + missingIcons.map((i) => i.src).join(',') : ''}` : '没有声明任何图标',
      )
      const linkOk = /rel="icon"/.test(fs.readFileSync(path.join(PUBLISH_DIR, 'index.html'), 'utf8'))
      check('index.html 声明了标签页图标（否则浏览器会去探 /favicon.ico 404）', linkOk)
    }

    // ---------- 3d. 发布产物运行期零 404（路径相对化改写的正确性） ----------
    // 发布脚本把产物里的 `/static/...` 逐处改写成 `./static/...`，改漏一处就只在
    // **线上** 404（构建目录照样正常，smoke 跑的是构建目录，永远看不到）。
    // 所以这里在发布产物上真跑一遍主要页面，并主动取几个运行时拼出来的资源。
    const imgName = fs
      .readdirSync(path.join(PUBLISH_DIR, 'static', 'img'))
      .filter((f) => f.endsWith('.png'))
      .sort()[0]
    cdp.responses.clear()
    const probeRoutes = [
      'pages/map/map',
      'pages/learn/learn?subject=en&cat=animals&lessonId=en-learn-animals',
      'pages/quiz/quiz?subject=en&level=1&lessonId=en-quiz-l1',
      'pages/learn/learn?subject=zh&level=1&lessonId=zh-learn-l1',
      'pages/math/practice?level=2',
      'pages/poem/poem?stage=qimeng&lessonId=zh-poem-qimeng',
      'pages/write/write?char=%E4%B8%80&cp=4e00&pinyin=y%C4%AB',
      'pages/collection/collection',
      'pages/parent/parent',
    ]
    for (const route of probeRoutes) {
      await cdp.navigate(`${BASE}/#/${route}`)
      await sleep(1400)
    }
    // 运行时拼出来的路径最容易漏改写：音频/图片/笔顺数据/manifest/图标各取一个
    const fetched = await cdp.eval(`
      const urls = ['./static/audio/dog.mp3', './static/img/${imgName}', './static/icons/icon.png', './static/manifest.webmanifest', './static/hanzi-data/4e00.json']
      const out = []
      for (const u of urls) {
        try {
          const r = await fetch(u)
          out.push(u.replace('./static/', '') + ':' + r.status)
        } catch (e) {
          out.push(u.replace('./static/', '') + ':ERR')
        }
      }
      return out
    `)
    const publishedBad = [...cdp.responses.entries()]
      .filter(([u]) => u.startsWith(BASE))
      .filter(([, s]) => s >= 400)
    check(
      '发布产物运行期零 404（相对化改写无遗漏）',
      publishedBad.length === 0 && cdp.responses.size > 30,
      publishedBad.length
        ? `${publishedBad.length} 条：${publishedBad.slice(0, 5).map(([u, s]) => `${s} ${u.replace(BASE, '')}`).join(' | ')}`
        : `检查 ${cdp.responses.size} 个响应；主动取值 ${fetched.join(' ')}`,
    )

    // ---------- 3e. 绝对路径改写自检（静态，比运行时 404 更早暴露问题） ----------
    // 发布脚本按三种引号形态改写 `/static/` → `./static/`。漏掉的形态（例如写成
    // `"/static"` 不带尾斜杠、或用变量拼）不会报错，只在线上 404。
    // 规则：**引号/括号紧跟 /static/** 才算"代码里的字面量"；
    //       注释里提到的（前面是空格或 *）与 sw.js 的运行时判定（includes('/static/')）不算。
    // 自证：同一条规则跑在**构建产物**上必然大量命中（那里绝对路径是预期的），
    //       跑在发布产物上必须为 0 —— 两边一起看，这条断言才不可能"永远为绿"。
    {
      const TEXT_EXT = ['.js', '.css', '.html', '.json', '.webmanifest']
      const RUNTIME_TEST = /(?:includes|startsWith|endsWith|indexOf)\('[^']*\/static\/[^']*'\)/
      function scanAbsoluteStatic(dir) {
        const files = []
        ;(function walkText(d) {
          for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            const p = path.join(d, e.name)
            if (e.isDirectory()) walkText(p)
            else if (TEXT_EXT.includes(path.extname(e.name).toLowerCase())) files.push(p)
          }
        })(dir)
        const hits = []
        for (const f of files) {
          const text = fs.readFileSync(f, 'utf8')
          const re = /["'`(]\s*\/static\//g
          let m
          while ((m = re.exec(text))) {
            const around = text.slice(Math.max(0, m.index - 60), m.index + 60)
            if (RUNTIME_TEST.test(around)) continue
            hits.push(`${path.relative(dir, f)} → …${around.replace(/\s+/g, ' ')}…`)
          }
        }
        return { files, hits }
      }

      const pub = scanAbsoluteStatic(PUBLISH_DIR)
      check(
        '发布产物里没有残留的绝对 /static 字面量（改写完整性静态自检）',
        // 必须同时要求"确实扫到了文件"：files 为空时 hits 也是 0 → 恒真假绿灯
        pub.files.length > 0 && pub.hits.length === 0,
        pub.hits.length ? `${pub.hits.length} 处：${pub.hits.slice(0, 3).join(' | ')}` : `扫了 ${pub.files.length} 个文本文件`,
      )
      // 阴性对照（阳性对照更准确）：构建产物里绝对路径本就存在，规则必须能大量命中，
      // 否则说明规则写坏了（例如正则不再匹配）——那样上面那条 0 就是假绿灯。
      const BUILD_DIR = path.join(ROOT, 'dist', 'build', 'h5')
      if (fs.existsSync(BUILD_DIR)) {
        const build = scanAbsoluteStatic(BUILD_DIR)
        check(
          '同一条规则在构建产物上大量命中（证明改写自检有判别力）',
          build.hits.length > 100,
          `构建产物命中 ${build.hits.length} 处 / 发布产物 ${pub.hits.length} 处`,
        )
      } else {
        check('同一条规则在构建产物上大量命中（证明改写自检有判别力）', false, `找不到 ${BUILD_DIR}，无法做对照`)
      }
    }

    // ---------- 4. 断网刷新仍能打开（核心） ----------
    // 上面为查 404 连着跑了 9 个页面，最后停在家长页；这里先回到课程主页，
    // 下面的断网刷新断言依赖"当前是首页"（阶段胶囊 ×4）。
    await cdp.navigate(`${BASE}/#/pages/map/map`)
    await sleep(1500)
    await cdp.send('Network.emulateNetworkConditions', {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    })
    await sleep(300)
    await cdp.send('Page.reload', { ignoreCache: true })
    await sleep(2500)
    const offlineHome = await cdp.eval(`
      return {
        chips: document.querySelectorAll('.stage-chip').length,
        cards: document.querySelectorAll('.unit-card').length,
        text: document.body.innerText.trim().slice(0, 40),
      }
    `)
    check(
      '断网后刷新仍能打开应用（外壳来自缓存，不是浏览器错误页）',
      offlineHome.chips === 4 && offlineHome.cards > 0,
      `阶段胶囊 ${offlineHome.chips} / 课程卡 ${offlineHome.cards}`,
    )

    // ---------- 5. 断网仍能取到已缓存的静态资源 ----------
    const offlineAudio = await cdp.eval(`
      try {
        const res = await fetch('./static/audio/dog.mp3')
        const buf = await res.arrayBuffer()
        return { ok: res.ok, bytes: buf.byteLength, status: res.status }
      } catch (e) { return { ok: false, error: String(e && e.message) } }
    `)
    check(
      '断网仍能取到已缓存的音频（离线可听）',
      offlineAudio.ok && offlineAudio.bytes > 1000,
      offlineAudio.ok ? `${offlineAudio.bytes}B` : String(offlineAudio.error || offlineAudio.status),
    )

    // ---------- 5b. 带 Range 的请求（媒体元素就是这么取音频的） ----------
    // sw.js 原实现对带 range 的请求直接放行 → 断网时绕过缓存打到网络 → 离线放不出声。
    // 现在从缓存的完整响应里切 206，这里验证切片正确、以及真的能播。
    const offlineRange = await cdp.eval(`
      try {
        const res = await fetch('./static/audio/dog.mp3', { headers: { Range: 'bytes=0-99' } })
        const buf = await res.arrayBuffer()
        return { ok: res.ok, status: res.status, bytes: buf.byteLength, contentRange: res.headers.get('content-range') }
      } catch (e) { return { ok: false, error: String(e && e.message).slice(0, 120) } }
    `)
    check(
      '断网时带 Range 的请求返回 206 且切片正确（不是半截缓存）',
      offlineRange.status === 206 && offlineRange.bytes === 100 && /bytes 0-99\//.test(offlineRange.contentRange || ''),
      `status=${offlineRange.status} bytes=${offlineRange.bytes} content-range=${offlineRange.contentRange || offlineRange.error}`,
    )

    const offlinePlay = await cdp.eval(`
      const a = new Audio('./static/audio/dog.mp3')
      a.muted = true
      let err = null
      a.addEventListener('error', () => { err = (a.error && a.error.code) || 'error' })
      try { await a.play() } catch (e) { err = String(e && e.message).slice(0, 90) }
      await new Promise((r) => setTimeout(r, 1500))
      return { readyState: a.readyState, currentTime: +a.currentTime.toFixed(2), error: err }
    `)
    check(
      '断网时媒体元素真的能开始播放（readyState≥2，之前是 0 + 报错）',
      offlinePlay.readyState >= 2 && !offlinePlay.error,
      `readyState=${offlinePlay.readyState} t=${offlinePlay.currentTime}s 错误=${offlinePlay.error || '无'}`,
    )

    // 应用自身走 Howler Web Audio（XHR 整文件）——离线也必须能拿到数据
    const offlineHowler = await cdp.eval(`
      const h = new window.Howl({ src: ['./static/audio/dog.mp3'], html5: false })
      let state = null
      h.once('load', () => { state = 'loaded' })
      h.once('loaderror', () => { state = 'loaderror' })
      h.play()
      await new Promise((r) => setTimeout(r, 1800))
      return { state }
    `)
    check('断网时应用音频封装（Howler Web Audio）能加载成功', offlineHowler.state === 'loaded', `state=${offlineHowler.state}`)

    // ---------- 6. 换代：新版本激活后清掉旧缓存代次 ----------
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    })
    server.close()
    await closeServer(server)
    server = await serve(rotatedDir, PORT)
    const rotatedHasSw = fs.existsSync(path.join(rotatedDir, 'sw.js'))
    if (!rotatedHasSw) console.error(`⚠ 换代副本缺少 sw.js：${rotatedDir}`)
    await cdp.navigate(`${BASE}/#/pages/map/map`) // 触发 SW 更新检查
    await cdp.eval(`
      const rs = await navigator.serviceWorker.getRegistrations()
      for (const r of rs) await r.update()
      return 1
    `)
    let rotated = false
    for (let i = 0; i < 40 && !rotated; i++) {
      await sleep(400)
      rotated = await cdp.eval(`
        const names = await caches.keys()
        return names.some((n) => n.endsWith(${JSON.stringify(nextVersion)}))
      `)
    }
    await sleep(1200) // 等 activate 清理完成
    const caches2 = await cdp.eval(`return await caches.keys()`)
    check('版本变化后新代次被建立', rotated, (caches2 || []).join(', '))
    check(
      'activate 清掉旧代次（不留旧图/旧音频残留）',
      Array.isArray(caches2) && !caches2.some((n) => n.endsWith(version)),
      `旧代次 ${version} 仍在：${(caches2 || []).filter((n) => n.endsWith(version)).join(', ') || '否'}`,
    )
  } finally {
    await cdp.close()
    try {
      await closeServer(server)
    } catch (e) {
      /* ignore */
    }
    try {
      fs.rmSync(rotatedDir, { recursive: true, force: true })
    } catch (e) {
      /* ignore */
    }
  }
}

main()
  .then(() => {
    console.log('\n===== 离线可用性验证（发布产物）=====')
    results.forEach((r) => console.log(r))
    console.log(`\n${failures ? '✖ 失败 ' + failures + ' 项' : '✓ 全部通过'}（共 ${results.length} 项）`)
    process.exitCode = failures ? 1 : 0
  })
  .catch((e) => {
    console.error('离线验证异常:', e)
    process.exitCode = 1
  })

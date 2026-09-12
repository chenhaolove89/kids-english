/**
 * 源码级契约测试：这些约束跨文件、跨构建产物（页面 / 发布脚本 / index.html），
 * 没有浏览器测试环境可跑，但一旦被静默破坏就会造成「线上 404」「清空没清干净」
 * 「答错不教」这类回归。故直接用源码扫描把它们钉住。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === 'static' || e.name === 'node_modules') continue
      walk(p, out)
    } else out.push(p)
  }
  return out
}

/**
 * 去掉注释后再扫描：注释里正当讨论 `/static/ → ./static/` 的写法不算违规，
 * 只有真实代码里的路径字面量才会进产物、才会 404。
 * 带引号状态机，避免把字符串里的 `//`（如 https://）误当注释起点。
 */
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

test('发布路径改写契约：源码里每个 /static/ 前面必须紧邻可改写的引号', () => {
  // publish-github-pages.mjs:60-62 只替换 `"/static/`、`` `/static/ ``、`'/static/` 三种形态，
  // 并在 :112 用 /["'`]\/static\// 兜底检查产物。任何「裸」/static/（前面不是引号）
  // 或 "/static"（缺尾斜杠）都会在子路径部署时留下绝对路径 → 线上静默 404。
  const files = walk(path.join(ROOT, 'src')).filter((f) => /\.(vue|js|json|mjs)$/.test(f))
  assert.ok(files.length > 20, `扫描到的源文件太少（${files.length}），路径可能不对`)

  const bad = []
  for (const f of files) {
    const text = stripComments(fs.readFileSync(f, 'utf8'))
    const rel = path.relative(ROOT, f).replace(/\\/g, '/')
    let idx = text.indexOf('/static/')
    while (idx !== -1) {
      const prev = idx === 0 ? '' : text[idx - 1]
      if (!['"', "'", '`'].includes(prev)) {
        bad.push(`${rel}: 裸 /static/（前一个字符是 ${JSON.stringify(prev)}）`)
      }
      idx = text.indexOf('/static/', idx + 1)
    }
    // 缺尾斜杠的写法无法被 replaceAll('/static/') 覆盖
    for (const m of text.matchAll(/["'`]\/static(?![\/\w])/g)) {
      bad.push(`${rel}: 出现 "${m[0]}"（/static 缺尾斜杠，改写规则覆盖不到）`)
    }
  }
  assert.deepEqual(bad, [], `以下位置会在 GitHub Pages 子路径部署下 404：\n${bad.join('\n')}`)
})

test('清空学习记录必须清掉全部学习键（含错题本）', () => {
  const src = read('src/pages/parent/parent.vue')
  const start = src.indexOf('function clearRecords()')
  assert.ok(start > -1, '未找到 clearRecords')
  const end = src.indexOf('\n}', start)
  const body = src.slice(start, end)
  for (const key of ['attempts', 'sessions', 'active', 'review', 'collection']) {
    assert.ok(
      body.includes(`store.remove('${key}')`),
      `clearRecords 漏删 ${key}：漏了错题本(review)会让「清空」后首页错题重练入口和家长页待复习数照旧`,
    )
  }
})

test('页面允许缩放：家长要在同一台设备上放大读报告', () => {
  const html = read('index.html')
  // viewport 是 document.write 里拼出来的，只检查那段 content 字符串（注释里提到旧写法不算）
  const m = html.match(/<meta name="viewport" content="([^"]*)"/)
  assert.ok(m, 'index.html 未找到 viewport meta')
  const content = m[1]
  assert.ok(!content.includes('user-scalable=no'), `viewport 不应禁止缩放（WCAG 1.4.4）：${content}`)
  const max = content.match(/maximum-scale=([\d.]+)/)
  assert.ok(max && Number(max[1]) >= 2, `应允许放大到 2 倍以上：${content}`)
})

test('尊重系统「减弱动态效果」：动画必须可被 prefers-reduced-motion 关掉', () => {
  const app = read('src/App.vue')
  assert.ok(app.includes('prefers-reduced-motion'), 'App.vue 缺少 prefers-reduced-motion 分支')
})

test('答错必须揭晓正确答案（quiz 与 math 两条链路都要有）', () => {
  for (const p of ['src/pages/quiz/quiz.vue', 'src/pages/math/practice.vue']) {
    const src = read(p)
    assert.ok(src.includes('revealId'), `${p} 缺少答错揭晓状态 revealId`)
    assert.ok(src.includes('speakAnswer'), `${p} 揭晓时没有读出正确答案`)
    // 揭晓期间必须屏蔽点击：否则孩子靠「被告知答案后再点一次」刷分/刷错题晋级
    assert.match(src, /if \(flash(Id)?\.value \|\| revealing\.value\) return/, `${p} 揭晓期间未屏蔽重复点击`)
  }
})

test('页面卸载要清定时器：否则退出后定时器仍会 completeSession', () => {
  for (const p of ['src/pages/quiz/quiz.vue', 'src/pages/math/practice.vue']) {
    const src = read(p)
    assert.ok(src.includes('clearTimers'), `${p} 缺少 clearTimers`)
    assert.match(src, /onUnload\(\(\) => \{\s*clearTimers\(\)/, `${p} 的 onUnload 未清理定时器`)
    // 除登记表自身外，不应再有直接 setTimeout（否则又出现漏清的定时器）
    const body = src.slice(0, src.indexOf('function clearTimers'))
    const stray = [...body.matchAll(/setTimeout\(/g)].length
    assert.equal(stray, 1, `${p} 除定时器登记表外还有 ${stray - 1} 处直接 setTimeout`)
  }
})

test('生成产物必须可复现：不得含墙钟时间（否则重跑一次就让客户端全量重下）', () => {
  // 背景：contentVersion 曾由 words/hanzi 的 generatedAt 参与计算，而 generatedAt 是
  // 每次 gen:assets 写的当前时间 → 「什么都没改、只重跑一次生成」也会让版本变化
  // → SW 缓存代次整代失效 → 客户端把全部音频图片重新下一遍。
  const artifacts = ['src/data/words.json', 'src/data/hanzi.json', 'src/content/catalog.json']
  for (const p of artifacts) {
    const text = read(p)
    const m = text.match(/"(generatedAt|builtAt|timestamp|builtOn)"\s*:/)
    assert.equal(m, null, `${p} 含墙钟字段 ${m && m[0]}：产物必须可复现（同样输入 → 同样字节）`)
  }
  for (const p of ['tools/gen-assets.mjs', 'tools/validate-content.mjs']) {
    const src = stripComments(read(p))
    assert.ok(
      !/new Date\(\)\.toISOString\(\)/.test(src),
      `${p} 仍在生成产物里写当前时间，会破坏可复现性与缓存代次稳定性`,
    )
  }
  // 目录版本必须是内容派生的固定长度 hash
  const catalog = JSON.parse(read('src/content/catalog.json'))
  assert.match(catalog.contentVersion, /^[0-9a-f]{10}$/, 'contentVersion 应是 10 位十六进制内容哈希')
  assert.equal('generatedAt' in catalog, false, 'catalog 不应再带 generatedAt')
})

test('收集图鉴服务边界：页面走注入了解析器的 collection-app，纯服务保持可测', () => {
  // 纯服务（services/collection.js）不 import 任何数据 JSON，因此能被 Node 单测覆盖；
  // 解析器由 services/collection-app.js 注入。页面若直接 import 纯服务，
  // 拿到的是未注入版本 → 明确抛错（而不是静默不点亮）。
  const pages = walk(path.join(ROOT, 'src', 'pages')).filter((f) => f.endsWith('.vue'))
  assert.ok(pages.length >= 8, `扫描到的页面太少（${pages.length}）`)
  for (const f of pages) {
    const text = stripComments(fs.readFileSync(f, 'utf8'))
    const rel = path.relative(ROOT, f).replace(/\\/g, '/')
    assert.ok(
      !text.includes("from '@/services/collection.js'"),
      `${rel} 直接 import 了未注入解析器的 collection.js（应改为 collection-app.js）`,
    )
  }
  const pure = stripComments(read('src/services/collection.js'))
  assert.ok(!/from '\.\.\/(data|content)\//.test(pure), 'services/collection.js 不得 import 数据 JSON，否则单测无法覆盖')
  assert.ok(!/getStorage/.test(pure), 'services/collection.js 不应自取存储单例（存储由调用方注入）')
})

test('收起原生 tabBar 必须走 platform/router-ui（uni.hideTabBar 返回 Promise，try/catch 拦不住）', () => {
  // 实测：uni.hideTabBar 不传回调时返回 Promise，失败（not TabBar page）会变成
  // unhandledrejection——页面里的 try/catch 完全拦不住，控制台当报错、污染错误监控。
  // 由 tools/smoke-h5.mjs 的真实浏览器断言守着这条。
  const pages = walk(path.join(ROOT, 'src', 'pages')).filter((f) => f.endsWith('.vue'))
  for (const f of pages) {
    const text = stripComments(fs.readFileSync(f, 'utf8'))
    const rel = path.relative(ROOT, f).replace(/\\/g, '/')
    assert.ok(!/uni\.hideTabBar\s*\(/.test(text), `${rel} 直接调用 uni.hideTabBar，应改用 platform/router-ui.js 的 hideNativeTabBar()`)
  }
  const helper = read('src/platform/router-ui.js')
  assert.match(helper, /typeof ret\.catch === 'function'/, 'router-ui 必须显式吞掉返回的 Promise 拒绝')
})

test('笔顺描红画布必须跟随田字格尺寸（禁止再写死 300px）', () => {
  // 实测：.board 是 640rpx → 320px 屏只有 277px（写死 300px 会超出被 overflow:hidden 裁掉），
  // iPad（1rpx=1px）面板 652px 时字只占中间 46%。尺寸必须由面板实测值决定，
  // 且 HanziWriter 的字形变换在 create 时算好 → 尺寸变了要重建。
  const src = stripComments(read('src/pages/write/write.vue'))
  assert.ok(!/width:\s*300\s*,/.test(src), '画布尺寸不得写死 300px')
  assert.match(src, /function boardSize\(\)/, '应有按面板实测尺寸取值的辅助函数')
  assert.match(src, /clientWidth/, '尺寸应取 clientWidth（不含 6rpx 边框）')
  assert.match(src, /addEventListener\('resize'/, '窗口/旋转变化后要重建画布')
  assert.match(src, /removeEventListener\('resize'/, '卸载时要摘掉 resize 监听')
})

test('顶栏必须走共享组件 page-top-bar（禁止再在页面里复制一份）', () => {
  // 这段结构与样式此前在 9 个页面里逐字重复（约 60 行模板 + 约 130 行样式）。
  // 重构后由「截图回归 + 像素比对」验收（tools/shots.mjs），此处只防回退。
  const pages = walk(path.join(ROOT, 'src', 'pages')).filter((f) => f.endsWith('.vue'))
  const TOPBAR_PAGES = ['quiz/quiz', 'math/practice', 'learn/learn', 'poem/poem', 'write/write', 'math/math', 'index/index', 'chinese/chinese']
  for (const p of TOPBAR_PAGES) {
    const file = path.join(ROOT, 'src', 'pages', p + '.vue')
    const text = fs.readFileSync(file, 'utf8')
    assert.match(text, /<PageTopBar[\s>]/, `${p}.vue 应使用 <PageTopBar>`)
    assert.match(text, /from '@\/components\/page-top-bar\.vue'/, `${p}.vue 应 import PageTopBar`)
    // 页面里不应再出现共享的返回钮/标题结构
    assert.ok(!/class="back"/.test(text), `${p}.vue 仍在手写返回钮结构`)
    assert.ok(!/\.back-icon\s*\{/.test(text), `${p}.vue 仍在复制 .back-icon 样式`)
  }
  const comp = read('src/components/page-top-bar.vue')
  for (const prop of ['title', 'titleSize', 'backBg', 'ellipsis']) {
    assert.match(comp, new RegExp(`${prop}:`), `共享顶栏缺 prop ${prop}（各页差异需要它才能保持逐像素一致）`)
  }
})

test('课程查询服务边界：页面走 curriculum-app，纯服务不碰 JSON/存储（否则无法单测）', () => {
  // services/curriculum.js 是导航层（地址拼接 + 继续学习降级），必须可 Node 单测：
  // 一旦它 import catalog.js（进而 import catalog.json），Node 会以
  // ERR_IMPORT_ATTRIBUTE_MISSING 拒绝加载，整模块又回到零覆盖。
  const pure = stripComments(read('src/services/curriculum.js'))
  assert.ok(!/from '\.\.\/(content|data)\//.test(pure), 'services/curriculum.js 不得 import 数据 JSON')
  assert.ok(!/getStorage/.test(pure), 'services/curriculum.js 不应自取存储单例（存储由调用方注入）')
  assert.ok(!/export function (stageBlocks|lessonUrl|continueTarget)/.test(pure), '纯服务应导出工厂而不是直接可用函数')

  const pages = walk(path.join(ROOT, 'src', 'pages')).filter((f) => f.endsWith('.vue'))
  for (const f of pages) {
    const text = stripComments(fs.readFileSync(f, 'utf8'))
    const rel = path.relative(ROOT, f).replace(/\\/g, '/')
    assert.ok(
      !text.includes("from '@/services/curriculum.js'"),
      `${rel} 直接 import 了未注入依赖的 curriculum.js（应改为 curriculum-app.js）`,
    )
  }
})

test('偏好核心保持可测：content/prefs.js 不得自取存储，lowAge.js 只做门面', () => {
  // 低龄模式是内容安全开关，必须能被单测覆盖（tests/prefs.test.js）。
  // 一旦 prefs.js 自取 getStorage() 单例，就又回到"只能靠手点验证"的状态。
  const core = stripComments(read('src/content/prefs.js'))
  assert.ok(!/getStorage/.test(core), 'content/prefs.js 不应 import/调用 getStorage（存储由参数注入）')
  assert.ok(!/from '\.\.\/platform\//.test(core), 'content/prefs.js 不应依赖 platform 层')
  assert.match(core, /export function createPrefs/, '应导出注入式工厂')

  const facade = read('src/content/lowAge.js')
  assert.match(facade, /from '\.\/prefs\.js'/, 'lowAge.js 应复用纯核心')
  assert.match(facade, /createPrefs\(getStorage\(\)\)/, 'lowAge.js 负责注入真实存储')
})

test('数学题型集合自洽：分派链实现的 kind 与关卡池一一对应（无死题型、无未实现题型）', () => {
  // 池里有、分派链没有 → 该关抽到就白屏/崩（历史上 compareNum 就是这么出事的）
  // 分派链有、池里没有 → 永远跑不到的死题型（白养代码 + 让人误以为有 26 种）
  const src = read('src/domain/mathgen.js')
  const body = src.slice(src.indexOf('function makeQuestion'), src.indexOf('export function mathText'))
  const dispatch = [...new Set([...body.matchAll(/kind === '([a-zA-Z0-9]+)'/g)].map((m) => m[1]))].sort()
  const poolStart = src.indexOf('const KINDS_BY_LEVEL')
  const pool = [...new Set([...src.slice(poolStart, src.indexOf('\n}', poolStart)).matchAll(/'([a-zA-Z0-9]+)'/g)].map((m) => m[1]))].sort()
  assert.deepEqual(pool.filter((k) => !dispatch.includes(k)), [], '关卡池里有未实现的题型（抽到会白屏）')
  assert.deepEqual(dispatch.filter((k) => !pool.includes(k)), [], '实现了但任何关卡都选不到的题型（死题型）')
  assert.equal(
    pool.length,
    23,
    `题型数变成 ${pool.length}：请同步 README「数据规模」里的「9 个关卡 / N 个题型」与冒烟的题型分支断言`,
  )
})

test('数学关卡真源唯一：旧入口从 MATH_LEVELS 派生，且带 lessonId 记录进度', () => {
  // 注释里回顾「4 个关卡」这类历史问题不算违规，只看真实代码
  const src = stripComments(read('src/pages/math/math.vue'))
  assert.ok(src.includes("from '@/domain/mathgen.js'"), '旧入口应从 domain/mathgen.js 取关卡真源')
  assert.ok(src.includes('MATH_LEVELS'), '旧入口必须用 MATH_LEVELS')
  // 曾经的问题：只列 6 关（L7/L8/L9 进不去）+ 标题写死「4 个关卡」
  assert.ok(!src.includes('4 个关卡'), '不得再写死关卡数量')
  assert.ok(src.includes('{{ levels.length }}'), '关卡数必须动态来自真源')
  assert.ok(!/name: '(认识数字|十以内加减|二十以内)'/.test(src), '不得再抄一份关卡名称副本')
  // 不带 lessonId 的旧入口玩一整关不留任何记录
  assert.ok(src.includes('lessonId='), '旧入口必须带 lessonId，否则不记会话/不记星/不点亮图鉴')
})

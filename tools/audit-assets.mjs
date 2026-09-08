/**
 * 资源审计：把「引用是否齐全」和「孩子是否有图可认」两件事一次查清。
 *
 * 与 validate-content 的分工：那边管课程目录的逻辑一致性，这里管静态资源本体——
 * 引用对账、空文件、英式口音镜像、纯文字卡覆盖度、真孤儿。
 *
 * 判定口径（都是踩过的坑，改的时候别退回旧写法）：
 * - 引用来源要含 pages.json / manifest.webmanifest / index.html，tab 与 app 图标在里面的路径没有前导斜杠。
 * - 数学语音是 `${audioBase}/zh-xxx.mp3`、`n${i}.mp3` 运行时拼出来的，按模式补齐，不算孤儿。
 * - 英式音轨由 withAccent 字符串改写，永远不会被字面量引用，按镜像规则补齐。
 * - 空白图按「单一颜色覆盖 ≥95% 采样像素」判定；国旗类 2~3 条纹不算空白。
 *
 * 退出码：仅「引用缺失 / 空文件 / 英式镜像缺口」为 1；文字卡覆盖度与孤儿只报告不失败。
 */
import fs from 'fs'
import path from 'path'
import zlib from 'zlib'
import crypto from 'crypto'

const ROOT = path.resolve(import.meta.dirname, '..')
const STATIC = path.join(ROOT, 'src', 'static')
const RE = /\/?static\/[\w\-./]*/g
const ASSET_EXT = /\.(?:png|jpe?g|svg|webp|gif|mp3|ogg|m4a|wav|ico|webmanifest)$/i

const norm = (p) => (p.startsWith('/') ? p : `/${p}`)
/** 只有带资源扩展名的才算一条资源引用：/static/audio 这类目录前缀与注释里的示例路径要排除 */
const isAssetRef = (p) => ASSET_EXT.test(p)
const statOf = (ref) => {
  const abs = path.join(ROOT, 'src', norm(ref).replace(/^\//, ''))
  try {
    const st = fs.statSync(abs)
    return st.size > 0 ? 'ok' : 'empty'
  } catch (e) {
    return 'missing'
  }
}

/* ---------- 1. 收集引用 ---------- */
function collectJson(node, where, out) {
  if (typeof node === 'string') {
    for (const m of node.match(RE) || []) if (isAssetRef(m)) out.push({ ref: norm(m), where })
    return
  }
  if (Array.isArray(node)) return node.forEach((v, i) => collectJson(v, `${where}[${i}]`, out))
  if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) collectJson(v, `${where}.${k}`, out)
}

const refs = []
const DATA_JSON = ['src/data/words.json', 'src/data/hanzi.json', 'src/content/catalog.json']
const CONFIG_FILES = ['src/pages.json', 'src/static/manifest.webmanifest', 'index.html', 'src/manifest.json']

for (const jf of DATA_JSON) collectJson(JSON.parse(fs.readFileSync(path.join(ROOT, jf), 'utf8')), jf, refs)

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, acc)
    else if (/\.(vue|js|json|html)$/.test(e.name)) acc.push(p)
  }
  return acc
}
for (const f of [...walk(path.join(ROOT, 'src')), ...CONFIG_FILES.map((f) => path.join(ROOT, f))]) {
  const rel = path.relative(ROOT, f).replace(/\\/g, '/')
  if (DATA_JSON.includes(rel)) continue
  fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach((line, i) => {
    for (const m of line.match(RE) || []) {
      if (/\$\{/.test(line) || !isAssetRef(m)) continue
      refs.push({ ref: norm(m), where: `${rel}:${i + 1}` })
    }
  })
}

/* ---------- 2. 引用对账 ---------- */
const broken = []
for (const r of refs) {
  const st = statOf(r.ref)
  if (st !== 'ok') broken.push({ ...r, status: st })
}

/* ---------- 3. 英式口音镜像 ---------- */
const words = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/words.json'), 'utf8'))
const EN_AUDIO = /^\/static\/audio\/(?!zh-)(?!n\d)[A-Za-z][A-Za-z0-9'_-]*\.mp3$/
const gbMissing = []
for (const c of words.categories) {
  for (const w of c.words) {
    if (!EN_AUDIO.test(w.audio || '')) continue
    const gb = w.audio.replace('/static/audio/', '/static/audio-gb/')
    if (statOf(gb) !== 'ok') gbMissing.push(`${c.id}/${w.id} → ${gb}`)
  }
}

/* ---------- 4. 图片本体体检 ---------- */
function pngStats(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return { error: 'not-png' }
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20), bitDepth = buf[24], colorType = buf[25]
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType]
  if (!channels || !w || !h) return { error: 'unsupported' }
  const chunks = []
  let off = 8
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off)
    if (buf.toString('ascii', off + 4, off + 8) === 'IDAT') chunks.push(buf.subarray(off + 8, off + 8 + len))
    off += 12 + len
  }
  let raw
  try { raw = zlib.inflateSync(Buffer.concat(chunks)) } catch (e) { return { error: 'inflate-error' } }
  const bpp = Math.max(1, Math.floor((channels * bitDepth) / 8))
  const stride = Math.ceil((w * channels * bitDepth) / 8)
  const prev = Buffer.alloc(stride), cur = Buffer.alloc(stride)
  const rowStep = Math.max(1, Math.floor(h / 160)), colStep = Math.max(1, Math.floor(w / 160))
  const hist = new Map()
  let o = 0
  for (let y = 0; y < h; y++) {
    const filter = raw[o++]
    raw.copy(cur, 0, o, o + stride)
    o += stride
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0
      let v = cur[i]
      if (filter === 1) v = (v + a) & 0xff
      else if (filter === 2) v = (v + b) & 0xff
      else if (filter === 3) v = (v + ((a + b) >> 1)) & 0xff
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff
      }
      cur[i] = v
    }
    cur.copy(prev, 0)
    if (y % rowStep) continue
    if (colorType === 3) {
      const mask = (1 << bitDepth) - 1
      for (let x = 0; x < w; x += colStep) {
        const bp = x * bitDepth
        const idx = (cur[bp >> 3] >> (8 - bitDepth - (bp & 7))) & mask
        hist.set(idx, (hist.get(idx) || 0) + 1)
      }
    } else {
      for (let x = 0; x < w; x += colStep) {
        const key = cur.subarray(x * bpp, x * bpp + bpp).toString('base64')
        hist.set(key, (hist.get(key) || 0) + 1)
      }
    }
  }
  let n = 0, top = 0
  for (const v of hist.values()) { n += v; if (v > top) top = v }
  return { distinct: hist.size, topFrac: n ? top / n : 1 }
}

const blankish = []
const dup = new Map()
for (const f of fs.readdirSync(path.join(STATIC, 'img'))) {
  const buf = fs.readFileSync(path.join(STATIC, 'img', f))
  const sum = crypto.createHash('sha1').update(buf).digest('hex')
  if (!dup.has(sum)) dup.set(sum, [])
  dup.get(sum).push(f)
  if (!f.endsWith('.png')) continue
  const st = pngStats(buf)
  if (st.error || st.topFrac >= 0.95) blankish.push({ f, bytes: buf.length, note: st.error || `单色占 ${Math.round(st.topFrac * 100)}%` })
}

/* ---------- 5. 真孤儿 ---------- */
const referenced = new Set(refs.map((r) => r.ref))
for (let i = 0; i <= 100; i++) referenced.add(`/static/audio/n${i}.mp3`) // 数学数字音轨按序号拼
for (const m of ['zh-countit', 'zh-total', 'zh-listen', 'zh-missing', 'zh-plus', 'zh-minus', 'zh-times', 'zh-divided', 'zh-howmany', 'zh-equals', 'zh-ji', 'zh-more', 'zh-less', 'zh-bigger', 'zh-smaller', 'zh-choose', 'zh-awesome', 'zh-great', 'zh-try', 'zh-ok']) {
  referenced.add(`/static/audio/${m}.mp3`) // mathgen 里 ${audioBase}/zh-xxx.mp3
}
// 启蒙中文配音：learn.vue 按词 id 拼出 /static/audio-zh/{id}.mp3
for (const c of words.categories) {
  if (c.level !== 1) continue
  for (const w of c.words) referenced.add(`/static/audio-zh/${w.id}.mp3`)
}
for (const r of [...referenced]) {
  if (EN_AUDIO.test(r)) referenced.add(r.replace('/static/audio/', '/static/audio-gb/'))
}
const orphans = []
for (const dir of ['img', 'audio', 'audio-gb', 'audio-zh', 'tab', 'icons']) {
  const abs = path.join(STATIC, dir)
  if (!fs.existsSync(abs)) continue
  for (const f of fs.readdirSync(abs)) if (!referenced.has(`/static/${dir}/${f}`)) orphans.push(`${dir}/${f}`)
}

/* ---------- 6. 图片卡 vs 纯文字卡（按阶段） ---------- */
// 判定看图片本体，不信 words.json 的 card 标签：形状卡已改成真几何图形，
// 但标签仍是 word，按标签统计会把已修好的资源误报成「整类无图」。
const artCache = new Map()
function hasArt(ref) {
  if (!ref) return false
  if (artCache.has(ref)) return artCache.get(ref)
  let art
  try {
    const abs = path.join(ROOT, 'src', norm(ref).replace(/^\//, ''))
    if (ref.endsWith('.svg')) {
      // 词卡背景固定是两个 rect（外底色 + 内描边），剔除后仍有绘图图元才算真图形
      const body = fs.readFileSync(abs, 'utf8')
        .replace(/<rect x="16"[^>]*\/>/, '')
        .replace(/<rect x="34"[^>]*\/>/, '')
      art = /<(?:circle|polygon|polyline|path|ellipse|line|rect|image)\b/.test(body)
    } else {
      art = true
    }
  } catch (e) {
    art = false
  }
  artCache.set(ref, art)
  return art
}

const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/content/catalog.json'), 'utf8'))
const stageOfCat = new Map()
for (const l of catalog.lessons || []) if (l.ref?.kind === 'en-category') stageOfCat.set(l.ref.id, l.stage)
const byStage = {}
for (const c of words.categories) {
  const pic = c.words.filter((w) => hasArt(w.image)).length
  const text = c.words.length - pic
  const st = stageOfCat.get(c.id) || '未挂课'
  const g = (byStage[st] = byStage[st] || { cats: 0, pic: 0, text: 0, noPic: [] })
  g.cats++; g.pic += pic; g.text += text
  if (!pic) g.noPic.push(`${c.zh} ${c.id}(${text})`)
}

/* ---------- 7. 混合分类缺图词（认读白名单锁） ---------- */
// 有图的分类里不允许出现「没有着落」的文字卡词——那是「漏配图」（水果 7 词教训）：
// 孩子翻到该词只有字没有图。缺图词只有两种合法状态：① 已补图；② 在认读白名单里
// （抽象词如 today/Monday/uncle、动作词 act-* 等，设计上不配图，走认读）。
// 白名单外的缺图词一律 fail。历史上 312 词基线已随档2 铺图完成清空（2026-09-08）。
// 整类无图的分类（认读类/字母数字等）不在此检查内，仍走上面的覆盖度报告。
const WHITELIST_FILE = path.join(ROOT, 'tools', 'audit-textcard-whitelist.json')
const mixedMissing = []
for (const c of words.categories) {
  const noPic = c.words.filter((w) => !hasArt(w.image))
  if (noPic.length && noPic.length < c.words.length) {
    mixedMissing.push({ cat: c.id, zh: c.zh, ids: noPic.map((w) => w.id) })
  }
}
const whitelist = JSON.parse(fs.readFileSync(WHITELIST_FILE, 'utf8'))
const newMissing = []
const fixedInWhitelist = []
for (const m of mixedMissing) {
  const base = new Set(whitelist[m.cat] || [])
  for (const id of m.ids) if (!base.has(id)) newMissing.push(`${m.cat}/${id}`)
  for (const id of base) if (!m.ids.includes(id)) fixedInWhitelist.push(`${m.cat}/${id}`)
}

/* ---------- 输出 ---------- */
const uniqRefs = new Set(refs.map((r) => r.ref))
console.log('=== 资源审计 ===')
console.log(`引用 ${uniqRefs.size} 个唯一路径（数据+源码+配置，共 ${refs.length} 处）`)
console.log(`引用缺失/空文件：${broken.length}`)
for (const b of broken.slice(0, 30)) console.log(`  [${b.status}] ${b.ref} ← ${b.where}`)
console.log(`英式音轨缺口：${gbMissing.length}`)
for (const g of gbMissing.slice(0, 20)) console.log('  ' + g)
const l1Words = words.categories.filter((c) => c.level === 1).flatMap((c) => c.words)
const zhLearnMissing = l1Words.filter((w) => statOf(`/static/audio-zh/${w.id}.mp3`) !== 'ok')
console.log(`启蒙中文配音：${l1Words.length - zhLearnMissing.length}/${l1Words.length} 就绪`)
for (const w of zhLearnMissing.slice(0, 20)) console.log(`  缺 audio-zh/${w.id}.mp3（${w.zh}）`)
console.log(`疑似空白图：${blankish.length}（单色国旗属正常，需人工确认）`)
for (const b of blankish.slice(0, 15)) console.log(`  ${b.f} ${b.bytes}B ${b.note}`)
const dupGroups = [...dup.values()].filter((v) => v.length > 1)
console.log(`字节重复图片组：${dupGroups.length}`)
console.log(`未被引用文件：${orphans.length}`)
for (const o of orphans.slice(0, 25)) console.log('  ' + o)
console.log('\n=== 英语卡片：图片卡 vs 纯文字卡（按阶段） ===')
for (const [st, g] of Object.entries(byStage)) {
  const pct = Math.round((g.text / (g.pic + g.text)) * 100)
  console.log(`${st}: 分类${g.cats} 图片卡${g.pic} 文字卡${g.text}（${pct}%）| 整类无图: ${g.noPic.join('、') || '无'}`)
}
const wlCount = Object.values(whitelist).reduce((n, v) => n + v.length, 0)
console.log(`\n=== 混合分类缺图词（认读白名单）：白名单 ${wlCount} 个 / ${Object.keys(whitelist).length} 类 ===`)
for (const m of mixedMissing) console.log(`  ${m.zh} ${m.cat} ${m.ids.length} 个: ${m.ids.join(' ')}`)
if (newMissing.length) {
  console.log(`  ✗ 白名单外缺图词 ${newMissing.length} 个（必须补 emoji 码点、进自绘图标库，或明确加入认读白名单）:`)
  for (const n of newMissing) console.log('    ' + n)
}
if (fixedInWhitelist.length) {
  console.log(`  ✓ 已补图可从白名单移除 ${fixedInWhitelist.length} 个: ${fixedInWhitelist.slice(0, 30).join(' ')}${fixedInWhitelist.length > 30 ? ' …' : ''}`)
}
const fail = broken.length || gbMissing.length || zhLearnMissing.length || newMissing.length
const failNote = [
  broken.length && `缺失 ${broken.length}`,
  gbMissing.length && `英式缺口 ${gbMissing.length}`,
  zhLearnMissing.length && `启蒙中文配音缺口 ${zhLearnMissing.length}`,
  newMissing.length && `混合分类新增缺图 ${newMissing.length}`,
].filter(Boolean).join('，')
console.log(fail ? `\n✗ 资源审计未通过（${failNote}）` : '\n✓ 资源审计通过：引用齐全、无空文件、英式镜像与启蒙中文配音完整、混合分类无新增缺图')
if (fail) process.exit(1)

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { withAccent } from '../src/platform/assets.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('英式口音：英文词/反馈音重写到 audio-gb 目录', () => {
  assert.equal(withAccent('/static/audio/red.mp3', 'gb'), '/static/audio-gb/red.mp3')
  assert.equal(withAccent('/static/audio/watermelon.mp3', 'gb'), '/static/audio-gb/watermelon.mp3')
  assert.equal(withAccent('/static/audio/great_job.mp3', 'gb'), '/static/audio-gb/great_job.mp3')
})

test('课堂口音（az）：英文词/反馈音重写到 audio-azure 目录', () => {
  assert.equal(withAccent('/static/audio/red.mp3', 'az'), '/static/audio-azure/red.mp3')
  assert.equal(withAccent('/static/audio/watermelon.mp3', 'az'), '/static/audio-azure/watermelon.mp3')
  assert.equal(withAccent('/static/audio/great_job.mp3', 'az'), '/static/audio-azure/great_job.mp3')
  assert.equal(withAccent('./static/audio/red.mp3', 'az'), './static/audio-azure/red.mp3')
  // 非法口音值与语文/数学音频一律原样
  assert.equal(withAccent('/static/audio/red.mp3', 'xx'), '/static/audio/red.mp3')
  assert.equal(withAccent('/static/audio/zh-great.mp3', 'az'), '/static/audio/zh-great.mp3')
  assert.equal(withAccent('/static/audio/n9.mp3', 'az'), '/static/audio/n9.mp3')
})

test('美式口音（默认）：路径一律原样', () => {
  assert.equal(withAccent('/static/audio/red.mp3', 'us'), '/static/audio/red.mp3')
  assert.equal(withAccent('/static/audio/red.mp3', undefined), '/static/audio/red.mp3')
})

test('语文/数学音频即使误传也绝不改写', () => {
  // 语文：zh- 前缀（字音/例词/指令语）
  assert.equal(withAccent('/static/audio/zh-4e91.mp3', 'gb'), '/static/audio/zh-4e91.mp3')
  assert.equal(withAccent('/static/audio/zh-great.mp3', 'gb'), '/static/audio/zh-great.mp3')
  // 数学：n数字（数读）
  assert.equal(withAccent('/static/audio/n9.mp3', 'gb'), '/static/audio/n9.mp3')
  assert.equal(withAccent('/static/audio/n100.mp3', 'gb'), '/static/audio/n100.mp3')
  // 语文码点命名（四位十六进制，数字开头）
  assert.equal(withAccent('/static/audio/4e91.mp3', 'gb'), '/static/audio/4e91.mp3')
})

test('非法输入原样返回：空值/外链不重写', () => {
  assert.equal(withAccent('', 'gb'), '')
  assert.equal(withAccent(null, 'gb'), null)
  assert.equal(withAccent(undefined, 'gb'), undefined)
  assert.equal(withAccent('https://cdn.example.com/red.mp3', 'gb'), 'https://cdn.example.com/red.mp3')
})

test('大写开头的英文音频同样切英式（星期/国家等专有名词）', () => {
  assert.equal(withAccent('/static/audio/China.mp3', 'gb'), '/static/audio-gb/China.mp3')
  assert.equal(withAccent('/static/audio/Monday.mp3', 'gb'), '/static/audio-gb/Monday.mp3')
  assert.equal(withAccent('/static/audio/CD.mp3', 'gb'), '/static/audio-gb/CD.mp3')
})

test('./ 前缀同样切英式（GitHub Pages 发布改写后的运行时形态）', () => {
  assert.equal(withAccent('./static/audio/red.mp3', 'gb'), './static/audio-gb/red.mp3')
  assert.equal(withAccent('./static/audio/Monday.mp3', 'gb'), './static/audio-gb/Monday.mp3')
  // ./ 形态下语文/数学同样不改写
  assert.equal(withAccent('./static/audio/zh-4e91.mp3', 'gb'), './static/audio/zh-4e91.mp3')
  assert.equal(withAccent('./static/audio/n9.mp3', 'gb'), './static/audio/n9.mp3')
})

test('防回归：源码不得用反引号模板字符串拼 /static/ 路径（打包后原样保留，发布改写只认引号字符串 → 线上 404）', () => {
  // audio-zh 字母音全挂的教训：`/static/audio-zh/${id}.mp3` 打包后仍是反引号模板，
  // publish-github-pages 的 "/static/ 改写碰不到它，GitHub Pages 子路径部署下必 404。
  // 运行时路径一律走数据 JSON（双引号）或普通字符串拼接（打包后统一为双引号被改写）。
  const offenders = []
  const scan = (dir) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name)
      if (f.isDirectory()) { scan(p); continue }
      if (!/\.(vue|js)$/.test(f.name)) continue
      const text = fs.readFileSync(p, 'utf8')
      if (/`\/static\//.test(text)) offenders.push(path.relative(ROOT, p))
    }
  }
  scan(path.join(ROOT, 'src', 'pages'))
  scan(path.join(ROOT, 'src', 'platform'))
  scan(path.join(ROOT, 'src', 'services'))
  assert.deepEqual(offenders, [], `以下文件存在反引号拼的 /static/ 路径: ${offenders.join(', ')}`)
})

test('防回归：页面运行时路径必须走 assetUrl（小程序 CDN 化的唯一切换点）', () => {
  // 页面里引号字符串形态的 /static/ 若不经 assetUrl 包裹，将来切 CDN 前缀时页面要逐个再改。
  // 数据 JSON / domain 层默认参数（mathgen audioBase）/ 发布脚本自身不在扫描范围。
  const offenders = []
  const scan = (dir) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name)
      if (f.isDirectory()) { scan(p); continue }
      if (!/\.vue$/.test(f.name)) continue
      const lines = fs.readFileSync(p, 'utf8').split('\n')
      lines.forEach((line, i) => {
        if (/['"]\/?\.?\/?static\//.test(line) && !/assetUrl\(/.test(line)) {
          offenders.push(`${path.relative(ROOT, p)}:${i + 1}: ${line.trim().slice(0, 80)}`)
        }
      })
    }
  }
  scan(path.join(ROOT, 'src', 'pages'))
  assert.deepEqual(offenders, [], `以下行存在未走 assetUrl 的 /static/ 引用:\n${offenders.join('\n')}`)
})

test('全量：每条英文音频都取得到真实存在的英式/课堂音轨', () => {
  const words = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/words.json'), 'utf8'))
  const gaps = []
  for (const c of words.categories) {
    for (const w of c.words) {
      for (const [label, dir] of [['英式', 'audio-gb'], ['课堂', 'audio-azure']]) {
        const mirrored = withAccent(w.audio, label === '英式' ? 'gb' : 'az')
        if (mirrored === w.audio) gaps.push(`${c.id}/${w.id} 未被改写（${label}）：${w.audio}`)
        else if (!fs.existsSync(path.join(ROOT, 'src', mirrored.slice(1)))) gaps.push(`${c.id}/${w.id} ${label}文件缺失：${mirrored}`)
      }
    }
  }
  assert.deepEqual(gaps, [])
})

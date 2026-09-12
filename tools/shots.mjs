/**
 * 截图回归（真实 Chrome，零依赖）——给「不该有任何视觉变化」的重构做像素级验收。
 *
 * 为什么需要：改造页面结构（抽公共组件、挪样式）时，"我没改样式"只是声称；
 * 只有逐像素比对才能证明。用 Page.captureScreenshot + pngjs 求差。
 *
 * 确定性措施（缺一不可，否则每次截图都不同）：
 *   1) 注入固定种子的 Math.random → 随机出题/随机打乱的页面每次内容一致
 *   2) 截图前注入 CSS 关掉动画与过渡 → 呼吸闪烁/进度条不会造成偶然差异
 *   3) 每个页面先清 localStorage → 不受上一页留下的进度影响
 *   4) 固定视口 + 固定 deviceScaleFactor + 滚到顶部
 *
 * 用法：
 *   node tools/shots.mjs capture tmp/shots-before
 *   ...（改代码 + npm run build:h5）...
 *   node tools/shots.mjs capture tmp/shots-after
 *   node tools/shots.mjs compare tmp/shots-before tmp/shots-after
 * 退出码：compare 有差异时为 1。
 *
 * 环境变量：
 *   SHOTS_ONLY=poem,write        只截/比这几个页面（做假设验证时用）
 *   SHOTS_EXTRA_CSS="<css>"      截图前注入覆盖样式（用于隔离"是哪个属性造成的差异"）
 *   SHOTS_DIFF_DIR=tmp/diff      输出差异图（差异像素标红）便于人眼定位
 *   SHOTS_TOLERANCE=16           每像素四通道差之和的容差（0 = 严格逐像素）
 *
 * 噪声底线（2026-09 实测，务必按这个口径解读结果）：
 * 这个工具**不是逐位精确的判定器**，而是带噪声的回归工具。同一份代码连跑两次，
 * 通常有 0~2 个页面出现极小差异（几十~200 像素，四通道差之和 ≤30，密度 <0.05%），
 * 位置集中在图片/文字的边缘，且**随机器负载变化**（同一页有时稳定有时抖）。
 * 已做的降噪：显式 await img.decode()（complete 只代表数据到手，不代表解码完成）、
 * 字体就绪、两帧 rAF、连续两帧一致才采信（不稳定会打印 ⚠）。
 * 结论口径：
 *   - 想判「某页是否真的没变」→ 同一 session 里再跑一次 capture 作对照（同代码噪声），
 *     只有当"改动后差异"明显超出"同代码差异"时才算真差异。
 *   - 跨构建批量比对 → `SHOTS_TOLERANCE=16`，并按差异 bbox/密度判断是边缘抖动还是成片变化。
 *   - 纯逻辑重构（如把直接 import 改成注入式工厂）别用像素判定：把旧实现从 git HEAD 取出来
 *     参数化，与新实现逐输入比对输出（阶段×课程×存储状态全枚举），比"看起来一样"强得多。
 */
import fs from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'
import { launchChrome, safeJson } from './lib/cdp.mjs'

const PORT = Number(process.env.SHOTS_PORT || 4173)
const BASE = `http://127.0.0.1:${PORT}`
const CDP_PORT = Number(process.env.SHOTS_CDP_PORT || 9231)

/** 固定种子的 PRNG（mulberry32），保证随机出题每次一致 */
const SEED_SCRIPT = `
  (function () {
    let a = 0x9e3779b9;
    Math.random = function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  })();
`

/** 截图前关动画：只保留最终静止状态 */
const FREEZE_CSS = `
  (function () {
    const s = document.createElement('style');
    s.textContent = '*{animation:none !important;transition:none !important;caret-color:transparent !important}';
    document.head.appendChild(s);
    window.scrollTo(0, 0);
  })();
`

const SHOTS = [
  { name: 'map', route: 'pages/map/map' },
  { name: 'quiz', route: 'pages/quiz/quiz?subject=en&level=3&lessonId=en-quiz-l3' },
  { name: 'learn-en', route: 'pages/learn/learn?subject=en&cat=animals&lessonId=en-learn-animals' },
  { name: 'learn-zh', route: 'pages/learn/learn?subject=zh&level=1&lessonId=zh-learn-l1' },
  { name: 'practice', route: 'pages/math/practice?level=2&lessonId=math-practice-l2' },
  { name: 'math', route: 'pages/math/math' },
  { name: 'index', route: 'pages/index/index' },
  { name: 'chinese', route: 'pages/chinese/chinese' },
  { name: 'poem', route: 'pages/poem/poem?stage=qimeng&lessonId=zh-poem-qimeng' },
  { name: 'write', route: 'pages/write/write?char=%E4%B8%80&cp=4e00&pinyin=y%C4%AB' },
  { name: 'collection', route: 'pages/collection/collection' },
  { name: 'parent', route: 'pages/parent/parent' },
]

const VIEWPORTS = [
  { tag: 'phone', w: 390, h: 844 },
  { tag: 'ipad', w: 1024, h: 768 },
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function capture(outDir) {
  fs.mkdirSync(outDir, { recursive: true })
  const cdp = await launchChrome({ port: CDP_PORT })
  try {
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: SEED_SCRIPT })
    const extraCss = process.env.SHOTS_EXTRA_CSS || ''
    if (extraCss) {
      // 注意：addScriptToEvaluateOnNewDocument 在「文档开始」执行，此时
      // document.head 与 documentElement 都还不存在 → 直接 appendChild 会被静默丢弃。
      // 必须轮询等到有宿主节点再插入。
      await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
        source: `(function(){var css=${JSON.stringify(extraCss)};var n=0;(function tick(){var h=document.head||document.documentElement;if(h){var s=document.createElement('style');s.textContent=css;h.appendChild(s);return}if(++n<400)setTimeout(tick,5)})()})();`,
      })
    }
    const only = (process.env.SHOTS_ONLY || '').split(',').map((s) => s.trim()).filter(Boolean)
    const shots = only.length ? SHOTS.filter((s) => only.includes(s.name)) : SHOTS
    const index = []
    for (const vp of VIEWPORTS) {
      await cdp.setViewport(vp.w, vp.h)
      for (const shot of shots) {
        // 同源下清掉存储，让每个页面都从"全新用户"状态渲染
        await cdp.freshNavigate(`${BASE}/`)
        await cdp.eval(`localStorage.clear(); return 1`)
        await cdp.freshNavigate(`${BASE}/#/${shot.route}`)
        await sleep(1800)
        // 等「真的稳定」：
        //  - img.complete 只代表数据到手，不代表已解码；未解码的位图与容器的
        //    background-image 叠加会产生抗锯齿级差异（uni 的 <image> 正好是两层绘制）。
        //    所以这里显式 await img.decode()。
        //  - 字体就绪 + 两帧 rAF。
        await cdp.eval(`
          const dec = Promise.all([...document.images].map((i) => (i.decode ? i.decode().catch(() => {}) : Promise.resolve())))
          const fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()
          return Promise.all([dec, fonts]).then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(1)))))
        `)
        await cdp.eval(FREEZE_CSS)
        await sleep(250)
        // 连续两帧必须完全一致才采信（避免把"正在重绘"的中间态写进基线）
        const file = path.join(outDir, `${shot.name}-${vp.tag}.png`)
        let stable = false
        let prev = null
        for (let attempt = 0; attempt < 6 && !stable; attempt++) {
          const r = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
          const buf = Buffer.from(r.data, 'base64')
          if (prev && prev.equals(buf)) {
            fs.writeFileSync(file, buf)
            stable = true
            break
          }
          prev = buf
          await sleep(220)
        }
        if (!stable) {
          // 一直不稳定：仍然写出最后一帧，但明确警告（基线可信度下降）
          if (prev) fs.writeFileSync(file, prev)
          console.log(`  ⚠ ${shot.name}-${vp.tag}: 连续两帧不稳定，已写出最后一帧`)
        }
        const size = fs.statSync(file).size
        index.push(`${shot.name}-${vp.tag}: ${size}B${stable ? '' : ' (unstable)'}`)
        console.log(`  ${shot.name}-${vp.tag}.png (${(size / 1024).toFixed(1)}KB)${stable ? '' : ' ⚠不稳定'}`)
      }
    }
    const errs = cdp.allErrors()
    if (errs.length) console.log(`\n⚠ 截图期间出现 ${errs.length} 条错误：\n  ` + errs.slice(0, 5).join('\n  '))
    fs.writeFileSync(path.join(outDir, 'index.txt'), index.join('\n') + '\n')
    console.log(`\n已保存 ${index.length} 张截图到 ${outDir}`)
  } finally {
    await cdp.close()
  }
}

function readPng(file) {
  return PNG.sync.read(fs.readFileSync(file))
}

function compare(dirA, dirB, tolerance = 0) {
  const files = fs.readdirSync(dirA).filter((f) => f.endsWith('.png')).sort()
  if (!files.length) {
    console.error(`目录里没有截图：${dirA}`)
    process.exitCode = 2
    return
  }
  let bad = 0
  let missing = 0
  for (const f of files) {
    const pb = path.join(dirB, f)
    if (!fs.existsSync(pb)) {
      console.log(`✖ 缺少对照截图: ${f}`)
      missing++
      continue
    }
    const a = readPng(path.join(dirA, f))
    const b = readPng(pb)
    if (a.width !== b.width || a.height !== b.height) {
      console.log(`✖ ${f}: 尺寸不同 ${a.width}x${a.height} vs ${b.width}x${b.height}`)
      bad++
      continue
    }
    let diffPx = 0
    let maxDiff = 0
    let sumDiff = 0
    let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1
    for (let i = 0; i < a.data.length; i += 4) {
      const d =
        Math.abs(a.data[i] - b.data[i]) +
        Math.abs(a.data[i + 1] - b.data[i + 1]) +
        Math.abs(a.data[i + 2] - b.data[i + 2]) +
        Math.abs(a.data[i + 3] - b.data[i + 3])
      if (d > tolerance) {
        diffPx++
        sumDiff += d
        if (d > maxDiff) maxDiff = d
        const px = (i / 4) % a.width
        const py = Math.floor(i / 4 / a.width)
        if (px < minX) minX = px
        if (px > maxX) maxX = px
        if (py < minY) minY = py
        if (py > maxY) maxY = py
      }
    }
    const total = (a.width * a.height)
    if (diffPx === 0) {
      console.log(`✔ ${f}: 像素完全一致（${total} px）`)
    } else {
      bad++
      // 差异位置很关键：集中在小块＝抗锯齿/字体抖动；成片＝真实布局变化
      const w = maxX - minX + 1
      const h = maxY - minY + 1
      const density = ((diffPx / (w * h)) * 100).toFixed(1)
      console.log(
        `✖ ${f}: ${diffPx} px 有差异（占 ${((diffPx / total) * 100).toFixed(3)}%），最大通道差 ${maxDiff}，平均 ${(sumDiff / diffPx).toFixed(1)}`,
      )
      console.log(`     差异区域 bbox: x ${minX}..${maxX}（宽 ${w}） y ${minY}..${maxY}（高 ${h}），区域内密度 ${density}%`)
      // 输出放大后的差异图（差异像素标红，其余保留原图灰阶），便于人眼定位
      if (process.env.SHOTS_DIFF_DIR) {
        fs.mkdirSync(process.env.SHOTS_DIFF_DIR, { recursive: true })
        const out = new PNG({ width: a.width, height: a.height })
        for (let i = 0; i < a.data.length; i += 4) {
          const d =
            Math.abs(a.data[i] - b.data[i]) +
            Math.abs(a.data[i + 1] - b.data[i + 1]) +
            Math.abs(a.data[i + 2] - b.data[i + 2]) +
            Math.abs(a.data[i + 3] - b.data[i + 3])
          if (d > tolerance) {
            out.data[i] = 255
            out.data[i + 1] = 0
            out.data[i + 2] = 0
            out.data[i + 3] = 255
          } else {
            const g = Math.round((a.data[i] + a.data[i + 1] + a.data[i + 2]) / 3)
            out.data[i] = out.data[i + 1] = out.data[i + 2] = g
            out.data[i + 3] = 255
          }
        }
        fs.writeFileSync(path.join(process.env.SHOTS_DIFF_DIR, f.replace(/\.png$/, '.diff.png')), PNG.sync.write(out))
      }
    }
  }
  const ok = files.length - bad - missing
  console.log(`\n一致 ${ok} / 差异 ${bad} / 缺失 ${missing}（共 ${files.length}）`)
  if (bad || missing) {
    console.log('提示：差异在文字区域通常是字体/抗锯齿抖动，先重跑一次 capture 对比同一份代码确认基线是否稳定。')
    process.exitCode = 1
  }
}

const [cmd, a, b] = process.argv.slice(2)
if (cmd === 'capture') {
  capture(a || path.join('tmp', 'shots'))
    .then(() => {
      if (process.exitCode) console.error('截图过程有错误')
    })
    .catch((e) => {
      console.error('截图失败:', e)
      process.exitCode = 1
    })
} else if (cmd === 'compare') {
  if (!a || !b) {
    console.error('用法：node tools/shots.mjs compare <基线目录> <对照目录>')
    process.exit(2)
  }
  compare(a, b, Number(process.env.SHOTS_TOLERANCE || 0))
} else {
  console.error('用法：node tools/shots.mjs capture <目录> | compare <目录A> <目录B>')
  console.error('示例：node tools/shots.mjs capture tmp/shots-before && node tools/shots.mjs compare tmp/shots-before tmp/shots-latest')
  process.exit(2)
}

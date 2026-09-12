/**
 * H5 冒烟测试（真实 Chrome + CDP，零依赖）。
 *
 * 为什么需要它：本项目此前没有任何浏览器级测试，于是"改了页面但没法验证"成了常态。
 * 这里用 Node 内置的 WebSocket 直接驱动 Chrome DevTools Protocol，把
 * 「页面能不能起来、交互对不对、样式有没有真的生效」变成可执行断言。
 *
 * 跑法：
 *   npm run build:h5
 *   node tools/serve.mjs 4173      # 另开一个终端
 *   npm run smoke:h5
 * 环境变量：SMOKE_PORT（默认 4173）、SMOKE_CDP_PORT（默认 9222）、CHROME_PATH
 *
 * 覆盖场景：
 *   1) 首页渲染 + 手机/iPad 两种宽度的 rpx 基准（pages.json 里 rpxCalc* 的实际效果）
 *   2) 挑战页：答错揭晓正确答案 → 自动进下一题
 *   3) 中途中止 → 回到同一课，快照与作答记录连续（不重新出题）
 *   4) 错题重练入口与重练模式
 *   5) 口音切换真的去取 audio-gb 音轨（线上 404 风险点）
 *   6) 家长页新区块、收集页可读性、320px 窄屏不横向溢出、零控制台报错
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { launchChrome, safeJson } from './lib/cdp.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = Number(process.env.SMOKE_PORT || 4173)
const BASE = `http://127.0.0.1:${PORT}`
const CDP_PORT = Number(process.env.SMOKE_CDP_PORT || 9222)

const results = []
let failures = 0

function pass(name, detail = '') {
  results.push(`✔ ${name}${detail ? ' — ' + detail : ''}`)
}
function fail(name, detail = '') {
  failures++
  results.push(`✖ ${name}${detail ? ' — ' + detail : ''}`)
}
function check(name, cond, detail = '') {
  if (cond) pass(name, detail)
  else fail(name, detail)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * 空池早退路径的「闪现」检查：池为空时页面会先渲染再跳回主页（toast + 600~700ms 后 reLaunch），
 * 那段时间**不能**出现「第 1 / 0 题」、空题目区、或假的结卡片。
 * 用 Page.navigate 直接跳（不预先 sleep），并以 90ms 间隔连续采样，避免"刚好错过窗口"。
 */
const FLASH_SAMPLE = `
  return {
    badRound: /第\\s*1\\s*\\/\\s*0\\s*题/.test(document.body.innerText),
    result: !!document.querySelector('.result'),
    body: document.querySelectorAll('.option, .opt, .compare-card, .tiles, .groups').length,
    home: document.querySelectorAll('.stage-chip').length === 4,
  }
`

async function checkEmptyPoolFlash(cdp, url, label) {
  await cdp.send('Page.navigate', { url: 'about:blank' })
  await sleep(250)
  await cdp.send('Page.navigate', { url })
  const bad = []
  let landedHome = false
  let frames = 0
  for (let i = 0; i < 20; i++) {
    await sleep(90)
    let s = null
    try {
      s = await cdp.eval(FLASH_SAMPLE)
    } catch (e) {
      continue // about:blank 阶段 localStorage/DOM 不可用，跳过
    }
    frames++
    if (s.badRound) bad.push('第1/0题')
    if (s.result) bad.push('结果卡片')
    if (s.body > 0) bad.push(`题目区${s.body}`)
    if (s.home) landedHome = true
  }
  check(
    `池为空时不会闪现空题目/假结果：${label}`,
    bad.length === 0 && landedHome,
    `采样 ${frames} 帧，问题=${[...new Set(bad)].join(',') || '无'}，最终回主页=${landedHome}`,
  )
}

/**
 * 抓一条"答错揭晓"文案：逐题点选项（先点第一个，多半会错），
 * 直到 `.reveal-text` 出现内容。揭晓期间页面会屏蔽点击（REVEAL_MS≈3s），
 * 所以每轮都要轮询"出现揭晓 / 题号变化"再继续，不能固定等待。
 */
async function captureReveal(cdp, route, maxRounds = 8) {
  // 每轮只点一次（点对了就进下一题），所以"整段都没点错"是有概率的：
  // 4 选 1 时 8 轮全对的概率 0.75^8 ≈ 10%。再整段重来一次把误报概率压到 ~1%。
  for (let attempt = 0; attempt < 2; attempt++) {
    const got = await captureRevealOnce(cdp, route, maxRounds)
    if (got) return got
  }
  return ''
}

async function captureRevealOnce(cdp, route, maxRounds) {
  await cdp.freshNavigate(`${route}`)
  await sleep(2400)
  for (let round = 0; round < maxRounds; round++) {
    const st = await cdp.eval(`
      return {
        round: (document.querySelector('.round-info')||{}).innerText || '',
        n: Math.max(document.querySelectorAll('.option, .opt').length, document.querySelectorAll('.compare-card').length),
        done: !!document.querySelector('.result'),
      }
    `)
    if (st.done || !st.n) return ''
    for (let k = 0; k < st.n; k++) {
      await cdp.eval(`
        const els = document.querySelectorAll('.compare-card').length ? document.querySelectorAll('.compare-card') : document.querySelectorAll('.option, .opt')
        const t = els[${k}]
        if (t) t.click()
        return !!t
      `)
      let moved = false
      for (let t = 0; t < 14; t++) {
        await sleep(280)
        const now = await cdp.eval(`
          return {
            reveal: (document.querySelector('.reveal-text')||{}).innerText || '',
            round: (document.querySelector('.round-info')||{}).innerText || '',
            done: !!document.querySelector('.result'),
          }
        `)
        if (now.reveal) return now.reveal
        if (now.done || (now.round && now.round !== st.round)) {
          moved = true
          break
        }
      }
      if (!moved) break // 本轮已揭晓结束/无更多选项
    }
    // 等下一题稳定
    for (let t = 0; t < 12; t++) {
      await sleep(280)
      const r = await cdp.eval(`return (document.querySelector('.round-info')||{}).innerText || ''`)
      if (r && r !== st.round) break
    }
  }
  return ''
}

/** 读当前题号文案（「第 3 / 10 题」） */
const ROUND_TEXT = `return (document.querySelector('.round-info')||{}).innerText||''`

/**
 * 沿给定屏幕坐标点派发一次真实拖拽（mousePressed → 插值 mouseMoved → mouseReleased）。
 * 用于模拟「描红」：HanziWriter 只认真实指针轨迹，脚本 click 无效。
 */
async function dragThrough(cdp, points, { stepsPerSegment = 6, delayMs = 16 } = {}) {
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: points[0].x, y: points[0].y, button: 'left', clickCount: 1 })
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1]
    const to = points[i]
    for (let s = 1; s <= stepsPerSegment; s++) {
      const x = Math.round(from.x + ((to.x - from.x) * s) / stepsPerSegment)
      const y = Math.round(from.y + ((to.y - from.y) * s) / stepsPerSegment)
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1 })
      await sleep(delayMs)
    }
  }
  const last = points[points.length - 1]
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: last.x, y: last.y, button: 'left', clickCount: 1 })
  await sleep(600)
}

/**
 * 把某字的第 strokeIndex 条笔画中线换算成屏幕坐标。
 * 数据是 1024×1024 坐标系；HanziWriter 按 (画布宽 - 2*padding)/1024 缩放并加 padding 偏移。
 *
 * **y 必须翻转**：字符数据的 y 轴朝上（库的 positioner 会翻转），直接 y*scale 会把整字
 * 上下镜像。实测「十」正序写也判不对、而居中的横画「一」能靠容差蒙对——所以这个错误
 * 极容易被漏掉：用错误换算做"笔顺"断言会得出"反正都写不对"的假结论。
 */
function strokePointsScript(cp, strokeIndex = 0) {
  return `
    const res = await fetch('/static/hanzi-data/${cp}.json')
    const data = await res.json()
    const svg = document.querySelector('#hanzi-target svg')
    if (!svg) return []
    const r = svg.getBoundingClientRect()
    const pad = Math.round(r.width * 0.08)
    const scale = (r.width - pad * 2) / 1024
    return (data.medians[${strokeIndex}] || []).map(([x, y]) => ({
      x: Math.round(r.left + pad + x * scale),
      y: Math.round(r.top + pad + (1024 - y) * scale),
    }))
  `
}

/**
 * 答完当前这一题：依次点选项直到题号变化。
 * 答对 1.5s 进下一题；答错会揭晓并等 3s 再进下一题，所以最多等 ~6s。
 */
async function answerOneRound(cdp, timeoutMs = 7000) {
  const before = await cdp.eval(ROUND_TEXT)
  const n = await cdp.eval(`return document.querySelectorAll('.option').length`)
  if (!n) return { ok: false, reason: '没有选项' }
  const deadline = Date.now() + timeoutMs
  let i = 0
  while (Date.now() < deadline) {
    await cdp.eval(`const el=document.querySelectorAll('.option')[${i % n}]; if(el) el.click(); return 1`)
    i++
    await sleep(400)
    const now = await cdp.eval(ROUND_TEXT)
    if (now && now !== before) return { ok: true, before, after: now }
    if (i > n + 2 && i % n === 0) await sleep(600) // 揭晓中，等待自动前进
  }
  return { ok: false, reason: '题号未变化', before }
}

/* ---------------- 主流程 ---------------- */
async function main() {
  // CDP 客户端与 Chrome 启动都在 tools/lib/cdp.mjs（与 tools/shots.mjs 共用一份实现）：
  // 之前这里复制了一整份 class，导致"修一处、另一处没修"（例如 eval 包 async IIFE）。
  const cdp = await launchChrome({ port: CDP_PORT })
  try {
    await cdp.send('Network.enable') // 资源请求记录（音轨/笔顺数据统计用）
    // 数学练习页的随机出题换成固定种子（只对该路由生效，其它页面保持真实随机）：
    // 9 关共 23 种题型，靠随机抽样很难稳定覆盖到比大小这类低频分支，
    // 固定种子后"题型覆盖"断言才可复现。
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `(function () {
        if (location.hash.indexOf('/pages/math/practice') < 0) return;
        var s = 20240911;
        Math.random = function () {
          s = (s + 0x6D2B79F5) | 0;
          var t = Math.imul(s ^ (s >>> 15), 1 | s);
          t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
      })();`,
    })

    // ---------- 1. 首页（手机宽度） ----------
    await cdp.setViewport(390, 844)
    await cdp.navigate(`${BASE}/#/pages/map/map`)
    await cdp.navigate(`${BASE}/#/pages/map/map`) // 二次导航确保 hash 路由生效
    const home = await cdp.eval(`
      const q = (s) => document.querySelectorAll(s).length
      return {
        stageChips: q('.stage-chip'),
        unitCards: q('.unit-card'),
        dice: q('.block-dice'),
        tabbar: q('.tabbar'),
        bodyText: document.body.innerText.slice(0, 200),
        rpxFont: document.documentElement.style.fontSize,
      }
    `)
    check('首页渲染：4 个阶段胶囊', home.stageChips === 4, `实际 ${home.stageChips}`)
    check('首页渲染：有课程卡', home.unitCards > 0, `${home.unitCards} 张`)
    check('首页渲染：有 🎲 随机入口', home.dice > 0, `${home.dice} 个`)
    check('首页渲染：自定义底部栏已挂载', home.tabbar > 0)
    check('手机宽度 rpx 基准合理', parseFloat(home.rpxFont) > 8 && parseFloat(home.rpxFont) < 24, `fontSize=${home.rpxFont}`)

    // ---------- 2. iPad 宽屏：rpxCalcBaseDeviceWidth=750 的实际效果 ----------
    await cdp.setViewport(1024, 768)
    await cdp.navigate(`${BASE}/#/pages/map/map`)
    const ipad = await cdp.eval(`
      const page = document.querySelector('uni-page-body') || document.body
      return {
        rpxFont: parseFloat(document.documentElement.style.fontSize),
        pageMaxWidth: getComputedStyle(document.body).maxWidth,
        stageChipH: document.querySelector('.stage-chip') ? document.querySelector('.stage-chip').getBoundingClientRect().height : 0,
      }
    `)
    // 1024px 视口 > rpxCalcMaxDeviceWidth(750) → 按 base 750 换算：1024→750，750/23.4375 ≈ 32px
    check(
      'iPad 宽屏：1rpx 按 750 基准换算（不是 375 的一半）',
      ipad.rpxFont > 28 && ipad.rpxFont < 36,
      `documentElement.fontSize=${ipad.rpxFont}px（旧配置会是 16px）`,
    )
    check('iPad 宽屏：阶段胶囊高度达到设计尺寸（≥44px 可点下限）', ipad.stageChipH >= 44, `${Math.round(ipad.stageChipH)}px`)

    // ---------- 3. 挑战页：答错揭晓 + 自动进下一题 ----------
    await cdp.setViewport(390, 844)
    const lessonId = 'en-quiz-l1'
    await cdp.navigate(`${BASE}/#/pages/quiz/quiz?subject=en&level=1&lessonId=${lessonId}`)
    await sleep(1200)
    let reveal = null
    for (let attempt = 0; attempt < 8 && !reveal; attempt++) {
      const before = await cdp.eval(`
        const opts = document.querySelectorAll('.option')
        return { count: opts.length, round: (document.querySelector('.round-info')||{}).innerText || '' }
      `)
      if (!before.count) break
      // 依次点每个选项，直到某次点错触发揭晓
      for (let i = 0; i < before.count; i++) {
        await cdp.eval(`document.querySelectorAll('.option')[${i}].click(); return 1`)
        await sleep(300)
        const r = await cdp.eval(`
          const bar = document.querySelector('.reveal-bar')
          const revealed = document.querySelector('.option.reveal')
          const check = document.querySelector('.opt-check')
          return bar ? { text: bar.innerText.trim(), revealed: !!revealed, check: !!check } : null
        `)
        if (r) { reveal = r; break }
        // 点对了会进下一题，跳出重来
      }
      if (reveal) break
      await sleep(1600)
    }
    check('答错后出现揭晓条', !!reveal, reveal ? JSON.stringify(reveal.text) : '未能触发（可能连续答对）')
    check('揭晓时正确项被高亮并带对勾', !!(reveal && reveal.revealed && reveal.check))

    // 揭晓后应自动进入下一题（3 秒），且期间点击被屏蔽
    if (reveal) {
      const roundBefore = await cdp.eval(`return (document.querySelector('.round-info')||{}).innerText||''`)
      await sleep(3600)
      const roundAfter = await cdp.eval(`return (document.querySelector('.round-info')||{}).innerText||''`)
      const barGone = await cdp.eval(`return !document.querySelector('.reveal-bar')`)
      check('揭晓后自动进入下一题', roundBefore !== roundAfter, `${roundBefore} → ${roundAfter}`)
      check('进入下一题后揭晓态已清理', barGone)
    }

    // 会话应已落库（保证后面家长页有数据）
    const stored = await cdp.eval(`
      const raw = localStorage.getItem('kx:attempts')
      if (!raw) return { n: 0 }
      const parsed = JSON.parse(raw)
      return { n: (parsed.d || []).length, sample: (parsed.d || [])[0] || null }
    `)
    check('作答事件已写入本地存储', stored.n > 0, `${stored.n} 条`)
    check('作答事件带 skillIds（家长页薄弱知识点依赖它）', !!(stored.sample && Array.isArray(stored.sample.skillIds) && stored.sample.skillIds.length))

    // ---------- 4. 中途中止 → 回到同一课：快照与记录连续 ----------
    await cdp.setViewport(390, 844)
    const resumeLesson = 'en-quiz-l1'
    // 真加载一次（而不是只改 hash）：保证是新的页面实例、onLoad 会重新跑
    await cdp.eval(`localStorage.clear(); return 1`)
    await cdp.freshNavigate(`${BASE}/#/pages/quiz/quiz?subject=en&level=1&lessonId=${resumeLesson}`)
    await sleep(800)
    const first = await answerOneRound(cdp)
    const left = await cdp.eval(ROUND_TEXT)
    const sessionBefore = await cdp.eval(`
      const wrap = JSON.parse(localStorage.getItem('kx:active') || 'null')
      const a = wrap && wrap.d ? wrap.d : wrap
      return a && a.session ? { id: a.session.sessionId, snap: !!(a.snapshot && a.snapshot.roundIdx !== undefined) } : null
    `)
    check('作答会开启会话并带快照（恢复用）', !!(sessionBefore && sessionBefore.snap), safeJson(sessionBefore) + ` 首答推进=${first.ok}`)

    // 点页面左上角的 ← 返回：这是孩子真实的退出路径（走 platform/nav.js 的 goBackOrHome）
    const backClicked = await cdp.click('.back')
    await sleep(900)
    const paused = await cdp.eval(`
      const list = JSON.parse(localStorage.getItem('kx:sessions') || '{"d":[]}').d || []
      const act = localStorage.getItem('kx:active')
      const p = list.filter(s => s.status === 'paused')
      return { paused: p.length, withSnap: p.filter(s => s.snapshot).length, activeCleared: !act }
    `)
    check('点返回按钮离开会落一条带快照的 paused 会话', backClicked && paused.paused > 0 && paused.withSnap > 0, safeJson(paused))
    check('离开后活跃会话已清除', paused.activeCleared)

    // 回到同一课：应恢复同一 sessionId 与题号，而不是重新出题
    await cdp.freshNavigate(`${BASE}/#/pages/quiz/quiz?subject=en&level=1&lessonId=${resumeLesson}`)
    await sleep(1400)
    const resumed = await cdp.eval(`
      const wrap = JSON.parse(localStorage.getItem('kx:active') || 'null')
      const a = wrap && wrap.d ? wrap.d : wrap
      return {
        round: document.querySelector('.round-info') ? document.querySelector('.round-info').innerText : '',
        sessionId: a && a.session ? a.session.sessionId : null,
      }
    `)
    check('恢复回到原题号（不重新出题）', resumed.round === left, `${left} → ${resumed.round}`)
    check('恢复复用同一 sessionId', !!resumed.sessionId && resumed.sessionId === (sessionBefore && sessionBefore.id), `${sessionBefore && sessionBefore.id} → ${resumed.sessionId}`)

    // ---------- 6. 家长页（此时已有多次作答）+ 薄弱知识点与数据一致 ----------
    await cdp.navigate(`${BASE}/#/pages/parent/parent`)
    await sleep(800)
    const parent = await cdp.eval(`
      const txt = document.body.innerText
      const sizes = {}
      for (const sel of ['.meta-label', '.summary-label', '.week-label']) {
        const el = document.querySelector(sel)
        if (el) sizes[sel] = getComputedStyle(el).fontSize
      }
      // 各知识点首答样本数：决定「需要多练的知识点」该不该出现（阈值 3）
      const attempts = JSON.parse(localStorage.getItem('kx:attempts') || '{"d":[]}').d || []
      const bySkill = {}
      for (const a of attempts) {
        if (!a.firstTry) continue
        for (const s of a.skillIds || []) bySkill[s] = (bySkill[s] || 0) + 1
      }
      const maxFirst = Math.max(0, ...Object.values(bySkill))
      return {
        hasExport: !!document.querySelector('.data-btn'),
        hasWeakSection: txt.includes('需要多练的知识点'),
        hasStorageWarn: !!document.querySelector('.storage-warn'),
        probeLeftover: localStorage.getItem('kx:自检') !== null,
        maxFirst,
        skillSamples: bySkill,
        sizes,
      }
    `)
    check('家长页有导出/导入按钮', parent.hasExport)
    check(
      '薄弱知识点区块与数据一致（某知识点首答≥3 题才出现）',
      parent.hasWeakSection === (parent.maxFirst >= 3),
      `区块=${parent.hasWeakSection} 最大样本=${parent.maxFirst} ${safeJson(parent.skillSamples)}`,
    )
    check('存储正常时不显示告警条', !parent.hasStorageWarn)
    check(
      '存储正常时自检探针写完即删（不在存储里留垃圾）',
      !parent.probeLeftover,
      `kx:自检 残留=${parent.probeLeftover}`,
    )
    check(
      '家长页正文字号不小于 11px（可读性下限）',
      Object.keys(parent.sizes).length > 0 && Object.values(parent.sizes).every((s) => parseFloat(s) >= 11),
      safeJson(parent.sizes),
    )

    // ---------- 7. 错题重练入口 ----------
    // 先**确定性地**制造一道到期错题：进挑战页点到出现揭晓条（＝刚答错，已进错题本）。
    // 原来直接查首页，若上一局恰好全答对就没有错题卡，测试会随机失败。
    await cdp.freshNavigate(`${BASE}/#/pages/quiz/quiz?subject=en&level=3&lessonId=en-quiz-l3`)
    await sleep(1200)
    let wrongRecorded = false
    for (let round = 0; round < 6 && !wrongRecorded; round++) {
      const n = await cdp.eval(`return document.querySelectorAll('.option').length`)
      if (!n) break
      for (let k = 0; k < n && !wrongRecorded; k++) {
        await cdp.eval(`const el=document.querySelectorAll('.option')[${k}]; if(el) el.click(); return 1`)
        await sleep(350)
        wrongRecorded = !!(await cdp.eval(`return !!document.querySelector('.reveal-bar')`))
        if (!wrongRecorded) break // 点对了 → 已进下一题，重新取选项
      }
      if (!wrongRecorded) await sleep(1700)
    }
    check('能制造一道错题（答错即进错题本）', wrongRecorded)

    await cdp.navigate(`${BASE}/#/pages/map/map`)
    await sleep(900)
    const reviewEntry = await cdp.eval(`
      const card = [...document.querySelectorAll('.review-card')]
      const due = JSON.parse(localStorage.getItem('kx:review') || '{}').d || {}
      return { cards: card.length, text: card[0] ? card[0].innerText.replace(/\\n/g,' ') : '', dueKeys: Object.keys(due).length }
    `)
    check('有错题时首页出现「错题重练」入口', reviewEntry.cards > 0 && reviewEntry.dueKeys > 0, reviewEntry.text || `错题本条目 ${reviewEntry.dueKeys}`)
    if (reviewEntry.cards > 0) {
      await cdp.eval(`document.querySelector('.review-card').click(); return 1`)
      await sleep(1500)
      const reviewPage = await cdp.eval(`
        return { url: location.hash, opts: document.querySelectorAll('.option').length, title: (document.body.innerText||'').slice(0,60) }
      `)
      check('重练模式能出题', reviewPage.opts > 0, JSON.stringify(reviewPage))
    }

    // ---------- 8. 口音切换真的取 audio-gb 音轨 ----------
    await cdp.eval(`localStorage.setItem('kx:prefs', JSON.stringify({v:1,d:{accent:'gb'}})); return 1`)
    cdp.requests.length = 0
    await cdp.navigate(`${BASE}/#/pages/learn/learn?subject=en&cat=animals&lessonId=en-learn-animals`)
    await sleep(2500)
    const gbReq = cdp.requests.filter((u) => u.includes('/static/audio-gb/'))
    check('切到英式口音会去取 audio-gb 音轨（线上 404 风险点）', gbReq.length > 0, `${gbReq.length} 条，例：${(gbReq[0] || '').split('/').pop()}`)
    await cdp.eval(`localStorage.setItem('kx:prefs', JSON.stringify({v:1,d:{accent:'us'}})); return 1`)

    // ---------- 9. 320px 窄屏不横向溢出 + 收集页可读性 ----------
    await cdp.setViewport(320, 640)
    for (const route of ['pages/map/map', 'pages/collection/collection', 'pages/parent/parent']) {
      await cdp.navigate(`${BASE}/#/${route}`)
      await sleep(700)
      const narrow = await cdp.eval(`
        const de = document.documentElement
        return { overflow: de.scrollWidth - de.clientWidth }
      `)
      check(`320px 窄屏不横向溢出：${route}`, narrow.overflow <= 2, `overflow=${narrow.overflow}px`)
    }
    // 停在收集页读统计标签（必须在收集页上查，别在家长页上查 .stat-label）
    await cdp.navigate(`${BASE}/#/pages/collection/collection`)
    await sleep(800)
    const coll = await cdp.eval(`
      const el = document.querySelector('.stat-label')
      const items = document.querySelectorAll('.stat-item')
      const first = items[0] ? items[0].getBoundingClientRect() : null
      const second = items[3] ? items[3].getBoundingClientRect() : null
      return {
        label: el ? el.innerText : '',
        size: el ? getComputedStyle(el).fontSize : '',
        count: items.length,
        // 3×2 布局：第 4 格的 top 应大于第 1 格（换行了）
        wrapped: !!(first && second && second.top > first.top + 4),
      }
    `)
    check('收集页统计标签字号 ≥ 11px（原来 20rpx≈8.5px）', parseFloat(coll.size) >= 11, `${coll.label} = ${coll.size}`)
    check('收集页 6 格统计在窄屏折成 3×2（不再挤一行）', coll.count === 6 && coll.wrapped, `items=${coll.count} wrapped=${coll.wrapped}`)

    // ---------- 10. 笔顺描红：画布必须跟住田字格实际尺寸 ----------
    // 原来画布写死 300px：320px 窄屏上面板只有 277px（画布比面板宽 → 外圈被裁），
    // iPad 上面板 652px（字只占中间 46%）。这两条断言把修复钉住。
    const writeUrl = `${BASE}/#/pages/write/write?char=%E4%B8%80&cp=4e00&pinyin=y%C4%AB`
    const measureBoard = `
      const board = document.querySelector('.board')
      const target = document.querySelector('#hanzi-target')
      const glyph = target ? (target.querySelector('svg') || target.querySelector('canvas')) : null
      const b = board ? board.getBoundingClientRect() : null
      const g = glyph ? glyph.getBoundingClientRect() : null
      return {
        boardW: b ? +b.width.toFixed(1) : 0,
        boardClientW: board ? board.clientWidth : 0,
        glyphW: g ? +g.width.toFixed(1) : 0,
        offCenter: b && g ? +((g.left + g.width / 2) - (b.left + b.width / 2)).toFixed(1) : 999,
        actions: document.querySelectorAll('.action').length,
        hint: (document.querySelector('.hint-text') || {}).innerText || '',
      }
    `
    for (const [w, h, label, minFill] of [
      [320, 640, '320px 窄屏', 0.9],
      [1024, 768, 'iPad 横屏', 0.9],
    ]) {
      await cdp.setViewport(w, h)
      await cdp.freshNavigate(writeUrl)
      await sleep(1800)
      const m = await cdp.eval(measureBoard)
      check(
        `描红画布不超出田字格（${label}）`,
        m.glyphW > 0 && m.glyphW <= m.boardW + 1,
        `画布=${m.glyphW}px 田字格=${m.boardW}px`,
      )
      check(
        `描红画布占满田字格 ≥${Math.round(minFill * 100)}%（${label}）`,
        m.boardClientW > 0 && m.glyphW / m.boardClientW >= minFill,
        `${Math.round((m.glyphW / m.boardClientW) * 100)}%（旧实现固定 300px → 320px 屏会溢 23px、iPad 只有 46%）`,
      )
      check(`描红画布居中（${label}）`, Math.abs(m.offCenter) <= 2, `偏移 ${m.offCenter}px`)
    }
    const writeUi = await cdp.eval(measureBoard)
    check('描红页三个动作按钮齐备', writeUi.actions === 3, `${writeUi.actions} 个`)
    check('笔顺数据加载正常（无失败提示）', !writeUi.hint.includes('没加载出来'), writeUi.hint)
    // 「看笔顺」演示不应抛错
    await cdp.eval(`document.querySelectorAll('.action')[1].click(); return 1`)
    await sleep(1200)

    // ---------- 10b. 笔顺数据 404 的失败路径（真实 404，不是打桩） ----------
    // 用一个不存在的码点：/static/hanzi-data/ffff.json 会真的 404，
    // 于是触发 charDataLoader 的失败分支。修复前这里是静默的（面板空着、提示照旧）。
    cdp.requests.length = 0
    await cdp.freshNavigate(`${BASE}/#/pages/write/write?char=%F0%A0%80%80&cp=ffff&pinyin=x`)
    await sleep(2200)
    const failed = await cdp.eval(`
      const hint = (document.querySelector('.hint-text') || {}).innerText || ''
      const board = document.querySelector('.board')
      const target = document.querySelector('#hanzi-target')
      const glyph = target ? (target.querySelector('svg') || target.querySelector('canvas')) : null
      return {
        hint,
        boardW: board ? Math.round(board.clientWidth) : 0,
        glyphW: glyph ? Math.round(glyph.getBoundingClientRect().width) : 0,
        dataRequested: true,
      }
    `)
    const hit404 = cdp.requests.some((u) => u.includes('hanzi-data/ffff.json'))
    check('笔顺数据 404 时给出可见提示（不再静默空面板）', failed.hint.includes('没加载出来'), `提示：「${failed.hint}」`)
    check('确实请求了该码点的笔顺数据（404 是真实返回）', hit404, hit404 ? '' : '未观察到请求')
    // 点「看笔顺」应重试（重建画布 → 再请求一次），而不是毫无反应
    cdp.requests.length = 0
    const retried = await cdp.click('.action:nth-child(2)')
    await sleep(1500)
    const retriedAgain = cdp.requests.some((u) => u.includes('hanzi-data/ffff.json'))
    const hintAfter = await cdp.eval(`return (document.querySelector('.hint-text') || {}).innerText || ''`)
    check('点「看笔顺」会重试加载（再次失败仍保持提示）', retried && retriedAgain, `重试请求=${retriedAgain}，提示：「${hintAfter}」`)

    // ---------- 10c. 描红核心交互：真的把「一」写对（用笔画中线模拟真实描红） ----------
    // 这是全站最"物理"的交互（孩子在屏幕上按笔顺画），此前零覆盖。
    // 用桌面视口确保 HanziWriter 绑的是鼠标事件；脚本 click 无效，必须派发真实指针轨迹。
    const COUNT_RECORDS = `
      const n = (k) => { try { const v = JSON.parse(localStorage.getItem(k) || '{"d":[]}').d; return Array.isArray(v) ? v.length : (v ? Object.keys(v).length : 0) } catch (e) { return -1 } }
      return { attempts: n('kx:attempts'), sessions: n('kx:sessions'), active: localStorage.getItem('kx:active') !== null }
    `
    const recordsBefore = await cdp.eval(COUNT_RECORDS)
    await cdp.setViewport(1024, 768)
    await cdp.freshNavigate(`${BASE}/#/pages/write/write?char=%E4%B8%80&cp=4e00&pinyin=y%C4%AB`)
    await sleep(2500)
    const quizStarted = await cdp.eval(`
      const actions = [...document.querySelectorAll('.action')]
      if (actions.length < 3) return false
      actions[2].click()
      return true
    `)
    await sleep(900)
    const quizHint = await cdp.eval(`return (document.querySelector('.hint-text')||{}).innerText || ''`)
    check('能进入描红模式（点「我来写」后给出书写提示）', quizStarted && quizHint.includes('按笔顺描'), quizHint)

    const stroke = await cdp.eval(strokePointsScript('4e00', 0))
    check('能取到「一」的笔画中线并换算成屏幕坐标', Array.isArray(stroke) && stroke.length >= 2, `${stroke.length} 个采样点`)
    await dragThrough(cdp, stroke)
    await sleep(900)
    const traced = await cdp.eval(`
      return {
        done: !!document.querySelector('.done-badge'),
        hint: (document.querySelector('.hint-text')||{}).innerText || '',
        lastBtn: (document.querySelectorAll('.action')[2]||{}).innerText || '',
      }
    `)
    check('沿笔画中线描完后判定写对（出现 🎉 写对啦）', traced.done, `提示：「${traced.hint}」`)
    check('写对后按钮变为「再写一次」并给出鼓励语', traced.lastBtn.includes('再写一次') && traced.hint.includes('太棒了'), `${traced.lastBtn.replace(/\n/g, ' ')}`)

    // 写错两笔应给出鼓励性提示（验证 onMistake 计数与 showHintAfterMisses 的接线）
    await cdp.eval(`document.querySelectorAll('.action')[2].click(); return 1`)
    await sleep(800)
    const svgBox = await cdp.eval(`
      const r = document.querySelector('#hanzi-target svg').getBoundingClientRect()
      return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width) }
    `)
    for (let i = 0; i < 2; i++) {
      // 在角落画一小段，必然判错
      await dragThrough(cdp, [
        { x: svgBox.x + 20, y: svgBox.y + 20 },
        { x: svgBox.x + 60, y: svgBox.y + 30 },
        { x: svgBox.x + 90, y: svgBox.y + 24 },
      ], { stepsPerSegment: 4 })
    }
    const afterMisses = await cdp.eval(`return (document.querySelector('.hint-text')||{}).innerText || ''`)
    check('写错两笔后给出鼓励性提示（onMistake 接线正确）', afterMisses.includes('看橙色提示'), `提示：「${afterMisses}」`)

    // ---------- 10d. 笔顺顺序判定：非对称两笔画字（十） ----------
    // 描红的教学意义就在"按笔顺"，前面只验过单笔画的「一」。
    // 这里必须用**非对称**的字：像「二」上下对称，把整字上下镜像后照样能写完，
    // 无法区分"笔顺正确"与"刚好镜像蒙对"。「十」= 先横后竖，镜像后几何完全不同。
    const SHI = '%E5%8D%81'
    await cdp.freshNavigate(`${BASE}/#/pages/write/write?char=${SHI}&cp=5341&pinyin=sh%C3%AD`)
    await sleep(2500)
    await cdp.eval(`document.querySelectorAll('.action')[2].click(); return 1`)
    await sleep(800)
    const hStroke = await cdp.eval(strokePointsScript('5341', 0))
    const vStroke = await cdp.eval(strokePointsScript('5341', 1))
    check('取到「十」的两笔中线', hStroke.length >= 2 && vStroke.length >= 2, `横 ${hStroke.length} 点 / 竖 ${vStroke.length} 点`)

    await dragThrough(cdp, hStroke)
    const midDone = await cdp.eval(`return !!document.querySelector('.done-badge')`)
    check('两笔画字只写第 1 笔不算写完', !midDone)
    await dragThrough(cdp, vStroke)
    await sleep(700)
    const inOrder = await cdp.eval(`return { done: !!document.querySelector('.done-badge'), hint: (document.querySelector('.hint-text')||{}).innerText || '' }`)
    check('正序写完两笔判定写对（十：先横后竖）', inOrder.done, `提示：「${inOrder.hint}」`)

    // 逆序：重开一局，先竖后横 —— 不应判对
    await cdp.freshNavigate(`${BASE}/#/pages/write/write?char=${SHI}&cp=5341&pinyin=sh%C3%AD`)
    await sleep(2500)
    await cdp.eval(`document.querySelectorAll('.action')[2].click(); return 1`)
    await sleep(800)
    const v2 = await cdp.eval(strokePointsScript('5341', 1))
    const h2 = await cdp.eval(strokePointsScript('5341', 0))
    await dragThrough(cdp, v2)
    await sleep(400)
    await dragThrough(cdp, h2)
    await sleep(800)
    const reversed = await cdp.eval(`return { done: !!document.querySelector('.done-badge'), hint: (document.querySelector('.hint-text')||{}).innerText || '' }`)
    check('逆序写完两笔不判对（笔顺约束生效）', !reversed.done, `done=${reversed.done} 提示：「${reversed.hint}」`)

    // 顺带取证：描红目前**不记任何学习记录**（内容审计点过这个缺口，这里用观测确认）。
    // 只统计本段（写对 + 写错 + 两个方向共 5 局）造成的增量，避免把前面的挑战/会话算进来。
    const recordsAfter = await cdp.eval(COUNT_RECORDS)
    console.log(
      `  ℹ 描红 5 局（含写对/写错/逆序）造成的记录增量：attempts +${recordsAfter.attempts - recordsBefore.attempts}、` +
        `sessions +${recordsAfter.sessions - recordsBefore.sessions}、active 新增 ${!recordsBefore.active && recordsAfter.active}`,
    )

    // ---------- 10e. 描红接进度：从识字卡进来才算这门课（按单字点亮，不虚标整课完成） ----------
    // 口径：写完一个字 → 记一条 stroke-write 作答 + 该字进图鉴「认识」；
    // 绝不 complete 会话（否则写一个字就把整门识字课标成学完），也不顶替学一学的会话。
    await cdp.setViewport(1024, 768)
    await cdp.freshNavigate(`${BASE}/#/pages/map/map`)
    await sleep(700)
    await cdp.eval(`localStorage.clear(); return 1`)
    await cdp.freshNavigate(`${BASE}/#/pages/learn/learn?subject=zh&level=1&lessonId=zh-learn-l1`)
    await sleep(2400)
    const wpEntry = await cdp.eval(`
      const btns = [...document.querySelectorAll('.write-btn')]
      if (!btns.length) return { ok: false }
      btns[0].click()
      return { ok: true, count: btns.length }
    `)
    await sleep(2600)
    const wpUrl = await cdp.eval(`return location.hash`)
    const wpCpMatch = /[?&]cp=([0-9a-f]{4,6})/i.exec(wpUrl.replace(/%26amp;/g, '&'))
    check(
      '从识字卡进描红会带上 lessonId（否则写完什么都不记）',
      wpEntry.ok && /lessonId=zh-learn-l1/.test(wpUrl) && !!wpCpMatch,
      `按钮 ${wpEntry.count} 个，URL=${wpUrl.slice(0, 90)}`,
    )
    const wpCp = wpCpMatch ? wpCpMatch[1].toLowerCase() : '4e00'
    await cdp.eval(`document.querySelectorAll('.action')[2].click(); return 1`)
    await sleep(900)
    const wpStrokes = await cdp.eval(`
      const d = await (await fetch('/static/hanzi-data/${wpCp}.json')).json()
      return d.medians.length
    `)
    for (let i = 0; i < wpStrokes; i++) {
      const pts = await cdp.eval(strokePointsScript(wpCp, i))
      await dragThrough(cdp, pts)
      await sleep(350)
    }
    await sleep(900)
    const wpRec = await cdp.eval(`
      const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null') } catch (e) { return null } }
      const att = (read('kx:attempts') || {}).d || []
      const coll = (read('kx:collection') || {}).d || null
      const sessions = (read('kx:sessions') || {}).d || []
      const active = read('kx:active')
      const mine = att.filter((a) => a.activityId === 'stroke-write')
      return {
        attempts: att.length,
        stroke: mine.length,
        strokeItem: mine[0] ? mine[0].itemId : null,
        strokeCorrect: mine[0] ? mine[0].correct : null,
        strokeFirstTry: mine[0] ? mine[0].firstTry : null,
        seen: coll && coll.zh ? coll.zh.seen || [] : [],
        mastered: coll && coll.zh ? (coll.zh.mastered || []).length : 0,
        lessonSessions: sessions.filter((s) => s.lessonId === 'zh-learn-l1').length,
        activeLesson: active && active.d ? active.d.session.lessonId : null,
      }
    `)
    check(
      '写完一个字会记一条 stroke-write 作答（首答正确）',
      wpRec.stroke === 1 && wpRec.strokeItem === wpCp && wpRec.strokeCorrect === true && wpRec.strokeFirstTry === true,
      `作答 ${wpRec.attempts} 条，其中描红 ${wpRec.stroke} 条（itemId=${wpRec.strokeItem} 首答=${wpRec.strokeFirstTry}）`,
    )
    check(
      '按单字点亮图鉴「认识」——只亮这一个字，不是整课',
      wpRec.seen.length === 1 && wpRec.seen[0] === wpCp && wpRec.mastered === 0,
      `认识 ${safeJson(wpRec.seen)}，掌握 ${wpRec.mastered}`,
    )
    check(
      '描红不虚标整课完成、也不顶替学一学的会话',
      wpRec.lessonSessions === 0 && wpRec.activeLesson === 'zh-learn-l1',
      `本课已记录会话 ${wpRec.lessonSessions} 条，活跃会话仍指向 ${wpRec.activeLesson}`,
    )

    // 直链（没有 lessonId）只练不记：不产生半截会话、也不把任意码点写进图鉴
    const wpBefore = await cdp.eval(`
      const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null') } catch (e) { return null } }
      const att = (read('kx:attempts') || {}).d || []
      const coll = (read('kx:collection') || {}).d || {}
      return { attempts: att.length, seen: coll.zh ? (coll.zh.seen || []).length : 0 }
    `)
    await cdp.freshNavigate(`${BASE}/#/pages/write/write?char=%E4%BA%8C&cp=4e8c&pinyin=%C3%A8r`)
    await sleep(2400)
    await cdp.eval(`document.querySelectorAll('.action')[2].click(); return 1`)
    await sleep(900)
    for (let i = 0; i < 2; i++) {
      const pts = await cdp.eval(strokePointsScript('4e8c', i))
      await dragThrough(cdp, pts)
      await sleep(350)
    }
    await sleep(800)
    const wpAfter = await cdp.eval(`
      const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null') } catch (e) { return null } }
      const att = (read('kx:attempts') || {}).d || []
      const coll = (read('kx:collection') || {}).d || {}
      return { attempts: att.length, seen: coll.zh ? (coll.zh.seen || []).length : 0 }
    `)
    check(
      '直链进描红只练不记（不写码点进图鉴、不产生半截作答）',
      wpAfter.attempts === wpBefore.attempts && wpAfter.seen === wpBefore.seen,
      `作答 ${wpBefore.attempts}→${wpAfter.attempts}，认识 ${wpBefore.seen}→${wpAfter.seen}`,
    )

    // ---------- 11. 古诗点读：书单 → 逐行点读 → 填字挑战 ----------
    await cdp.setViewport(390, 844)
    await cdp.freshNavigate(`${BASE}/#/pages/poem/poem?stage=qimeng&lessonId=zh-poem-qimeng`)
    await sleep(1500)
    const poemList = await cdp.eval(`
      return {
        cards: document.querySelectorAll('.poem-card').length,
        firstTitle: (document.querySelector('.poem-title') || {}).innerText || '',
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }
    `)
    check('古诗书单渲染 6 首且不横向溢出', poemList.cards === 6 && poemList.overflow <= 2, `${poemList.cards} 首，首篇《${poemList.firstTitle}》`)
    await cdp.eval(`document.querySelectorAll('.poem-card')[0].click(); return 1`)
    await sleep(1000)
    const poemReader = await cdp.eval(`
      const lines = [...document.querySelectorAll('.line')]
      return {
        lines: lines.length,
        actions: [...document.querySelectorAll('.action')].length,
        line0: lines[0] ? lines[0].innerText.trim() : '',
      }
    `)
    check('点开一首诗进入逐行点读（咏鹅 4 行 + 2 个动作）', poemReader.lines === 4 && poemReader.actions === 2, `${poemReader.lines} 行：${poemReader.line0}`)
    await cdp.eval(`document.querySelectorAll('.line')[0].click(); return 1`)
    await sleep(900)
    const poemPlaying = await cdp.eval(`
      const active = document.querySelector('.line.active')
      const howls = (window.Howler && window.Howler._howls) ? window.Howler._howls : []
      const loaded = howls.filter(h => h.state() === 'loaded').map(h => h._src)
      return { active: active ? active.innerText.trim() : null, loadedPoem: loaded.filter(s => s.includes('audio-poem')).length }
    `)
    check('点一行会进入播放态且该诗音轨已就绪', !!poemPlaying.active && poemPlaying.loadedPoem >= 5, `active="${poemPlaying.active}" 就绪音轨 ${poemPlaying.loadedPoem} 条`)
    await cdp.eval(`document.querySelectorAll('.action')[1].click(); return 1`)
    await sleep(1800)
    const poemQuiz = await cdp.eval(`
      return {
        hash: location.hash,
        opts: document.querySelectorAll('.option').length,
        stem: (document.querySelector('.stem') || {}).innerText || '',
        round: (document.querySelector('.round-info') || {}).innerText || '',
      }
    `)
    check('古诗「填字挑战」能跳转出题', poemQuiz.hash.includes('poem=') && poemQuiz.opts > 0, `${poemQuiz.round} 题干「${poemQuiz.stem}」`)

    // ---------- 11b. 古诗点读本身也记进度：读完一首 → practice 会话 + 作答，但不算课时完成 ----------
    // 之前点读完全不记录（孩子读完 12 首什么都不留）。现在读完一首记一次 practice。
    // 用最短的一首（《画》约 6 秒）以免冒烟被音频时长拖住。
    await cdp.setViewport(390, 844)
    await cdp.freshNavigate(`${BASE}/#/pages/map/map`)
    await sleep(700)
    await cdp.eval(`localStorage.clear(); return 1`)
    await cdp.freshNavigate(`${BASE}/#/pages/poem/poem?stage=qimeng&lessonId=zh-poem-qimeng`)
    await sleep(2200)
    const pickedPoem = await cdp.eval(`
      const cards = [...document.querySelectorAll('.poem-card')]
      const target = cards.find((c) => (c.innerText || '').includes('画'))
      if (!target) return { ok: false, titles: cards.map((c) => c.innerText.split('\\n')[0]) }
      target.click()
      return { ok: true }
    `)
    await sleep(900)
    const readStarted = await cdp.eval(`
      const btns = [...document.querySelectorAll('.action')]
      if (btns.length < 2) return { ok: false, n: btns.length }
      btns[0].click()
      return { ok: true, label: btns[0].innerText.replace(/\\n/g, '') }
    `)
    check(
      '古诗点读页能打开一首诗并开始「读整首」',
      pickedPoem.ok && readStarted.ok,
      pickedPoem.ok ? `按钮「${readStarted.label || ''}」` : `没找到《画》：${safeJson(pickedPoem.titles)}`,
    )
    let poemRec = null
    for (let i = 0; i < 60; i++) {
      await sleep(500)
      poemRec = await cdp.eval(`
        const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null') } catch (e) { return null } }
        const sessions = (read('kx:sessions') || {}).d || []
        const att = (read('kx:attempts') || {}).d || []
        return {
          sessions: sessions.length,
          kinds: sessions.map((s) => s.kind),
          statuses: sessions.map((s) => s.status),
          lesson: sessions[0] ? sessions[0].lessonId : null,
          attempts: att.length,
          activity: att[0] ? att[0].activityId : null,
        }
      `)
      if (poemRec && poemRec.sessions > 0) break
    }
    check(
      '读完一首会记账（practice 会话 + poem-read 作答）',
      poemRec && poemRec.sessions === 1 && poemRec.kinds[0] === 'practice' && poemRec.lesson === 'zh-poem-qimeng' && poemRec.activity === 'poem-read',
      safeJson(poemRec),
    )
    await cdp.freshNavigate(`${BASE}/#/pages/parent/parent`)
    await sleep(1700)
    const poemParent = await cdp.eval(`
      const txt = document.body.innerText
      const m = txt.match(/完成课程[^0-9]*([0-9]+)/)
      const rows = [...document.querySelectorAll('.record-row')].map((r) => r.innerText.replace(/\\n+/g, ' '))
      return { completed: m ? Number(m[1]) : null, rows }
    `)
    check(
      '点读会出现在家长页「最近记录」并标为练习',
      poemParent.rows.some((r) => r.includes('练习')),
      safeJson(poemParent.rows.slice(0, 2)),
    )
    check(
      '读完一首不会把整门古诗课算成"完成课程"（一课有 6 首）',
      poemParent.completed === 0,
      `完成课程=${poemParent.completed}`,
    )

    // ---------- 12. 收集页：图鉴三态渲染 + 庆祝条（改动过统计布局，明细页从未验证） ----------
    await cdp.setViewport(390, 844)
    // 造出三种状态：cat 掌握、dog 认识、其余未解锁；并把"上次计数"设为 0 以触发庆祝条
    await cdp.freshNavigate(`${BASE}/#/pages/map/map`)
    await sleep(700)
    await cdp.eval(`
      localStorage.setItem('kx:collection', JSON.stringify({ v: 1, d: {
        en: { seen: ['dog', 'cat'], mastered: ['cat'] },
        zh: { seen: [], mastered: [] },
        zhWords: { seen: [], mastered: [] },
        zhSentences: { seen: [], mastered: [] },
        math: { done: [] },
      } }))
      localStorage.setItem('kx:prefs', JSON.stringify({ v: 1, d: { lastCollectionLit: {
        // 基线：只点亮过 dog（cat 这次从无到有，且同时进 seen+mastered）
        en: ['dog'], zh: [], zhWords: [], zhSentences: [], math: [],
      } } }))
      return 1
    `)
    await cdp.freshNavigate(`${BASE}/#/pages/collection/collection`)
    await sleep(1300)
    const gathered = await cdp.eval(`
      const cel = document.querySelector('.celebrate')
      const labels = [...document.querySelectorAll('.stat-label')].map((e) => e.innerText.trim())
      const nums = [...document.querySelectorAll('.stat-num')].map((e) => e.innerText.trim())
      return { celebrate: cel ? cel.innerText.trim() : null, labels, nums }
    `)
    // cat 同时进 seen 与 mastered，但只能算 **1 张**新卡片（旧实现按点亮动作会报 2）
    check(
      '庆祝条按去重后的卡片数报新增（cat 认识+掌握只算一张）',
      !!gathered.celebrate && /新点亮\s*1\s*张/.test(gathered.celebrate),
      gathered.celebrate || '未出现',
    )
    check('收集页统计格数与文案正确（英语掌握 1/2000）', gathered.labels.includes('英语掌握') && gathered.nums.some((n) => n.startsWith('1/')), `${safeJson(gathered.labels)} ${safeJson(gathered.nums)}`)

    // 打开「动物」分类明细：cat 掌握 / dog 认识 / 其他未解锁
    const opened = await cdp.eval(`
      const cards = [...document.querySelectorAll('.cat-card')]
      const target = cards.find((c) => (c.innerText || '').includes('动物'))
      if (!target) return { found: false, texts: cards.slice(0, 6).map((c) => (c.innerText || '').split('\\n')[0]) }
      target.click()
      return { found: true, count: cards.length }
    `)
    await sleep(1200)
    const tiles = await cdp.eval(`
      const sheet = document.querySelector('.overlay')
      if (!sheet) return { open: false }
      const tiles = [...document.querySelectorAll('.tile')]
      const stateOf = (t) => (t.className.match(/tile-(locked|seen|mastered)/) || [])[1] || '?'
      return {
        open: true,
        title: (document.querySelector('.sheet-title') || {}).innerText || '',
        prog: (document.querySelector('.sheet-prog') || {}).innerText || '',
        total: tiles.length,
        mastered: tiles.filter((t) => stateOf(t) === 'mastered').length,
        seen: tiles.filter((t) => stateOf(t) === 'seen').length,
        locked: tiles.filter((t) => stateOf(t) === 'locked').length,
        starOnMastered: tiles.filter((t) => stateOf(t) === 'mastered' && t.querySelector('.tile-star')).length,
        lockedPlaceholders: tiles.filter((t) => stateOf(t) === 'locked' && t.querySelector('.tile-locked')).length,
        firstMasteredText: (tiles.find((t) => stateOf(t) === 'mastered') || {}).innerText || '',
      }
    `)
    check('能打开分类明细（overlay + 标题 + 进度）', opened.found && tiles.open, opened.found ? `${tiles.title} ${tiles.prog}` : `没找到动物卡：${safeJson(opened.texts)}`)
    if (tiles.open) {
      check(
        '明细页三态正确：掌握 1、认识 1、其余未解锁',
        tiles.mastered === 1 && tiles.seen === 1 && tiles.locked === tiles.total - 2,
        `共 ${tiles.total} 格：掌握 ${tiles.mastered} / 认识 ${tiles.seen} / 未解锁 ${tiles.locked}`,
      )
      check('掌握格带 ⭐，未解锁格显示 ?', tiles.starOnMastered === 1 && tiles.lockedPlaceholders === tiles.locked, `⭐${tiles.starOnMastered} ?×${tiles.lockedPlaceholders}`)
      check('掌握的正是 cat（不是别的词）', tiles.firstMasteredText.includes('cat'), tiles.firstMasteredText.replace(/\n/g, ' ').slice(0, 40))
    }
    await cdp.eval(`const o = document.querySelector('.overlay'); if (o) o.click(); return 1`)
    await sleep(600)

    // 再次进入收集页：庆祝条应消失（上次计数已更新）
    await cdp.freshNavigate(`${BASE}/#/pages/collection/collection`)
    await sleep(1200)
    check(
      '再次进入时庆祝条已消失（不重复庆祝）',
      await cdp.eval(`return !document.querySelector('.celebrate')`),
    )

    // ---------- 12b. 非法深链：不白屏，且不与记录错配 ----------
    // 页面设计是「回退到第一个分类/级别」而不是报错页（对孩子更友好），
    // 但内容与课程不一致时**必须不记会话**——否则孩子的进度会被记到别的课上。
    await cdp.freshNavigate(`${BASE}/#/pages/map/map`)
    await sleep(700)
    await cdp.eval(`localStorage.removeItem('kx:active'); return 1`)
    await cdp.freshNavigate(`${BASE}/#/pages/learn/learn?subject=en&cat=__not_a_category&lessonId=en-learn-animals`)
    await sleep(2000)
    const badCat = await cdp.eval(`
      return {
        rendered: !!document.querySelector('.swiper') && document.querySelectorAll('.card').length > 0,
        blank: document.body.innerText.trim().length === 0,
        activeSession: localStorage.getItem('kx:active') !== null,
        title: (document.querySelector('.title') || {}).innerText || '',
      }
    `)
    check(
      '非法分类深链不白屏（回退到别的分类照常显示）',
      badCat.rendered && !badCat.blank,
      `渲染=${badCat.rendered} 标题「${badCat.title}」`,
    )
    check(
      '内容与课程不一致时不记会话（避免进度记到别的课上）',
      !badCat.activeSession,
      `kx:active=${badCat.activeSession ? '存在（错配）' : '未创建（正确）'}`,
    )

    await cdp.freshNavigate(`${BASE}/#/pages/quiz/quiz?subject=en&level=99&lessonId=en-quiz-l1`)
    await sleep(2000)
    const badLevel = await cdp.eval(`
      return {
        opts: document.querySelectorAll('.option').length,
        round: (document.querySelector('.round-info') || {}).innerText || '',
        blank: document.body.innerText.trim().length === 0,
      }
    `)
    check('非法级别深链不白屏且能出题（回退到默认级别）', badLevel.opts > 0 && !badLevel.blank, `${badLevel.round}，选项 ${badLevel.opts} 个`)

    // ---------- 12c. 数学 9 个关卡：每个题型分支都要能渲染并作答（规则文件记录过 compareNum 崩页事故） ----------
    // 9 关共 23 种题型；模板里只有 count/add/sub/compare/compareNum/wordX/listen/sequence
    // 有专属分支，其余走通用算式分支。这里逐关抽样作答，逐题校验"要么 4 个选项、要么 2 张比大小卡"
    // 且题干非空、作答后不白屏——这正是"新增题型只修一处 v-if 就继续崩页"的防线。
    const MATH_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9]
    // 每关的题型池 → 期望渲染分支（与 domain/mathgen 的 KINDS_BY_LEVEL 对应）
    const EXPECTED_FAMILIES = {
      1: ['tiles', 'listen', 'equation'],
      2: ['groups', 'compare-emoji'],
      3: ['equation', 'compare-num'],
      4: ['equation'],
      5: ['equation'],
      6: ['equation'],
      7: ['equation'],
      8: ['word'],
      9: ['equation'],
    }
    const families = new Set()
    const mathProblems = []
    await cdp.setViewport(390, 844)
    for (const level of MATH_LEVELS) {
      await cdp.freshNavigate(`${BASE}/#/pages/math/practice?level=${level}`)
      await sleep(1400)
      const seenHere = new Set()
      for (let i = 0; i < 6; i++) {
        const q = await cdp.eval(`
          const q = (s) => document.querySelectorAll(s).length
          const txt = (s) => { const e = document.querySelector(s); return e ? (e.innerText || '').trim() : '' }
          const cards = q('.compare-card')
          const opts = q('.opt')
          const visual = q('.tiles') + q('.groups') + q('.dot-emoji') + q('.compare-num')
          const fam = q('.tiles') ? 'tiles'
            : q('.groups') ? 'groups'
            : cards > 0 ? (q('.dot-emoji') > 0 ? 'compare-emoji' : 'compare-num')
            : q('.word-problem') > 0 ? 'word'
            : q('.listen-icon') > 0 ? 'listen'
            : q('.equation') > 0 ? 'equation'
            : 'unknown'
          return {
            fam, opts, cards,
            round: txt('.round-info'),
            hasText: !!(txt('.equation') || txt('.word-problem')),
            visual,
            blank: document.body.innerText.trim().length === 0,
          }
        `)
        if (q.blank) {
          mathProblems.push(`L${level} 第${i + 1}题白屏`)
          break
        }
        seenHere.add(q.fam)
        families.add(q.fam)
        // 比大小两种题型直接点卡片（无数字选项，固定 2 张）；其余是 3 或 4 个选项
        // （generator 里 numOptions(n, 3) 用于低关，numOptions(n, 4) 用于其它关）
        const valid = q.cards === 2 ? q.opts === 0 : (q.opts === 3 || q.opts === 4) && q.cards === 0
        if (!valid) mathProblems.push(`L${level} 第${i + 1}题形态异常：选项 ${q.opts} / 卡片 ${q.cards}`)
        // 题干可以是文字（算式/应用题），也可以是纯图形（点数、看图加减、比大小）
        if (!q.hasText && q.visual === 0) mathProblems.push(`L${level} 第${i + 1}题既无文字也无图形（fam=${q.fam}）`)
        const roundBefore = q.round
        await cdp.eval(`
          const target = document.querySelector('.compare-card') || document.querySelector('.opt')
          if (target) target.click()
          return !!target
        `)
        // 作答反馈有两条路径：答对 → 先播放鼓励语音再进下一题（约 1.5s）；
        // 答错 → 先揭晓（对勾/right 类）再自动进下一题。固定等待会误判成"无反应"，
        // 所以轮询到「题号变化 / 出现揭晓 / 出结果页」为止。
        let after = null
        for (let t = 0; t < 14; t++) {
          await sleep(300)
          after = await cdp.eval(`
            return {
              round: (document.querySelector('.round-info')||{}).innerText || '',
              reveal: !!document.querySelector('.opt-check'),
              right: !!document.querySelector('.opt.right, .compare-card.right'),
              finished: !!document.querySelector('.result'),
              blank: document.body.innerText.trim().length === 0,
            }
          `)
          if (after.blank) break
          if (after.round !== roundBefore || after.reveal || after.right || after.finished) break
        }
        if (after.blank) mathProblems.push(`L${level} 第${i + 1}题作答后白屏`)
        // 答对会进下一题（或先标记 right）；答错会先揭晓（对勾/right）再自动进下一题
        const advanced = after.round !== roundBefore || after.reveal || after.right || after.finished
        if (!advanced) mathProblems.push(`L${level} 第${i + 1}题作答后无反应（fam=${q.fam}）`)
      }
      const unexpected = [...seenHere].filter((f) => f === 'unknown' || !EXPECTED_FAMILIES[level].includes(f))
      if (unexpected.length) mathProblems.push(`L${level} 出现该关不该有的分支：${unexpected.join(',')}`)
    }
    check(
      '数学 9 关 54 题：形态合法（比大小 2 卡 / 其余 3~4 选项）、有内容、作答有反馈、无白屏',
      mathProblems.length === 0,
      mathProblems.length ? mathProblems.slice(0, 4).join(' | ') : '全部通过',
    )

    /**
     * 比大小两种分支（比多少 / 比数字）在最坏情况下抽样多轮都不出现（L2/L3 各 3~4 种题型）。
     * 它们是无选项的特殊分支（历史上 compareNum 崩过页），所以这里"追问到出现为止"，
     * 上限 30 题避免极端情况卡住；单次 1/3 概率下 30 题不出现的概率约 1e-5。
     */
    async function ensureFamily(level, family, maxQ = 24) {
      await cdp.freshNavigate(`${BASE}/#/pages/math/practice?level=${level}`)
      await sleep(1400)
      for (let i = 0; i < maxQ; i++) {
        const cur = await cdp.eval(`
          const cards = document.querySelectorAll('.compare-card').length
          return {
            fam: cards > 0 ? (document.querySelectorAll('.dot-emoji').length > 0 ? 'compare-emoji' : 'compare-num') : '',
            round: (document.querySelector('.round-info')||{}).innerText || '',
            finished: !!document.querySelector('.result'),
          }
        `)
        if (cur.fam === family) return { ok: true, questions: i + 1 }
        if (cur.finished) {
          // 一轮 10 题结束，点「再来一次」继续追问
          await cdp.eval(`const b = document.querySelector('.result-btn'); if (b) b.click(); return 1`)
          await sleep(1400)
          continue
        }
        await cdp.eval(`
          const target = document.querySelector('.compare-card') || document.querySelector('.opt')
          if (target) target.click()
          return !!target
        `)
        // 等题号变化（或进入结果页）：稳定判据，不依赖作答反馈动画的具体时长
        for (let t = 0; t < 16; t++) {
          await sleep(300)
          const now = await cdp.eval(`
            return {
              round: (document.querySelector('.round-info')||{}).innerText || '',
              finished: !!document.querySelector('.result'),
            }
          `)
          if (now.finished || now.round !== cur.round) break
        }
      }
      return { ok: false, questions: maxQ }
    }
    const cmpEmoji = await ensureFamily(2, 'compare-emoji')
    const cmpNum = await ensureFamily(3, 'compare-num')
    check(
      '数学「比多少」分支能渲染（2 张比大小卡、无数字选项）',
      cmpEmoji.ok,
      cmpEmoji.ok ? `第 ${cmpEmoji.questions} 题出现` : `追问 ${cmpEmoji.questions} 题仍未出现`,
    )
    check(
      '数学「比数字」分支能渲染（历史上 compareNum 崩过页）',
      cmpNum.ok,
      cmpNum.ok ? `第 ${cmpNum.questions} 题出现` : `追问 ${cmpNum.questions} 题仍未出现`,
    )
    check(
      '数学题型分支覆盖到位（看图 / 应用题 / 算式 / 听音 / 比大小）',
      ['tiles', 'groups', 'word', 'equation'].every((f) => families.has(f)) && cmpEmoji.ok && cmpNum.ok,
      `观察到：${[...families].join(', ')}`,
    )

    // ---------- 12c-2. 答错讲解（路线图里"答错后的讲解环"）：揭晓要说清"为什么" ----------
    // 原来是"正确答案是绿色的这个 ✓"，孩子知道点哪个但不知道为什么。
    // 现在按题型生成讲解（domain/explain.js），这里验证三类页面都真的显示出来。
    const explainCases = [
      ['数学（算式/缺数/比大小）', `${BASE}/#/pages/math/practice?level=3`, /(算式是|补上缺的数|找规律|那边是答案|数一数|听到的是)/],
      ['语文（看字选拼音/组词/听音）', `${BASE}/#/pages/quiz/quiz?subject=zh&level=1&lessonId=zh-quiz-l1`, /(读 |是「|可以组成「|听到的是|这一句是)/],
      ['英语（听音选图）', `${BASE}/#/pages/quiz/quiz?subject=en&level=1&lessonId=en-quiz-l1`, /听到的是/],
    ]
    const explainGot = []
    for (const [label, route, family] of explainCases) {
      const text = await captureReveal(cdp, route, 6)
      explainGot.push({ label, text, ok: !!text && family.test(text) })
    }
    check(
      '答错揭晓会讲清"为什么"（数学/语文/英语都出现讲解文案）',
      explainGot.every((x) => x.ok),
      explainGot.map((x) => `${x.label}：「${x.text}」`).join(' ｜ '),
    )
    check(
      '讲解文案够短（揭晓区一行小字，≤40 字）',
      explainGot.every((x) => x.text.length > 0 && x.text.length <= 40),
      explainGot.map((x) => x.text.length).join(' / ') + ' 字',
    )

    // ---------- 12d. 320px 窄屏全站横向溢出检查 ----------
    // 之前只覆盖了首页与描红页；窄屏横向溢出会让孩子看不到右侧内容（也没有滚动条提示）。
    await cdp.setViewport(320, 640)
    const overflowPages = [
      ['pages/map/map', '课程主页'],
      ['pages/quiz/quiz?subject=en&level=1&lessonId=en-quiz-l1', '英语挑战'],
      ['pages/quiz/quiz?subject=zh&level=1&lessonId=zh-quiz-l1', '汉字挑战'],
      ['pages/learn/learn?subject=en&cat=animals&lessonId=en-learn-animals', '学词页'],
      ['pages/math/math', '数学入口'],
      ['pages/math/practice?level=2', '数学练习'],
      ['pages/poem/poem', '古诗点读'],
      ['pages/write/write?char=%E4%B8%80&cp=4e00&pinyin=y%C4%AB', '描红'],
      ['pages/collection/collection', '图鉴'],
      ['pages/parent/parent', '家长中心'],
      ['pages/index/index', '英语入口'],
      ['pages/chinese/chinese', '语文入口'],
    ]
    const overflowing = []
    for (const [route, label] of overflowPages) {
      await cdp.freshNavigate(`${BASE}/#/${route}`)
      await sleep(1400)
      const r = await cdp.eval(`
        const de = document.documentElement
        const over = Math.max(de.scrollWidth, document.body.scrollWidth) - window.innerWidth
        // 找出真正越界的可见元素（排除可横滑容器内部的元素）
        const bad = []
        for (const el of document.querySelectorAll('uni-page-body *')) {
          const b = el.getBoundingClientRect()
          if (b.width === 0 || b.height === 0) continue
          if (b.right > window.innerWidth + 2 || b.left < -2) {
            if (el.closest('uni-scroll-view, uni-swiper, .swiper, [style*="overflow"]')) continue
            bad.push((el.className || el.tagName) + ':' + Math.round(b.left) + '~' + Math.round(b.right))
          }
        }
        return { over, bad: bad.slice(0, 3) }
      `)
      if (r.over > 1) overflowing.push(`${label} 文档溢出 ${r.over}px ${safeJson(r.bad)}`)
    }
    check('320px 窄屏 12 个页面均无横向溢出', overflowing.length === 0, overflowing.slice(0, 3).join(' | ') || '全部通过')
    await cdp.setViewport(390, 844)

    // ---------- 12e. 清空学习记录：破坏性操作必须"取消不删、确认全删、偏好保留" ----------
    // 家长点这个按钮的意图是"这台设备上别留孩子的记录"，所以：
    //   取消 → 一条都不能少；确认 → attempts/sessions/active/review/collection 全清；
    //   同时**不能**误删偏好（口音/低龄/阶段），那是设置不是学习记录。
    await cdp.setViewport(390, 844)
    await cdp.freshNavigate(`${BASE}/#/pages/map/map`)
    await sleep(700)
    await cdp.eval(`
      localStorage.setItem('kx:attempts', JSON.stringify({ v: 1, d: [{ attemptId: 'a1', correct: true, order: 0, ts: 1 }] }))
      localStorage.setItem('kx:sessions', JSON.stringify({ v: 1, d: [{ sessionId: 's1', lessonId: 'en-quiz-l1', status: 'completed', kind: 'challenge', startedAt: 1 }] }))
      localStorage.setItem('kx:active', JSON.stringify({ v: 1, d: { session: { sessionId: 's2', lessonId: 'en-quiz-l1' } } }))
      localStorage.setItem('kx:review', JSON.stringify({ v: 1, d: { en: { 'en|cat': { box: 0, due: 1, wrong: 1 } } } }))
      localStorage.setItem('kx:collection', JSON.stringify({ v: 1, d: { en: { seen: ['cat'], mastered: [] }, zh: { seen: [], mastered: [] }, zhWords: { seen: [], mastered: [] }, zhSentences: { seen: [], mastered: [] }, math: { done: [] } } }))
      localStorage.setItem('kx:prefs', JSON.stringify({ v: 1, d: { accent: 'gb', lowAge: false, stage: 'g56' } }))
      return 1
    `)
    const READ_RECORDS = `
      const keys = ['attempts', 'sessions', 'active', 'review', 'collection']
      const present = {}
      for (const k of keys) present[k] = localStorage.getItem('kx:' + k) !== null
      let prefs = null
      try { prefs = JSON.parse(localStorage.getItem('kx:prefs') || 'null') } catch (e) {}
      return { present, prefs: prefs && prefs.d ? prefs.d : null }
    `
    await cdp.freshNavigate(`${BASE}/#/pages/parent/parent`)
    await sleep(1200)

    // 1) 取消 → 一条都不少
    await cdp.eval(`document.querySelector('.clear-btn').click(); return 1`)
    await sleep(700)
    const modalShown = await cdp.eval(`
      const btns = [...document.querySelectorAll('.uni-modal__btn')].map((b) => b.innerText.trim())
      const cancel = btns.find((t) => t.includes('取消'))
      const el = [...document.querySelectorAll('.uni-modal__btn')].find((b) => b.innerText.includes('取消'))
      if (el) el.click()
      return { btns, clicked: !!el }
    `)
    await sleep(900)
    const afterCancel = await cdp.eval(READ_RECORDS)
    check(
      '清空弹窗出现且取消后记录一条不少（破坏性操作有二次确认）',
      modalShown.btns.length > 0 && modalShown.clicked && Object.values(afterCancel.present).every(Boolean),
      `按钮 ${safeJson(modalShown.btns)}，取消后 ${safeJson(afterCancel.present)}`,
    )

    // 2) 确认 → 全清，但偏好保留
    await cdp.eval(`document.querySelector('.clear-btn').click(); return 1`)
    await sleep(700)
    const confirmed = await cdp.eval(`
      const el = [...document.querySelectorAll('.uni-modal__btn')].find((b) => b.innerText.includes('清空'))
      if (el) el.click()
      return !!el
    `)
    await sleep(1200)
    const afterClear = await cdp.eval(READ_RECORDS)
    check(
      '确认清空后 5 类学习记录全部删除',
      confirmed && Object.values(afterClear.present).every((v) => v === false),
      safeJson(afterClear.present),
    )
    check(
      '清空不误删偏好（口音/低龄/阶段属于设置，不是学习记录）',
      !!afterClear.prefs && afterClear.prefs.accent === 'gb' && afterClear.prefs.lowAge === false && afterClear.prefs.stage === 'g56',
      safeJson(afterClear.prefs),
    )
    const homeAfterClear = await cdp.eval(`
      const parentText = document.body.innerText
      return { reviewCard: document.querySelectorAll('.review-card').length, hasReviewSection: parentText.includes('待复习') }
    `)
    await cdp.freshNavigate(`${BASE}/#/pages/map/map`)
    await sleep(1100)
    const mapAfterClear = await cdp.eval(`
      const due = JSON.parse(localStorage.getItem('kx:review') || '{"d":{}}').d || {}
      return { reviewCard: document.querySelectorAll('.review-card').length, dueKeys: Object.keys(due).length, attempts: JSON.parse(localStorage.getItem('kx:attempts') || '{"d":[]}').d.length }
    `)
    check(
      '清空后首页不再出现错题重练入口（记录真的没了）',
      mapAfterClear.reviewCard === 0 && mapAfterClear.dueKeys === 0 && mapAfterClear.attempts === 0,
      `错题卡 ${mapAfterClear.reviewCard} / 到期条目 ${mapAfterClear.dueKeys} / attempts ${mapAfterClear.attempts}`,
    )
    // 复位偏好，避免影响后续场景
    await cdp.eval(`localStorage.setItem('kx:prefs', JSON.stringify({ v: 1, d: { accent: 'us' } })); return 1`)

    // ---------- 13. 返回按钮兜底 + 连点节流（曾出过「返回键失效」的真实事故） ----------
    // 不依赖 getCurrentPages（uni-h5 未把它挂到 window）与 hash 字面量
    // （reLaunch 到首页 tab 会把 hash 归一成 #/），改用页面级标记：
    //   首页 = 4 个阶段胶囊；课程页 = 已离开首页且出现课程内容。
    const ON_HOME = `return document.querySelectorAll('.stage-chip').length === 4`
    await cdp.setViewport(390, 844)

    // a) 直链进入（没有可回的栈）→ 点 ← 必须回主页，而不是装死
    await cdp.freshNavigate(`${BASE}/#/pages/quiz/quiz?subject=en&level=1&lessonId=en-quiz-l1`)
    await sleep(1200)
    const quizRendered = await cdp.eval(`return document.querySelectorAll('.option').length > 0`)
    await cdp.click('.back')
    await sleep(1400)
    const homeAfterDeepBack = await cdp.eval(ON_HOME)
    check(
      '直链进入后点返回会回主页（无栈可回也不装死）',
      quizRendered && homeAfterDeepBack,
      `进入时出题=${quizRendered}，返回后首页=${homeAfterDeepBack}`,
    )

    // b) 从课程页点进一课时有栈可回，返回应回到首页
    //    注意：不要用 window.uni.navigateTo 计数——H5 里应用用的是模块内的 uni
    //    （window.uni 上根本没有 navigateTo，实测 typeof 为 undefined），
    //    打桩只会打到一个没人调用的对象上，断言会假通过。
    //    改为验证**可观察行为**：离开首页且在课程页，然后一次返回回到首页。
    await cdp.freshNavigate(`${BASE}/#/pages/map/map`)
    await sleep(1100)
    await cdp.eval(`
      const card = document.querySelector('.unit-card')
      if (card) card.click()
      return 1
    `)
    await sleep(1600)
    const leftHome = await cdp.eval(`return !(${ON_HOME.replace(/^return /, '')})`)
    const lessonRendered = await cdp.eval(`
      return document.querySelectorAll('.swiper, .option, .poem-card, .board').length > 0
    `)
    check('从课程页能进入课程（离开首页并渲染课程页）', leftHome && lessonRendered, `课程页渲染=${lessonRendered}`)
    await cdp.click('.back')
    await sleep(1400)
    check('有页面栈时返回回到上一页（首页）', await cdp.eval(ON_HOME))

    // c) 连点节流：窗口内重复点击必须被折叠，不能叠出多层页面。
    //    验证方式：连点 4 次后「按一次返回就回到首页」——若节流失效会叠 4 层，需要按 4 次。
    await cdp.navigate(`${BASE}/#/pages/map/map`)
    await sleep(1600) // 等过节流窗口（700ms），确保这一轮从"可放行"状态开始
    await cdp.eval(`
      const card = document.querySelector('.unit-card')
      if (card) { card.click(); card.click(); card.click(); card.click() }
      return 1
    `)
    await sleep(1700)
    const rapidLeftHome = await cdp.eval(`return !(${ON_HOME.replace(/^return /, '')})`)
    check('连点 4 次课程卡会跳进课程（不是 0 次也不是被吞掉）', rapidLeftHome)
    await cdp.click('.back')
    await sleep(1500)
    const rapidBackHome = await cdp.eval(ON_HOME)
    check('连点 4 次后按一次返回即回到首页（未被叠成多层）', rapidBackHome)

    // ---------- 14. 低龄模式（内容安全）：惊悚/暗黑分类必须整类消失 ----------
    // 这是安全开关：默认开启并隐藏 characters/story。上面单测覆盖了逻辑，
    // 这里验证它在真实页面里确实生效（课程地图真的少掉这些课）。
    const setPrefs = (obj) =>
      cdp.eval(`localStorage.setItem('kx:prefs', ${JSON.stringify(JSON.stringify({ v: 1, d: obj }))}); return 1`)
    const countG56 = `
      const txt = document.body.innerText
      return {
        cards: document.querySelectorAll('.unit-card').length,
        hasChar: txt.includes('角色'),
        hasStory: txt.includes('故事'),
      }
    `
    await cdp.setViewport(390, 844)
    await setPrefs({ stage: 'g56', lowAge: false })
    await cdp.freshNavigate(`${BASE}/#/pages/map/map`)
    await sleep(900)
    const lowAgeOff = await cdp.eval(countG56)
    await setPrefs({ stage: 'g56', lowAge: true })
    await cdp.freshNavigate(`${BASE}/#/pages/map/map`)
    await sleep(900)
    const lowAgeOn = await cdp.eval(countG56)
    check(
      '低龄模式关闭时能看到「角色/故事」分类（否则这条检查没有意义）',
      lowAgeOff.hasChar && lowAgeOff.hasStory,
      `课卡 ${lowAgeOff.cards} 张，角色=${lowAgeOff.hasChar} 故事=${lowAgeOff.hasStory}`,
    )
    check(
      '低龄模式开启时整类隐藏（内容安全）',
      !lowAgeOn.hasChar && !lowAgeOn.hasStory && lowAgeOn.cards < lowAgeOff.cards,
      `课卡 ${lowAgeOff.cards} → ${lowAgeOn.cards}，角色=${lowAgeOn.hasChar} 故事=${lowAgeOn.hasStory}`,
    )

    // ---------- 14b. 低龄模式 + 直链/题池的组合（内容安全不能只在"正常点进去"时生效） ----------
    // 单纯过滤首页不够：家长/旧书签/分享链接可能直链到被隐藏的分类，挑战题池也必须过滤。
    const wordsData = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/words.json'), 'utf8'))
    const hiddenWordIds = new Set(
      wordsData.categories.filter((c) => ['characters', 'story'].includes(c.id)).flatMap((c) => c.words.map((w) => w.id)),
    )
    check('能取到被隐藏分类的词表（用于安全断言）', hiddenWordIds.size > 0, `${hiddenWordIds.size} 个词`)

    await setPrefs({ lowAge: true })
    // (1) 直链到被隐藏分类：应回退到别的分类，绝不能显示隐藏内容，也不能记会话
    await cdp.eval(`localStorage.removeItem('kx:active'); return 1`)
    await cdp.freshNavigate(`${BASE}/#/pages/learn/learn?subject=en&cat=story&lessonId=en-learn-story`)
    await sleep(2000)
    const hiddenDeepLink = await cdp.eval(`
      const imgs = [...document.querySelectorAll('.card img, uni-image img, .word-img img')].map((i) => i.getAttribute('src') || '')
      return {
        imgs,
        text: document.body.innerText.replace(/\\n+/g, ' ').slice(0, 80),
        active: localStorage.getItem('kx:active') !== null,
      }
    `)
    const leakedDeepLink = hiddenDeepLink.imgs
      .map((s) => (s.split('/').pop() || '').replace(/\.(png|jpg|webp)$/, ''))
      .filter((id) => hiddenWordIds.has(id))
    check(
      '低龄模式下直链被隐藏分类：不显示隐藏内容',
      leakedDeepLink.length === 0,
      leakedDeepLink.length ? `泄漏 ${leakedDeepLink.slice(0, 5).join(',')}` : `图片 ${hiddenDeepLink.imgs.length} 张，均不属于隐藏分类`,
    )
    check('低龄模式下直链被隐藏分类：内容与课程不一致时不记会话', !hiddenDeepLink.active, `kx:active=${hiddenDeepLink.active}`)

    // (2) 挑战题池也必须过滤：连打若干轮，收集出现的音频与选项图，断言没有隐藏分类的词
    cdp.requests.length = 0 // 只统计本场景真正请求过的音轨，避免把整轮的请求算进来
    await cdp.freshNavigate(`${BASE}/#/pages/quiz/quiz?subject=en&level=4&lessonId=en-quiz-l4`)
    await sleep(2200)
    const seenFiles = new Set()
    for (let i = 0; i < 10; i++) {
      const round = await cdp.eval(`
        const imgs = [...document.querySelectorAll('.option img, uni-image img')].map((e) => e.getAttribute('src') || '')
        return {
          opts: document.querySelectorAll('.option').length,
          imgs,
          round: (document.querySelector('.round-info') || {}).innerText || '',
          result: !!document.querySelector('.result'),
        }
      `)
      for (const s of round.imgs) seenFiles.add((s.split('/').pop() || '').replace(/\.(png|jpg|webp)$/, ''))
      if (round.result) break
      if (!round.opts) break
      await cdp.eval(`const o = document.querySelectorAll('.option')[0]; if (o) o.click(); return !!o`)
      for (let t = 0; t < 16; t++) {
        await sleep(300)
        const now = await cdp.eval(`
          return { r: (document.querySelector('.round-info') || {}).innerText || '', done: !!document.querySelector('.result') }
        `)
        if (now.done || now.r !== round.round) break
      }
    }
    // 请求过的音轨也代表题干内容
    for (const u of cdp.requests) {
      const m = /\/static\/audio(?:-gb)?\/([^/]+)\.mp3$/.exec(u)
      if (m) seenFiles.add(m[1])
    }
    const leakedQuiz = [...seenFiles].filter((id) => hiddenWordIds.has(id))
    check(
      '低龄模式下挑战题池已过滤（连打多轮不出现隐藏分类的词）',
      leakedQuiz.length === 0,
      leakedQuiz.length ? `泄漏 ${leakedQuiz.slice(0, 6).join(',')}` : `共出现 ${seenFiles.size} 个词，均不属于隐藏分类`,
    )
    await setPrefs({ lowAge: false })

    // ---------- 15. 路由守卫：乱输/拼错的 hash 必须被导回主页，而不是白屏 ----------
    // App.vue 的 guard 只对"对接不到的路径"生效（resolveHashRoute 白名单）。
    // 这是防白屏的兜底：家长手输、旧书签、被截断的链接都可能落到不存在的路由。
    await cdp.setViewport(390, 844)
    for (const [bad, label] of [
      ['#/pages/xxx/yyy', '不存在的页面'],
      ['#/pages/learn/Learn', '大小写拼错'],
      ['#/somewhere-else', '完全无关的路径'],
    ]) {
      await cdp.freshNavigate(`${BASE}/`)
      await sleep(900)
      await cdp.eval(`location.hash = ${JSON.stringify(bad)}; return 1`)
      await sleep(1400)
      const recovered = await cdp.eval(`
        return {
          home: document.querySelectorAll('.stage-chip').length === 4,
          hash: location.hash,
        }
      `)
      check(`路由守卫把${label}导回主页`, recovered.home, `${bad} → ${recovered.hash}`)
    }
    // 正常路由不应被守卫误伤（导回主页才是 bug）
    await cdp.freshNavigate(`${BASE}/#/pages/map/map`)
    await sleep(900)
    await cdp.eval(`location.hash = '#/pages/collection/collection'; return 1`)
    await sleep(1200)
    const legit = await cdp.eval(`
      return { collection: document.body.innerText.includes('我的百宝箱'), home: document.querySelectorAll('.stage-chip').length === 4 }
    `)
    check('合法路由不会被守卫误导回主页', legit.collection && !legit.home, JSON.stringify(legit))

    // ---------- 16. 导出/导入学习记录（应用的唯一备份通道，之前没验证过） ----------
    // 用真实鼠标事件点按钮（文件选择器需要 user activation），并把下载目录指到临时目录，
    // 读回导出的 JSON 校验结构，再用 DOM.setFileInputFiles 走一次真正的导入恢复。
    const dlDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kx-smoke-dl-'))
    try {
      await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dlDir })
      await cdp.setViewport(390, 844)
      // 造一条可识别的学习记录
      await cdp.freshNavigate(`${BASE}/#/pages/map/map`)
      await sleep(700)
      await cdp.eval(`
        localStorage.setItem('kx:attempts', JSON.stringify({ v: 1, d: [
          { attemptId: 'smoke-1', sessionId: 's', activityId: 'listen-pick', order: 0, answer: 'cat', correct: true, firstTry: true, itemId: 'cat', skillIds: ['en-word-l1'], ts: 1 },
        ] }))
        return 1
      `)
      await cdp.freshNavigate(`${BASE}/#/pages/parent/parent`)
      await sleep(1100)

      // 导出
      await cdp.realClick('.data-btn', 0)
      let exported = null
      for (let i = 0; i < 40 && !exported; i++) {
        await sleep(250)
        const got = fs.readdirSync(dlDir).filter((f) => !f.endsWith('.crdownload'))
        if (got.length) exported = path.join(dlDir, got[0])
      }
      let payload = null
      if (exported) {
        try {
          payload = JSON.parse(fs.readFileSync(exported, 'utf8'))
        } catch (e) {
          /* 解析失败下面断言会暴露 */
        }
      }
      check(
        '导出学习记录会真的下载出文件，且是可解析的备份 JSON',
        !!payload && payload.app === 'kids-english',
        exported ? `${path.basename(exported)}` : '没有下载出文件',
      )
      check(
        '备份文件带 schemaVersion/contentVersion 与全部数据键',
        !!payload &&
          typeof payload.schemaVersion === 'number' &&
          typeof payload.contentVersion === 'string' &&
          ['attempts', 'sessions', 'active', 'review', 'collection', 'prefs'].every((k) => k in payload.data),
        payload ? `v${payload.schemaVersion} / ${payload.contentVersion} / ${Object.keys(payload.data).length} 键` : '',
      )
      check('备份内容与当前记录一致（attempts 条数）', !!payload && payload.data.attempts.length === 1, payload ? `${payload.data.attempts.length} 条` : '')

      // 导入：先把存储清空，再走一次真实恢复
      await cdp.send('Page.setInterceptFileChooserDialog', { enabled: true })
      cdp.fileChoosers.length = 0
      await cdp.eval(`localStorage.setItem('kx:attempts', JSON.stringify({ v: 1, d: [] })); return 1`)
      await cdp.realClick('.data-btn', 1)
      await sleep(800)
      check('点「导入学习记录」会打开文件选择器（真实手势）', cdp.fileChoosers.length > 0, `事件数 ${cdp.fileChoosers.length}`)
      if (cdp.fileChoosers.length && exported) {
        const chooser = cdp.fileChoosers[cdp.fileChoosers.length - 1]
        await cdp.send('DOM.setFileInputFiles', { files: [exported], backendNodeId: chooser.backendNodeId })
        await sleep(1500)
        const modal = await cdp.eval(`
          const btn = [...document.querySelectorAll('.uni-modal__btn')].find((b) => b.innerText.includes('导入'))
          return { hasModal: !!document.querySelector('.uni-modal'), hasConfirm: !!btn }
        `)
        check('导入前会弹确认框（覆盖前让家长确认）', modal.hasModal && modal.hasConfirm, safeJson(modal))
        if (modal.hasConfirm) {
          await cdp.eval(`
            const b = [...document.querySelectorAll('.uni-modal__btn')].find((x) => x.innerText.includes('导入'))
            b.click()
            return 1
          `)
          await sleep(1300)
          const restored = await cdp.eval(`
            const a = JSON.parse(localStorage.getItem('kx:attempts') || '{}')
            return Array.isArray(a.d) ? a.d.length : -1
          `)
          check('确认后学习记录被真的恢复回来', restored === 1, `恢复后 attempts = ${restored} 条`)
        }
      }
    } finally {
      try {
        fs.rmSync(dlDir, { recursive: true, force: true })
      } catch (e) {
        /* 忽略 */
      }
      await cdp.send('Browser.setDownloadBehavior', { behavior: 'default' }).catch(() => {})
    }

    // ---------- 16b. 奖励闭环（真实点击，不用预置数据）：学完一课 → 会话完成 → 图鉴真的点亮 ----------
    // 这是全站的核心激励回路：孩子学完却什么都没点亮＝白学，家长页也看不到。
    // 之前所有图鉴断言都是**预置 localStorage**，从没验证过"学习 → 记录 → 点亮 → 页面显示"这条链。
    // 选最小的课（en-learn-city，10 个词）以便真点完；本场景会清空存储，所以放在依赖历史数据的场景之后。
    await cdp.setViewport(390, 844)
    await cdp.freshNavigate(`${BASE}/#/pages/map/map`)
    await sleep(700)
    await cdp.eval(`localStorage.clear(); return 1`)

    // continueTarget 只在单测里验过纯函数；首页「继续学习」卡片的三态（开始第一课/下一课/继续上次）
    // 与点击后的跳转属于页面接线，这里顺带覆盖。三态各自需要不同存储状态，所以分三处断言。
    const RESUME_CARD = `
      const tag = document.querySelector('.resume-tag')
      const title = document.querySelector('.resume-title')
      return {
        has: !!document.querySelector('.resume-card'),
        tag: tag ? tag.innerText.trim() : '',
        title: title ? title.innerText.trim() : '',
      }
    `
    await cdp.freshNavigate(`${BASE}/#/pages/map/map`)
    await sleep(1400)
    const resumeStart = await cdp.eval(RESUME_CARD)
    check(
      '全新状态首页显示「开始第一课」',
      resumeStart.has && resumeStart.tag === '开始第一课' && !!resumeStart.title,
      `标签「${resumeStart.tag}」课程「${resumeStart.title}」`,
    )

    await cdp.freshNavigate(`${BASE}/#/pages/learn/learn?subject=en&cat=city&lessonId=en-learn-city`)
    await sleep(2200)

    const learnOpened = await cdp.eval(`
      return {
        pageNum: (document.querySelector('.page-num') || {}).innerText || '',
        navBtns: document.querySelectorAll('.nav-btn').length,
        firstWord: (document.querySelector('.card') || {}).innerText ? document.querySelector('.card').innerText.replace(/\\n+/g, ' ').slice(0, 40) : '',
      }
    `)
    check(
      '学词页打开：有前后翻页按钮与页码',
      learnOpened.navBtns === 2 && /\d+\s*\/\s*\d+/.test(learnOpened.pageNum),
      `页码「${learnOpened.pageNum}」首卡「${learnOpened.firstWord}」`,
    )

    // 真点「→」直到走完（末张再点一次触发完成）；页码不变说明已到末尾
    let lastPage = ''
    let stuck = 0
    for (let i = 0; i < 16; i++) {
      const page = await cdp.eval(`return (document.querySelector('.page-num') || {}).innerText || ''`)
      if (page && page === lastPage) stuck++
      else stuck = 0
      lastPage = page
      if (await cdp.eval(`return location.hash.indexOf('learn') < 0`)) break
      // 点第二个 .nav-btn（第一个是「←」）
      await cdp.eval(`const b = document.querySelectorAll('.nav-btn')[1]; if (b) b.click(); return !!b`)
      await sleep(650)
      if (stuck >= 1) break // 已在末张点到第二次 → 完成逻辑已触发
    }
    await sleep(1500)

    const rewarded = await cdp.eval(`
      const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null') } catch (e) { return null } }
      const sessions = (read('kx:sessions') || {}).d || []
      const coll = (read('kx:collection') || {}).d || null
      const finished = sessions.filter((s) => s.lessonId === 'en-learn-city' && s.status === 'completed')
      return {
        sessions: sessions.length,
        finished: finished.length,
        kind: finished[0] ? finished[0].kind : null,
        seen: coll && coll.en ? (coll.en.seen || []).length : 0,
      }
    `)
    check(
      '学完一课会落一条 completed 的 learn 会话（不是只翻页不记录）',
      rewarded.finished > 0 && rewarded.kind === 'learn',
      `会话 ${rewarded.sessions} 条，本课完成 ${rewarded.finished} 条（kind=${rewarded.kind}）`,
    )
    check('学完一课后图鉴真的点亮（本课词进入「认识」）', rewarded.seen > 0, `认识 ${rewarded.seen} 个词`)

    // 图鉴页要能**显示**出来（渲染链路，而不只是存储里有）
    // 注意断言口径：「学一学完成」按设计只点亮**认识**（seen），不给星、不算掌握，
    // 所以统计格里的「英语掌握 0/1949」「小星星 0」是**正确**的；可见的反馈是
    // 「分类卡不再变暗」+「明细页里这些词不再是未解锁」，以及首次使用没有庆祝条
    // （没有"上次计数"可比较，celebrate 为 null）。
    await cdp.freshNavigate(`${BASE}/#/pages/collection/collection`)
    await sleep(1500)
    const collView = await cdp.eval(`
      const card = [...document.querySelectorAll('.cat-card')].find((c) => (c.innerText || '').includes('城市'))
      return {
        nums: [...document.querySelectorAll('.stat-num')].map((e) => e.innerText.trim()),
        found: !!card,
        dim: card ? card.className.includes('dim') : null,
        prog: card ? (card.querySelector('.cat-prog') || {}).innerText : '',
        celebrate: !!document.querySelector('.celebrate'),
        cards: document.querySelectorAll('.cat-card').length,
      }
    `)
    check('图鉴页能找到刚学完的分类卡（城市）', collView.found, `分类卡 ${collView.cards} 张`)
    check(
      '刚学完的分类卡不再变暗（seen>0 有视觉反馈，掌握仍为 0 是正确语义）',
      collView.dim === false,
      `dim=${collView.dim} 卡片进度「${collView.prog}」，统计 ${safeJson(collView.nums)}`,
    )
    check('首次使用没有庆祝条（没有上次点亮基线可比，不虚报新点亮）', !collView.celebrate)

    // 明细页：这 10 个词应当是「认识」态，而不是未解锁的 ?
    await cdp.eval(`
      const card = [...document.querySelectorAll('.cat-card')].find((c) => (c.innerText || '').includes('城市'))
      if (card) card.click()
      return 1
    `)
    await sleep(1200)
    const detailStates = await cdp.eval(`
      const tiles = [...document.querySelectorAll('.tile')]
      const stateOf = (t) => (t.className.match(/tile-(locked|seen|mastered)/) || [])[1] || '?'
      return {
        open: !!document.querySelector('.overlay'),
        total: tiles.length,
        seen: tiles.filter((t) => stateOf(t) === 'seen').length,
        locked: tiles.filter((t) => stateOf(t) === 'locked').length,
      }
    `)
    check(
      '明细页里刚学完的词是「认识」态（不是未解锁）',
      detailStates.open && detailStates.seen === 10 && detailStates.locked === 0,
      `共 ${detailStates.total} 格：认识 ${detailStates.seen} / 未解锁 ${detailStates.locked}`,
    )

    // 「下一课」态：需要"有已完成课、但没有活跃/暂停会话"——这正是学完一课后的稳态。
    // 前面真点完 city 后页面会自动进下一课（留下 countries 的活跃会话），所以这里把状态收敛到稳态再断言。
    await cdp.freshNavigate(`${BASE}/#/pages/map/map`)
    await sleep(800)
    await cdp.eval(`
      const sessions = (JSON.parse(localStorage.getItem('kx:sessions') || '{"d":[]}').d || [])
        .filter((s) => s.status === 'completed')
      localStorage.setItem('kx:sessions', JSON.stringify({ v: 1, d: sessions }))
      localStorage.removeItem('kx:active')
      return sessions.length
    `)
    await cdp.freshNavigate(`${BASE}/#/pages/map/map`)
    await sleep(1500)
    const resumeNext = await cdp.eval(RESUME_CARD)
    check(
      '学完一课后（无活跃会话时）首页显示「下一课」而不是重复同一课',
      resumeNext.has && resumeNext.tag === '下一课' && !!resumeNext.title && !resumeNext.title.includes('城市'),
      `标签「${resumeNext.tag}」课程「${resumeNext.title}」`,
    )
    await cdp.eval(`const c = document.querySelector('.resume-card'); if (c) c.click(); return !!c`)
    await sleep(2200)
    const nextTarget = await cdp.eval(`
      return { hash: location.hash, rendered: !!document.querySelector('.swiper') && document.querySelectorAll('.card').length > 0 }
    `)
    check(
      '点「下一课」能进入同一科目的下一门课（不是回到刚学完的那课）',
      nextTarget.rendered && !nextTarget.hash.includes('en-learn-city'),
      `hash=${nextTarget.hash}`,
    )

    // ---------- 16c. 挑战的奖励闭环：答完 10 题 → 会话完成 + 星级 + 「掌握」点亮 ----------
    // 与 16b 互补：学一学只点亮「认识」，挑战才给星与「掌握」。这条链（作答 → 完成 →
    // 星级 → 图鉴掌握 → 图鉴页可见）此前没有任何场景真的走完过。
    await cdp.freshNavigate(`${BASE}/#/pages/map/map`)
    await sleep(700)
    await cdp.eval(`localStorage.clear(); return 1`) // 从零开始，星星/掌握都必须来自本次挑战
    await cdp.freshNavigate(`${BASE}/#/pages/quiz/quiz?subject=en&level=1&lessonId=en-quiz-l1`)
    await sleep(2000)
    let sawResult = false
    for (let i = 0; i < 14 && !sawResult; i++) {
      const st = await cdp.eval(`
        return {
          result: !!document.querySelector('.result'),
          round: (document.querySelector('.round-info') || {}).innerText || '',
          opts: document.querySelectorAll('.option').length,
        }
      `)
      if (st.result) {
        sawResult = true
        break
      }
      if (!st.opts) break
      await cdp.eval(`
        const o = document.querySelectorAll('.option')[0]
        if (o) o.click()
        return !!o
      `)
      // 等本题走完：答对立刻进下一题；答错先揭晓再自动进下一题
      for (let t = 0; t < 16; t++) {
        await sleep(300)
        const now = await cdp.eval(`
          return { result: !!document.querySelector('.result'), round: (document.querySelector('.round-info') || {}).innerText || '' }
        `)
        if (now.result || now.round !== st.round) break
      }
    }
    await sleep(1200)
    const quizReward = await cdp.eval(`
      const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null') } catch (e) { return null } }
      const sessions = (read('kx:sessions') || {}).d || []
      const coll = (read('kx:collection') || {}).d || null
      const fin = sessions.filter((s) => s.lessonId === 'en-quiz-l1' && s.status === 'completed')
      const s = fin[0] || {}
      const attempts = (read('kx:attempts') || {}).d || []
      const t = s.totals || {}
      // 星级不是存下来的，而是由 totals 在读取时推导（parent.vue 也是这么算的）
      const stars = t.questions ? 1 + (t.firstCorrect / t.questions >= 0.9 ? 2 : t.firstCorrect / t.questions >= 0.6 ? 1 : 0) : null
      return {
        result: !!document.querySelector('.result'),
        kind: s.kind || null,
        questions: t.questions === undefined ? null : t.questions,
        firstCorrect: t.firstCorrect === undefined ? null : t.firstCorrect,
        stars,
        attempts: attempts.length,
        mastered: coll && coll.en ? (coll.en.mastered || []).length : 0,
        starsText: (document.querySelector('.result-stars') || {}).innerText || '',
        sessionAttempts: t.attempts === undefined ? null : t.attempts,
      }
    `)
    check('答完 10 题会进入结果页并显示星级', quizReward.result && quizReward.starsText.includes('⭐'), quizReward.starsText || '未到结果页')
    check(
      '挑战完成后落一条带 totals 的 completed 会话（作答 → 完成 → 星级链条通了）',
      quizReward.kind === 'challenge' && quizReward.questions === 10 && quizReward.sessionAttempts === 10,
      `kind=${quizReward.kind} 题数=${quizReward.questions} 首答对=${quizReward.firstCorrect} 聚合作答=${quizReward.sessionAttempts} 推导星级=${quizReward.stars}`,
    )
    check('由 totals 推导出的星级在合法区间（1~3 星）', typeof quizReward.stars === 'number' && quizReward.stars >= 1 && quizReward.stars <= 3, `星级=${quizReward.stars}`)
    check(
      '首答答对的题进入图鉴「掌握」（掌握只应由挑战首答产生）',
      quizReward.mastered > 0,
      `掌握 ${quizReward.mastered} 个词`,
    )

    // 图鉴页的「英语掌握」统计应随之非 0 —— 这是家长/孩子唯一能看到掌握的入口
    await cdp.freshNavigate(`${BASE}/#/pages/collection/collection`)
    await sleep(1500)
    const masteryView = await cdp.eval(`
      const labels = [...document.querySelectorAll('.stat-label')].map((e) => e.innerText.trim())
      const nums = [...document.querySelectorAll('.stat-num')].map((e) => e.innerText.trim())
      const i = labels.findIndex((l) => l.includes('英语掌握'))
      return { labels, nums, mastered: i >= 0 ? nums[i] : null, stars: nums[0] }
    `)
    check(
      '图鉴页「英语掌握」反映本次挑战的首答成绩（非 0）',
      !!masteryView.mastered && !/^0\//.test(masteryView.mastered),
      `英语掌握=${masteryView.mastered}，小星星=${masteryView.stars}`,
    )

    // ---------- 16d. 数学错题重练：原题重放 + 不计课时 ----------
    // 错题本存的是"答错那道的整题快照"（payload），重练时按 id 还原原题。
    // 这条链断掉的后果很隐蔽：题面变了（孩子练的不是错的那道）、或重练反而刷出课时和星星。
    await cdp.setViewport(390, 844)
    await cdp.freshNavigate(`${BASE}/#/pages/map/map`)
    await sleep(700)
    await cdp.eval(`localStorage.clear(); return 1`)

    // 题面签名：算式/应用题取文字，比大小取卡片内容，其余取选项
    const MATH_SIG = `
      const txt = (s) => { const e = document.querySelector(s); return e ? (e.innerText || '').trim() : '' }
      const cards = [...document.querySelectorAll('.compare-card')].map((c) => c.innerText.trim())
      const opts = [...document.querySelectorAll('.opt-text')].map((e) => e.innerText.trim())
      return {
        title: txt('.title'),
        round: txt('.round-info'),
        stem: txt('.equation') || txt('.word-problem') || txt('.listen-icon') || txt('.tiles'),
        cards, opts,
        sig: (txt('.equation') || txt('.word-problem') || cards.join('|') || opts.join('|')),
      }
    `

    // 1) 真实答错一道（点到出现揭晓对勾＝答错），并记下题面
    await cdp.freshNavigate(`${BASE}/#/pages/math/practice?level=2`)
    await sleep(1600)
    let asked = null
    let madeWrong = false
    for (let round = 0; round < 6 && !madeWrong; round++) {
      asked = await cdp.eval(MATH_SIG)
      const n = await cdp.eval(`return Math.max(document.querySelectorAll('.opt').length, document.querySelectorAll('.compare-card').length)`)
      for (let k = 0; k < n && !madeWrong; k++) {
        await cdp.eval(`
          const t = document.querySelectorAll('.compare-card')[${k}] || document.querySelectorAll('.opt')[${k}]
          if (t) t.click()
          return !!t
        `)
        await sleep(500)
        madeWrong = await cdp.eval(`return !!document.querySelector('.opt-check')`)
        if (!madeWrong) break // 答对了，已进下一题
      }
      if (!madeWrong) {
        // 等下一题稳定
        for (let t = 0; t < 12; t++) {
          await sleep(300)
          const r = await cdp.eval(`return (document.querySelector('.round-info')||{}).innerText || ''`)
          if (r && r !== asked.round) break
        }
      }
    }
    check('能真实制造一道数学错题（进了错题本并带整题快照）', madeWrong, `题面「${asked ? asked.sig.slice(0, 40) : ''}」`)
    // 错题本是**扁平命名空间键**（`math|math-l2:add:2:1`），不是按科目嵌套
    const REVIEW_SHAPE = `
      const d = (JSON.parse(localStorage.getItem('kx:review') || '{}').d) || {}
      const keys = Object.keys(d)
      const mathKeys = keys.filter((k) => k.startsWith('math|'))
      const entries = mathKeys.map((k) => d[k])
      return {
        total: keys.length,
        mathKeys,
        kinds: entries.map((e) => (e.payload ? e.payload.kind : null)),
        payloadKeys: entries.map((e) => (e.payload ? Object.keys(e.payload).join(',') : '')),
        box: entries[0] ? entries[0].box : null,
        due: entries[0] ? entries[0].due : null,
      }
    `
    const reviewStored = await cdp.eval(REVIEW_SHAPE)
    check(
      '错题条目里存了整题快照（payload.kind 存在）',
      reviewStored.mathKeys.length > 0 && reviewStored.kinds.every((k) => !!k),
      `数学错题 ${reviewStored.mathKeys.length} 条，题型=${safeJson(reviewStored.kinds)}，字段=${safeJson(reviewStored.payloadKeys)}`,
    )

    // 2) 进重练模式：必须是同一道题
    const sessionsBefore = await cdp.eval(`
      const d = (JSON.parse(localStorage.getItem('kx:sessions') || '{"d":[]}').d || [])
      return d.length
    `)
    await cdp.freshNavigate(`${BASE}/#/pages/math/practice?review=1`)
    await sleep(1800)
    const replayed = await cdp.eval(MATH_SIG)
    check('重练模式标题为「错题重练」', replayed.title.includes('错题重练'), `标题「${replayed.title}」`)
    check(
      '重练是原题重放（题面与作答时完全一致）',
      !!asked && replayed.sig === asked.sig && replayed.sig.length > 0,
      `作答时「${asked ? asked.sig.slice(0, 30) : ''}」vs 重练「${replayed.sig.slice(0, 30)}」`,
    )

    // 3) 重练不刷课时：答完仍不产生 completed 会话
    const n2 = await cdp.eval(`return Math.max(document.querySelectorAll('.opt').length, document.querySelectorAll('.compare-card').length)`)
    for (let k = 0; k < n2; k++) {
      await cdp.eval(`
        const t = document.querySelectorAll('.compare-card')[${k}] || document.querySelectorAll('.opt')[${k}]
        if (t) t.click()
        return !!t
      `)
      await sleep(600)
      if (await cdp.eval(`return !!document.querySelector('.opt-check')`)) break
    }
    await sleep(1500)
    const reviewAfter = await cdp.eval(`
      const sessions = (JSON.parse(localStorage.getItem('kx:sessions') || '{"d":[]}').d || [])
      const active = localStorage.getItem('kx:active') !== null
      const d = (JSON.parse(localStorage.getItem('kx:review') || '{}').d) || {}
      const mathKeys = Object.keys(d).filter((k) => k.startsWith('math|'))
      const first = mathKeys.length ? d[mathKeys[0]] : null
      return { sessions: sessions.length, active, keys: mathKeys.length, box: first ? (first.box === undefined ? null : first.box) : null, due: first ? first.due : null }
    `)
    check(
      '重练不计课时、不产生会话（不给孩子刷课时/星级）',
      reviewAfter.sessions === sessionsBefore && !reviewAfter.active,
      `会话 ${sessionsBefore} → ${reviewAfter.sessions}（active=${reviewAfter.active}）`,
    )
    check('重练后错题条目按 Leitner 更新（box/due 仍存在）', reviewAfter.keys > 0 && reviewAfter.due !== null, `条目 ${reviewAfter.keys} 条，box=${reviewAfter.box} due=${reviewAfter.due}`)

    // 4) 没有到期错题时：提示 + 回主页，不白屏
    await cdp.eval(`localStorage.removeItem('kx:review'); return 1`)
    await cdp.freshNavigate(`${BASE}/#/pages/math/practice?review=1`)
    await sleep(2200)
    const emptyPool = await cdp.eval(`
      return {
        home: document.querySelectorAll('.stage-chip').length === 4,
        blank: document.body.innerText.trim().length === 0,
        hash: location.hash,
      }
    `)
    // 回归：池空时页面会先渲染一瞬再跳回主页，那段时间不能出现「第 1 / 0 题」或空选项区
    // （修之前这里会渲染空题目并抛 TypeError，见 16d 上方注释）
    await cdp.freshNavigate(`${BASE}/#/pages/math/practice?review=1`)
    await sleep(250)
    const midFlash = await cdp.eval(`
      const txt = document.body.innerText
      return {
        badRound: /第\\s*1\\s*\\/\\s*0\\s*题/.test(txt),
        optBlocks: document.querySelectorAll('.options, .compare-card, .tiles, .groups').length,
      }
    `)
    check(
      '空池直链进入重练时不会渲染「第 1 / 0 题」或空题目区',
      !midFlash.badRound && midFlash.optBlocks === 0,
      `第1/0题=${midFlash.badRound} 题目区元素=${midFlash.optBlocks}`,
    )
    await sleep(1800)
    check('没有到期错题直链进重练：不白屏且回主页', emptyPool.home && !emptyPool.blank, `hash=${emptyPool.hash}`)

    // ---------- 16e. 池为空的早退路径（闪现窗口）——数学与挑战页都要干净 ----------
    // 这类路径只在"参数无效/错题本为空"时走到，恰恰是最容易被漏测的状态组合。
    await checkEmptyPoolFlash(cdp, `${BASE}/#/pages/math/practice?review=1`, '数学重练（错题本空）')
    await checkEmptyPoolFlash(cdp, `${BASE}/#/pages/quiz/quiz?review=en`, '英语重练（错题本空）')
    await checkEmptyPoolFlash(cdp, `${BASE}/#/pages/quiz/quiz?poem=__nope&subject=zh&lessonId=zh-poem-qimeng`, '古诗阶段不存在')
    await checkEmptyPoolFlash(cdp, `${BASE}/#/pages/quiz/quiz?subject=en&cat=__nope&lessonId=en-quiz-l1`, '英语分类不存在')

    // ---------- 16f. 古诗填字的会话生命周期：中途退出 → 原课恢复 → 完成记星 ----------
    // 这条链跨两个页面（poem.vue 点读页 → quiz.vue 填字模式），且题目池每次进入都会重建——
    // 若恢复时用了新建的题而不是快照里的题，孩子会看到"题变了"，记录也会与题错配。
    await cdp.setViewport(390, 844)
    await cdp.freshNavigate(`${BASE}/#/pages/map/map`)
    await sleep(700)
    await cdp.eval(`localStorage.clear(); return 1`)

    const FILL_STATE = `
      const txt = (s) => { const e = document.querySelector(s); return e ? (e.innerText || '').trim() : '' }
      return {
        hash: location.hash,
        title: txt('.title'),
        round: txt('.round-info'),
        stem: txt('.stem'),
        opts: [...document.querySelectorAll('.option')].map((o) => o.innerText.trim()),
        result: !!document.querySelector('.result'),
      }
    `

    // 直接进入填字模式的 URL（与点「填字挑战」按钮跳转的地址一致；
    // 按钮接线已由场景 11 覆盖，这里专注会话生命周期）
    await cdp.freshNavigate(`${BASE}/#/pages/quiz/quiz?poem=qimeng&subject=zh&lessonId=zh-poem-qimeng`)
    await sleep(2400)
    const fillQuiz = await cdp.eval(FILL_STATE)
    check(
      '填字模式出题（听句选缺字，有选项）',
      fillQuiz.title.includes('古诗填字') && fillQuiz.opts.length >= 2 && /第\s*1\s*\/\s*\d+/.test(fillQuiz.round),
      `${fillQuiz.round}｜题干「${fillQuiz.stem.slice(0, 20)}」`,
    )

    // 答一题后退出
    await cdp.eval(`const o = document.querySelectorAll('.option')[0]; if (o) o.click(); return !!o`)
    await sleep(1800)
    const fillAfterOne = await cdp.eval(FILL_STATE)
    const fillSessBefore = await cdp.eval(`
      const a = JSON.parse(localStorage.getItem('kx:active') || 'null')
      return a && a.d ? { sessionId: a.d.session && a.d.session.sessionId, lessonId: a.d.session && a.d.session.lessonId, kind: a.d.session && a.d.session.kind } : null
    `)
    check(
      '填字挑战会开一条挂在古诗课上的会话',
      !!fillSessBefore && fillSessBefore.lessonId === 'zh-poem-qimeng',
      safeJson(fillSessBefore),
    )

    await cdp.click('.back')
    await sleep(1400)
    const fillPaused = await cdp.eval(`
      const d = (JSON.parse(localStorage.getItem('kx:sessions') || '{"d":[]}').d || [])
      const mine = d.filter((s) => s.lessonId === 'zh-poem-qimeng')
      const last = mine[mine.length - 1] || null
      return {
        n: mine.length,
        statuses: mine.map((x) => x.status),
        status: last && last.status,
        sessionId: last && last.sessionId,
        snapRounds: last && last.snapshot && last.snapshot.rounds ? last.snapshot.rounds.length : 0,
        snapIdx: last && last.snapshot ? last.snapshot.roundIdx : null,
        activeCleared: localStorage.getItem('kx:active') === null,
      }
    `)
    check(
      '中途退出会落一条带快照的 paused 会话',
      // 不要求 idx>0：答错时页面要先揭晓再自动进下一题，退出时机不同 idx 可能还是 0。
      // 真正的不变量是"快照在、题数与题号可还原"，由下面的重进断言逐项验证。
      fillPaused.status === 'paused' && fillPaused.snapRounds === 10 && Number.isInteger(fillPaused.snapIdx) && fillPaused.activeCleared,
      `会话 ${fillPaused.n} 条 ${safeJson(fillPaused.statuses)}；快照题数=${fillPaused.snapRounds} idx=${fillPaused.snapIdx} active 已清=${fillPaused.activeCleared}`,
    )

    // 重新进入同一课：必须复用同一 sessionId、回到原题号、题干与上次一致
    await cdp.freshNavigate(`${BASE}/#/pages/quiz/quiz?poem=qimeng&subject=zh&lessonId=zh-poem-qimeng`)
    await sleep(2400)
    const fillResumed = await cdp.eval(FILL_STATE)
    const fillSessAfter = await cdp.eval(`
      const a = JSON.parse(localStorage.getItem('kx:active') || 'null')
      return a && a.d && a.d.session ? a.d.session.sessionId : null
    `)
    check(
      '重新进入会复用同一会话并回到原题号（题目不重出）',
      fillSessAfter === fillPaused.sessionId && fillResumed.round === fillAfterOne.round && fillResumed.stem === fillAfterOne.stem,
      `sessionId ${fillPaused.sessionId} → ${fillSessAfter}；题号「${fillAfterOne.round}」→「${fillResumed.round}」`,
    )

    // 答完剩下的题：应落 completed 会话并给出星级（古诗课时记在本课）
    let fillSawResult = fillResumed.result
    for (let i = 0; i < 16 && !fillSawResult; i++) {
      const st = await cdp.eval(FILL_STATE)
      if (st.result) {
        fillSawResult = true
        break
      }
      if (!st.opts.length) break
      await cdp.eval(`const o = document.querySelectorAll('.option')[0]; if (o) o.click(); return !!o`)
      for (let t = 0; t < 16; t++) {
        await sleep(300)
        const now = await cdp.eval(`return { r: (document.querySelector('.round-info')||{}).innerText || '', done: !!document.querySelector('.result') }`)
        if (now.done || now.r !== st.round) break
      }
    }
    await sleep(1000)
    const fill = await cdp.eval(`
      const d = (JSON.parse(localStorage.getItem('kx:sessions') || '{"d":[]}').d || [])
      const mine = d.filter((s) => s.lessonId === 'zh-poem-qimeng')
      const done = mine.filter((s) => s.status === 'completed')
      const last = done[done.length - 1] || null
      const t = (last && last.totals) || {}
      const stars = t.questions ? 1 + (t.firstCorrect / t.questions >= 0.9 ? 2 : t.firstCorrect / t.questions >= 0.6 ? 1 : 0) : null
      const coll = (JSON.parse(localStorage.getItem('kx:collection') || '{}').d) || {}
      const reviewMap = (JSON.parse(localStorage.getItem('kx:review') || '{}').d) || {}
      return {
        total: mine.length,
        completed: done.length,
        kind: last && last.kind,
        questions: t.questions,
        firstCorrect: t.firstCorrect,
        stars,
        zhMastered: coll.zh ? (coll.zh.mastered || []).length : 0,
        reviewKeys: Object.keys(reviewMap).length,
      }
    `)
    check(
      '答完古诗填字会落一条 completed 会话（kind=challenge、带 totals 与星级）',
      fill.completed === 1 && fill.kind === 'challenge' && fill.questions > 0 && fill.stars >= 1,
      `会话 ${fill.total} 条（完成 ${fill.completed}），题数=${fill.questions} 首答对=${fill.firstCorrect} 星级=${fill.stars}`,
    )
    // 设计如此（代码里有明确注释）：古诗填字的条目是「字在句中位置」，不是可还原的知识点，
    // 所以既不进错题本、也不点亮汉字图鉴；这里把"不产生脏数据"这件事锁住，
    // 避免将来有人顺手接上导致重练池里出现无法还原的条目（徽章说有错题、点进去却是空的）。
    check(
      '古诗填字不写错题本、不点亮汉字图鉴（避免不可还原的条目与假的掌握）',
      fill.reviewKeys === 0 && fill.zhMastered === 0,
      `错题本条目 ${fill.reviewKeys} 个，汉字掌握 ${fill.zhMastered} 个`,
    )

    // ---------- 17. 控制台零报错 ----------
    await cdp.drainPageErrors()
    const errs = [...cdp.pageSideErrors, ...cdp.consoleErrors, ...cdp.pageErrors]
    check(
      '运行期零 console error / 未捕获异常 / 未处理的 Promise 拒绝',
      errs.length === 0,
      errs.length ? `${errs.length} 条：\n      ` + errs.map((e, i) => `[${i + 1}] ${e}`).join('\n      ') : '',
    )

    // ---------- 17. 英式音轨缺失时回退美音（故意制造网络失败，必须放在零报错检查之后） ----------
    // 这是已知的线上事故模式：部署时漏传 audio-gb 目录 → 家长切到英式后全部无声。
    // audio.js 的 loaderror 处理会把 /audio-gb/ 改写成 /audio/ 兜底，这里真的把它断掉来验证。
    // 注意：该路径会**有意**打出 console.error，所以本场景放在"零报错"断言之后。
    await cdp.send('Network.setBlockedURLs', { urls: ['*/static/audio-gb/*'] })
    await cdp.eval(`localStorage.setItem('kx:prefs', JSON.stringify({ v: 1, d: { accent: 'gb' } })); return 1`)
    cdp.requests.length = 0
    await cdp.freshNavigate(`${BASE}/#/pages/learn/learn?subject=en&cat=animals&lessonId=en-learn-animals`)
    await sleep(3000)
    const gbTried = cdp.requests.filter((u) => u.includes('/static/audio-gb/'))
    const usAfter = cdp.requests.filter((u) => /\/static\/audio\/[A-Za-z][\w'-]*\.mp3$/.test(u))
    const fallbackPair = gbTried.some((g) => {
      const file = g.split('/').pop()
      return usAfter.some((u) => u.split('/').pop() === file)
    })
    check('切英式且 audio-gb 不可用时确实尝试过英式音轨', gbTried.length > 0, `${gbTried.length} 条`)
    check(
      '英式缺文件时回退取同名美音（不是永久沉默）',
      fallbackPair,
      fallbackPair ? `例：${gbTried[0].split('/').pop()}` : `英式 ${gbTried.length} 条 / 美音 ${usAfter.length} 条，未配对`,
    )
    await cdp.send('Network.setBlockedURLs', { urls: [] })
    await cdp.eval(`localStorage.setItem('kx:prefs', JSON.stringify({ v: 1, d: { accent: 'us' } })); return 1`)

    // ---------- 18. 存储写失败必须可见（真实配额耗尽，不是打桩） ----------
    // 本地存储是唯一数据源：星星/完成/错题本/图鉴全丢却毫无提示，是这类应用最糟的失败模式。
    // 这里真的把 localStorage 填到临界（64 字节级逼近配额），再让页面自己发起一次写入
    // （点口音胶囊 → updatePrefs），验证家长页会出现常驻告警条。
    // 放在零报错检查之后：该路径会**有意**打出 console.error。
    try {
      await cdp.setViewport(390, 844)
      await cdp.freshNavigate(`${BASE}/#/pages/parent/parent`)
      await sleep(1000)
      check('填充配额前不显示存储告警条（对照组）', await cdp.eval(`return !document.querySelector('.storage-warn')`))

      const fill = await cdp.eval(`
        const put = (k, v) => localStorage.setItem(k, v)
        let big = 0
        try { while (big < 200) { put('__junk' + big, 'x'.repeat(256 * 1024)); big++ } } catch (e) { /* 满了 */ }
        let kb = 0
        try { while (kb < 4000) { put('__junkk' + kb, 'y'.repeat(1024)); kb++ } } catch (e) { /* 满了 */ }
        let tiny = 0
        try { while (tiny < 4000) { put('__junkt' + tiny, 'z'.repeat(64)); tiny++ } } catch (e) { /* 满了 */ }
        // 关键：按 1 字符继续逼近，直到连「和自检探针同量级」的写入都失败。
        // 只用 64B 粒度收尾会留下 40~75 字节余量，小写入仍可能塞进去 → 断言随机失败。
        let fine = 0
        try { while (fine < 8000) { put('__junkf' + fine, 'z'); fine++ } } catch (e) { /* 满了 */ }
        let appLikeFails = false
        try { localStorage.setItem('kx:__sizetest', JSON.stringify({ v: 1, d: 1789000000000 })) } catch (e) { appLikeFails = true }
        if (!appLikeFails) localStorage.removeItem('kx:__sizetest')
        return { big, kb, tiny, fine, appLikeFails }
      `)
      check(
        '能把 localStorage 逼到「连自检探针都写不进去」',
        fill.appLikeFails,
        `256KB×${fill.big} + 1KB×${fill.kb} + 64B×${fill.tiny} + 1B×${fill.fine}`,
      )

      // 重新进入家长页（新文档）：页面自己的存储自检应当立刻亮出告警，无需家长做任何操作
      await cdp.freshNavigate(`${BASE}/#/pages/parent/parent`)
      await sleep(1400)
      const warned = await cdp.eval(`
        const el = document.querySelector('.storage-warn')
        return {
          has: !!el,
          text: el ? el.innerText.replace(/\\n+/g, ' / ') : '',
          probeLeft: localStorage.getItem('kx:自检') !== null,
          errors: (window.__errors || []).slice(-2),
        }
      `)
      check(
        '配额耗尽后一进家长页就出现「存储写不进去」告警条（无需任何操作）',
        warned.has,
        `告警=${warned.has} 探针残留=${warned.probeLeft} 错误=${safeJson(warned.errors)}`,
      )
      check(
        '告警条给出可执行的下一步（导出备份 / 清理空间）',
        warned.text.includes('导出备份') && warned.text.includes('清理'),
        warned.text.slice(0, 130),
      )
      check('自检探针写完即删，不在存储里留垃圾', !warned.probeLeft)
    } finally {
      // 清理填充，保持环境干净（本场景已是最后一项）
      await cdp
        .eval(`
          const dels = []
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i)
            if (k && k.startsWith('__junk')) dels.push(k)
          }
          dels.forEach((k) => localStorage.removeItem(k))
          localStorage.removeItem('__probe_small')
          return dels.length
        `)
        .catch(() => {})
    }
  } finally {
    await cdp.close()
  }
}

main()
  .then(() => {
    console.log('\n===== H5 冒烟测试 =====')
    results.forEach((r) => console.log(r))
    console.log(`\n${failures ? '✖ 失败 ' + failures + ' 项' : '✓ 全部通过'}（共 ${results.length} 项）`)
    process.exitCode = failures ? 1 : 0
  })
  .catch((e) => {
    console.error('冒烟测试异常:', e)
    process.exitCode = 1
  })

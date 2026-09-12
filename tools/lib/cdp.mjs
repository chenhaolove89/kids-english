/**
 * 极简 Chrome DevTools Protocol 客户端（零依赖，用 Node 内置 WebSocket）。
 *
 * 被 tools/smoke-h5.mjs（冒烟断言）与 tools/shots.mjs（截图回归）共用。
 * 只提供这两个工具需要的能力：导航（含"强制新文档"）、求值、视口切换、截图、
 * 控制台/异常/未处理拒绝收集、网络请求记录。
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft/Edge/Application/msedge.exe'),
].filter(Boolean)

export function findChrome() {
  return CHROME_CANDIDATES.find((p) => p && fs.existsSync(p)) || null
}

function fmtArg(a) {
  if (!a) return String(a)
  if (a.value !== undefined) return typeof a.value === 'string' ? a.value : safeJson(a.value)
  if (a.description) return String(a.description).slice(0, 300)
  if (a.preview) return safeJson(a.preview).slice(0, 300)
  return '<arg>'
}

export function safeJson(v) {
  try {
    return JSON.stringify(v)
  } catch (e) {
    return '<unserializable>'
  }
}

/** 在每个文档的脚本之前装错误钩子：CDP 事件里对象参数只能拿到 "Object" */
const ERROR_HOOK = `
  window.__errors = [];
  (function () {
    // 带栈：只有 message 时定位不到出错位置（Vue 会把渲染期异常 console.error 出来，
    // 没有栈就只能靠猜）。取前 4 帧足够指出源文件与行号。
    const frames = (e) => {
      try {
        const st = e && e.stack ? String(e.stack) : '';
        if (!st) return '';
        const lines = st.split('\\n').slice(1, 5).map((l) => l.trim());
        return lines.length ? ' @ ' + lines.join(' <- ') : '';
      } catch (err) { return ''; }
    };
    const fmt = (a) => {
      try {
        if (typeof a === 'string') return a;
        if (a instanceof Error) return a.message + frames(a);
        if (a && a.message) return String(a.message) + frames(a);
        return JSON.stringify(a);
      } catch (e) { return '<arg>'; }
    };
    const orig = console.error.bind(console);
    console.error = function () {
      window.__errors.push('console.error: ' + Array.prototype.map.call(arguments, fmt).join(' '));
      orig.apply(null, arguments);
    };
    window.addEventListener('error', (e) => window.__errors.push('window.error: ' + (e.message || '') + frames(e.error)));
    window.addEventListener('unhandledrejection', (e) => window.__errors.push('unhandledrejection: ' + fmt(e.reason)));
  })();
`

export class Cdp {
  constructor(ws, child, profileDir) {
    this.ws = ws
    this.child = child
    this.profileDir = profileDir
    this.id = 0
    this.pending = new Map()
    this.consoleErrors = []
    this.pageErrors = []
    this.pageSideErrors = []
    this.requests = []
    this.fileChoosers = []
    this.lastRoute = '(init)'
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        if (msg.error) reject(new Error(JSON.stringify(msg.error)))
        else resolve(msg.result)
        return
      }
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        this.consoleErrors.push(`[${this.lastRoute}] ` + (msg.params.args || []).map(fmtArg).join(' '))
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        this.pageErrors.push(`[${this.lastRoute}] ` + (msg.params.exceptionDetails?.exception?.description || 'unknown exception'))
      }
      if (msg.method === 'Network.requestWillBeSent') this.requests.push(msg.params.request.url)
      if (msg.method === 'Page.fileChooserOpened') this.fileChoosers.push(msg.params)
    })
  }

  send(method, params = {}, timeoutMs = 30000) {
    const id = ++this.id
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error(`CDP timeout: ${method}`))
        }
      }, timeoutMs)
    })
  }

  /**
   * 在页面里求值并返回 JSON 化结果。
   * 包成 **async** IIFE：这样注入的代码里可以用 await（配合 awaitPromise，
   * CDP 会等 promise 落地）。否则 `await fetch(...)` 这类写法会报
   * "await is only valid in async functions"。
   */
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression: `(async function(){${expression}})()`,
      returnByValue: true,
      awaitPromise: true,
    })
    if (r.exceptionDetails) throw new Error('eval failed: ' + (r.exceptionDetails.exception?.description || ''))
    return r.result?.value
  }

  async setViewport(width, height, deviceScaleFactor = 1) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor, mobile: width < 700,
    })
  }

  /** 只改 hash 不会重新加载文档（uni 会复用页面实例），这里就是普通导航 */
  async navigate(url) {
    this.lastRoute = url.includes('#') ? url.slice(url.indexOf('#') + 1) : url
    await this.send('Page.navigate', { url })
    await sleep(1200)
    await this.drainPageErrors()
  }

  /** 绕 about:blank 真加载一次：等价于刷新/深链进入，onLoad 会重新执行 */
  async freshNavigate(url) {
    await this.send('Page.navigate', { url: 'about:blank' })
    await sleep(300)
    await this.navigate(url)
  }

  /** 文档级错误钩子在每次新文档会重建，必须及时收进 Node 侧 */
  async drainPageErrors() {
    try {
      const errs = await this.eval(`const e = window.__errors || []; window.__errors = []; return e`)
      if (Array.isArray(errs) && errs.length) this.pageSideErrors.push(...errs)
    } catch (e) {
      /* 页面可能正在导航 */
    }
  }

  allErrors() {
    return [...this.pageSideErrors, ...this.consoleErrors, ...this.pageErrors]
  }

  async click(selector) {
    const ok = await this.eval(
      `const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true`,
    )
    await sleep(900)
    return ok
  }

  /**
   * 真实鼠标点击（Input.dispatchMouseEvent）。
   * 需要 user activation 的动作（打开文件选择器、下载）**必须**用这个：脚本
   * `element.click()` 没有 activation，浏览器会静默拒绝——用它测"导入按钮"会得出
   * 「点了完全没反应」的错误结论。另外先 scrollIntoView：元素在视口外时
   * rect 的 y 超界，点击会落到空处。
   */
  async realClick(selector, index = 0) {
    const ok = await this.eval(`
      const el = document.querySelectorAll(${JSON.stringify(selector)})[${index}]
      if (!el) return false
      el.scrollIntoView({ block: 'center' })
      return true
    `)
    if (!ok) return false
    await sleep(350)
    const box = await this.eval(`
      const b = document.querySelectorAll(${JSON.stringify(selector)})[${index}].getBoundingClientRect()
      return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) }
    `)
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 })
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 })
    await sleep(900)
    return true
  }

  async screenshot(file) {
    const r = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    fs.writeFileSync(file, Buffer.from(r.data, 'base64'))
    return file
  }

  async close() {
    try {
      this.ws.close()
    } catch (e) {
      /* ignore */
    }
    try {
      this.child.kill()
    } catch (e) {
      /* ignore */
    }
    await sleep(400)
    try {
      fs.rmSync(this.profileDir, { recursive: true, force: true })
    } catch (e) {
      /* Windows 上 chrome 可能还没完全退出，留临时目录无害 */
    }
  }
}

/**
 * 启动无头 Chrome 并连上 CDP。
 * @param {{port?: number, extraArgs?: string[]}} opts
 */
export async function launchChrome({ port = 9222, extraArgs = [] } = {}) {
  const chrome = findChrome()
  if (!chrome) throw new Error('找不到 Chrome/Edge，可用 CHROME_PATH 指定')
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kx-cdp-'))
  const child = spawn(
    chrome,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-gpu',
      '--mute-audio',
      '--autoplay-policy=no-user-gesture-required',
      '--hide-scrollbars',
      ...extraArgs,
      'about:blank',
    ],
    { stdio: 'ignore' },
  )

  let target = null
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`)
      const list = await res.json()
      target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
    } catch (e) {
      /* chrome 还没起来 */
    }
    if (!target) await sleep(250)
  }
  if (!target) {
    try { child.kill() } catch (e) { /* ignore */ }
    throw new Error(`无法连上 Chrome CDP（端口 ${port}）`)
  }

  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })
  const cdp = new Cdp(ws, child, profileDir)
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: ERROR_HOOK })
  return cdp
}

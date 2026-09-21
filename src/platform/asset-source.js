/**
 * 资源源决策：服务器可达就用服务器上的资源，不可达就用应用包内那份（兜底）。
 *
 * 必须在任何页面渲染前定下来——收口是就地改数据单例（见 collectAssetFieldsInPlace），
 * 晚了页面读到的还是本地地址，远程模式等于没生效。所以 main.js 用顶层 await 把
 * initAssetSource() 挡在 createApp() 之前。
 *
 * 只给抢先版开启：发布脚本按目标替换下面的占位符——抢先版注入服务器地址，
 * 正式站与电脑版分享包留空，留空时本模块是空操作（连探测都不发）。
 */

import { setAssetBase } from './assets.js'

// 占位符由 tools/publish-github-pages.mjs 按 --remote-base 替换；不要在这里做字符串运算，
// 否则打包后字面量可能被折掉、发布脚本就替换不到了。
const REMOTE_BASE = '__KX_ASSET_REMOTE_BASE__'

// 探针目标：产物根的资源源标记文件（几十字节，发布脚本每次都写）。
// 刻意**不探 /static/ 下的文件**：发布脚本会把 JS 里的 '/static/ 改写成 './static/
// （子路径部署的相对化），而打包器还会把 'a' + '/' + 'b' 折成一个字面量，
// 折出来的 '/static/...' 一样会被改写，最终拼成 .../kids-english./static/... 这种坏地址——
// 探测必然 404、永远回退本地、服务器等于白挂，而且全程不报错。这个路径里没有 /static/，
// 折叠也好、改写也好都碰不到它。
const PROBE_PATH = 'asset-source.json'
// 超时不能太紧：探测是跨境请求（国内 → 新加坡），实测一趟超过 1.5 秒很常见。
// 掐太早的后果是"服务器明明可达却判为不可达"，永远用本地包——功能静默失效。
// 探测不阻塞渲染（先本地、通过再切），所以放宽超时的代价只是"晚一点切过去"。
const PROBE_TIMEOUT_MS = 4000

/**
 * 探测地址。两种情况不必探测、直接走本地：
 *  - 没有配远程资源源（正式站 / 电脑版 / 本地开发）；
 *  - 应用本身就是从这台服务器打开的——同源更快、SW 能缓存、还免 CORS。
 */
export function probeUrl(remoteBase, appHref) {
  if (!remoteBase) return null
  const root = remoteBase.replace(/\/+$/, '')
  if (appHref && appHref.indexOf(root + '/') === 0) return null
  return root + '/' + PROBE_PATH
}

/**
 * 决策：探测通过返回远程地址，否则返回空串（本地）。
 * fetchImpl / 超时可注入，便于单测覆盖超时与失败分支。
 */
export async function decideAssetBase(remoteBase, appHref, fetchImpl, timeoutMs) {
  const url = probeUrl(remoteBase, appHref)
  if (!url) return ''
  const doFetch = fetchImpl || (typeof fetch === 'function' ? fetch : null)
  if (!doFetch) return ''
  const ms = timeoutMs || PROBE_TIMEOUT_MS
  let timer = null
  try {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null
    if (ctrl) timer = setTimeout(() => ctrl.abort(), ms)
    const res = await doFetch(url, { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
    return res && res.ok ? remoteBase : ''
  } catch (e) {
    // 探测失败不是错误路径，是"用本地兜底"的正常分支：断网、超时、CORS 都会走到这
    return ''
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** 把配置值收敛成"真配了没有"：只有 http(s) 开头才算。
 * 占位符没被发布脚本替换（npm run build:h5 的原始产物、本地开发、冒烟测试）时
 * 会原样留在这里，若当成地址去探测就会凭空多一个失败请求，还会污染冒烟的零报错断言。
 * 这里刻意不复用占位符字面量做比较——发布脚本是 replaceAll，字面量出现两次会一起被替换，
 * 比较就恒真了。 */
export function configuredRemoteBase(raw) {
  return typeof raw === 'string' && /^https?:\/\//.test(raw) ? raw : ''
}

/**
 * 异步校正：探测一次，通过就切到服务器，不可达就保持本地。
 * 收口是懒取值，所以这里翻转 base 后**后续所有读取**（含尚未渲染的页面）自动跟着走。
 */
export async function verifyAssetSource(remoteBase, appHref, fetchImpl, timeoutMs) {
  const ok = await decideAssetBase(configuredRemoteBase(remoteBase), appHref, fetchImpl, timeoutMs)
  setAssetBase(ok || '')
  return ok
}

/**
 * 启动时调用一次，返回初始资源源（一律本地）。
 *
 * 为什么是"先本地、探测通过再切服务器"，而不是乐观地先用服务器：
 * uni-app 的 <image> 在 H5 下渲染成 <uni-image><div style="background-image">，**不是 <img>**
 * （实测 37 个 uni-image 只对应 3 个真 <img>），既没有可用的全局加载失败钩子，
 * 失败时也不会抛错——首屏若先按远程地址渲染，服务器不可达时那些图标会静默消失、无法补救。
 * 先本地则首屏一定正常；探测通过后，懒取值让后续页面（音频与词卡图的大头）全部走服务器。
 */
export function startAssetSource() {
  const href = typeof location !== 'undefined' ? location.href : ''
  const rb = configuredRemoteBase(REMOTE_BASE)
  setAssetBase('')
  if (!probeUrl(rb, href)) return ''
  verifyAssetSource(rb, href)
  return rb
}

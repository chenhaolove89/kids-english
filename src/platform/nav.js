/**
 * 点击节流：小朋友连点时只认第一次，防止重复跳页（navigateTo 叠页面）、重复出题。
 * createThrottle 返回「放行检查」：距上次放行不足 ms 毫秒返回 false。
 * now 可注入（测试用确定性时钟）。
 */
export function createThrottle(ms, now = () => Date.now()) {
  let last = -Infinity
  return () => {
    const t = now()
    if (t - last < ms) return false
    last = t
    return true
  }
}

// 页面跳转共用一个节流实例：700ms 内的第二次跳页请求直接忽略
const pageNavGate = createThrottle(700)
export function allowNavigate() {
  return pageNavGate()
}

/**
 * 返回按钮统一出口：页面栈只剩当前页（学完自动跳下一关的 redirectTo/直链/reLaunch 进入）
 * 时 navigateBack 无栈可回——降级为回课程主页，按钮永不变「死」。
 */
export function goBackOrHome() {
  const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
  if (pages && pages.length > 1) uni.navigateBack()
  else uni.reLaunch({ url: '/pages/map/map' })
}

/**
 * 平板判定：触屏（粗指针）+ 短边 ≥ 560px。
 * 只用于「点读板」这类平板专属入口的显示开关，不拦截任何已有流程。
 */
export function isTabletDevice() {
  try {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    if (!window.matchMedia('(pointer: coarse)').matches) return false
    const w = window.innerWidth || 0
    const h = window.innerHeight || 0
    return Math.min(w, h) >= 560
  } catch (e) {
    return false
  }
}

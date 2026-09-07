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

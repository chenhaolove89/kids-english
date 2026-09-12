/**
 * 与路由相关的 UI 收口（目前只有「收起原生 tabBar」）。
 *
 * 为什么需要收口：uni.hideTabBar 在没有回调时返回 **Promise**，
 * 于是 `try { uni.hideTabBar() } catch {}` 根本拦不住失败——失败会变成
 * unhandledrejection（实测报 "hideTabBar:fail not TabBar page"），
 * 在控制台里被当成真错误，也污染错误监控。这里把 Promise 的拒绝也吞掉。
 */
export function hideNativeTabBar() {
  try {
    const ret = uni.hideTabBar({ animation: false })
    if (ret && typeof ret.catch === 'function') ret.catch(() => {})
  } catch (e) {
    /* 已隐藏 / 非 tab 页：静默 */
  }
}

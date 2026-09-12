<script>
// #ifdef H5
import { resolveHashRoute, HOME_ROUTE } from './platform/routes.js'

let redirecting = false

// 路由守卫：对接不到的路径一律导回主页（reLaunch 清空页面栈）
function guard() {
  if (redirecting) return
  const { path, valid } = resolveHashRoute(window.location.hash)
  if (valid) return
  redirecting = true
  console.warn('[guard] 未知路由，导回主页:', path)
  uni.reLaunch({
    url: HOME_ROUTE,
    complete: () => {
      redirecting = false
    },
  })
}
// #endif

export default {
  onLaunch() {
    // #ifdef H5
    guard()
    window.addEventListener('hashchange', guard)
    // #endif
  },
}
</script>

<style>
page {
  background-color: #fff8ec;
  font-family: 'PingFang SC', 'Microsoft YaHei', -apple-system, 'Helvetica Neue', sans-serif;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
  -webkit-user-select: none;
  /* 宽屏（iPad/桌面）收成 750px 版心居中。
     1rpx 的换算基准由 pages.json globalStyle 的 rpxCalcMaxDeviceWidth/rpxCalcBaseDeviceWidth
     一起定为 750 —— uni 运行时在「视口宽 > rpxCalcMaxDeviceWidth」时回退到
     rpxCalcBaseDeviceWidth（默认 375）换算，只设 max 不设 base 会让 >750px 的屏幕
     按 375 基准渲染，即 1rpx = 0.5px：字体和控件只有设计值的一半，版心内大片空白。
     仅写在 manifest.h5 里不生效（不会进 __uniConfig.globalStyle，运行时读不到）。 */
  max-width: 750px;
  margin: 0 auto;
}

/* 尊重系统「减弱动态效果」：关掉答错抖动、音量呼吸闪烁与进出场动画。
   答错反馈本来只有「抖动 + 红框」，现在揭晓态另有绿框与对勾，去掉动画不会丢信息。 */
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
  }
}
</style>

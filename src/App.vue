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

/**
 * 微信内置浏览器：底部会压一条工具条（安卓尤其明显，位置在 WebView 之上、不占视口高度），
 * 页面下沿的按钮/选项卡会被它盖住；`env(safe-area-inset-bottom)` 只算 iOS 的 home indicator，
 * 算不到它。这里把标志打到 html 上，样式据此把各页底部留白加到 --bottom-gap（见 <style>）。
 */
function markWeChat() {
  if (typeof navigator !== 'undefined' && /micromessenger/i.test(navigator.userAgent)) {
    document.documentElement.classList.add('in-wechat')
  }
}
// #endif

export default {
  onLaunch() {
    // #ifdef H5
    markWeChat()
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

/* 触屏下拉刷新：H5 的滚动是文档级滚动，Chrome/安卓上「从页面顶部往下拽」会整页重载，
   答题/描红中途被重载就丢进度。内容页的 disableScroll 只挡 touchmove（也会把
   「装不下时滑一滑」这条退路堵死，iPad 上就这么卡住的），所以改成全局禁掉
   overscroll 的浏览器动作：正常滚动不受影响，只是不再触发下拉刷新与滚动链。

   页面底部统一留白 --bottom-gap：内容页现在正好占满一屏（100dvh + flex 分配），
   底部控件会贴死屏幕下沿；微信内置浏览器再压一条工具条就把它盖住了
   （用户反馈：微信里打开时底下被 banner 遮住）。
   env(safe-area-inset-bottom) 只覆盖 iOS 的 home indicator，所以各页在它之上再叠这一条：
   普通浏览器 20px 当呼吸位，微信里 56px 把「返回/再玩一次/我来写」这类底部控件抬到工具条上方。
   用 px 而不是 rpx：浏览器工具条是物理高度，不该跟着 1rpx=1px 的平板基准翻倍。
   单位只用 px（不放 min/max/calc）：这些值会被 var() 嵌进 calc()，
   老 Safari（<15.4）不支持 calc() 里再套 min()/max()，会让整条 padding 失效。 */
html {
  overscroll-behavior-y: contain;
  --bottom-gap: 20px;
}
html.in-wechat {
  --bottom-gap: 56px;
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

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
  /* 宽屏（iPad/桌面）收成 750px 版心居中；manifest rpxCalcMaxDeviceWidth=750
     保证 >750px 视口时 1rpx=1px，内容宽恰好等于版心宽 */
  max-width: 750px;
  margin: 0 auto;
}
</style>

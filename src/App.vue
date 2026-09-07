<script>
export default {
  onLaunch() {},
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

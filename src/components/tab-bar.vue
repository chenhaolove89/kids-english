<template>
  <view class="tabbar">
    <!-- 曲线剪影：顶缘两侧平、中间上扬兜住圆钮（viewBox=rpx 单位，随屏宽等比缩放） -->
    <svg class="tab-shape" viewBox="0 0 694 150" preserveAspectRatio="none" aria-hidden="true">
      <path
        d="M 0 110 L 0 96 Q 0 46 50 46 L 235 46 C 279 46 283 6 347 6 C 411 6 415 46 459 46 L 644 46 Q 694 46 694 96 L 694 110 Q 694 150 654 150 L 40 150 Q 0 150 0 110 Z"
        fill="#fffcf5"
        stroke="#f6ead8"
        stroke-width="3"
      />
    </svg>

    <view class="tab-row">
      <view class="tab-item" :class="{ active: active === 'map' }" @tap="go('/pages/map/map')">
        <image class="tab-icon" :src="assetUrl('/static/tab/map' + (active === 'map' ? '-on' : '') + '.png')" mode="aspectFit" />
        <text class="tab-label" :style="active === 'map' ? 'color:#FF8C42' : ''">课程</text>
      </view>

      <view class="tab-fab-spacer"></view>

      <view class="tab-item" :class="{ active: active === 'parent' }" @tap="go('/pages/parent/parent')">
        <image class="tab-icon" :src="assetUrl('/static/tab/parent' + (active === 'parent' ? '-on' : '') + '.png')" mode="aspectFit" />
        <text class="tab-label" :style="active === 'parent' ? 'color:#3BB273' : ''">家长</text>
      </view>
    </view>

    <!-- 中间凸起：坐在曲线凹口的正中 -->
    <view class="tab-fab" :class="{ glow: active === 'collection' }" @tap="go('/pages/collection/collection')">
      <image class="fab-glyph" :src="assetUrl('/static/tab/collection-glyph.png')" mode="aspectFit" />
    </view>
    <text class="fab-label" :class="{ on: active === 'collection' }" @tap="go('/pages/collection/collection')">收集</text>
  </view>
</template>

<script setup>
import { assetUrl } from '@/platform/assets.js'

defineProps({
  /** 当前页：map | collection | parent（每页写死，比运行时解析路由可靠） */
  active: { type: String, default: 'map' },
})

function go(url) {
  uni.switchTab({ url })
}
</script>

<style scoped>
.tabbar {
  position: fixed;
  left: 28rpx;
  right: 28rpx;
  /* 贴底（只抬安全区）：悬浮缝隙会露出滚动内容，贴底 + 沿曲线的投影同样有层次 */
  bottom: env(safe-area-inset-bottom);
  height: 150rpx;
  z-index: 999;
  /* drop-shadow 沿 SVG 剪影投影，曲线轮廓也有阴影 */
  filter: drop-shadow(0 10rpx 20rpx rgba(120, 90, 40, 0.18));
}
.tab-shape {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
}
.tab-row {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 104rpx;
  display: flex;
  align-items: center;
}
.tab-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2rpx;
}
.tab-fab-spacer {
  width: 190rpx;
}
.tab-icon {
  width: 52rpx;
  height: 52rpx;
}
.tab-label {
  font-size: 20rpx;
  font-weight: 700;
  color: #b4a696;
  line-height: 1.2;
}
/* 凸起圆钮：嵌在曲线凹口正中，白圈让它和曲线之间有一圈呼吸缝 */
.tab-fab {
  position: absolute;
  top: 8rpx;
  left: 50%;
  transform: translateX(-50%);
  width: 116rpx;
  height: 116rpx;
  border-radius: 50%;
  background: linear-gradient(180deg, #ffd36b 0%, #f0a500 100%);
  box-shadow:
    0 10rpx 24rpx rgba(240, 165, 0, 0.45),
    0 0 0 8rpx #fffcf5;
  display: flex;
  align-items: center;
  justify-content: center;
}
.tab-fab.glow {
  box-shadow:
    0 10rpx 28rpx rgba(240, 165, 0, 0.6),
    0 0 0 8rpx #fffcf5,
    0 0 0 12rpx rgba(247, 181, 0, 0.25);
}
.fab-glyph {
  width: 64rpx;
  height: 64rpx;
}
.fab-label {
  position: absolute;
  top: 126rpx;
  left: 50%;
  transform: translateX(-50%);
  font-size: 20rpx;
  font-weight: 700;
  color: #b4a696;
  line-height: 1.2;
}
.fab-label.on {
  color: #f0a500;
}
</style>

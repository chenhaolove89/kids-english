<template>
  <view class="tabbar">
    <view class="tab-item" :class="{ active: active === 'map' }" @tap="go('/pages/map/map')">
      <image class="tab-icon" :src="assetUrl('/static/tab/map' + (active === 'map' ? '-on' : '') + '.png')" mode="aspectFit" />
      <text class="tab-label" :style="active === 'map' ? 'color:#FF8C42' : ''">课程</text>
    </view>

    <!-- 中间凸起：收集百宝箱，金色圆钮 + 白星描形 -->
    <view class="tab-fab-wrap" @tap="go('/pages/collection/collection')">
      <view class="tab-fab" :class="{ glow: active === 'collection' }">
        <image class="fab-glyph" :src="assetUrl('/static/tab/collection-glyph.png')" mode="aspectFit" />
      </view>
      <text class="fab-label" :class="{ on: active === 'collection' }">收集</text>
    </view>

    <view class="tab-item" :class="{ active: active === 'parent' }" @tap="go('/pages/parent/parent')">
      <image class="tab-icon" :src="assetUrl('/static/tab/parent' + (active === 'parent' ? '-on' : '') + '.png')" mode="aspectFit" />
      <text class="tab-label" :style="active === 'parent' ? 'color:#3BB273' : ''">家长</text>
    </view>
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
  bottom: calc(14rpx + env(safe-area-inset-bottom));
  height: 104rpx;
  background: #fffcf5;
  border: 2rpx solid #f6ead8;
  border-radius: 999rpx;
  box-shadow: 0 12rpx 32rpx rgba(120, 90, 40, 0.18);
  display: flex;
  align-items: center;
  z-index: 999;
}
.tab-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2rpx;
  padding-top: 6rpx;
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
/* 中间凸起圆钮：上浮出胶囊栏，白圈描边制造「从栏里长出来」的一体感 */
.tab-fab-wrap {
  width: 150rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: -64rpx;
}
.tab-fab {
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
  margin-top: 4rpx;
  font-size: 20rpx;
  font-weight: 700;
  color: #b4a696;
  line-height: 1.2;
}
.fab-label.on {
  color: #f0a500;
}
</style>

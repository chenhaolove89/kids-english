<template>
  <view class="page">
    <view class="topbar">
      <view class="back" @tap="goBack">
        <text class="back-icon">←</text>
      </view>
      <text class="title">学语文 · 认汉字</text>
      <text class="total">共 {{ total }} 字</text>
    </view>

    <view class="tip">
      <text class="tip-text">跟读汉字 → 听音识字挑战，一级一级往上闯</text>
    </view>

    <view
      v-for="lv in levels"
      :key="lv.id"
      class="level-card"
      :style="{ background: lv.bg }"
    >
      <view class="level-left">
        <image class="level-icon" :src="lv.icon" mode="aspectFit" />
        <view class="level-info">
          <text class="level-name" :style="{ color: lv.color }">{{ lv.zh }}</text>
          <text class="level-chars">{{ lv.chars.length }} 个汉字</text>
        </view>
      </view>
      <view class="level-btns">
        <view class="level-btn learn" :style="{ background: lv.color }" @tap="goLearn(lv)">
          <text class="level-btn-text">学一学</text>
        </view>
        <view class="level-btn quiz" @tap="goQuiz(lv)">
          <text class="level-btn-text quiz-text">⚡ 挑战</text>
        </view>
      </view>
    </view>

    <view class="footer">
      <text class="footer-text">先学一学，再去挑战，星星是你的！⭐</text>
    </view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import data from '@/data/hanzi.json'

const levels = ref(data.levels)
const total = computed(() => data.total)

function goLearn(lv) {
  uni.navigateTo({ url: `/pages/learn/learn?subject=zh&level=${lv.id}` })
}
function goQuiz(lv) {
  uni.navigateTo({ url: `/pages/quiz/quiz?subject=zh&level=${lv.id}` })
}
function goBack() {
  uni.navigateBack()
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  min-height: 100svh;
  padding: calc(30rpx + env(safe-area-inset-top)) 40rpx calc(50rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
}
.topbar {
  display: flex;
  align-items: center;
  padding: 8rpx 4rpx 8rpx;
}
.back {
  width: 84rpx;
  height: 84rpx;
  border-radius: 50%;
  background: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6rpx 16rpx rgba(120, 90, 40, 0.1);
  flex-shrink: 0;
}
.back-icon {
  font-size: 44rpx;
  font-weight: 700;
  color: #4a3f35;
}
.title {
  flex: 1;
  text-align: center;
  font-size: 42rpx;
  font-weight: 800;
  color: #4a3f35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.total {
  min-width: 84rpx;
  text-align: right;
  font-size: 28rpx;
  font-weight: 700;
  color: #a2917d;
  flex-shrink: 0;
}
.tip {
  margin: 16rpx 4rpx 30rpx;
}
.tip-text {
  font-size: 27rpx;
  color: #b3a492;
}
.level-card {
  border-radius: 48rpx;
  padding: 36rpx 32rpx;
  margin-bottom: 30rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 10rpx 28rpx rgba(120, 90, 40, 0.08);
}
.level-left {
  display: flex;
  align-items: center;
  gap: 22rpx;
  flex: 1;
  min-width: 0;
}
.level-icon {
  width: 96rpx;
  height: 96rpx;
  flex-shrink: 0;
}
.level-info {
  min-width: 0;
}
.level-name {
  display: block;
  font-size: 38rpx;
  font-weight: 800;
  white-space: nowrap;
}
.level-chars {
  display: block;
  margin-top: 8rpx;
  font-size: 25rpx;
  color: #8a8073;
  font-weight: 600;
  white-space: nowrap;
}
.level-btns {
  display: flex;
  gap: 16rpx;
  flex-shrink: 0;
  margin-left: 16rpx;
}
.level-btn {
  padding: 16rpx 26rpx;
  border-radius: 40rpx;
  box-shadow: 0 8rpx 18rpx rgba(120, 90, 40, 0.14);
}
.level-btn:active {
  transform: scale(0.95);
}
.level-btn.learn .level-btn-text {
  color: #ffffff;
}
.level-btn-text {
  font-size: 29rpx;
  font-weight: 800;
  color: #ffffff;
  white-space: nowrap;
}
.level-btn.quiz {
  background: #ffffff;
}
.level-btn-text.quiz-text {
  color: #4a3f35;
}
.footer {
  display: flex;
  justify-content: center;
  padding-top: 20rpx;
}
.footer-text {
  font-size: 26rpx;
  color: #c9bba7;
}
</style>

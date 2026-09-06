<template>
  <view class="page">
    <view class="header">
      <image class="logo" src="/static/icons/icon.png" mode="aspectFit" />
      <view class="title-wrap">
        <text class="title">快乐学单词</text>
        <text class="subtitle">点一点，听一听，跟着读</text>
      </view>
    </view>

    <view class="grid">
      <view
        v-for="cat in categories"
        :key="cat.id"
        class="cat-card"
        :style="{ background: cat.bg }"
        @tap="goLearn(cat.id)"
      >
        <image class="cat-icon" :src="cat.icon" mode="aspectFit" />
        <text class="cat-zh" :style="{ color: cat.color }">{{ cat.zh }}</text>
        <text class="cat-en">{{ cat.en }}</text>
        <text class="cat-count">{{ cat.words.length }} 个单词</text>
      </view>
    </view>

    <view class="quiz-btn" @tap="goQuiz">
      <text class="quiz-btn-text">🎯 听音选图挑战</text>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import data from '@/data/words.json'

const categories = ref(data.categories)

function goLearn(id) {
  uni.navigateTo({ url: `/pages/learn/learn?cat=${id}` })
}
function goQuiz() {
  uni.navigateTo({ url: '/pages/quiz/quiz?cat=all' })
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: calc(30rpx + env(safe-area-inset-top)) 40rpx calc(50rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
}
.header {
  display: flex;
  align-items: center;
  gap: 28rpx;
  padding: 20rpx 10rpx 44rpx;
}
.logo {
  width: 120rpx;
  height: 120rpx;
}
.title {
  display: block;
  font-size: 60rpx;
  font-weight: 800;
  color: #4a3f35;
}
.subtitle {
  display: block;
  margin-top: 8rpx;
  font-size: 30rpx;
  color: #a2917d;
}
.grid {
  display: flex;
  flex-wrap: wrap;
  gap: 32rpx;
}
.cat-card {
  width: calc(50% - 16rpx);
  border-radius: 48rpx;
  padding: 48rpx 0 44rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-shadow: 0 10rpx 30rpx rgba(120, 90, 40, 0.08);
}
.cat-card:active {
  transform: scale(0.97);
}
.cat-icon {
  width: 190rpx;
  height: 190rpx;
}
.cat-zh {
  margin-top: 26rpx;
  font-size: 50rpx;
  font-weight: 800;
}
.cat-en {
  margin-top: 6rpx;
  font-size: 32rpx;
  color: #8a8073;
  font-weight: 600;
}
.cat-count {
  margin-top: 10rpx;
  font-size: 26rpx;
  color: #a89d8e;
}
.quiz-btn {
  margin-top: 48rpx;
  height: 130rpx;
  border-radius: 65rpx;
  background: linear-gradient(135deg, #ffb84d, #ff8c42);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 12rpx 30rpx rgba(255, 140, 66, 0.35);
}
.quiz-btn:active {
  transform: scale(0.97);
}
.quiz-btn-text {
  color: #ffffff;
  font-size: 44rpx;
  font-weight: 800;
  letter-spacing: 4rpx;
}
</style>

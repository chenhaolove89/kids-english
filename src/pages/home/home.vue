<template>
  <view class="page">
    <view class="header">
      <image class="logo" src="/static/icons/icon.png" mode="aspectFit" />
      <view class="title-wrap">
        <text class="title">快乐学园</text>
        <text class="subtitle">英语 · 语文 · 数学，一样都好玩</text>
      </view>
    </view>

    <view class="subjects">
      <view
        v-for="s in subjects"
        :key="s.id"
        class="subject-card"
        :style="{ background: s.bg }"
        @tap="go(s)"
      >
        <image class="subject-icon" :src="s.icon" mode="aspectFit" />
        <text class="subject-name" :style="{ color: s.color }">{{ s.zh }}</text>
        <text class="subject-en">{{ s.en }}</text>
        <text class="subject-desc">{{ s.desc }}</text>
      </view>
    </view>

    <view class="footer">
      <text class="footer-text">给小朋友的快乐学习园地 🌈</text>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import enData from '@/data/words.json'
import zhData from '@/data/hanzi.json'

const enWords = enData.categories.reduce((s, c) => s + c.words.length, 0)
const enCats = enData.categories.length
const zhCount = zhData.total

const subjects = ref([
  { id: 'en', zh: '学英语', en: 'English', color: '#FF8C42', bg: '#FFF3E4', icon: '/static/img/subject-english.png', desc: `${enWords} 个单词 · ${enCats} 个分类` },
  { id: 'zh', zh: '学语文', en: 'Chinese', color: '#E4573D', bg: '#FDEBE7', icon: '/static/img/subject-chinese.png', desc: `认汉字 ${zhCount} 个 · 听音识字` },
  { id: 'math', zh: '学数学', en: 'Math', color: '#4D96FF', bg: '#E9F2FF', icon: '/static/img/subject-math.png', desc: '数数 · 加减 · 乘除，4 个关卡' },
])

function go(s) {
  if (s.id === 'en') uni.navigateTo({ url: '/pages/index/index' })
  else if (s.id === 'zh') uni.navigateTo({ url: '/pages/chinese/chinese' })
  else uni.navigateTo({ url: '/pages/math/math' })
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  min-height: 100svh;
  padding: calc(40rpx + env(safe-area-inset-top)) 44rpx calc(50rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}
.header {
  display: flex;
  align-items: center;
  gap: 30rpx;
  padding: 24rpx 8rpx 52rpx;
}
.logo {
  width: 130rpx;
  height: 130rpx;
  flex-shrink: 0;
}
.title-wrap {
  flex: 1;
  min-width: 0;
}
.title {
  display: block;
  font-size: 64rpx;
  font-weight: 800;
  color: #4a3f35;
}
.subtitle {
  display: block;
  margin-top: 10rpx;
  font-size: 30rpx;
  color: #a2917d;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.subjects {
  display: flex;
  flex-direction: column;
  gap: 34rpx;
}
.subject-card {
  border-radius: 52rpx;
  padding: 46rpx 44rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-shadow: 0 12rpx 32rpx rgba(120, 90, 40, 0.09);
}
.subject-card:active {
  transform: scale(0.97);
}
.subject-icon {
  width: 170rpx;
  height: 170rpx;
}
.subject-name {
  margin-top: 22rpx;
  font-size: 56rpx;
  font-weight: 800;
}
.subject-en {
  margin-top: 6rpx;
  font-size: 30rpx;
  color: #8a8073;
  font-weight: 600;
}
.subject-desc {
  margin-top: 12rpx;
  font-size: 27rpx;
  color: #a89d8e;
  white-space: nowrap;
}
.footer {
  flex: 1;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 40rpx 0 10rpx;
}
.footer-text {
  font-size: 26rpx;
  color: #c9bba7;
}
</style>

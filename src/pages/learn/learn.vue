<template>
  <view class="page" :style="{ background: cat.bg }">
    <view class="topbar">
      <view class="back" @tap="goBack">
        <text class="back-icon">←</text>
      </view>
      <text class="cat-title">{{ cat.zh }} · {{ cat.en }}</text>
      <text class="progress">{{ current + 1 }}/{{ words.length }}</text>
    </view>

    <swiper class="swiper" :current="current" duration="250" @change="onChange">
      <swiper-item v-for="w in words" :key="w.id">
        <view class="card" @tap="speakCurrent">
          <view class="img-wrap">
            <image class="word-img" :src="w.image" mode="aspectFit" />
          </view>
          <text class="word-en" :style="{ color: cat.color }">{{ w.en }}</text>
          <text class="word-phonetic">{{ w.phonetic }}</text>
          <text class="word-zh">{{ w.zh }}</text>
          <view class="tap-hint">
            <text class="tap-hint-text">点一点卡片再听一次 🔊</text>
          </view>
        </view>
      </swiper-item>
    </swiper>

    <view class="footer">
      <view class="nav-btn" @tap="prev">
        <text class="nav-text">←</text>
      </view>
      <view class="dots" v-if="words.length <= 20">
        <view
          v-for="(w, i) in words"
          :key="w.id"
          class="dot"
          :class="{ active: i === current }"
          :style="i === current ? { background: cat.color } : {}"
        />
      </view>
      <text v-else class="page-num">{{ current + 1 }} / {{ words.length }}</text>
      <view class="nav-btn" @tap="next">
        <text class="nav-text">→</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import data from '@/data/words.json'
import { play, preload } from '@/utils/player.js'

const cat = ref({ zh: '', en: '', bg: '#FFF8EC', color: '#FF8C42' })
const words = ref([])
const current = ref(0)

onLoad((query) => {
  const c = data.categories.find((x) => x.id === query.cat) || data.categories[0]
  cat.value = c
  words.value = c.words
  preload(c.words.map((w) => w.audio))
  // 进页先播第一个词（用户点卡片进来时已经有过手势，iOS 可正常发声）
  setTimeout(() => speakIdx(0), 400)
})

function speakIdx(i) {
  const w = words.value[i]
  if (w) play(w.audio)
}
function speakCurrent() {
  speakIdx(current.value)
}
function onChange(e) {
  current.value = e.detail.current
  speakIdx(current.value)
}
function prev() {
  if (current.value > 0) current.value--
}
function next() {
  if (current.value < words.value.length - 1) current.value++
}
function goBack() {
  uni.navigateBack()
}
</script>

<style scoped>
.page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow: hidden;
}
.topbar {
  display: flex;
  align-items: center;
  padding: calc(24rpx + env(safe-area-inset-top)) 32rpx 20rpx;
}
.back {
  width: 84rpx;
  height: 84rpx;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6rpx 16rpx rgba(120, 90, 40, 0.1);
}
.back-icon {
  font-size: 44rpx;
  font-weight: 700;
  color: #4a3f35;
}
.cat-title {
  flex: 1;
  text-align: center;
  font-size: 40rpx;
  font-weight: 800;
  color: #4a3f35;
}
.progress {
  min-width: 84rpx;
  text-align: right;
  font-size: 32rpx;
  font-weight: 700;
  color: #4a3f35;
}
.swiper {
  flex: 1;
}
.card {
  margin: 16rpx 44rpx;
  height: calc(100% - 32rpx);
  background: #ffffff;
  border-radius: 56rpx;
  box-shadow: 0 14rpx 40rpx rgba(120, 90, 40, 0.12);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40rpx;
  box-sizing: border-box;
}
.card:active {
  transform: scale(0.98);
}
.img-wrap {
  flex: 1;
  min-height: 0;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10rpx 0;
}
.word-img {
  width: 100%;
  height: 100%;
}
.word-en {
  margin-top: 30rpx;
  font-size: 88rpx;
  font-weight: 800;
}
.word-phonetic {
  margin-top: 12rpx;
  font-size: 36rpx;
  color: #a2917d;
  font-family: 'Doulos SIL', 'Charis SIL', Georgia, serif;
}
.word-zh {
  margin-top: 16rpx;
  font-size: 46rpx;
  color: #4a3f35;
  font-weight: 600;
}
.tap-hint {
  margin-top: 34rpx;
  padding: 12rpx 36rpx;
  border-radius: 40rpx;
  background: #fff3df;
}
.tap-hint-text {
  font-size: 26rpx;
  color: #c99b52;
}
.footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20rpx 44rpx calc(34rpx + env(safe-area-inset-bottom));
}
.nav-btn {
  width: 110rpx;
  height: 110rpx;
  border-radius: 50%;
  background: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8rpx 20rpx rgba(120, 90, 40, 0.12);
}
.nav-btn:active {
  transform: scale(0.94);
}
.nav-text {
  font-size: 48rpx;
  font-weight: 700;
  color: #4a3f35;
}
.dots {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8rpx;
  flex-wrap: nowrap;
  overflow: hidden;
  padding: 0 20rpx;
}
.dot {
  flex: 0 0 auto;
  width: 10rpx;
  height: 10rpx;
  border-radius: 6rpx;
  background: rgba(74, 63, 53, 0.18);
}
.dot.active {
  width: 32rpx;
}
.page-num {
  flex: 1;
  text-align: center;
  font-size: 36rpx;
  font-weight: 700;
  color: #8a8073;
}
</style>

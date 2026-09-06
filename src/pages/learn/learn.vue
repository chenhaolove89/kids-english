<template>
  <view class="page" :style="{ background: theme.bg }">
    <view class="topbar">
      <view class="back" @tap="goBack">
        <text class="back-icon">←</text>
      </view>
      <text class="cat-title">{{ title }}</text>
      <text class="progress">{{ current + 1 }}/{{ items.length }}</text>
    </view>

    <swiper class="swiper" :current="current" duration="250" @change="onChange">
      <swiper-item v-for="(it, idx) in items" :key="it.id">
        <view class="card" @tap="speakIdx(idx)">
          <template v-if="subject === 'en'">
            <view class="img-wrap">
              <image class="word-img" :src="it.image" mode="aspectFit" />
            </view>
            <text class="word-en" :style="{ color: theme.color }">{{ it.main }}</text>
            <text class="word-phonetic">{{ it.phon }}</text>
            <text class="word-zh">{{ it.sub }}</text>
            <view class="tap-hint">
              <text class="tap-hint-text">点一点卡片再听一次 🔊</text>
            </view>
          </template>
          <template v-else>
            <view class="char-wrap">
              <text class="char-big" :style="{ color: theme.color }">{{ it.main }}</text>
            </view>
            <text class="word-pinyin">{{ it.phon }}</text>
            <view class="word-row" @tap.stop="speakExtra(idx)">
              <text class="word-zh">{{ it.sub }}</text>
              <text class="word-speaker">🔊</text>
            </view>
            <view class="tap-hint">
              <text class="tap-hint-text">点字卡听发音，点词语听例词</text>
            </view>
          </template>
        </view>
      </swiper-item>
    </swiper>

    <view class="footer">
      <view class="nav-btn" @tap="prev">
        <text class="nav-text">←</text>
      </view>
      <text class="page-num">{{ current + 1 }} / {{ items.length }}</text>
      <view class="nav-btn" @tap="next">
        <text class="nav-text">→</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import enData from '@/data/words.json'
import zhData from '@/data/hanzi.json'
import { play, preload } from '@/utils/player.js'

const subject = ref('en')
const title = ref('')
const theme = ref({ bg: '#FFF8EC', color: '#FF8C42' })
const items = ref([])
const current = ref(0)

onLoad((query) => {
  subject.value = query.subject || 'en'
  if (subject.value === 'en') {
    const c = enData.categories.find((x) => x.id === query.cat) || enData.categories[0]
    const lv = enData.levels.find((l) => l.id === c.level)
    theme.value = { bg: lv ? lv.bg : '#FFF8EC', color: c.color }
    title.value = `${c.zh} · ${c.en}`
    items.value = c.words.map((w) => ({ id: w.id, main: w.en, phon: w.phonetic, sub: w.zh, image: w.image, audio: w.audio }))
    preload(items.value.map((i) => i.audio))
  } else {
    const lv = zhData.levels.find((l) => String(l.id) === String(query.level)) || zhData.levels[0]
    theme.value = { bg: lv.bg, color: lv.color }
    title.value = `识字 · ${lv.zh}`
    items.value = lv.chars.map((h) => ({ id: h.id, main: h.char, phon: h.pinyin, sub: h.word, audio: h.audio, extraAudio: h.wordAudio }))
    preload(items.value.flatMap((i) => [i.audio, i.extraAudio]))
  }
  // 进页先播第一个（用户点卡片进来时已有点击手势，iOS 可正常发声）
  setTimeout(() => speakIdx(0), 400)
})

function speakIdx(i) {
  const it = items.value[i]
  if (it) play(it.audio)
}
function speakExtra(i) {
  const it = items.value[i]
  if (it && it.extraAudio) play(it.extraAudio)
}
function onChange(e) {
  current.value = e.detail.current
  speakIdx(current.value)
}
function prev() {
  if (current.value > 0) current.value--
}
function next() {
  if (current.value < items.value.length - 1) current.value++
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
.char-wrap {
  flex: 1;
  min-height: 0;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.char-big {
  font-size: 360rpx;
  font-weight: 800;
  line-height: 1;
}
.word-en {
  margin-top: 30rpx;
  font-size: 88rpx;
  font-weight: 800;
}
.word-pinyin {
  margin-top: 20rpx;
  font-size: 60rpx;
  color: #8a8073;
  font-weight: 700;
}
.word-phonetic {
  margin-top: 12rpx;
  font-size: 36rpx;
  color: #a2917d;
  font-family: 'Doulos SIL', 'Charis SIL', Georgia, serif;
}
.word-row {
  margin-top: 16rpx;
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 10rpx 34rpx;
  border-radius: 40rpx;
  background: #f7f3ec;
}
.word-zh {
  font-size: 46rpx;
  color: #4a3f35;
  font-weight: 600;
}
.word-speaker {
  font-size: 34rpx;
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
.page-num {
  flex: 1;
  text-align: center;
  font-size: 36rpx;
  font-weight: 700;
  color: #8a8073;
}
</style>

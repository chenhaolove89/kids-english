<template>
  <view class="page">
    <view class="topbar">
      <view class="back" @tap="goBack">
        <text class="back-icon">←</text>
      </view>
      <text class="title">{{ subject === 'zh' ? '听音识字' : '听音选图' }}</text>
      <text class="score">⭐ {{ score }}</text>
    </view>

    <template v-if="!finished">
      <view class="prompt" @tap="speakQuestion">
        <text class="prompt-speaker">🔊</text>
        <text class="prompt-hint">{{ subject === 'zh' ? '听一听，选出对应的汉字' : '听一听，选出对应的图片' }}</text>
      </view>

      <view class="round-info">第 {{ roundIdx + 1 }} / {{ rounds.length }} 题</view>

      <view class="options" :class="{ 'options-text': subject === 'zh' }">
        <view
          v-for="opt in options"
          :key="opt.id"
          class="option"
          :class="{ right: flashId === opt.id && isRight, wrong: flashId === opt.id && !isRight, shake: flashId === opt.id && !isRight }"
          @tap="pick(opt)"
        >
          <image v-if="subject === 'en'" class="opt-img" :src="opt.image" mode="aspectFit" />
          <text v-else class="opt-char" :style="{ color: opt.color }">{{ opt.main }}</text>
        </view>
      </view>
    </template>

    <template v-else>
      <view class="result">
        <text class="result-emoji">🎉</text>
        <text class="result-score">答对 {{ score }} / {{ rounds.length }} 题</text>
        <text class="result-stars">{{ stars }}</text>
        <view class="result-btn" @tap="restart">
          <text class="result-btn-text">再玩一次</text>
        </view>
        <view class="result-btn ghost" @tap="goBack">
          <text class="result-btn-text ghost-text">返回</text>
        </view>
      </view>
    </template>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import enData from '@/data/words.json'
import zhData from '@/data/hanzi.json'
import { play, preload } from '@/utils/player.js'

const ROUNDS = 10
const OPTION_COLORS = ['#FF8C42', '#4D96FF', '#3BB273', '#9B5DE5', '#F76BA8', '#FF6B6B', '#12B886', '#FAB005']

const subject = ref('en')
const pool = ref([])
const rounds = ref([])
const roundIdx = ref(0)
const score = ref(0)
const options = ref([])
const flashId = ref('')
const isRight = ref(false)
const finished = ref(false)

const stars = computed(() => {
  const full = Math.round((score.value / Math.max(rounds.value.length, 1)) * 5)
  return '⭐'.repeat(full) + '☆'.repeat(5 - full)
})

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

onLoad((query) => {
  subject.value = query.subject || 'en'
  preload(['/static/audio/great_job.mp3', '/static/audio/try_again.mp3'])
  let p = []
  if (subject.value === 'en') {
    if (query.cat) {
      p = enData.categories.find((c) => c.id === query.cat)?.words ?? []
    } else {
      const lv = Number(query.level) || 1
      p = enData.categories.filter((c) => c.level === lv).flatMap((c) => c.words)
    }
  } else {
    const lv = Number(query.level) || 1
    const level = zhData.levels.find((l) => Number(l.id) === lv) || zhData.levels[0]
    p = level.chars.map((h) => ({ ...h, main: h.char, color: OPTION_COLORS[h.id.charCodeAt(0) % OPTION_COLORS.length] }))
    preload(p.map((x) => x.audio))
  }
  pool.value = p
  start()
})

function start() {
  const p = pool.value
  rounds.value = shuffle(p)
    .slice(0, Math.min(ROUNDS, p.length))
    .map((w) => ({
      answer: w,
      options: shuffle([w, ...shuffle(p.filter((x) => x.id !== w.id)).slice(0, 3)]),
    }))
  roundIdx.value = 0
  score.value = 0
  finished.value = false
  loadRound()
}

function loadRound() {
  flashId.value = ''
  options.value = rounds.value[roundIdx.value].options
  setTimeout(speakQuestion, 450)
}

function speakQuestion() {
  if (finished.value) return
  play(rounds.value[roundIdx.value].answer.audio)
}

function pick(opt) {
  if (flashId.value) return
  flashId.value = opt.id
  isRight.value = opt.id === rounds.value[roundIdx.value].answer.id
  if (isRight.value) {
    score.value++
    play('/static/audio/great_job.mp3')
    setTimeout(nextRound, 1500)
  } else {
    play('/static/audio/try_again.mp3')
    setTimeout(() => {
      flashId.value = ''
    }, 1000)
  }
}

function nextRound() {
  if (roundIdx.value < rounds.value.length - 1) {
    roundIdx.value++
    loadRound()
  } else {
    finished.value = true
  }
}

function restart() {
  start()
}
function goBack() {
  uni.navigateBack()
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #fff8ec;
  box-sizing: border-box;
  padding-bottom: env(safe-area-inset-bottom);
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
  background: #ffffff;
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
.title {
  flex: 1;
  text-align: center;
  font-size: 40rpx;
  font-weight: 800;
  color: #4a3f35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.score {
  min-width: 84rpx;
  text-align: right;
  font-size: 34rpx;
  font-weight: 700;
  color: #ff8c42;
}
.prompt {
  margin: 30rpx 60rpx 0;
  background: #ffffff;
  border-radius: 44rpx;
  padding: 40rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-shadow: 0 10rpx 30rpx rgba(120, 90, 40, 0.08);
}
.prompt:active {
  transform: scale(0.98);
}
.prompt-speaker {
  font-size: 90rpx;
}
.prompt-hint {
  margin-top: 12rpx;
  font-size: 30rpx;
  color: #a2917d;
}
.round-info {
  margin-top: 22rpx;
  text-align: center;
  font-size: 28rpx;
  color: #b3a492;
  font-weight: 600;
}
.options {
  margin: 26rpx 48rpx;
  display: flex;
  flex-wrap: wrap;
  gap: 30rpx;
}
.option {
  width: calc(50% - 15rpx);
  height: 340rpx;
  background: #ffffff;
  border-radius: 44rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 10rpx 30rpx rgba(120, 90, 40, 0.08);
  border: 6rpx solid transparent;
  box-sizing: border-box;
}
.option:active {
  transform: scale(0.96);
}
.option.right {
  border-color: #3bb273;
  background: #e8f8ee;
}
.option.wrong {
  border-color: #ff6b6b;
  background: #fdecec;
}
.opt-img {
  width: 260rpx;
  height: 260rpx;
}
.options-text .option {
  height: 260rpx;
}
.opt-char {
  font-size: 170rpx;
  font-weight: 800;
}
.shake {
  animation: shake 0.45s;
}
/* 矮屏（iPhone SE 568px 等）压缩纵向空间，避免答题区被顶出首屏 */
@media (max-height: 620px) {
  .option {
    height: 300rpx;
  }
  .options-text .option {
    height: 230rpx;
  }
  .prompt {
    margin-top: 14rpx;
    padding: 26rpx;
  }
  .prompt-speaker {
    font-size: 72rpx;
  }
}
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-16rpx); }
  50% { transform: translateX(16rpx); }
  75% { transform: translateX(-10rpx); }
}
.result {
  padding-top: 22vh;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.result-emoji {
  font-size: 140rpx;
}
.result-score {
  margin-top: 30rpx;
  font-size: 48rpx;
  font-weight: 800;
  color: #4a3f35;
}
.result-stars {
  margin-top: 20rpx;
  font-size: 52rpx;
  letter-spacing: 8rpx;
}
.result-btn {
  margin-top: 56rpx;
  width: 420rpx;
  height: 110rpx;
  border-radius: 55rpx;
  background: linear-gradient(135deg, #ffb84d, #ff8c42);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 12rpx 30rpx rgba(255, 140, 66, 0.35);
}
.result-btn:active {
  transform: scale(0.97);
}
.result-btn-text {
  color: #ffffff;
  font-size: 38rpx;
  font-weight: 800;
}
.result-btn.ghost {
  margin-top: 28rpx;
  background: #ffffff;
  box-shadow: 0 8rpx 20rpx rgba(120, 90, 40, 0.1);
}
.ghost-text {
  color: #8a8073;
}
</style>

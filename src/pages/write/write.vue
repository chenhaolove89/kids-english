<template>
  <view class="page">
    <view class="topbar">
      <view class="back" @tap="goBack">
        <text class="back-icon">←</text>
      </view>
      <text class="title">{{ char }} · 写一写</text>
      <text class="pinyin">{{ pinyin }}</text>
    </view>

    <!-- 田字格 + 笔顺画布 -->
    <view class="board-wrap">
      <view class="board">
        <view class="grid-line v"></view>
        <view class="grid-line h"></view>
        <view id="hanzi-target" class="target"></view>
      </view>
      <view v-if="done" class="done-badge">🎉 写对啦！</view>
    </view>

    <view class="hint"><text class="hint-text">{{ hintText }}</text></view>

    <!-- 三个大按钮：听发音 / 笔顺演示 / 开始描红 -->
    <view class="btn-row">
      <view class="action" :style="{ background: '#FFF3E4' }" @tap="speak">
        <text class="action-emoji">🔊</text>
        <text class="action-label">听发音</text>
      </view>
      <view class="action" :style="{ background: '#E9F2FF' }" @tap="demo">
        <text class="action-emoji">▶️</text>
        <text class="action-label">看笔顺</text>
      </view>
      <view class="action primary" :style="{ background: '#E3F6E8' }" @tap="startQuiz">
        <text class="action-emoji">✏️</text>
        <text class="action-label">{{ done ? '再写一次' : '我来写' }}</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onLoad, onUnload } from '@dcloudio/uni-app'
import HanziWriter from 'hanzi-writer'
import { play, preload } from '@/platform/audio.js'
import { assetUrl } from '@/platform/assets.js'

const char = ref('')
const pinyin = ref('')
const done = ref(false)
const hintText = ref('先看笔顺，再自己写写看！')

let writer = null
let audioPath = ''
let cp = ''
// 连错 2 笔自动高亮下一笔起笔，别让小朋友瞎猜
let misses = 0

onLoad((query) => {
  char.value = decodeURIComponent(query.char || '')
  pinyin.value = decodeURIComponent(query.pinyin || '')
  audioPath = decodeURIComponent(query.audio || '')
  cp = query.cp || ''
  if (!char.value || !cp) {
    uni.showToast({ title: '内容准备中', icon: 'none' })
    setTimeout(() => uni.navigateBack(), 600)
    return
  }
  if (audioPath) preload([audioPath])
  // 等容器渲染完成后再建画布
  setTimeout(setupWriter, 60)
})

function setupWriter() {
  const el = document.getElementById('hanzi-target')
  if (!el) {
    setTimeout(setupWriter, 120)
    return
  }
  writer = HanziWriter.create(el, char.value, {
    width: 300,
    height: 300,
    padding: 24,
    strokeColor: '#E4573D',
    outlineColor: '#F0E4D7',
    drawingColor: '#4A90D9',
    strokeAnimationSpeed: 1.4,
    delayBetweenStrokes: 260,
    highlightColor: '#FFB84D',
    leniency: 1.3,
    showHintAfterMisses: 2,
    charDataLoader: (c, onComplete, onError) => {
      // 引号字符串拼接而非反引号模板：发布脚本的 /static/ → ./static/ 改写只认引号字符串
      fetch(assetUrl("/static/hanzi-data/") + cp + ".json")
        .then((r) => {
          if (!r.ok) throw new Error('no data')
          return r.json()
        })
        .then((d) => onComplete(d))
        .catch(onError)
    },
  })
  writer.loopCharacterAnimation()
}

function speak() {
  if (audioPath) play(audioPath)
}

function demo() {
  if (!writer) return
  done.value = false
  misses = 0
  hintText.value = '看好每一笔的顺序和方向～'
  // 取消进行中的描红/动画再演示，避免两个动画叠在画布上
  writer.cancelQuiz()
  writer.hideCharacter()
  writer.animateCharacter({ onComplete: () => writer.showCharacter() })
}

function startQuiz() {
  if (!writer) return
  done.value = false
  misses = 0
  hintText.value = '按笔顺描，写错两笔会给提示哦'
  writer.cancelQuiz()
  writer.hideCharacter()
  writer.quiz({
    onMistake: () => {
      misses++
      if (misses === 2) hintText.value = '没关系，看橙色提示再试一次 💛'
    },
    onComplete: () => {
      done.value = true
      hintText.value = '太棒了，再写一遍巩固一下！'
      play(assetUrl('/static/audio/zh-great.mp3'))
    },
  })
}

function goBack() {
  uni.navigateBack()
}

onUnload(() => {
  if (writer) writer.destroy()
  writer = null
})
</script>

<style scoped>
.page {
  min-height: 100vh;
  min-height: 100svh;
  background: #fff8ec;
  box-sizing: border-box;
  padding: calc(24rpx + env(safe-area-inset-top)) 40rpx calc(40rpx + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
}
.topbar {
  display: flex;
  align-items: center;
  padding: 0 8rpx 20rpx;
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
}
.pinyin {
  min-width: 84rpx;
  text-align: right;
  font-size: 32rpx;
  font-weight: 700;
  color: #a2917d;
}
.board-wrap {
  position: relative;
  display: flex;
  justify-content: center;
  padding: 20rpx 0;
}
.board {
  position: relative;
  width: 640rpx;
  height: 640rpx;
  background: #ffffff;
  border-radius: 40rpx;
  border: 6rpx solid #f0e4d7;
  box-shadow: 0 14rpx 40rpx rgba(120, 90, 40, 0.12);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}
/* 田字格：虚线中线 */
.grid-line {
  position: absolute;
  background-image: linear-gradient(to right, #f0e4d7 55%, transparent 45%);
  background-size: 24rpx 4rpx;
}
.grid-line.v {
  left: 50%;
  top: 4%;
  width: 0;
  height: 92%;
  border-left: 4rpx dashed #f0e4d7;
  background: none;
}
.grid-line.h {
  top: 50%;
  left: 4%;
  height: 0;
  width: 92%;
  border-top: 4rpx dashed #f0e4d7;
  background: none;
}
.target {
  position: relative;
  z-index: 1;
}
.done-badge {
  position: absolute;
  top: 44rpx;
  left: 50%;
  transform: translateX(-50%);
  background: linear-gradient(90deg, #ffd76e, #ffb84d);
  color: #6b4a17;
  font-size: 30rpx;
  font-weight: 800;
  padding: 12rpx 34rpx;
  border-radius: 40rpx;
  box-shadow: 0 10rpx 24rpx rgba(200, 140, 40, 0.25);
}
.hint {
  display: flex;
  justify-content: center;
  padding: 8rpx 0 26rpx;
}
.hint-text {
  font-size: 27rpx;
  color: #a2917d;
}
.btn-row {
  display: flex;
  gap: 24rpx;
  padding: 0 10rpx;
}
.action {
  flex: 1;
  border-radius: 36rpx;
  padding: 26rpx 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10rpx;
  box-shadow: 0 8rpx 24rpx rgba(120, 90, 40, 0.08);
}
.action:active {
  transform: scale(0.96);
}
.action.primary {
  border: 4rpx solid #3bb273;
}
.action-emoji {
  font-size: 52rpx;
  line-height: 1.1;
}
.action-label {
  font-size: 27rpx;
  font-weight: 800;
  color: #4a3f35;
}
@media (max-height: 620px) {
  .board {
    width: 520rpx;
    height: 520rpx;
  }
  .btn-row {
    padding: 0 40rpx;
  }
}
</style>

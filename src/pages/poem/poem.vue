<template>
  <view class="page">
    <PageTopBar class="topbar-page" :title="current ? current.title : '古诗 · 点读'" :ellipsis="false" @back="goBack">
      <text class="count">{{ current ? authorLine(current) || '古诗' : poems.length + ' 首' }}</text>
    </PageTopBar>

    <!-- 声音预加载进度：慢网下孩子能看到声音在来的路上 -->
    <view v-if="audioTotal > 0 && audioDone < audioTotal" class="load-bar">
      <view class="load-fill" :style="{ width: audioPercent + '%' }"></view>
    </view>

    <!-- 书单：每首诗一张卡 -->
    <view v-if="!current" class="list">
      <view v-for="(p, i) in poems" :key="p.id" class="poem-card" :style="cardStyle(i)" @tap="openPoem(i)">
        <view class="poem-head">
          <text class="poem-title">{{ p.title }}</text>
          <text v-if="authorLine(p)" class="poem-author">{{ authorLine(p) }}</text>
        </view>
        <text class="poem-first">{{ p.lines[0] }}</text>
      </view>
    </view>

    <!-- 点读：点一行念一行 -->
    <template v-else>
      <view class="reader">
        <view v-for="(line, li) in current.lines" :key="li" class="line" :class="{ active: playingIdx === li }" @tap="playLine(li)">
          <text class="line-text">{{ line }}</text>
        </view>
      </view>

      <view class="btn-row">
        <view class="action" :style="{ background: '#F1ECFB' }" @tap="playFull">
          <text class="action-emoji">{{ playingFull ? '🎵' : '▶️' }}</text>
          <text class="action-label">读整首</text>
        </view>
        <view class="action primary" :style="{ background: '#E3F6E8' }" @tap="goQuiz">
          <text class="action-emoji">✏️</text>
          <text class="action-label">填字挑战</text>
        </view>
      </view>
    </template>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { onLoad, onUnload } from '@dcloudio/uni-app'
import { play, stopSeq, preloadWithProgress } from '@/platform/audio.js'
import { assetUrl } from '@/platform/assets.js'
import { goBackOrHome } from '@/platform/nav.js'
import { getLesson } from '@/content/catalog.js'
import { getSessionService } from '@/services/session.js'
import poemsData from '@/data/poems.json'
import PageTopBar from '@/components/page-top-bar.vue'

const CARD_STYLES = [
  { bg: '#FFF3E4', border: '#ffd9b0' },
  { bg: '#E9F2FF', border: '#bcd7ff' },
  { bg: '#E3F6E8', border: '#b8e8c6' },
  { bg: '#F1ECFB', border: '#d8cdf2' },
]

const stage = ref('qimeng')
const lessonId = ref('')
const currentIdx = ref(-1) // -1 = 书单
const playingIdx = ref(-1)
const playingFull = ref(false)
const audioDone = ref(0)
const audioTotal = ref(0)

const poems = computed(() => poemsData.poems.filter((p) => p.stage === stage.value))
const current = computed(() => (currentIdx.value >= 0 ? poems.value[currentIdx.value] : null))
const audioPercent = computed(() => (audioTotal.value ? Math.round((audioDone.value / audioTotal.value) * 100) : 0))

function cardStyle(i) {
  const s = CARD_STYLES[i % CARD_STYLES.length]
  return { background: s.bg, border: '4rpx solid ' + s.border }
}

/** 署名行：教材不署名的（《画》）留空；「汉乐府」本身含朝代，不重复前缀 */
function authorLine(p) {
  if (!p.author) return ''
  return p.author.indexOf(p.dynasty) === 0 ? p.author : p.dynasty + '·' + p.author
}

function lineSrc(poem, li) {
  return assetUrl('/static/audio-poem/' + poem.id + '-l' + li + '.mp3')
}

onLoad((query) => {
  stage.value = String(query.stage || 'qimeng')
  lessonId.value = String(query.lessonId || '')
  // 预加载本阶段全部句音与整首音（每首 8 个左右小文件，慢网也有进度条可见）
  const srcs = []
  for (const p of poems.value) {
    srcs.push(assetUrl('/static/audio-poem/' + p.id + '-full.mp3'))
    p.lines.forEach((_, li) => srcs.push(lineSrc(p, li)))
  }
  const list = [...new Set(srcs)]
  audioTotal.value = list.length
  preloadWithProgress(list, (done) => {
    audioDone.value = done
  })
})

onUnload(() => stopSeq())

function openPoem(i) {
  currentIdx.value = i
  playingIdx.value = -1
  playingFull.value = false
}

function playLine(li) {
  if (!current.value) return
  stopSeq()
  playingFull.value = false
  playingIdx.value = li
  play(lineSrc(current.value, li), () => {
    if (playingIdx.value === li) playingIdx.value = -1
  })
}

function playFull() {
  if (!current.value) return
  stopSeq()
  playingIdx.value = -1
  playingFull.value = true
  const poem = current.value
  // play 的 onEnd 只在自然播完时触发（stop 不触发），所以这就是"读完一首"的信号
  play(assetUrl('/static/audio-poem/' + poem.id + '-full.mp3'), () => {
    playingFull.value = false
    recordPoemRead(poem)
  })
}

/**
 * 读完一首诗记一次练习。
 *
 * 用 `kind: 'practice'` 的**即开即完短会话**：它会进家长页「最近记录」、周报练习时长与
 * 累计作答，但按 domain/progress 的规则**不计入课时完成、不给星**——读完一首 ≠ 学完整个阶段
 * （一个阶段 6 首），否则家长页的"完成课程"会虚高。
 * 也不写错题本：点读没有对错可言。
 */
function recordPoemRead(poem) {
  const lid = lessonId.value
  if (!poem || !lid || !getLesson(lid)) return
  const svc = getSessionService()
  svc.startSession({ lessonId: lid, kind: 'practice', skillIds: [] })
  svc.recordAttempt({ activityId: 'poem-read', order: poem.id, answer: poem.id, correct: true, itemId: null })
  svc.completeSession()
}

function goQuiz() {
  if (!current.value) return
  stopSeq()
  uni.navigateTo({
    url: '/pages/quiz/quiz?poem=' + stage.value + '&subject=zh&lessonId=' + encodeURIComponent(lessonId.value),
  })
}

function goBack() {
  if (current.value) {
    stopSeq()
    currentIdx.value = -1
    playingIdx.value = -1
    playingFull.value = false
    return
  }
  goBackOrHome()
}
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
/* 顶栏：结构与样式在 components/page-top-bar.vue，这里只保留本页内边距 */
.topbar-page {
  padding: 0 8rpx 20rpx;
}
.count {
  min-width: 84rpx;
  text-align: right;
  font-size: 30rpx;
  font-weight: 700;
  color: #a2917d;
}
.load-bar {
  height: 10rpx;
  border-radius: 6rpx;
  background: #f0e4d7;
  overflow: hidden;
  margin: 0 8rpx 16rpx;
}
.load-fill {
  height: 100%;
  background: #ffb84d;
  transition: width 0.2s;
}
/* 书单 */
.list {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
  padding-top: 8rpx;
}
.poem-card {
  border-radius: 32rpx;
  padding: 30rpx 34rpx;
  box-shadow: 0 10rpx 26rpx rgba(120, 90, 40, 0.1);
}
.poem-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.poem-title {
  font-size: 40rpx;
  font-weight: 800;
  color: #4a3f35;
}
.poem-author {
  font-size: 26rpx;
  font-weight: 600;
  color: #a2917d;
}
.poem-first {
  display: block;
  margin-top: 10rpx;
  font-size: 30rpx;
  color: #6f6252;
  letter-spacing: 2rpx;
}
/* 点读 */
.reader {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 18rpx;
  background: #ffffff;
  border-radius: 40rpx;
  border: 6rpx solid #f0e4d7;
  box-shadow: 0 14rpx 40rpx rgba(120, 90, 40, 0.12);
  padding: 46rpx 30rpx;
  margin-top: 10rpx;
}
.line {
  display: flex;
  justify-content: center;
  padding: 14rpx 20rpx;
  border-radius: 22rpx;
}
.line.active {
  background: #fff3e4;
}
.line-text {
  font-size: 54rpx;
  font-weight: 700;
  color: #4a3f35;
  letter-spacing: 6rpx;
}
.line.active .line-text {
  color: #e4573d;
}
/* 底部大按钮：与写一写页同一套 */
.btn-row {
  display: flex;
  gap: 24rpx;
  padding: 30rpx 0 6rpx;
}
.action {
  flex: 1;
  border-radius: 30rpx;
  padding: 26rpx 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  box-shadow: 0 8rpx 20rpx rgba(120, 90, 40, 0.1);
}
.action-emoji {
  font-size: 40rpx;
}
.action-label {
  font-size: 32rpx;
  font-weight: 800;
  color: #4a3f35;
}
</style>

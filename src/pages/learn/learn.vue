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
            <text class="word-en" :style="{ color: theme.color, fontSize: enSize(it.main) }">{{ it.main }}</text>
            <text class="word-phonetic">{{ it.phon }}</text>
            <text class="word-zh">{{ it.sub }}</text>
            <view class="tap-hint">
              <text class="tap-hint-text">点一点卡片再听一次 🔊</text>
            </view>
          </template>
          <template v-else>
            <view class="char-wrap" :class="{ 'has-emoji': it.emoji }">
              <view v-if="it.emoji" class="hz-emoji-tile">
                <image class="hz-emoji-img" :src="it.emoji" mode="aspectFit" />
              </view>
              <text class="char-big" :class="{ 'char-sm': it.emoji }" :style="{ color: theme.color }">{{ it.main }}</text>
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
import { onLoad, onUnload } from '@dcloudio/uni-app'
import enData from '@/data/words.json'
import zhData from '@/data/hanzi.json'
import { play, preload } from '@/platform/audio.js'
import { createThrottle } from '@/platform/nav.js'
import { getLesson } from '@/content/catalog.js'
import { resolveEnCategory, resolveZhLevel } from '@/content/adapters.js'
import { getSessionService } from '@/services/session.js'

const subject = ref('en')
const title = ref('')
const theme = ref({ bg: '#FFF8EC', color: '#FF8C42' })
const items = ref([])
const current = ref(0)

const svc = getSessionService()
const lesson = ref(null) // 有 lessonId 才记录会话；旧入口不记录
let completed = false

onLoad((query) => {
  subject.value = query.subject || 'en'
  let resolvedCatId = null
  if (subject.value === 'en') {
    // 走适配器：低龄模式隐藏的分类深链会回退到第一个可见分类
    const c = resolveEnCategory(query.cat) || resolveEnCategory(enData.categories[0]?.id)
    if (!c) {
      uni.showToast({ title: '内容准备中', icon: 'none' })
      setTimeout(() => uni.reLaunch({ url: '/pages/home/home' }), 600)
      return
    }
    resolvedCatId = c.id
    const lv = enData.levels.find((l) => l.id === c.level)
    theme.value = { bg: lv ? lv.bg : '#FFF8EC', color: c.color }
    title.value = `${c.zh} · ${c.en}`
    items.value = c.words.map((w) => ({ id: w.id, main: w.en, phon: w.phonetic, sub: w.zh, image: w.image, audio: w.audio }))
    preload(items.value.map((i) => i.audio))
  } else {
    const lv = zhData.levels.find((l) => String(l.id) === String(query.level)) || zhData.levels[0]
    theme.value = { bg: lv.bg, color: lv.color }
    title.value = `识字 · ${lv.zh}`
    items.value = lv.chars.map((h) => ({ id: h.id, main: h.char, phon: h.pinyin, sub: h.word, audio: h.audio, extraAudio: h.wordAudio, emoji: h.emoji || '' }))
    preload(items.value.flatMap((i) => [i.audio, i.extraAudio]))
  }

  wireSession(query.lessonId, resolvedCatId)
  // 进页先播第一个（用户点卡片进来时已有点击手势，iOS 可正常发声）
  setTimeout(() => speakIdx(current.value), 400)
})

/** 会话接入：恢复未完成进度；没有 lessonId（旧入口）则不记录。
 *  深链指向被低龄模式隐藏的分类时内容会回退到别的分类，课程与所见不一致，降级为不记录。 */
function wireSession(lessonId, resolvedCatId) {
  const l = getLesson(lessonId)
  if (!l) return
  if (l.ref?.kind === 'en-category' && resolvedCatId && l.ref.id !== resolvedCatId) return
  lesson.value = l
  const resumed = svc.resumeSessionFor(l.id)
  if (resumed) {
    const idx = resumed.snapshot && Number(resumed.snapshot.idx)
    if (Number.isInteger(idx)) current.value = Math.min(Math.max(0, idx), items.value.length - 1)
    if (current.value >= items.value.length - 1) completeLearn()
  } else {
    svc.startSession({ lessonId: l.id, kind: 'learn', skillIds: l.skillIds || [] })
  }
  svc.saveSnapshot({ idx: current.value })
}

function completeLearn() {
  if (!lesson.value) return
  const done = svc.completeSession()
  if (done) completed = true
}

function speakIdx(i) {
  const it = items.value[i]
  if (it) play(it.audio)
}

// 英文长短不一：单词 88rpx，长短语逐步缩号，保证最长词例（20 字符）单行放下
function enSize(text) {
  const len = (text || '').length
  if (len <= 7) return '88rpx'
  if (len <= 10) return '72rpx'
  if (len <= 14) return '56rpx'
  if (len <= 17) return '46rpx'
  return '40rpx'
}
function speakExtra(i) {
  const it = items.value[i]
  if (it && it.extraAudio) play(it.extraAudio)
}
function onChange(e) {
  current.value = e.detail.current
  if (lesson.value) svc.saveSnapshot({ idx: current.value })
  if (current.value >= items.value.length - 1) completeLearn()
  speakIdx(current.value)
}
// 翻页节流：小朋友连点只认第一次，防止一口气翻好几张、音频追着叠
const tapGate = createThrottle(450)

function prev() {
  if (!tapGate()) return
  if (current.value > 0) current.value--
}
function next() {
  if (!tapGate()) return
  if (current.value < items.value.length - 1) current.value++
  if (current.value >= items.value.length - 1) completeLearn()
}
onUnload(() => {
  if (lesson.value && !completed) {
    svc.saveSnapshot({ idx: current.value })
    svc.pauseSession()
  }
})
function goBack() {
  uni.navigateBack()
}
</script>

<style scoped>
.page {
  height: 100vh;
  height: 100dvh;
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
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.progress {
  min-width: 84rpx;
  text-align: right;
  font-size: 32rpx;
  font-weight: 700;
  color: #4a3f35;
  flex-shrink: 0;
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
/* 图文搭配：图标在前，字在后；没有映射的字回退独占大字排版 */
.char-wrap.has-emoji {
  flex-direction: column;
  gap: 20rpx;
}
.hz-emoji-tile {
  width: 210rpx;
  height: 210rpx;
  border-radius: 56rpx;
  background: #ffffff;
  box-shadow: 0 12rpx 26rpx rgba(120, 90, 40, 0.14);
  display: flex;
  align-items: center;
  justify-content: center;
  transform: rotate(-3deg);
}
.hz-emoji-img {
  width: 156rpx;
  height: 156rpx;
}
.char-big {
  font-size: 360rpx;
  font-weight: 800;
  line-height: 1;
}
.char-sm {
  font-size: 220rpx;
}
.word-en {
  margin-top: 30rpx;
  font-size: 88rpx;
  font-weight: 800;
  line-height: 1.15;
  text-align: center;
  align-self: stretch;
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
  margin-top: 16rpx;
  font-size: 46rpx;
  color: #4a3f35;
  font-weight: 600;
  text-align: center;
  line-height: 1.3;
  align-self: stretch;
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

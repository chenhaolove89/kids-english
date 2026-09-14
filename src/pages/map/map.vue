<template>
  <view class="page">
    <!-- 继续学习：卡片按课程名自适应，星数放卡片右侧 -->
    <view v-if="resume" class="resume-row">
      <view class="resume-card" :style="{ background: resume.lesson.bg || '#FFF3E4' }" @tap="goResume">
        <image v-if="resume.lesson.icon" class="resume-icon" :src="resume.lesson.icon" mode="aspectFit" />
        <view class="resume-info">
          <text class="resume-tag" :style="{ color: resume.lesson.color || '#FF8C42' }">{{ resumeModeText }}</text>
          <text class="resume-title">{{ resume.lesson.title }}</text>
        </view>
        <view class="play-btn" :style="{ background: resume.lesson.color || '#FF8C42' }">
          <text class="play-icon">▶</text>
        </view>
      </view>
      <!-- 星数胶囊：点了去百宝箱看收集成果 -->
      <view class="star-pill" @tap="goCollection">
        <text class="star-pill-num">⭐ {{ totalStars }}</text>
      </view>
    </view>

    <!-- 错题重练 -->
    <view v-if="reviewDue > 0" class="review-card" @tap="goReview">
      <text class="review-emoji">🔁</text>
      <view class="review-info">
        <text class="review-title">错题重练</text>
        <text class="review-sub">{{ reviewDue }} 道错题在等你</text>
      </view>
      <text class="review-go">开始 →</text>
    </view>

    <!-- 今日小任务：软推荐（无错题时给一个「把没满星的挑战打满」的默认答案，不是打卡） -->
    <view v-if="dailyTask" class="task-card" @tap="goDailyTask">
      <text class="review-emoji">🎯</text>
      <view class="review-info">
        <text class="review-title">今日小任务</text>
        <text class="review-sub">{{ dailyTask.title }} · 拿满星 🏆</text>
      </view>
      <text class="review-go">开始 →</text>
    </view>

    <!-- 阶段选择 -->
    <view class="stage-row">
      <view
        v-for="s in stages"
        :key="s.id"
        class="stage-chip"
        :class="{ active: s.id === stage }"
        @tap="setStage(s.id)"
      >
        <text class="stage-emoji">{{ s.emoji }}</text>
        <text class="stage-name">{{ s.name }}</text>
      </view>
    </view>

    <!-- 阶段课程块 -->
    <view v-for="block in blocks" :key="block.subject.id" class="block">
      <view class="block-header">
        <image class="block-icon" :src="block.subject.icon" mode="aspectFit" />
        <text class="block-name" :style="{ color: block.subject.color }">{{ block.subject.name }}</text>
        <!-- 启蒙/一二年级不识字：挑战只留 🏆 图标，与 🎲 配成一对圆钮 -->
        <view
          v-if="block.challenge && block.subject.id !== 'math'"
          class="block-quiz"
          :class="{ 'block-quiz-icon': !showLabels, 'block-quiz-locked': block.challengeLocked, shake: shakeId === 'challenge-' + block.subject.id }"
          :style="{ background: block.challengeLocked ? '#d8d2c6' : block.subject.color }"
          @tap="goChallenge(block)"
        >
          <text class="block-quiz-text">{{ showLabels ? (block.challengeLocked ? '🔒 挑战' : '🏆 挑战') : block.challengeLocked ? '🔒' : '🏆' }}</text>
        </view>
        <!-- 🎲 随机来一课：本阶段该科随机抽一课，连点不重样 -->
        <view
          v-if="blockHasLessons(block)"
          class="block-dice"
          :style="{ background: block.subject.color + '26' }"
          @tap="goRandom(block.subject.id)"
        >
          <text class="block-dice-emoji">🎲</text>
        </view>
      </view>
      <view v-if="block.empty" class="block-empty">
        <text class="block-empty-text">🚧 筹备中，先去别的阶段玩吧</text>
      </view>
      <view v-else class="unit-grid" :class="'unit-grid-' + block.subject.id">
        <view
          v-for="u in block.units"
          :key="u.id"
          class="unit-card"
          :class="{ locked: u.locked, next: u.isNext, shake: shakeId === u.id }"
          :style="{ background: u.bg }"
          @tap="goLesson(u)"
        >
          <image class="unit-icon" :src="u.icon" mode="aspectFit" />
          <text class="unit-title" :style="{ color: u.color }">{{ u.title }}</text>
          <text class="unit-sub">{{ u.subtitle }}</text>
          <!-- 软解锁：路径下一课有金色描边指引；后面的课半透明 + 锁 -->
          <text v-if="u.isNext" class="unit-next-badge">▶</text>
          <text v-else-if="u.locked" class="unit-lock">🔒</text>
        </view>
      </view>
    </view>

    <!-- 自由探索（旧三科入口） -->
    <view class="section-head">
      <text class="section-title">自由探索</text>
    </view>
    <view class="explore-row">
      <view v-for="s in explore" :key="s.id" class="explore-chip" :style="{ background: s.bg }" @tap="go(s)">
        <image class="explore-icon" :src="s.icon" mode="aspectFit" />
        <text class="explore-name" :style="{ color: s.color }">{{ s.zh }}</text>
      </view>
    </view>

    <TabBar active="map" />
  </view>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { getStorage } from '@/platform/storage.js'
import { assetUrl } from '@/platform/assets.js'
import { play, preload } from '@/platform/audio.js'
import { updatePrefs } from '@/content/lowAge.js'
import { allowNavigate } from '@/platform/nav.js'
import { hideNativeTabBar } from '@/platform/router-ui.js'
import { getProgressService } from '@/services/progress.js'
import { getReviewService } from '@/services/review.js'
import { pickDailyTask, todayKey } from '@/domain/daily-task.js'
import { stageBlocks, continueTarget, lessonUrl, normalizeStage, randomLesson, STAGES } from '@/services/curriculum-app.js'
import { getLesson } from '@/content/catalog.js'
import TabBar from '@/components/tab-bar.vue'

const explore = [
  { id: 'en', zh: '学英语', color: '#FF8C42', bg: '#FFF3E4', icon: assetUrl('/static/img/subject-english.png') },
  { id: 'zh', zh: '学语文', color: '#E4573D', bg: '#FDEBE7', icon: assetUrl('/static/img/subject-chinese.png') },
  { id: 'math', zh: '学数学', color: '#4D96FF', bg: '#E9F2FF', icon: assetUrl('/static/img/subject-math.png') },
]

const stages = STAGES
const stage = ref('qimeng')
// 软解锁状态依赖学习进度，onShow 时进度可能已变：用自增 tick 让 blocks 重算
const refreshTick = ref(0)
const blocks = computed(() => {
  void refreshTick.value
  return stageBlocks(stage.value)
})
// 正在抖动提示「锁着」的卡片/按钮 id
const shakeId = ref('')
// 启蒙、一二年级的孩子还不识字，这类入口只留图标
const PREREADER_STAGES = ['qimeng', 'g12']
const showLabels = computed(() => !PREREADER_STAGES.includes(stage.value))

// 旧首页的高价值入口并入课程页（课程页即首页）
const resume = ref(null)
const reviewDue = ref(0)
const totalStars = ref(0)
// 每科上一把随机抽中的课：连点骰子不重样
const lastRandom = ref({})
// 本次会话是否已播过进门引导（map 是常驻 tab 页，onShow 每次回来都会触发）
let welcomed = false

const resumeModeText = computed(() => {
  if (!resume.value) return ''
  return { 'resume-active': '继续上次', 'resume-paused': '继续上次', next: '下一课', start: '开始第一课' }[resume.value.mode] || '继续'
})

// 指令朗读：不识字的孩子点按钮先听到它在说什么（音频 zh-btn-*.mp3，gen-zh-azure --labels 生成）
const RESUME_LABEL_KEY = { 'resume-active': 'resume', 'resume-paused': 'resume', next: 'next', start: 'first' }
const say = (k) => play(assetUrl('/static/audio/zh-btn-' + k + '.mp3'))
preload([
  assetUrl('/static/audio/zh-btn-resume.mp3'), assetUrl('/static/audio/zh-btn-next.mp3'),
  assetUrl('/static/audio/zh-btn-first.mp3'), assetUrl('/static/audio/zh-btn-review.mp3'),
  assetUrl('/static/audio/zh-btn-en.mp3'), assetUrl('/static/audio/zh-btn-zh.mp3'),
  assetUrl('/static/audio/zh-btn-math.mp3'),
  assetUrl('/static/audio/zh-btn-welcome.mp3'), assetUrl('/static/audio/zh-btn-stage.mp3'),
  assetUrl('/static/audio/zh-btn-challenge.mp3'), assetUrl('/static/audio/zh-btn-random.mp3'),
])

onShow(() => {
  // 自定义悬浮底栏替代原生 tabBar（uni.hideTabBar 在 H5 收起原生栏，switchTab 不受影响）
  hideNativeTabBar()
  // 进门第一句引导：不识字的孩子先听到「今天想学哪一个？」，否则满屏文字无处下手。
  // 只在本次会话第一次显示时播；首次冷加载可能被 iOS 音频解锁策略静音，
  // 但每个按钮/阶段/骰子都有自己的指令音兜底。
  if (!welcomed) {
    welcomed = true
    setTimeout(() => say('welcome'), 600)
  }
  const store = getStorage()
  const prefs = store.get('prefs', {})
  stage.value = normalizeStage(prefs?.stage || stage.value)
  lastRandom.value = prefs?.lastRandom || {}
  resume.value = continueTarget()
  const reviewSvc = getReviewService()
  reviewDue.value = reviewSvc.dueCount('en') + reviewSvc.dueCount('zh') + reviewSvc.dueCount('math')
  // 学完一课回来：进度变了，课程块的锁/下一课标记得跟着重算
  refreshTick.value++
  // 只统计目录里仍存在的课：内容下线后历史数据不该继续计入首页星数
  const prog = getProgressService()
  totalStars.value = prog.summary({ isKnownLesson: (id) => !!getLesson(id) }).totalStars
  computeDailyTask(prog)
})

/** 今日小任务：无到期错题时，推荐当前阶段里星最少、路径开放的挑战关卡 */
const dailyTask = ref(null)
// 切阶段/进度变化会让 blocks 重算：任务卡跟着换到当前阶段的候选（onShow 只覆盖回来那一刻）
watch(blocks, () => {
  if (reviewDue.value === 0) computeDailyTask(getProgressService())
})
function computeDailyTask(prog) {
  const progressMap = prog.lessonProgressMap()
  const candidates = []
  blocks.value.forEach((block) => {
    // 数学关卡即路径：只推荐已解锁的关（锁着的关点了会被拒，不能当任务）
    const list = block.subject.id === 'math' ? block.units.filter((u) => !u.locked) : block.challenge && !block.challengeLocked ? [block.challenge] : []
    list.forEach((l) => {
      const p = progressMap.get(l.id)
      candidates.push({
        lessonId: l.id,
        title: l.title,
        stars: p?.bestStars || 0,
        order: candidates.length,
      })
    })
  })
  const hit = pickDailyTask({ dueTotal: reviewDue.value, candidates, dayKey: todayKey() })
  dailyTask.value = hit && getLesson(hit.lessonId) ? hit : null
}

function goDailyTask() {
  const t = dailyTask.value
  if (!t) return
  say('challenge')
  const lesson = getLesson(t.lessonId)
  const url = lesson && lessonUrl(lesson)
  if (url && allowNavigate()) uni.navigateTo({ url })
}

/** 软解锁的点锁反馈：抖一下 + 轻声提示，不打断孩子（1s 内去重） */
let lastShakeAt = 0
function denyLocked(id, tip) {
  const now = Date.now()
  if (now - lastShakeAt < 1000) return
  lastShakeAt = now
  shakeId.value = id
  setTimeout(() => {
    if (shakeId.value === id) shakeId.value = ''
  }, 600)
  uni.showToast({ title: tip, icon: 'none' })
}

function blockHasLessons(block) {
  return !block.empty && block.units.length > 0
}

function setStage(id) {
  stage.value = normalizeStage(id)
  updatePrefs({ stage: stage.value })
  // 阶段行对不识字的孩子是一排看不懂的字：点一下就念出「选一个想学的」
  say('stage')
}

function goLesson(lesson) {
  // 软解锁：锁着的课先完成前面的再来（家长中心「自由探索」可整体放开）
  if (lesson.locked) {
    denyLocked(lesson.id, '先完成前面的课，再来学它 ✨')
    return
  }
  const url = lessonUrl(lesson)
  if (url && allowNavigate()) uni.navigateTo({ url })
}

/** 🏆 挑战圆钮：启蒙/低年级只显示图标，必须能听到它是什么 */
function goChallenge(block) {
  if (block.challengeLocked) {
    denyLocked('challenge-' + block.subject.id, '先学一学，再来挑战 🏆')
    return
  }
  say('challenge')
  goLesson(block.challenge)
}

/** 随机来一课：当前阶段该科随机抽一课，记录上把结果避免连续重样 */
function goRandom(subjectId) {
  say('random')
  if (!allowNavigate()) return
  const lesson = randomLesson(stage.value, subjectId, lastRandom.value[subjectId])
  if (!lesson) return
  const next = { ...lastRandom.value, [subjectId]: lesson.id }
  lastRandom.value = next
  updatePrefs({ lastRandom: next })
  const url = lessonUrl(lesson)
  if (url) uni.navigateTo({ url })
}

function goResume() {
  say(RESUME_LABEL_KEY[resume.value?.mode] || 'resume')
  goLesson(resume.value?.lesson)
}

function goReview() {
  say('review')
  if (!allowNavigate()) return
  const reviewSvc = getReviewService()
  // 三科里挑到期最多的先练；数学错题在练习页原题重放
  const due = [
    ['en', reviewSvc.dueCount('en')],
    ['zh', reviewSvc.dueCount('zh')],
    ['math', reviewSvc.dueCount('math')],
  ].sort((a, b) => b[1] - a[1])[0][0]
  uni.navigateTo({ url: due === 'math' ? '/pages/math/practice?review=1' : `/pages/quiz/quiz?review=${due}` })
}

function goCollection() {
  if (!allowNavigate()) return
  uni.switchTab({ url: '/pages/collection/collection' })
}

function go(s) {
  say(s.id)
  if (!allowNavigate()) return
  if (s.id === 'en') uni.navigateTo({ url: '/pages/index/index' })
  else if (s.id === 'zh') uni.navigateTo({ url: '/pages/chinese/chinese' })
  else uni.navigateTo({ url: '/pages/math/math' })
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  min-height: 100svh;
  padding: calc(44rpx + env(safe-area-inset-top)) 40rpx calc(200rpx + env(safe-area-inset-bottom));
  /* 底部再叠 --bottom-gap：微信内置浏览器的底部工具条会盖住最下面那张课程卡（见 App.vue） */
  padding: calc(44rpx + env(safe-area-inset-top)) 40rpx calc(200rpx + env(safe-area-inset-bottom) + var(--bottom-gap));
  box-sizing: border-box;
}
/* 星数胶囊：贴在续学卡片右侧；最小高度提到 88rpx，保证 ≥44px 可点 */
.star-pill {
  flex-shrink: 0;
  background: #ffffff;
  border-radius: 44rpx;
  padding: 8rpx 20rpx;
  min-height: 88rpx;
  display: flex;
  align-items: center;
  box-shadow: 0 6rpx 16rpx rgba(120, 90, 40, 0.12);
}
.star-pill:active {
  transform: scale(0.94);
}
.star-pill-num {
  font-size: 30rpx;
  font-weight: 800;
  color: #c99b52;
  white-space: nowrap;
}

/* 继续学习 */
.resume-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 26rpx;
}
.resume-card {
  border-radius: 44rpx;
  padding: 30rpx 34rpx;
  display: flex;
  align-items: center;
  gap: 24rpx;
  box-shadow: 0 12rpx 32rpx rgba(120, 90, 40, 0.12);
  width: fit-content;
  max-width: 100%;
  min-width: 0;
}
.resume-card:active {
  transform: scale(0.98);
}
.resume-icon {
  width: 96rpx;
  height: 96rpx;
  flex-shrink: 0;
}
.resume-info {
  flex: 1;
  min-width: 0;
}
.resume-tag {
  display: block;
  font-size: 26rpx;
  font-weight: 700;
}
.resume-title {
  display: block;
  margin-top: 6rpx;
  font-size: 38rpx;
  font-weight: 800;
  color: #4a3f35;
  /* 与 unit-title 同规：两行截断，长课名（必背古诗 · 点读）不再被省略号拦腰 */
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-height: 1.3;
  word-break: break-word;
  overflow: hidden;
}
/* ▶ 播放圆钮：不识字的孩子也知道"点它开始" */
.play-btn {
  width: 88rpx;
  height: 88rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 8rpx 18rpx rgba(120, 90, 40, 0.2);
}
.play-btn:active {
  transform: scale(0.92);
}
.play-icon {
  color: #ffffff;
  font-size: 36rpx;
  margin-left: 6rpx;
}

/* 错题重练入口 */
.review-card {
  border-radius: 44rpx;
  padding: 26rpx 34rpx;
  display: flex;
  align-items: center;
  gap: 24rpx;
  background: #ffffff;
  border: 4rpx dashed #ffb84d;
  box-sizing: border-box;
  margin-bottom: 26rpx;
}
.review-card:active {
  transform: scale(0.98);
}
.review-emoji {
  font-size: 56rpx;
  line-height: 1;
  flex-shrink: 0;
}
.review-info {
  flex: 1;
  min-width: 0;
}
.review-title {
  display: block;
  font-size: 34rpx;
  font-weight: 800;
  color: #4a3f35;
}
.review-sub {
  display: block;
  margin-top: 4rpx;
  font-size: 25rpx;
  color: #c99b52;
}
.review-go {
  font-size: 29rpx;
  font-weight: 800;
  color: #c99b52;
  flex-shrink: 0;
}

/* 今日小任务：实线卡片（虚线留给错题卡），同结构不同色区分 */
.task-card {
  border-radius: 44rpx;
  padding: 26rpx 34rpx;
  display: flex;
  align-items: center;
  gap: 24rpx;
  margin-bottom: 26rpx;
  background: #fff3df;
  box-shadow: 0 8rpx 24rpx rgba(255, 184, 77, 0.18);
}

/* 阶段选择 */
.stage-row {
  display: flex;
  gap: 16rpx;
  margin-bottom: 34rpx;
}
.stage-chip {
  flex: 1;
  min-width: 0;
  background: #ffffff;
  border-radius: 34rpx;
  padding: 16rpx 6rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-shadow: 0 6rpx 18rpx rgba(120, 90, 40, 0.07);
  border: 4rpx solid transparent;
  box-sizing: border-box;
}
.stage-chip.active {
  border-color: #ffb84d;
  background: #fff3df;
}
.stage-chip:active {
  transform: scale(0.96);
}
.stage-emoji {
  font-size: 38rpx;
  line-height: 1.1;
}
.stage-name {
  margin-top: 4rpx;
  font-size: 26rpx;
  font-weight: 800;
  color: #4a3f35;
  white-space: nowrap;
}

/* 阶段课程块 */
.block {
  margin-bottom: 40rpx;
}
.block-header {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 20rpx;
  padding: 0 6rpx;
}
.block-icon {
  width: 64rpx;
  height: 64rpx;
  flex-shrink: 0;
}
.block-name {
  flex: 1;
  min-width: 0;
  font-size: 38rpx;
  font-weight: 800;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.block-quiz {
  padding: 14rpx 28rpx;
  border-radius: 38rpx;
  box-shadow: 0 8rpx 20rpx rgba(120, 90, 40, 0.12);
  flex-shrink: 0;
}
.block-quiz:active {
  transform: scale(0.95);
}
.block-quiz-text {
  color: #ffffff;
  font-size: 29rpx;
  font-weight: 800;
  white-space: nowrap;
}
/* 纯图标态：与 🎲 同尺寸成对，孩子不用认字。
   尺寸 72rpx 在 320px 窄屏只有约 31px，低于 44px 可点下限 → 提到 96rpx（≈41~50px）。 */
.block-quiz.block-quiz-icon {
  width: 96rpx;
  height: 96rpx;
  padding: 0;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.block-quiz.block-quiz-icon .block-quiz-text {
  font-size: 44rpx;
}
/* 🎲 随机来一课圆钮 */
.block-dice {
  width: 96rpx;
  height: 96rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 8rpx 18rpx rgba(120, 90, 40, 0.12);
}
.block-dice:active {
  transform: scale(0.92);
}
.block-dice-emoji {
  font-size: 46rpx;
  line-height: 1;
}
.block-empty {
  background: #ffffff;
  border-radius: 36rpx;
  padding: 30rpx;
  display: flex;
  justify-content: center;
  box-shadow: 0 6rpx 18rpx rgba(120, 90, 40, 0.06);
}
.block-empty-text {
  font-size: 27rpx;
  color: #b3a492;
}
.unit-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 22rpx;
}
.unit-card {
  border-radius: 36rpx;
  padding: 26rpx 8rpx 22rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-shadow: 0 8rpx 24rpx rgba(120, 90, 40, 0.07);
  box-sizing: border-box;
}
.unit-card:active {
  transform: scale(0.96);
}
.unit-icon {
  width: 96rpx;
  height: 96rpx;
}
.unit-title {
  margin-top: 12rpx;
  font-size: 27rpx;
  font-weight: 800;
  max-width: 100%;
  overflow: hidden;
  /* 两行截断：三列卡放不下「动物 · Animals」整行，单行省略号会拦腰截断英文名 */
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-height: 1.25;
  word-break: break-word;
}
.unit-sub {
  margin-top: 4rpx;
  font-size: 21rpx;
  color: #8a8073;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 英语分类多：紧凑 4 列；语文/数学每阶段只有 1 张卡：放大 2 列 */
.unit-grid-en .unit-card {
  width: calc(25% - 16.5rpx);
}
.unit-grid-zh .unit-card,
.unit-grid-math .unit-card {
  width: calc(50% - 11rpx);
}
.unit-grid-zh .unit-icon,
.unit-grid-math .unit-icon {
  width: 110rpx;
  height: 110rpx;
}
.unit-grid-zh .unit-title,
.unit-grid-math .unit-title {
  font-size: 31rpx;
}

/* 软解锁：锁着的课降低存在感但不消失（还告诉孩子「还有这些」）；
   下一课金色描边 + ▶ 角标，是「现在学这个」的默认答案 */
.unit-card.locked {
  opacity: 0.45;
  filter: saturate(0.35);
}
.unit-lock {
  position: absolute;
  top: 12rpx;
  right: 14rpx;
  font-size: 34rpx;
  line-height: 1;
}
.unit-card.next {
  box-shadow: 0 0 0 6rpx #ffb84d, 0 12rpx 30rpx rgba(255, 184, 77, 0.4);
}
.unit-next-badge {
  position: absolute;
  top: -14rpx;
  right: -8rpx;
  width: 52rpx;
  height: 52rpx;
  border-radius: 50%;
  background: #ffb84d;
  color: #ffffff;
  font-size: 26rpx;
  font-weight: 900;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6rpx 14rpx rgba(255, 184, 77, 0.5);
}
.unit-card {
  position: relative;
}
/* 挑战钮锁住态：灰底，点了给提示 */
.block-quiz-locked {
  box-shadow: none;
}
/* 点锁提示的抖动 */
.unit-card.shake {
  animation: shake 0.45s;
}
.block-quiz.shake {
  animation: shake 0.45s;
}
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-14rpx); }
  50% { transform: translateX(14rpx); }
  75% { transform: translateX(-8rpx); }
}

.section-head {
  padding: 10rpx 6rpx 22rpx;
}
.section-title {
  font-size: 34rpx;
  font-weight: 800;
  color: #a2917d;
}
.explore-row {
  display: flex;
  gap: 20rpx;
}
.explore-chip {
  flex: 1;
  border-radius: 40rpx;
  padding: 24rpx 10rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-shadow: 0 8rpx 24rpx rgba(120, 90, 40, 0.08);
}
.explore-chip:active {
  transform: scale(0.97);
}
.explore-icon {
  width: 90rpx;
  height: 90rpx;
}
.explore-name {
  margin-top: 12rpx;
  font-size: 30rpx;
  font-weight: 800;
}
@media (max-width: 760px) {
  .unit-grid-en .unit-card {
    width: calc(33.33% - 14.7rpx);
  }
  .unit-grid-zh .unit-card,
  .unit-grid-math .unit-card {
    width: calc(50% - 11rpx);
  }
}
</style>

<template>
  <view class="page">
    <view class="header">
      <image class="logo" src="/static/icons/icon.png" mode="aspectFit" />
      <view class="title-wrap">
        <text class="title">快乐学园</text>
        <text class="subtitle">英语 · 语文 · 数学，一样都好玩</text>
      </view>
    </view>

    <!-- 继续学习 -->
    <view v-if="resume" class="resume-card" :style="{ background: resume.lesson.bg || '#FFF3E4' }" @tap="goResume">
      <image v-if="resume.lesson.icon" class="resume-icon" :src="resume.lesson.icon" mode="aspectFit" />
      <view class="resume-info">
        <text class="resume-tag" :style="{ color: resume.lesson.color || '#FF8C42' }">{{ resumeModeText }}</text>
        <text class="resume-title">{{ resume.lesson.title }}</text>
      </view>
      <view class="play-btn" :style="{ background: resume.lesson.color || '#FF8C42' }">
        <text class="play-icon">▶</text>
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

    <!-- 学习摘要 -->
    <view class="summary">
      <view class="summary-item">
        <text class="summary-num">⭐ {{ summary.totalStars }}</text>
        <text class="summary-label">小星星</text>
      </view>
      <view class="summary-item">
        <text class="summary-num">🏁 {{ summary.lessonsCompleted }}</text>
        <text class="summary-label">完成课程</text>
      </view>
      <view class="summary-item">
        <text class="summary-num">📖 {{ summary.learnDoneCount }}</text>
        <text class="summary-label">学一学</text>
      </view>
    </view>

    <!-- 今天学什么 -->
    <view class="section-head">
      <text class="section-title">今天学什么</text>
    </view>
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

    <view class="quick-list">
      <view v-for="row in quickRows" :key="row.subject.id" class="quick-row" :style="{ background: row.subject.bg }">
        <image class="quick-icon" :src="row.subject.icon" mode="aspectFit" />
        <view class="quick-info">
          <text class="quick-name" :style="{ color: row.subject.color }">{{ row.subject.name }}</text>
          <text class="quick-next" v-if="row.next">{{ row.next.title }}</text>
        </view>
        <view class="quick-btns">
          <!-- 不识字也能懂：📖=学一学，⚡=挑战/练习，🎲=随机来一课 -->
          <view
            v-if="row.next"
            class="icon-btn"
            :style="{ background: row.subject.color + '26' }"
            @tap="goLesson(row.next)"
          >
            <text class="icon-btn-emoji">{{ row.subject.id === 'math' ? '⚡' : '📖' }}</text>
          </view>
          <view
            v-if="row.challenge && row.challenge.id !== (row.next && row.next.id)"
            class="icon-btn ghost"
            @tap="goLesson(row.challenge)"
          >
            <text class="icon-btn-emoji">⚡</text>
          </view>
          <view
            v-if="row.randomCount"
            class="icon-btn"
            :style="{ background: row.subject.color + '26' }"
            @tap="goRandom(row.subject.id)"
          >
            <text class="icon-btn-emoji">🎲</text>
          </view>
        </view>
      </view>
    </view>

    <view class="map-link" @tap="goMap">
      <text class="map-link-emoji">🗺️</text>
      <text class="map-link-text">全部课程</text>
    </view>

    <view class="footer">
      <text class="footer-text">给小朋友的快乐学习园地 🌈</text>
    </view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { getStorage, } from '@/platform/storage.js'
import { updatePrefs } from '@/content/lowAge.js'
import { allowNavigate } from '@/platform/nav.js'
import { getProgressService } from '@/services/progress.js'
import { getReviewService } from '@/services/review.js'
import { stageQuickRows, continueTarget, lessonUrl, normalizeStage, STAGES, randomLesson } from '@/services/curriculum.js'

const stage = ref('qimeng')
const quickRows = ref([])
const resume = ref(null)
const reviewDue = ref(0)
const summary = ref({ totalStars: 0, lessonsCompleted: 0, learnDoneCount: 0 })
const stages = STAGES
// 每科上一把随机抽中的课：连点骰子不重样
const lastRandom = ref({})

const resumeModeText = computed(() => {
  if (!resume.value) return ''
  return { 'resume-active': '继续上次', 'resume-paused': '继续上次', next: '下一课', start: '开始第一课' }[resume.value.mode] || '继续'
})

onShow(() => {
  refresh()
})

function refresh() {
  const store = getStorage()
  const prefs = store.get('prefs', {})
  stage.value = normalizeStage(prefs?.stage || stage.value)
  lastRandom.value = prefs?.lastRandom || {}
  quickRows.value = stageQuickRows(stage.value)
  resume.value = continueTarget()
  summary.value = getProgressService().summary()
  const reviewSvc = getReviewService()
  reviewDue.value = reviewSvc.dueCount('en') + reviewSvc.dueCount('zh')
}

function goReview() {
  if (!allowNavigate()) return
  const reviewSvc = getReviewService()
  const subject = reviewSvc.dueCount('zh') > reviewSvc.dueCount('en') ? 'zh' : 'en'
  uni.navigateTo({ url: `/pages/quiz/quiz?review=${subject}` })
}

function setStage(id) {
  stage.value = normalizeStage(id)
  quickRows.value = stageQuickRows(stage.value)
  updatePrefs({ stage: stage.value })
}

function goLesson(lesson) {
  const url = lessonUrl(lesson)
  // 连点节流：防止 navigateTo 叠出多层页面
  if (url && allowNavigate()) uni.navigateTo({ url })
}

/** 随机来一课：当前阶段该科随机抽一课，记录上把结果避免连续重样 */
function goRandom(subjectId) {
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
  goLesson(resume.value?.lesson)
}

function goMap() {
  uni.switchTab({ url: '/pages/map/map' })
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  min-height: 100svh;
  padding: calc(30rpx + env(safe-area-inset-top)) 44rpx calc(40rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}
.header {
  display: flex;
  align-items: center;
  gap: 28rpx;
  padding: 16rpx 8rpx 32rpx;
}
.logo {
  width: 110rpx;
  height: 110rpx;
  flex-shrink: 0;
}
.title-wrap {
  flex: 1;
  min-width: 0;
}
.title {
  display: block;
  font-size: 56rpx;
  font-weight: 800;
  color: #4a3f35;
}
.subtitle {
  display: block;
  margin-top: 8rpx;
  font-size: 28rpx;
  color: #a2917d;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 继续学习 */
.resume-card {
  border-radius: 44rpx;
  padding: 30rpx 34rpx;
  display: flex;
  align-items: center;
  gap: 24rpx;
  box-shadow: 0 12rpx 32rpx rgba(120, 90, 40, 0.12);
  margin-bottom: 26rpx;
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
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.resume-go {
  font-size: 30rpx;
  font-weight: 800;
  color: #4a3f35;
  flex-shrink: 0;
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

/* 学习摘要 */
.summary {
  display: flex;
  gap: 22rpx;
  margin-bottom: 34rpx;
}
.summary-item {
  flex: 1;
  background: #ffffff;
  border-radius: 36rpx;
  padding: 20rpx 10rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-shadow: 0 8rpx 24rpx rgba(120, 90, 40, 0.07);
}
.summary-num {
  font-size: 36rpx;
  font-weight: 800;
  color: #4a3f35;
}
.summary-label {
  margin-top: 6rpx;
  font-size: 24rpx;
  color: #a89d8e;
}

.section-head {
  padding: 0 6rpx 20rpx;
}
.section-title {
  font-size: 34rpx;
  font-weight: 800;
  color: #a2917d;
}

/* 阶段选择 */
.stage-row {
  display: flex;
  gap: 16rpx;
  margin-bottom: 28rpx;
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
  font-size: 24rpx;
  font-weight: 800;
  color: #4a3f35;
  white-space: nowrap;
}

/* 三科快速开始 */
.quick-list {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}
.quick-row {
  border-radius: 44rpx;
  padding: 28rpx 30rpx;
  display: flex;
  align-items: center;
  gap: 22rpx;
  box-shadow: 0 10rpx 26rpx rgba(120, 90, 40, 0.08);
}
.quick-row:active {
  transform: scale(0.98);
}
.quick-icon {
  width: 84rpx;
  height: 84rpx;
  flex-shrink: 0;
}
.quick-info {
  flex: 1;
  min-width: 0;
}
.quick-name {
  display: block;
  font-size: 38rpx;
  font-weight: 800;
}
.quick-next {
  display: block;
  margin-top: 6rpx;
  font-size: 25rpx;
  color: #8a8073;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.quick-btns {
  display: flex;
  gap: 18rpx;
  flex-shrink: 0;
}
/* 图标圆钮：📖 学一学 / ⚡ 挑战 / 🎲 随机来一课，孩子看图点 */
.icon-btn {
  width: 88rpx;
  height: 88rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8rpx 18rpx rgba(120, 90, 40, 0.12);
}
.icon-btn:active {
  transform: scale(0.92);
}
.icon-btn.ghost {
  background: #ffffff;
}
.icon-btn-emoji {
  font-size: 46rpx;
  line-height: 1;
}

.map-link {
  margin-top: 34rpx;
  align-self: center;
  background: #ffffff;
  border-radius: 44rpx;
  padding: 18rpx 40rpx;
  display: flex;
  align-items: center;
  gap: 16rpx;
  box-shadow: 0 8rpx 20rpx rgba(120, 90, 40, 0.1);
}
.map-link:active {
  transform: scale(0.97);
}
.map-link-emoji {
  font-size: 40rpx;
  line-height: 1;
}
.map-link-text {
  font-size: 28rpx;
  font-weight: 700;
  color: #c99b52;
}
.footer {
  flex: 1;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 30rpx 0 10rpx;
}
.footer-text {
  font-size: 26rpx;
  color: #c9bba7;
}
</style>

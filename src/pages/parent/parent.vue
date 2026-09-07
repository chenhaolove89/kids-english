<template>
  <view class="page">
    <view class="header">
      <view class="title-wrap">
        <text class="title">家长中心</text>
        <text class="subtitle">记录都保存在这台设备上，不上传网络</text>
      </view>
    </view>

    <!-- 摘要 -->
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

    <!-- 本周周报 -->
    <view class="section-head"><text class="section-title">本周（近 7 天）</text></view>
    <view class="card week-card">
      <view class="week-item">
        <text class="week-num">{{ week.completedLessons }}</text>
        <text class="week-label">完成课程</text>
      </view>
      <view class="week-item">
        <text class="week-num">⭐ {{ week.stars }}</text>
        <text class="week-label">获得星星</text>
      </view>
      <view class="week-item">
        <text class="week-num">{{ week.minutes }}</text>
        <text class="week-label">练习分钟</text>
      </view>
      <view class="week-item">
        <text class="week-num">📖 {{ week.learnDone }}</text>
        <text class="week-label">学一学</text>
      </view>
    </view>

    <!-- 分科目进度 -->
    <view class="section-head"><text class="section-title">各科进度</text></view>
    <view class="card">
      <view v-for="row in bySubject" :key="row.subject.id" class="subject-row">
        <image class="subject-icon" :src="row.subject.icon" mode="aspectFit" />
        <view class="subject-info">
          <text class="subject-name" :style="{ color: row.subject.color }">{{ row.subject.name }}</text>
          <view class="bar">
            <view class="bar-fill" :style="{ width: row.percent + '%', background: row.subject.color }" />
          </view>
        </view>
        <view class="subject-nums">
          <text class="subject-done">{{ row.done }}/{{ row.total }} 课</text>
          <text class="subject-stars">⭐ {{ row.stars }}</text>
        </view>
      </view>
    </view>

    <!-- 错题本 -->
    <view class="section-head"><text class="section-title">错题本</text></view>
    <view class="card">
      <view class="meta-row">
        <text class="meta-label">待复习</text>
        <text class="meta-value">{{ reviewDue }} 题</text>
      </view>
      <view v-if="topWrongText" class="meta-row">
        <text class="meta-label">最常错</text>
        <text class="meta-value">{{ topWrongText }}</text>
      </view>
      <view v-if="!topWrongText" class="meta-row">
        <text class="meta-label">答错的词会自动收进这里，首页会出现「错题重练」</text>
      </view>
    </view>

    <!-- 最近记录 -->
    <view class="section-head"><text class="section-title">最近记录</text></view>
    <view class="card">
      <view v-if="!recent.length" class="empty-row">
        <text class="empty-text">还没有记录，去上一节课吧</text>
      </view>
      <view v-for="(s, i) in recent" :key="i" class="record-row">
        <text class="record-dot" :class="s.status">{{ s.status === 'completed' ? '✓' : '…' }}</text>
        <view class="record-info">
          <text class="record-title">{{ s.title }}</text>
          <text class="record-sub">{{ s.kindLabel }} · {{ s.statusLabel }} · {{ fmtTime(s.startedAt) }}</text>
        </view>
        <text v-if="s.stars" class="record-stars">⭐ {{ s.stars }}</text>
      </view>
    </view>

    <!-- 数据管理 -->
    <view class="section-head"><text class="section-title">数据</text></view>
    <view class="card">
      <view class="meta-row" @longpress="revealLowAge">
        <text class="meta-label">课程版本（长按进入内容分级设置）</text>
        <text class="meta-value">{{ catalogVersion }}</text>
      </view>
      <view class="meta-row">
        <text class="meta-label">累计作答</text>
        <text class="meta-value">{{ attemptCount }} 次</text>
      </view>
      <view v-if="lowAgeVisible" class="meta-row lowage-row">
        <text class="meta-label">低龄模式（隐藏惊悚角色类内容）</text>
        <switch :checked="lowAge" color="#3BB273" style="transform: scale(0.85)" @change="onLowAgeChange" />
      </view>
      <view class="clear-btn" @tap="clearRecords">
        <text class="clear-text">清空学习记录</text>
      </view>
    </view>

    <view class="footer">
      <text class="footer-text">星级按「第一次就答对」计算，鼓励不刷分 🌟</text>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { getStorage } from '@/platform/storage.js'
import { getProgressService } from '@/services/progress.js'
import { getReviewService } from '@/services/review.js'
import { getLowAgeMode, setLowAgeMode, updatePrefs } from '@/content/lowAge.js'
import { SUBJECTS, getLesson, catalog } from '@/content/catalog.js'
import { visibleLessons } from '@/services/curriculum.js'
import { starsForFirstAttempt } from '@/domain/progress.js'

const KIND_LABEL = { learn: '学一学', challenge: '挑战' }
const STATUS_LABEL = { completed: '完成', paused: '中断' }

const summary = ref({ totalStars: 0, lessonsCompleted: 0, learnDoneCount: 0 })
const bySubject = ref([])
const recent = ref([])
const attemptCount = ref(0)
const catalogVersion = catalog.contentVersion
const week = ref({ completedLessons: 0, stars: 0, minutes: 0, learnDone: 0 })
const reviewDue = ref(0)
const topWrongText = ref('')
const lowAge = ref(true)
const lowAgeVisible = ref(false)

onShow(() => {
  refresh()
})

function refresh() {
  const store = getStorage()
  const prog = getProgressService()
  const reviewSvc = getReviewService()
  summary.value = prog.summary()
  week.value = prog.weeklyReport()
  attemptCount.value = store.get('attempts', []).length
  lowAge.value = getLowAgeMode()
  reviewDue.value = reviewSvc.dueCount('en') + reviewSvc.dueCount('zh')
  topWrongText.value = reviewSvc
    .topWrong(3)
    .map((e) => e.text || e.itemId)
    .join('、')

  const progressMap = prog.lessonProgressMap()
  const lessons = visibleLessons()
  bySubject.value = SUBJECTS.map((subject) => {
    const subjectLessons = lessons.filter((l) => l.subject === subject.id)
    const done = subjectLessons.filter((l) => (progressMap.get(l.id)?.completed || 0) > 0).length
    const stars = subjectLessons.reduce((sum, l) => sum + (progressMap.get(l.id)?.bestStars || 0), 0)
    return {
      subject,
      done,
      total: subjectLessons.length,
      stars,
      percent: subjectLessons.length ? Math.round((done / subjectLessons.length) * 100) : 0,
    }
  })

  recent.value = prog.recentSessions(8).map((s) => {
    const lesson = getLesson(s.lessonId)
    return {
      title: lesson?.title || s.lessonId,
      kindLabel: KIND_LABEL[s.kind] || s.kind,
      statusLabel: STATUS_LABEL[s.status] || s.status,
      startedAt: s.startedAt,
      stars:
        s.status === 'completed' && s.kind === 'challenge'
          ? starsForFirstAttempt(s.totals?.firstCorrect || 0, s.totals?.questions || 0)
          : 0,
    }
  })
}

/** 隐藏入口：长按版本行 500ms 出现低龄模式开关 */
function revealLowAge() {
  lowAgeVisible.value = true
  uni.showToast({ title: '已显示内容分级设置', icon: 'none' })
}

function onLowAgeChange(e) {
  const next = !!e.detail.value
  if (next === getLowAgeMode()) return // 事件重发时幂等
  setLowAgeMode(next)
  lowAge.value = getLowAgeMode()
  refresh()
  uni.showToast({ title: lowAge.value ? '已开启低龄模式' : '已关闭低龄模式', icon: 'none' })
}

function fmtTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function clearRecords() {
  uni.showModal({
    title: '清空学习记录',
    content: '将删除这台设备上的星星和课程记录，无法恢复。确定吗？',
    confirmText: '清空',
    confirmColor: '#E4573D',
    success: (r) => {
      if (!r.confirm) return
      const store = getStorage()
      store.remove('attempts')
      store.remove('sessions')
      store.remove('active')
      refresh()
      uni.showToast({ title: '已清空', icon: 'success' })
    },
  })
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  min-height: 100svh;
  padding: calc(30rpx + env(safe-area-inset-top)) 40rpx calc(50rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
}
.header {
  padding: 16rpx 8rpx 26rpx;
}
.title-wrap {
  min-width: 0;
}
.title {
  display: block;
  font-size: 52rpx;
  font-weight: 800;
  color: #4a3f35;
}
.subtitle {
  display: block;
  margin-top: 8rpx;
  font-size: 28rpx;
  color: #a2917d;
}

.summary {
  display: flex;
  gap: 22rpx;
  margin-bottom: 36rpx;
}
.summary-item {
  flex: 1;
  background: #ffffff;
  border-radius: 36rpx;
  padding: 22rpx 10rpx;
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
  padding: 0 6rpx 18rpx;
  margin-top: 10rpx;
}
.section-title {
  font-size: 32rpx;
  font-weight: 800;
  color: #a2917d;
}
.card {
  background: #ffffff;
  border-radius: 40rpx;
  padding: 10rpx 30rpx;
  box-shadow: 0 8rpx 24rpx rgba(120, 90, 40, 0.07);
  margin-bottom: 34rpx;
}

/* 本周周报 */
.week-card {
  display: flex;
  padding: 26rpx 10rpx;
}
.week-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 0;
}
.week-num {
  font-size: 34rpx;
  font-weight: 800;
  color: #4a3f35;
}
.week-label {
  margin-top: 6rpx;
  font-size: 23rpx;
  color: #a89d8e;
}

/* 分科目进度 */
.subject-row {
  display: flex;
  align-items: center;
  gap: 22rpx;
  padding: 24rpx 0;
}
.subject-row + .subject-row {
  border-top: 2rpx solid #f7f3ec;
}
.subject-icon {
  width: 72rpx;
  height: 72rpx;
  flex-shrink: 0;
}
.subject-info {
  flex: 1;
  min-width: 0;
}
.subject-name {
  display: block;
  font-size: 30rpx;
  font-weight: 800;
}
.bar {
  margin-top: 12rpx;
  height: 14rpx;
  border-radius: 7rpx;
  background: #f7f3ec;
  overflow: hidden;
}
.bar-fill {
  height: 100%;
  border-radius: 7rpx;
  transition: width 0.3s;
}
.subject-nums {
  flex-shrink: 0;
  text-align: right;
}
.subject-done {
  display: block;
  font-size: 26rpx;
  font-weight: 700;
  color: #4a3f35;
}
.subject-stars {
  display: block;
  margin-top: 6rpx;
  font-size: 24rpx;
  color: #a89d8e;
}

/* 最近记录 */
.record-row {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 22rpx 0;
}
.record-row + .record-row {
  border-top: 2rpx solid #f7f3ec;
}
.record-dot {
  width: 52rpx;
  height: 52rpx;
  border-radius: 50%;
  background: #e8f8ee;
  color: #3bb273;
  font-size: 30rpx;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.record-dot.paused {
  background: #fff3df;
  color: #c99b52;
}
.record-info {
  flex: 1;
  min-width: 0;
}
.record-title {
  display: block;
  font-size: 29rpx;
  font-weight: 700;
  color: #4a3f35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.record-sub {
  display: block;
  margin-top: 4rpx;
  font-size: 23rpx;
  color: #b3a492;
}
.record-stars {
  flex-shrink: 0;
  font-size: 26rpx;
  font-weight: 800;
  color: #c99b52;
}
.empty-row {
  padding: 30rpx 0;
  display: flex;
  justify-content: center;
}
.empty-text {
  font-size: 27rpx;
  color: #b3a492;
}

/* 数据 */
.meta-row {
  display: flex;
  justify-content: space-between;
  padding: 22rpx 0;
}
.meta-row + .meta-row {
  border-top: 2rpx solid #f7f3ec;
}
.meta-label {
  font-size: 27rpx;
  color: #8a8073;
}
.meta-value {
  font-size: 27rpx;
  font-weight: 700;
  color: #4a3f35;
}
.clear-btn {
  margin: 20rpx 0 28rpx;
  height: 96rpx;
  border-radius: 48rpx;
  background: #fdecec;
  display: flex;
  align-items: center;
  justify-content: center;
}
.clear-btn:active {
  transform: scale(0.98);
}
.clear-text {
  font-size: 30rpx;
  font-weight: 800;
  color: #e4573d;
}

.footer {
  display: flex;
  justify-content: center;
  padding: 10rpx 0 20rpx;
}
.footer-text {
  font-size: 25rpx;
  color: #c9bba7;
}
</style>

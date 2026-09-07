<template>
  <view class="page">
    <view class="header">
      <view class="title-wrap">
        <text class="title">课程地图</text>
        <text class="subtitle">选阶段，一课一课往上闯</text>
      </view>
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
        <view
          v-if="block.challenge && block.subject.id !== 'math'"
          class="block-quiz"
          :style="{ background: block.subject.color }"
          @tap="goLesson(block.challenge)"
        >
          <text class="block-quiz-text">⚡ 挑战</text>
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
          :style="{ background: u.bg }"
          @tap="goLesson(u)"
        >
          <image class="unit-icon" :src="u.icon" mode="aspectFit" />
          <text class="unit-title" :style="{ color: u.color }">{{ u.title }}</text>
          <text class="unit-sub">{{ u.subtitle }}</text>
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

    <view class="footer">
      <text class="footer-text">先学一学，再去挑战，星星是你的！⭐</text>
    </view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { getStorage } from '@/platform/storage.js'
import { updatePrefs } from '@/content/lowAge.js'
import { allowNavigate } from '@/platform/nav.js'
import { stageBlocks, lessonUrl, normalizeStage, STAGES } from '@/services/curriculum.js'

const explore = [
  { id: 'en', zh: '学英语', color: '#FF8C42', bg: '#FFF3E4', icon: '/static/img/subject-english.png' },
  { id: 'zh', zh: '学语文', color: '#E4573D', bg: '#FDEBE7', icon: '/static/img/subject-chinese.png' },
  { id: 'math', zh: '学数学', color: '#4D96FF', bg: '#E9F2FF', icon: '/static/img/subject-math.png' },
]

const stages = STAGES
const stage = ref('qimeng')
const blocks = computed(() => stageBlocks(stage.value))

onShow(() => {
  stage.value = normalizeStage(getStorage().get('prefs', {})?.stage || stage.value)
})

function setStage(id) {
  stage.value = normalizeStage(id)
  updatePrefs({ stage: stage.value })
}

function goLesson(lesson) {
  const url = lessonUrl(lesson)
  if (url && allowNavigate()) uni.navigateTo({ url })
}

function go(s) {
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
  font-size: 24rpx;
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
  text-overflow: ellipsis;
  white-space: nowrap;
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
.footer {
  display: flex;
  justify-content: center;
  padding: 44rpx 0 10rpx;
}
.footer-text {
  font-size: 26rpx;
  color: #c9bba7;
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

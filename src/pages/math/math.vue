<template>
  <view class="page">
    <PageTopBar class="topbar-page" title="学数学" title-size="42rpx" @back="goBack">
      <text class="total">{{ levels.length }} 个关卡</text>
    </PageTopBar>

    <view class="tip">
      <text class="tip-text">听题目，选答案，每关 10 道题</text>
    </view>

    <view
      v-for="lv in levels"
      :key="lv.id"
      class="level-card"
      :class="{ locked: isLocked(lessonIdOf(lv.id)), shake: shakeId === 'math-practice-l' + lv.id }"
      :style="{ background: lv.bg }"
      @tap="go(lv)"
    >
      <view class="level-left">
        <view class="level-num" :style="{ background: lv.color }">
          <text class="level-num-text">{{ isLocked(lessonIdOf(lv.id)) ? '🔒' : lv.id }}</text>
        </view>
        <view class="level-info">
          <text class="level-name" :style="{ color: lv.color }">{{ lv.name }}</text>
          <text class="level-desc">{{ lv.desc }}</text>
        </view>
      </view>
      <text class="go-icon">→</text>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { MATH_LEVELS } from '@/domain/mathgen.js'
import { lessonsOfSubject } from '@/content/catalog.js'
import { goBackOrHome } from '@/platform/nav.js'
import { lessonLocks } from '@/services/curriculum-app.js'
import PageTopBar from '@/components/page-top-bar.vue'

// 关卡 → 课程 id：带上 lessonId 才会记会话、记星、点亮图鉴。
// 旧入口不传 lessonId，从这里进去玩一整关等于没学（不落任何记录）。
const MATH_LESSONS = lessonsOfSubject('math')
function lessonOf(levelId) {
  return MATH_LESSONS.find((l) => l.ref?.kind === 'math-level' && Number(l.ref.id) === Number(levelId)) || null
}
function lessonIdOf(levelId) {
  return lessonOf(levelId)?.id || ''
}

const levels = ref(
  Object.values(MATH_LEVELS)
    .sort((a, b) => a.id - b.id)
    // 说明文案以课程目录 subtitle 为唯一真源（曾经手抄副本与目录漂移到 L7-9 两套说法）
    .map((lv) => ({ ...lv, desc: lessonOf(lv.id)?.subtitle || '' })),
)

// 路径软解锁：与课程页同一份口径（数学关卡即路径，阶段内顺序解锁）
const locks = ref(new Map())
const shakeId = ref('')
let lastShakeAt = 0
function refreshLocks() {
  locks.value = lessonLocks()
}
refreshLocks() // setup 先算一次：首帧不闪「全开放」
onShow(refreshLocks)
function isLocked(lessonId) {
  return lessonId && !!locks.value.get(lessonId)?.locked
}
function deny(lid) {
  const now = Date.now()
  if (now - lastShakeAt < 1000) return
  lastShakeAt = now
  shakeId.value = lid
  setTimeout(() => {
    if (shakeId.value === lid) shakeId.value = ''
  }, 600)
  uni.showToast({ title: '先完成前面的关卡 ✨', icon: 'none' })
}

function go(lv) {
  const lid = lessonIdOf(lv.id)
  if (isLocked(lid)) {
    deny('math-practice-l' + lv.id)
    return
  }
  uni.navigateTo({ url: `/pages/math/practice?level=${lv.id}` + (lid ? `&lessonId=${lid}` : '') })
}
function goBack() {
  goBackOrHome()
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: calc(30rpx + env(safe-area-inset-top)) 40rpx calc(50rpx + env(safe-area-inset-bottom));
  /* 底部再叠 --bottom-gap：微信内置浏览器的底部工具条会盖住最后一行关卡卡（见 App.vue） */
  padding: calc(30rpx + env(safe-area-inset-top)) 40rpx calc(50rpx + env(safe-area-inset-bottom) + var(--bottom-gap));
  box-sizing: border-box;
}
/* 顶栏：结构与样式在 components/page-top-bar.vue，这里只保留本页内边距 */
.topbar-page {
  padding: 8rpx 4rpx 8rpx;
}
.total {
  min-width: 84rpx;
  text-align: right;
  font-size: 28rpx;
  font-weight: 700;
  color: #a2917d;
  flex-shrink: 0;
}
.tip {
  margin: 16rpx 4rpx 30rpx;
}
.tip-text {
  font-size: 27rpx;
  color: #b3a492;
}
.level-card {
  border-radius: 48rpx;
  padding: 40rpx 32rpx;
  margin-bottom: 30rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 10rpx 28rpx rgba(120, 90, 40, 0.08);
}
.level-card:active {
  transform: scale(0.98);
}
.level-left {
  display: flex;
  align-items: center;
  gap: 26rpx;
  flex: 1;
  min-width: 0;
}
.level-num {
  width: 96rpx;
  height: 96rpx;
  border-radius: 32rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.level-num-text {
  color: #ffffff;
  font-size: 48rpx;
  font-weight: 800;
}
.level-info {
  min-width: 0;
}
.level-name {
  display: block;
  font-size: 40rpx;
  font-weight: 800;
  white-space: nowrap;
}
.level-desc {
  display: block;
  margin-top: 8rpx;
  font-size: 26rpx;
  color: #8a8073;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.go-icon {
  font-size: 44rpx;
  color: #c9bba7;
  font-weight: 700;
  flex-shrink: 0;
  margin-left: 16rpx;
}
/* 软解锁锁住态：整卡降存在感，点了抖一下提示 */
.level-card.locked {
  opacity: 0.55;
  filter: saturate(0.4);
}
.level-card.shake {
  animation: math-shake 0.45s;
}
@keyframes math-shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-14rpx); }
  50% { transform: translateX(14rpx); }
  75% { transform: translateX(-8rpx); }
}
</style>

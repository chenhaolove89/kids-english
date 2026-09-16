<template>
  <view class="page">
    <PageTopBar class="topbar-page" title="学英语" title-size="42rpx" @back="goBack">
      <text class="total">共 {{ totalWords }} 词</text>
    </PageTopBar>

    <view class="tip">
      <text class="tip-text">点卡片学单词，点 ⚡ 挑战听力</text>
    </view>

    <view v-for="lv in levels" :key="lv.id" class="level-block">
      <view class="level-header">
        <view class="level-badge" :style="{ background: lv.bg }">
          <image class="level-icon" :src="lv.icon" mode="aspectFit" />
          <text class="level-name" :style="{ color: lv.color }">{{ lv.zh }}</text>
        </view>
        <view class="level-quiz"
          :class="{ 'level-quiz-locked': isLocked('en-quiz-l' + lv.id) || !isAvailable('en-quiz-l' + lv.id), 'level-quiz-draft': !isAvailable('en-quiz-l' + lv.id) }"
          :style="{ background: isLocked('en-quiz-l' + lv.id) || !isAvailable('en-quiz-l' + lv.id) ? '#d8d2c6' : lv.color }" @tap="goQuiz(lv.id)">
          <text class="level-quiz-text">{{ !isAvailable('en-quiz-l' + lv.id) ? '🚧 筹备中' : isLocked('en-quiz-l' + lv.id) ? '🔒 挑战' : '⚡ 挑战' }}</text>
        </view>
      </view>

      <view class="grid">
        <view
          v-for="cat in catsOf(lv.id)"
          :key="cat.id"
          class="cat-card"
          :class="{ locked: isLocked('en-learn-' + cat.id), shake: shakeId === 'en-learn-' + cat.id }"
          :style="{ background: cat.bg }"
          @tap="goLearn(cat.id)"
        >
          <image class="cat-icon" :src="cat.icon" mode="aspectFit" />
          <text class="cat-zh" :style="{ color: cat.color }">{{ cat.zh }}</text>
          <text class="cat-en">{{ cat.en }}</text>
          <text class="cat-count">{{ cat.words.length }} 词</text>
          <text v-if="isLocked('en-learn-' + cat.id)" class="cat-lock">🔒</text>
          <!-- 平板专属：整类点读板入口（点卡片学词，点喇叭就是点读） -->
          <view v-if="isTablet" class="cat-board" @tap.stop="goBoard(cat.id)">
            <text class="cat-board-text">🔊</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import data from '@/data/words.json'
import { isCategoryHidden } from '@/content/lowAge.js'
import PageTopBar from '@/components/page-top-bar.vue'
import { goBackOrHome, isTabletDevice } from '@/platform/nav.js'
import { lessonLocks, lessonUrl, isVisibleLesson } from '@/services/curriculum-app.js'
import { getLesson } from '@/content/catalog.js'

// 点读板入口只在平板显示（触屏 + 短边 ≥560px）
const isTablet = ref(isTabletDevice())

const levels = ref(data.levels)
// 低龄模式隐藏的分类不计入顶部总数，与所见一致
const totalWords = computed(() =>
  data.categories.filter((c) => !isCategoryHidden(c.id)).reduce((s, c) => s + c.words.length, 0),
)

// 路径软解锁：与课程页同一份口径（onShow 时进度可能已变，每次都取最新）
const locks = ref(new Map())
const shakeId = ref('')
let lastShakeAt = 0
refreshLocks()
function refreshLocks() {
  locks.value = lessonLocks()
}
function isLocked(lessonId) {
  return !!locks.value.get(lessonId)?.locked
}
function isAvailable(lessonId) {
  return isVisibleLesson(getLesson(lessonId))
}
function deny(lessonId, tip) {
  const now = Date.now()
  if (now - lastShakeAt < 1000) return
  lastShakeAt = now
  shakeId.value = lessonId
  setTimeout(() => {
    if (shakeId.value === lessonId) shakeId.value = ''
  }, 600)
  uni.showToast({ title: tip, icon: 'none' })
}

function catsOf(levelId) {
  // 低龄模式：惊悚/暗黑分类不出现在自由探索页
  return data.categories.filter((c) => c.level === levelId && !isCategoryHidden(c.id) && isAvailable('en-learn-' + c.id))
}
function goLearn(id) {
  const lid = 'en-learn-' + id
  if (!isAvailable(lid)) {
    deny(lid, '内容准备中')
    return
  }
  if (isLocked(lid)) {
    deny(lid, '先完成前面的课，再来学它 ✨')
    return
  }
  const url = lessonUrl(getLesson(lid))
  if (url) uni.navigateTo({ url })
}
function goBoard(id) {
  // 点读板与进词卡同一把锁：锁着的分类不能从喇叭绕进去
  const lid = 'en-learn-' + id
  if (!isAvailable(lid)) {
    deny(lid, '内容准备中')
    return
  }
  if (isLocked(lid)) {
    deny(lid, '先完成前面的课，再来学它 ✨')
    return
  }
  uni.navigateTo({ url: `/pages/board/board?subject=en&cat=${id}` })
}
function goQuiz(levelId) {
  const lid = 'en-quiz-l' + levelId
  if (!isAvailable(lid)) {
    deny(lid, '内容准备中')
    return
  }
  if (isLocked(lid)) {
    deny(lid, '先学一学，再来挑战 🏆')
    return
  }
  const url = lessonUrl(getLesson(lid))
  if (url) uni.navigateTo({ url })
}
function goBack() {
  goBackOrHome()
}

onShow(refreshLocks)
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
}
.tip {
  margin: 16rpx 4rpx 30rpx;
}
.tip-text {
  font-size: 27rpx;
  color: #b3a492;
}
.level-block {
  margin-bottom: 46rpx;
}
.level-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 22rpx;
  padding: 0 4rpx;
}
.level-badge {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 14rpx 30rpx 14rpx 14rpx;
  border-radius: 40rpx;
  min-width: 0;
}
.level-icon {
  width: 60rpx;
  height: 60rpx;
}
.level-name {
  font-size: 36rpx;
  font-weight: 800;
}
.level-quiz {
  padding: 16rpx 30rpx;
  border-radius: 40rpx;
  box-shadow: 0 8rpx 20rpx rgba(120, 90, 40, 0.12);
  flex-shrink: 0;
}
.level-quiz:active {
  transform: scale(0.95);
}
.level-quiz-text {
  color: #ffffff;
  font-size: 30rpx;
  font-weight: 800;
  white-space: nowrap;
}
/* 挑战钮锁住态（软解锁：先学一学再来挑战） */
.level-quiz-locked {
  box-shadow: none;
}
/* 分类卡锁住态：与课程页同规（半透明+🔒，点了抖一下提示） */
.cat-card {
  position: relative;
}
.cat-card.locked {
  opacity: 0.45;
  filter: saturate(0.35);
}
.cat-lock {
  position: absolute;
  top: 12rpx;
  left: 14rpx;
  font-size: 34rpx;
  line-height: 1;
}
.cat-card.shake {
  animation: cat-shake 0.45s;
}
@keyframes cat-shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-14rpx); }
  50% { transform: translateX(14rpx); }
  75% { transform: translateX(-8rpx); }
}
.grid {
  display: flex;
  flex-wrap: wrap;
  gap: 28rpx;
}
.cat-card {
  position: relative;
  width: calc(25% - 21rpx);
  border-radius: 40rpx;
  padding: 30rpx 0 26rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-shadow: 0 8rpx 24rpx rgba(120, 90, 40, 0.07);
  box-sizing: border-box;
}
/* 平板点读入口：卡片右上角的小喇叭，@tap.stop 不与进词卡冲突 */
.cat-board {
  position: absolute;
  top: 12rpx;
  right: 12rpx;
  width: 52rpx;
  height: 52rpx;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4rpx 10rpx rgba(120, 90, 40, 0.15);
}
.cat-board:active {
  transform: scale(0.9);
}
.cat-board-text {
  font-size: 26rpx;
}
.cat-card:active {
  transform: scale(0.96);
}
.cat-icon {
  width: 110rpx;
  height: 110rpx;
}
.cat-zh {
  margin-top: 14rpx;
  font-size: 30rpx;
  font-weight: 800;
  white-space: nowrap;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cat-en {
  margin-top: 4rpx;
  font-size: 21rpx;
  line-height: 1.2;
  text-align: center;
  color: #8a8073;
  font-weight: 600;
  white-space: nowrap;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cat-count {
  margin-top: 6rpx;
  font-size: 21rpx;
  color: #a89d8e;
}
@media (max-width: 760px) {
  .cat-card {
    width: calc(33.33% - 19rpx);
  }
}
</style>

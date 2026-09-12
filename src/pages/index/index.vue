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
        <view class="level-quiz" :style="{ background: lv.color }" @tap="goQuiz(lv.id)">
          <text class="level-quiz-text">⚡ 挑战</text>
        </view>
      </view>

      <view class="grid">
        <view
          v-for="cat in catsOf(lv.id)"
          :key="cat.id"
          class="cat-card"
          :style="{ background: cat.bg }"
          @tap="goLearn(cat.id)"
        >
          <image class="cat-icon" :src="cat.icon" mode="aspectFit" />
          <text class="cat-zh" :style="{ color: cat.color }">{{ cat.zh }}</text>
          <text class="cat-en">{{ cat.en }}</text>
          <text class="cat-count">{{ cat.words.length }} 词</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import data from '@/data/words.json'
import { isCategoryHidden } from '@/content/lowAge.js'
import PageTopBar from '@/components/page-top-bar.vue'
import { goBackOrHome } from '@/platform/nav.js'

const levels = ref(data.levels)
// 低龄模式隐藏的分类不计入顶部总数，与所见一致
const totalWords = computed(() =>
  data.categories.filter((c) => !isCategoryHidden(c.id)).reduce((s, c) => s + c.words.length, 0),
)

function catsOf(levelId) {
  // 低龄模式：惊悚/暗黑分类不出现在自由探索页
  return data.categories.filter((c) => c.level === levelId && !isCategoryHidden(c.id))
}
function goLearn(id) {
  uni.navigateTo({ url: `/pages/learn/learn?subject=en&cat=${id}` })
}
function goQuiz(levelId) {
  uni.navigateTo({ url: `/pages/quiz/quiz?subject=en&level=${levelId}` })
}
function goBack() {
  goBackOrHome()
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: calc(30rpx + env(safe-area-inset-top)) 40rpx calc(50rpx + env(safe-area-inset-bottom));
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
.grid {
  display: flex;
  flex-wrap: wrap;
  gap: 28rpx;
}
.cat-card {
  width: calc(25% - 21rpx);
  border-radius: 40rpx;
  padding: 30rpx 0 26rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-shadow: 0 8rpx 24rpx rgba(120, 90, 40, 0.07);
  box-sizing: border-box;
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

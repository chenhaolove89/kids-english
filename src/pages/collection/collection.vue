<template>
  <view class="page">
    <view class="header">
      <view class="mascot-wrap">
        <image class="mascot" src="/static/img/star.png" mode="aspectFit" />
      </view>
      <view class="head-text">
        <text class="title">我的百宝箱</text>
        <view class="bubble"><text class="bubble-text">{{ bubbleText }}</text></view>
      </view>
    </view>

    <!-- 庆祝条：本次访问相对上次的新点亮 -->
    <view v-if="celebrate && celebrate.total > 0" class="celebrate">
      <text class="celebrate-text">🎉 本次新点亮 {{ celebrate.total }} 张卡片！</text>
    </view>

    <!-- 统计行 -->
    <view class="stats">
      <view class="stat-item">
        <text class="stat-num">⭐ {{ totalStars }}</text>
        <text class="stat-label">小星星</text>
      </view>
      <view class="stat-item">
        <text class="stat-num">{{ counts.enMastered }}/{{ enTotalWords }}</text>
        <text class="stat-label">英语掌握</text>
      </view>
      <view class="stat-item">
        <text class="stat-num">{{ counts.zhMastered }}/{{ zhTotalChars }}</text>
        <text class="stat-label">汉字掌握</text>
      </view>
      <view class="stat-item">
        <text class="stat-num">{{ counts.zhWordsMastered }}/{{ zhTotalWords }}</text>
        <text class="stat-label">词语掌握</text>
      </view>
      <view class="stat-item">
        <text class="stat-num">{{ counts.mathDone }}/{{ mathLessons.length }}</text>
        <text class="stat-label">数学徽章</text>
      </view>
    </view>

    <!-- 空态引导：什么都还没点亮 -->
    <view v-if="isEmpty" class="empty-card" @tap="goLearn">
      <text class="empty-emoji">📖</text>
      <view class="empty-info">
        <text class="empty-title">还没有点亮的卡片</text>
        <text class="empty-sub">先去学一课，回来就能看到它们亮起来！</text>
      </view>
      <text class="empty-go">去学习 →</text>
    </view>

    <template v-else>
      <!-- 三段切换 -->
      <view class="seg-row">
        <view v-for="t in tabs" :key="t.id" class="seg-chip" :class="{ active: tab === t.id }" @tap="tab = t.id">
          <text class="seg-emoji">{{ t.emoji }}</text>
          <text class="seg-name">{{ t.name }}</text>
        </view>
      </view>

      <!-- 英语图鉴：按级别分组 -->
      <scroll-view v-if="tab === 'en'" class="list" scroll-y>
        <view v-for="group in enGroups" :key="group.level.id" class="group">
          <view class="group-head">
            <text class="group-name" :style="{ color: group.level.color }">{{ group.level.zh }}</text>
            <text class="group-sub">Level {{ group.level.id }}</text>
          </view>
          <view class="cat-grid">
            <view
              v-for="c in group.cats"
              :key="c.id"
              class="cat-card"
              :class="{ dim: c.progress.mastered === 0 && c.progress.seen === 0, done: c.progressComplete }"
              :style="{ background: c.bg }"
              @tap="openDetail('en', c)"
            >
              <text v-if="c.progressComplete" class="cat-trophy">🏆</text>
              <image class="cat-icon" :src="c.icon" mode="aspectFit" />
              <text class="cat-name">{{ c.zh }}</text>
              <text class="cat-prog" :style="{ color: c.color }">{{ c.progress.mastered }}/{{ c.progress.total }}</text>
            </view>
          </view>
        </view>
      </scroll-view>

      <!-- 汉字图鉴：按级别 -->
      <scroll-view v-if="tab === 'zh'" class="list" scroll-y>
        <view class="cat-grid cat-grid-zh">
          <view
            v-for="g in zhGroups"
            :key="g.level.id"
            class="cat-card"
            :class="{ dim: g.progress.mastered === 0 && g.progress.seen === 0, done: g.progressComplete }"
            :style="{ background: g.level.bg }"
            @tap="openDetail('zh', g)"
          >
            <text v-if="g.progressComplete" class="cat-trophy">🏆</text>
            <image class="cat-icon" :src="g.level.icon" mode="aspectFit" />
            <text class="cat-name">识字 · {{ g.level.zh }}</text>
            <text class="cat-prog" :style="{ color: g.level.color }">{{ g.progress.mastered }}/{{ g.progress.total }}</text>
          </view>
        </view>
      </scroll-view>

      <!-- 词语图鉴：按级别分组的分类卡（与英语同图，点亮独立口径） -->
      <scroll-view v-if="tab === 'zhWords'" class="list" scroll-y>
        <view v-for="group in zhWordGroups" :key="group.level.id" class="group">
          <view class="group-head">
            <text class="group-name" :style="{ color: group.level.color }">{{ group.level.zh }}</text>
            <text class="group-sub">Level {{ group.level.id }}</text>
          </view>
          <view class="cat-grid">
            <view
              v-for="c in group.cats"
              :key="c.id"
              class="cat-card"
              :class="{ dim: c.progress.mastered === 0 && c.progress.seen === 0, done: c.progressComplete }"
              :style="{ background: c.bg }"
              @tap="openDetail('zhWords', c)"
            >
              <text v-if="c.progressComplete" class="cat-trophy">🏆</text>
              <image class="cat-icon" :src="c.icon" mode="aspectFit" />
              <text class="cat-name">{{ c.zh }}</text>
              <text class="cat-prog" :style="{ color: c.color }">{{ c.progress.mastered }}/{{ c.progress.total }}</text>
            </view>
          </view>
        </view>
      </scroll-view>

      <!-- 数学徽章 -->
      <scroll-view v-if="tab === 'math'" class="list" scroll-y>
        <view class="badge-grid">
          <view
            v-for="m in mathBadges"
            :key="m.lesson.id"
            class="badge-card"
            :class="{ 'badge-done': m.done }"
          >
            <text class="badge-ribbon">{{ m.done ? '✨' : '？' }}</text>
            <image class="badge-icon" :src="m.lesson.icon" mode="aspectFit" :class="{ gray: !m.done }" />
            <text class="badge-title">{{ m.lesson.title }}</text>
            <text class="badge-stars">{{ m.done ? starsBar(m.stars) : '未完成' }}</text>
          </view>
        </view>
      </scroll-view>
    </template>

    <!-- 分类详情浮层 -->
    <view v-if="detail" class="overlay" @tap="closeDetail">
      <view class="sheet" @tap.stop>
        <view class="sheet-head">
          <view class="sheet-back" @tap="closeDetail"><text class="sheet-back-icon">←</text></view>
          <text class="sheet-title">{{ detail.title }}</text>
          <text class="sheet-prog">⭐ {{ detail.progress.mastered }}/{{ detail.progress.total }}</text>
        </view>
        <scroll-view class="sheet-body" scroll-y>
          <view class="tile-grid">
            <view
              v-for="t in detail.tiles"
              :key="t.id"
              class="tile"
              :class="'tile-' + t.state"
              @tap="tapTile(t)"
            >
              <template v-if="t.state !== 'locked'">
                <image class="tile-img" :src="t.image" mode="aspectFit" />
                <text class="tile-main">{{ t.main }}</text>
                <text class="tile-sub">{{ t.sub }}</text>
                <text v-if="t.state === 'mastered'" class="tile-star">⭐</text>
              </template>
              <template v-else>
                <text class="tile-locked">?</text>
              </template>
            </view>
          </view>
        </scroll-view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import enData from '@/data/words.json'
import zhData from '@/data/hanzi.json'
import { LESSONS } from '@/content/catalog.js'
import { isCategoryHidden, updatePrefs } from '@/content/lowAge.js'
import { getStorage } from '@/platform/storage.js'
import { playEn, play } from '@/platform/audio.js'
import { starsText as starsBar } from '@/domain/progress.js'
import { progressOf, isCategoryComplete, celebration } from '@/domain/collection.js'
import { getCollectionService } from '@/services/collection.js'
import { getProgressService } from '@/services/progress.js'

const tabs = [
  { id: 'en', name: '英语图鉴', emoji: '🔤' },
  { id: 'zh', name: '汉字图鉴', emoji: '🈵' },
  { id: 'zhWords', name: '词语图鉴', emoji: '📖' },
  { id: 'math', name: '数学徽章', emoji: '🔢' },
]
const tab = ref('en')
const counts = ref({ enSeen: 0, enMastered: 0, zhSeen: 0, zhMastered: 0, zhWordsSeen: 0, zhWordsMastered: 0, mathDone: 0 })
const celebrate = ref(null)
const totalStars = ref(0)
const detail = ref(null)
// 每次进入页面刷新点亮集合的快照（record* 只增不减，这里只读）
const coll = ref({ en: { seen: [], mastered: [] }, zh: { seen: [], mastered: [] }, zhWords: { seen: [], mastered: [] }, math: { done: [] } })

const enTotalWords = computed(() =>
  enData.categories.filter((c) => !isCategoryHidden(c.id)).reduce((n, c) => n + c.words.length, 0),
)
const zhTotalChars = computed(() => zhData.levels.reduce((n, l) => n + l.chars.length, 0))
// 语文词语总量：catalog 里有 zh 词语课的分类才算（与课程/音频覆盖范围同一口径）
const zhWordCatIds = new Set(
  LESSONS.filter((l) => l.subject === 'zh' && l.ref?.kind === 'en-category').map((l) => l.ref.id),
)
const zhTotalWords = computed(() =>
  enData.categories.filter((c) => zhWordCatIds.has(c.id) && !isCategoryHidden(c.id)).reduce((n, c) => n + c.words.length, 0),
)
const mathLessons = computed(() => LESSONS.filter((l) => l.subject === 'math' && l.kind === 'challenge' && l.status === 'available'))

const isEmpty = computed(
  () => counts.value.enSeen === 0 && counts.value.zhSeen === 0 && counts.value.zhWordsSeen === 0 && counts.value.mathDone === 0,
)

const bubbleText = computed(() => {
  const lit = counts.value.enSeen + counts.value.zhSeen + counts.value.zhWordsSeen
  if (lit === 0) return '先去学一课，点亮第一张卡片吧！'
  if (lit < 20) return '哇，已经开始收集啦，继续加油！'
  if (lit < 100) return '收集得不错，星星都变成图鉴啦！'
  return '小小收藏家！全部图鉴等着你集齐～'
})

/** 英语：按级别分组的分类卡（隐藏分类不计入） */
const enGroups = computed(() => {
  const seen = new Set(coll.value.en.seen)
  const mastered = new Set(coll.value.en.mastered)
  return enData.levels
    .map((lv) => ({
      level: lv,
      cats: enData.categories
        .filter((c) => c.level === lv.id && !isCategoryHidden(c.id))
        .map((c) => {
          const ids = c.words.map((w) => w.id)
          const p = progressOf(ids, seen, mastered)
          return { id: c.id, zh: c.zh, en: c.en, color: c.color, bg: c.bg, icon: c.icon, words: c.words, progress: p, progressComplete: isCategoryComplete(p) }
        }),
    }))
    .filter((g) => g.cats.length)
})

/** 汉字：4 个级别卡 */
const zhGroups = computed(() => {
  const seen = new Set(coll.value.zh.seen)
  const mastered = new Set(coll.value.zh.mastered)
  return zhData.levels.map((lv) => {
    const ids = lv.chars.map((h) => h.id)
    const p = progressOf(ids, seen, mastered)
    return { level: lv, chars: lv.chars, progress: p, progressComplete: isCategoryComplete(p) }
  })
})

/** 语文词语：与英语同图同分组，点亮读 zhWords 桶；分类范围与词语课一致 */
const zhWordGroups = computed(() => {
  const seen = new Set(coll.value.zhWords.seen)
  const mastered = new Set(coll.value.zhWords.mastered)
  return enData.levels
    .map((lv) => ({
      level: lv,
      cats: enData.categories
        .filter((c) => c.level === lv.id && zhWordCatIds.has(c.id) && !isCategoryHidden(c.id))
        .map((c) => {
          const ids = c.words.map((w) => w.id)
          const p = progressOf(ids, seen, mastered)
          return { id: c.id, zh: c.zh, en: c.en, color: c.color, bg: c.bg, icon: c.icon, words: c.words, progress: p, progressComplete: isCategoryComplete(p) }
        }),
    }))
    .filter((g) => g.cats.length)
})

const mathBadges = computed(() => {
  const doneSet = new Set(coll.value.math.done)
  const progMap = getProgressService().lessonProgressMap()
  return mathLessons.value.map((l) => ({
    lesson: l,
    done: doneSet.has(l.id),
    stars: progMap.get(l.id)?.bestStars || 0,
  }))
})

onShow(() => {
  const svc = getCollectionService()
  coll.value = svc.get()
  const cur = svc.counts()
  const prev = getStorage().get('prefs', {})?.lastCollectionCounts
  celebrate.value = prev ? celebration(prev, cur) : null
  updatePrefs({ lastCollectionCounts: cur })
  counts.value = cur
  totalStars.value = getProgressService().summary().totalStars
  detail.value = null
})

function openDetail(kind, group) {
  if (kind === 'zhWords') {
    // 语文词语卡：主字段中文词、副字段英文，点击播中文
    const seen = new Set(coll.value.zhWords.seen)
    const mastered = new Set(coll.value.zhWords.mastered)
    detail.value = {
      kind,
      title: `词语 · ${group.zh}`,
      progress: group.progress,
      tiles: group.words.map((w) => ({
        id: w.id,
        state: seen.has(w.id) ? (mastered.has(w.id) ? 'mastered' : 'seen') : 'locked',
        main: w.zh,
        sub: w.en,
        image: w.image,
        audio: w.zhAudio || w.audio,
      })),
    }
    return
  }
  if (kind === 'en') {
    const seen = new Set(coll.value.en.seen)
    const mastered = new Set(coll.value.en.mastered)
    detail.value = {
      kind,
      title: `${group.zh} · ${group.en}`,
      progress: group.progress,
      tiles: group.words.map((w) => ({
        id: w.id,
        state: seen.has(w.id) ? (mastered.has(w.id) ? 'mastered' : 'seen') : 'locked',
        main: w.en,
        sub: w.zh,
        image: w.image,
        audio: w.audio,
      })),
    }
  } else {
    const seen = new Set(coll.value.zh.seen)
    const mastered = new Set(coll.value.zh.mastered)
    detail.value = {
      kind,
      title: `识字 · ${group.level.zh}`,
      progress: group.progress,
      tiles: group.chars.map((h) => ({
        id: h.id,
        state: seen.has(h.id) ? (mastered.has(h.id) ? 'mastered' : 'seen') : 'locked',
        main: h.char,
        sub: h.pinyin,
        image: h.emoji || group.level.icon,
        audio: h.audio,
      })),
    }
  }
}

function closeDetail() {
  detail.value = null
}

function tapTile(t) {
  if (t.state === 'locked') {
    uni.showToast({ title: '还没学过，先去学一学吧 📖', icon: 'none' })
    return
  }
  if (detail.value?.kind === 'en') playEn(t.audio)
  else play(t.audio)
}

function goLearn() {
  uni.switchTab({ url: '/pages/map/map' })
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  min-height: 100svh;
  padding: calc(30rpx + env(safe-area-inset-top)) 40rpx calc(40rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}
.header {
  display: flex;
  align-items: center;
  gap: 24rpx;
  padding: 10rpx 8rpx 26rpx;
}
.mascot-wrap {
  width: 110rpx;
  height: 110rpx;
  border-radius: 50%;
  background: #fff3df;
  box-shadow: 0 10rpx 24rpx rgba(120, 90, 40, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.mascot {
  width: 76rpx;
  height: 76rpx;
}
.head-text {
  flex: 1;
  min-width: 0;
}
.title {
  display: block;
  font-size: 52rpx;
  font-weight: 800;
  color: #4a3f35;
}
.bubble {
  margin-top: 10rpx;
  align-self: flex-start;
  background: #ffffff;
  border-radius: 28rpx 28rpx 28rpx 8rpx;
  padding: 12rpx 24rpx;
  box-shadow: 0 6rpx 16rpx rgba(120, 90, 40, 0.08);
}
.bubble-text {
  font-size: 26rpx;
  color: #8a8073;
}

/* 庆祝条 */
.celebrate {
  background: linear-gradient(90deg, #ffd76e, #ffb84d);
  border-radius: 36rpx;
  padding: 20rpx 30rpx;
  margin-bottom: 24rpx;
  box-shadow: 0 10rpx 24rpx rgba(200, 140, 40, 0.25);
}
.celebrate-text {
  font-size: 32rpx;
  font-weight: 800;
  color: #6b4a17;
}

/* 统计行 */
.stats {
  display: flex;
  gap: 12rpx;
  margin-bottom: 30rpx;
}
.stat-item {
  flex: 1;
  min-width: 0;
  background: #ffffff;
  border-radius: 32rpx;
  padding: 18rpx 4rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-shadow: 0 8rpx 24rpx rgba(120, 90, 40, 0.07);
}
.stat-num {
  font-size: 30rpx;
  font-weight: 800;
  color: #4a3f35;
  white-space: nowrap;
}
.stat-label {
  margin-top: 6rpx;
  font-size: 20rpx;
  color: #a89d8e;
  white-space: nowrap;
}

/* 空态 */
.empty-card {
  background: #ffffff;
  border-radius: 44rpx;
  padding: 34rpx;
  display: flex;
  align-items: center;
  gap: 24rpx;
  border: 4rpx dashed #ffb84d;
  box-shadow: 0 10rpx 26rpx rgba(120, 90, 40, 0.08);
}
.empty-card:active {
  transform: scale(0.98);
}
.empty-emoji {
  font-size: 60rpx;
}
.empty-info {
  flex: 1;
  min-width: 0;
}
.empty-title {
  display: block;
  font-size: 34rpx;
  font-weight: 800;
  color: #4a3f35;
}
.empty-sub {
  display: block;
  margin-top: 6rpx;
  font-size: 25rpx;
  color: #a2917d;
}
.empty-go {
  font-size: 29rpx;
  font-weight: 800;
  color: #c99b52;
  flex-shrink: 0;
}

/* 四段切换：图标在上文字在下，横排四枚才不挤 */
.seg-row {
  display: flex;
  gap: 14rpx;
  margin-bottom: 26rpx;
}
.seg-chip {
  flex: 1;
  min-width: 0;
  background: #ffffff;
  border-radius: 28rpx;
  padding: 14rpx 4rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4rpx;
  border: 4rpx solid transparent;
  box-sizing: border-box;
  box-shadow: 0 6rpx 18rpx rgba(120, 90, 40, 0.07);
}
.seg-chip.active {
  border-color: #ffb84d;
  background: #fff3df;
}
.seg-chip:active {
  transform: scale(0.96);
}
.seg-emoji {
  font-size: 38rpx;
  line-height: 1.15;
}
.seg-name {
  font-size: 24rpx;
  font-weight: 800;
  color: #4a3f35;
  white-space: nowrap;
}

.list {
  flex: 1;
  min-height: 0;
}
.group {
  margin-bottom: 30rpx;
}
.group-head {
  display: flex;
  align-items: baseline;
  gap: 14rpx;
  padding: 6rpx 8rpx 16rpx;
}
.group-name {
  font-size: 32rpx;
  font-weight: 800;
}
.group-sub {
  font-size: 22rpx;
  color: #b3a492;
}

/* 分类卡 */
.cat-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 20rpx;
}
.cat-card {
  position: relative;
  width: calc(33.33% - 13.4rpx);
  border-radius: 36rpx;
  padding: 22rpx 8rpx 18rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-shadow: 0 8rpx 24rpx rgba(120, 90, 40, 0.07);
  box-sizing: border-box;
}
.cat-card:active {
  transform: scale(0.96);
}
.cat-card.dim {
  opacity: 0.55;
  filter: saturate(0.6);
}
.cat-card.done {
  border: 4rpx solid #ffb84d;
}
.cat-trophy {
  position: absolute;
  top: -14rpx;
  right: -6rpx;
  font-size: 40rpx;
}
.cat-icon {
  width: 88rpx;
  height: 88rpx;
}
.cat-name {
  margin-top: 10rpx;
  font-size: 26rpx;
  font-weight: 800;
  color: #4a3f35;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cat-prog {
  margin-top: 4rpx;
  font-size: 22rpx;
  font-weight: 700;
}
.cat-grid-zh .cat-card {
  width: calc(50% - 10rpx);
}
.cat-grid-zh .cat-icon {
  width: 104rpx;
  height: 104rpx;
}

/* 数学徽章 */
.badge-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 24rpx;
}
.badge-card {
  width: calc(50% - 12rpx);
  background: #ffffff;
  border-radius: 40rpx;
  padding: 30rpx 12rpx 24rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  border: 4rpx dashed #d8cdbd;
  box-sizing: border-box;
  position: relative;
}
.badge-card.badge-done {
  border: 4rpx solid #ffb84d;
  background: #fff3df;
}
.badge-ribbon {
  position: absolute;
  top: 14rpx;
  right: 20rpx;
  font-size: 34rpx;
}
.badge-icon {
  width: 110rpx;
  height: 110rpx;
}
.badge-icon.gray {
  filter: grayscale(1);
  opacity: 0.4;
}
.badge-title {
  margin-top: 12rpx;
  font-size: 28rpx;
  font-weight: 800;
  color: #4a3f35;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.badge-stars {
  margin-top: 6rpx;
  font-size: 24rpx;
  color: #c99b52;
}

/* 详情浮层 */
.overlay {
  position: fixed;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  background: rgba(60, 45, 25, 0.45);
  display: flex;
  align-items: flex-end;
  z-index: 99;
}
.sheet {
  width: 100%;
  max-height: 82vh;
  background: #fff8ec;
  border-radius: 56rpx 56rpx 0 0;
  display: flex;
  flex-direction: column;
  padding-bottom: env(safe-area-inset-bottom);
}
.sheet-head {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 30rpx 34rpx 20rpx;
}
.sheet-back {
  width: 76rpx;
  height: 76rpx;
  border-radius: 50%;
  background: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6rpx 16rpx rgba(120, 90, 40, 0.1);
  flex-shrink: 0;
}
.sheet-back-icon {
  font-size: 40rpx;
  font-weight: 700;
  color: #4a3f35;
}
.sheet-title {
  flex: 1;
  min-width: 0;
  font-size: 36rpx;
  font-weight: 800;
  color: #4a3f35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sheet-prog {
  font-size: 28rpx;
  font-weight: 800;
  color: #c99b52;
  flex-shrink: 0;
}
.sheet-body {
  flex: 1;
  min-height: 0;
  padding: 0 26rpx 30rpx;
}
.tile-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 18rpx;
}
.tile {
  position: relative;
  width: calc(33.33% - 12rpx);
  background: #ffffff;
  border-radius: 32rpx;
  padding: 18rpx 8rpx 14rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-sizing: border-box;
  box-shadow: 0 6rpx 18rpx rgba(120, 90, 40, 0.06);
}
.tile:active {
  transform: scale(0.95);
}
.tile-img {
  width: 96rpx;
  height: 96rpx;
}
.tile-main {
  margin-top: 8rpx;
  font-size: 26rpx;
  font-weight: 800;
  color: #4a3f35;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tile-sub {
  margin-top: 2rpx;
  font-size: 21rpx;
  color: #8a8073;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tile-star {
  position: absolute;
  top: 6rpx;
  right: 10rpx;
  font-size: 28rpx;
}
.tile-locked {
  width: 96rpx;
  height: 96rpx;
  border-radius: 28rpx;
  background: #ece5d8;
  color: #b3a492;
  font-size: 52rpx;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 12rpx 0 34rpx;
}
.tile-seen {
  opacity: 0.92;
}
.tile-mastered {
  border: 3rpx solid #ffd76e;
}
</style>

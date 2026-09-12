<template>
  <view class="page">
    <PageTopBar class="topbar-page" :title="catZh ? catZh + ' · 点读' : '点读板'" @back="goBack">
      <text class="count">{{ items.length }} 词</text>
    </PageTopBar>

    <!-- 音频预载进度：慢网下孩子能看到声音在来的路上 -->
    <view v-if="audioTotal > 0 && audioDone < audioTotal" class="load-bar">
      <view class="load-fill" :style="{ width: audioPercent + '%' }"></view>
    </view>

    <view class="hint"><text class="hint-text">点一点，听一听 👇</text></view>

    <view class="board">
      <view
        v-for="(w, i) in items"
        :key="w.id"
        class="word-card"
        :class="['tone' + i % 6, { playing: activeId === w.id }]"
        :style="{ animationDelay: i * 40 + 'ms' }"
        @tap="tapWord(w)"
      >
        <image class="word-img" :src="w.image" mode="aspectFit" />
        <text class="word-label" :style="{ color: LABEL_COLORS[i % 6] }">{{ w.label }}</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { onLoad, onUnload } from '@dcloudio/uni-app'
import PageTopBar from '@/components/page-top-bar.vue'
import { play, preloadWithProgress, preloadEnWithProgress, accentEnSrc } from '@/platform/audio.js'
import { goBackOrHome } from '@/platform/nav.js'
import { resolveEnCategory } from '@/content/adapters.js'
import { isCategoryHidden } from '@/content/lowAge.js'

// 卡片马卡龙底色循环：与数学拼贴/古诗书单同一族暖色
const LABEL_COLORS = ['#E4573D', '#3BB273', '#4D96FF', '#D6336C', '#8A6BD1', '#E8A33D']

const catZh = ref('')
const items = ref([])
const activeId = ref('')
const audioDone = ref(0)
const audioTotal = ref(0)
const audioPercent = computed(() => (audioTotal.value ? Math.round((audioDone.value / audioTotal.value) * 100) : 0))

onLoad((query) => {
  const subject = query.subject === 'zh' ? 'zh' : 'en'
  const c = resolveEnCategory(query.cat)
  if (!c || !c.words?.length || isCategoryHidden(query.cat)) {
    uni.showToast({ title: '内容准备中', icon: 'none' })
    setTimeout(() => goBackOrHome(), 600)
    return
  }
  catZh.value = c.zh
  items.value = c.words.map((w) => ({
    id: w.id,
    label: subject === 'zh' ? w.zh : w.en,
    image: w.image,
    // 语文词语课用中文音（与词语课同源），英语按所选口音走统一出口
    audio: subject === 'zh' ? w.zhAudio || w.audio : accentEnSrc(w.audio),
  }))
  // 预载整类词的发音：板子上所有词都可能被点到
  const srcs = [...new Set(items.value.map((w) => w.audio).filter(Boolean))]
  audioTotal.value = srcs.length
  const onProgress = (done) => {
    audioDone.value = done
  }
  if (subject === 'en') preloadEnWithProgress(srcs, onProgress)
  else preloadWithProgress(srcs, onProgress)
})

onUnload(() => {
  activeId.value = ''
})

function tapWord(w) {
  if (!w.audio) return
  activeId.value = w.id
  play(w.audio, () => {
    if (activeId.value === w.id) activeId.value = ''
  })
}

function goBack() {
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
}
.topbar-page {
  padding: 0 8rpx 20rpx;
}
.count {
  font-size: 28rpx;
  font-weight: 700;
  color: #a2917d;
}
.load-bar {
  height: 10rpx;
  border-radius: 6rpx;
  background: #f0e4d7;
  overflow: hidden;
  margin: 0 8rpx 14rpx;
}
.load-fill {
  height: 100%;
  background: #ffb84d;
  transition: width 0.2s;
}
.hint {
  text-align: center;
  padding: 6rpx 0 18rpx;
}
.hint-text {
  font-size: 28rpx;
  color: #a2917d;
  font-weight: 600;
}
/* 点读网格：平板上 4-6 列自适应（px 网格随屏宽自动增减列数） */
.board {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 18px;
}
.word-card {
  border-radius: 28px;
  padding: 18px 8px 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  box-shadow: 0 8rpx 20rpx rgba(120, 90, 40, 0.1);
  border: 3px solid transparent;
  animation: pop-in 0.35s backwards;
  transition: transform 0.15s, border-color 0.15s;
}
.word-card:active {
  transform: scale(0.94);
}
.word-card.playing {
  border-color: #ffb84d;
  transform: scale(1.05);
  box-shadow: 0 10rpx 26rpx rgba(240, 165, 0, 0.35);
}
@keyframes pop-in {
  from {
    opacity: 0;
    transform: scale(0.6);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
.tone0 { background: #ffe8cc; }
.tone1 { background: #e3f6e8; }
.tone2 { background: #e3eeff; }
.tone3 { background: #fbe3ec; }
.tone4 { background: #f1ecfb; }
.tone5 { background: #fcf1dd; }
.word-img {
  width: 72px;
  height: 72px;
}
.word-label {
  font-size: 20px;
  font-weight: 800;
}
</style>

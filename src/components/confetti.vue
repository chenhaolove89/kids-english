<template>
  <view v-if="show" class="confetti-layer" aria-hidden="true">
    <text
      v-for="p in parts"
      :key="p.key"
      class="confetti-bit"
      :style="{
        left: p.left + '%',
        background: p.color,
        width: p.w + 'rpx',
        height: p.h + 'rpx',
        borderRadius: p.round ? '50%' : '6rpx',
        animationDelay: p.delay + 'ms',
        animationDuration: p.dur + 'ms',
      }"
    />
  </view>
</template>

<script setup>
/**
 * 过关庆祝彩带：纯 CSS 粒子（无依赖、无图片），show 置真时撒一把。
 * 颜色取应用调色板；每次显示重新随机落点/延迟/形状，重复过关不重样。
 * prefers-reduced-motion 下粒子直接隐藏（与 App.vue 的减弱动态约定一致）。
 */
import { ref, watch } from 'vue'

const props = defineProps({
  show: { type: Boolean, default: false },
})

const COLORS = ['#FF8C42', '#FFB84D', '#3BB273', '#4D96FF', '#9B5DE5', '#F76BA8', '#12B886']
const parts = ref([])

function burst() {
  const list = []
  for (let i = 0; i < 28; i++) {
    list.push({
      key: i + '-' + Math.random().toString(36).slice(2, 7),
      left: Math.round(Math.random() * 100),
      color: COLORS[i % COLORS.length],
      w: 10 + Math.round(Math.random() * 12),
      h: 16 + Math.round(Math.random() * 18),
      round: Math.random() < 0.35,
      delay: Math.round(Math.random() * 420),
      dur: 1300 + Math.round(Math.random() * 700),
    })
  }
  parts.value = list
}

watch(
  () => props.show,
  (v) => {
    if (v) burst()
  },
)
</script>

<style scoped>
.confetti-layer {
  position: fixed;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 60;
}
.confetti-bit {
  position: absolute;
  top: 0;
  animation-name: confetti-fall;
  animation-timing-function: ease-in;
  animation-fill-mode: both;
}
@keyframes confetti-fall {
  0% {
    transform: translateY(-8vh) rotate(0deg);
    opacity: 1;
  }
  100% {
    transform: translateY(108vh) rotate(660deg);
    opacity: 0.85;
  }
}
@media (prefers-reduced-motion: reduce) {
  .confetti-bit {
    animation: none;
    opacity: 0;
  }
}
</style>

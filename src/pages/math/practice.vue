<template>
  <view class="page">
    <view class="topbar">
      <view class="back" @tap="goBack">
        <text class="back-icon">←</text>
      </view>
      <text class="title">{{ level.name }}</text>
      <text class="score">⭐ {{ score }}</text>
    </view>

    <template v-if="!finished">
      <view class="round-info">第 {{ qIdx + 1 }} / {{ questions.length }} 题（点题目可以再听一遍）</view>

      <view class="stage" @tap="respeak">
        <!-- 点数题 -->
        <view v-if="q.kind === 'count'" class="dots">
          <text v-for="(e, i) in q.emojiList" :key="i" class="dot-emoji">{{ e }}</text>
        </view>

        <!-- 看图加法：两组圆点 -->
        <view v-else-if="q.kind === 'add'" class="groups">
          <view class="group">
            <text v-for="(e, i) in q.leftEmojis" :key="'l' + i" class="dot-emoji">{{ e }}</text>
          </view>
          <text class="op-symbol" :style="{ color: level.color }">+</text>
          <view class="group">
            <text v-for="(e, i) in q.rightEmojis" :key="'r' + i" class="dot-emoji">{{ e }}</text>
          </view>
        </view>

        <!-- 看图减法：划掉一部分 -->
        <view v-else-if="q.kind === 'sub'" class="groups">
          <view class="group">
            <text
              v-for="(e, i) in q.leftEmojis"
              :key="'s' + i"
              class="dot-emoji"
              :class="{ faded: i >= q.leftEmojis.length - q.takeAway }"
            >{{ e }}</text>
          </view>
          <text class="op-symbol" :style="{ color: level.color }">−</text>
          <view class="group">
            <text v-for="(e, i) in q.rightEmojis" :key="'t' + i" class="dot-emoji">{{ e }}</text>
          </view>
        </view>

        <!-- 比一比：两边直接点 -->
        <view v-else-if="q.kind === 'compare'" class="compare">
          <view
            v-for="(g, gi) in q.groups"
            :key="gi"
            class="compare-card"
            :class="{ right: flash === String(gi) && isRight, wrong: flash === String(gi) && !isRight, shake: flash === String(gi) && !isRight }"
            @tap.stop="pickById(String(gi))"
          >
            <template v-if="g.emojis">
              <text v-for="(e, i) in g.emojis" :key="i" class="dot-emoji">{{ e }}</text>
            </template>
            <text v-else class="compare-num">{{ g.n }}</text>
          </view>
        </view>

        <!-- 数字算式 / 数列 / 听音 -->
        <view v-else class="equation-wrap">
          <text v-if="q.kind === 'listen'" class="listen-icon">🔊</text>
          <text v-else class="equation" :class="{ 'equation-seq': q.kind === 'sequence' }">{{ q.display }}</text>
        </view>
      </view>

      <!-- 选项 -->
      <view v-if="q.kind !== 'compare'" class="options" :class="'opts-' + q.options.length">
        <view
          v-for="opt in q.options"
          :key="opt.id"
          class="opt"
          :class="{ right: flash === opt.id && isRight, wrong: flash === opt.id && !isRight, shake: flash === opt.id && !isRight }"
          @tap="pickById(opt.id)"
        >
          <text class="opt-text">{{ opt.label }}</text>
        </view>
      </view>
    </template>

    <template v-else>
      <view class="result">
        <text class="result-emoji">🎉</text>
        <text class="result-score">答对 {{ score }} / {{ questions.length }} 题</text>
        <text class="result-stars">{{ starsText }}</text>
        <view class="result-btn" @tap="restart">
          <text class="result-btn-text">再玩一次</text>
        </view>
        <view class="result-btn ghost" @tap="goBack">
          <text class="result-btn-text ghost-text">返回关卡</text>
        </view>
      </view>
    </template>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { onLoad, onUnload } from '@dcloudio/uni-app'
import { playSeq, preload, stopSeq } from '@/utils/player.js'

const A = '/static/audio'
const EMOJIS = ['🍎', '🍌', '🐤', '🌸', '⭐', '🐠', '🍓', '🚗', '🧸', '🍇', '🍀', '🎈']
const LEVELS = {
  1: { id: 1, name: '认识数字', color: '#3BB273', bg: '#E3F6E8' },
  2: { id: 2, name: '十以内加减', color: '#4D96FF', bg: '#E3EEFF' },
  3: { id: 3, name: '二十以内', color: '#FF8C42', bg: '#FFEDD9' },
  4: { id: 4, name: '乘除进阶', color: '#9B5DE5', bg: '#F0E6FB' },
}

const level = ref(LEVELS[1])
const questions = ref([])
const qIdx = ref(0)
const score = ref(0)
const finished = ref(false)
const flash = ref('')
const isRight = ref(false)
const q = computed(() => questions.value[qIdx.value] || {})
const starsText = computed(() => {
  const full = Math.round((score.value / Math.max(questions.value.length, 1)) * 5)
  return '⭐'.repeat(full) + '☆'.repeat(5 - full)
})

const rnd = (n) => Math.floor(Math.random() * n)
const pick = (arr) => arr[rnd(arr.length)]
function shuffle(a) {
  const x = [...a]
  for (let i = x.length - 1; i > 0; i--) {
    const j = rnd(i + 1)
    ;[x[i], x[j]] = [x[j], x[i]]
  }
  return x
}

// 生成一个数字题的选项（正确答案 + 相近干扰项）
function numOptions(answer, count) {
  const set = new Set([answer])
  const deltas = [1, -1, 2, -2, 10, -10, 5, -5]
  let di = 0
  while (set.size < count && di < deltas.length) {
    const v = answer + deltas[di++]
    if (v >= 0) set.add(v)
  }
  while (set.size < count) set.add(rnd(100))
  return shuffle([...set]).map((v) => ({ id: String(v), label: String(v) }))
}

function emojisOf(n) {
  const e = pick(EMOJIS)
  return Array.from({ length: n }, () => e)
}

function makeQuestion(lvId) {
  const kinds = {
    1: ['count', 'listen', 'sequence'],
    2: ['add', 'sub', 'compare'],
    3: ['add20', 'sub20', 'missing', 'compareNum'],
    4: ['mul', 'div'],
  }[lvId]
  const kind = pick(kinds)
  const qz = { kind, firstTry: true }

  if (kind === 'count') {
    const n = 1 + rnd(9)
    qz.emojiList = emojisOf(n)
    qz.seq = [`${A}/zh-countit.mp3`, `${A}/zh-total.mp3`]
    qz.options = numOptions(n, 3)
    qz.answer = String(n)
  } else if (kind === 'listen') {
    const n = 1 + rnd(19)
    qz.seq = [`${A}/zh-listen.mp3`, `${A}/n${n}.mp3`]
    qz.options = numOptions(n, 4)
    qz.answer = String(n)
  } else if (kind === 'sequence') {
    const start = 1 + rnd(10)
    const step = pick([1, 2])
    const nums = [start, start + step, start + step * 2, start + step * 3]
    const hideIdx = 1 + rnd(2)
    qz.answer = String(nums[hideIdx])
    qz.display = nums.map((v, i) => (i === hideIdx ? '?' : String(v))).join('  ')
    qz.seq = [`${A}/zh-missing.mp3`]
    qz.options = numOptions(nums[hideIdx], 4)
  } else if (kind === 'add') {
    const a = 1 + rnd(9)
    const b = 1 + rnd(10 - a)
    qz.leftEmojis = emojisOf(a)
    qz.rightEmojis = emojisOf(b)
    qz.answer = String(a + b)
    qz.seq = [`${A}/n${a}.mp3`, `${A}/zh-plus.mp3`, `${A}/n${b}.mp3`, `${A}/zh-howmany.mp3`]
    qz.options = numOptions(a + b, 3)
  } else if (kind === 'sub') {
    const a = 2 + rnd(9)
    const b = 1 + rnd(a - 1)
    qz.leftEmojis = emojisOf(a)
    qz.rightEmojis = emojisOf(b)
    qz.takeAway = b
    qz.answer = String(a - b)
    qz.seq = [`${A}/n${a}.mp3`, `${A}/zh-minus.mp3`, `${A}/n${b}.mp3`, `${A}/zh-howmany.mp3`]
    qz.options = numOptions(a - b, 3)
  } else if (kind === 'compare') {
    const a = 1 + rnd(9)
    let b = 1 + rnd(9)
    while (b === a) b = 1 + rnd(9)
    const more = Math.random() < 0.5
    qz.groups = [
      { emojis: emojisOf(a), n: a },
      { emojis: emojisOf(b), n: b },
    ]
    if (Math.random() < 0.5) qz.groups.reverse()
    const target = qz.groups.findIndex((g) => g.n === (more ? Math.max(a, b) : Math.min(a, b)))
    qz.answer = String(target)
    qz.seq = [more ? `${A}/zh-more.mp3` : `${A}/zh-less.mp3`]
  } else if (kind === 'add20') {
    const a = 3 + rnd(16)
    const b = 1 + rnd(Math.max(1, 20 - a))
    qz.answer = String(a + b)
    qz.display = `${a} + ${b} = ?`
    qz.seq = [`${A}/n${a}.mp3`, `${A}/zh-plus.mp3`, `${A}/n${b}.mp3`, `${A}/zh-howmany.mp3`]
    qz.options = numOptions(a + b, 4)
  } else if (kind === 'sub20') {
    const a = 8 + rnd(13)
    const b = 1 + rnd(a - 2)
    qz.answer = String(a - b)
    qz.display = `${a} − ${b} = ?`
    qz.seq = [`${A}/n${a}.mp3`, `${A}/zh-minus.mp3`, `${A}/n${b}.mp3`, `${A}/zh-howmany.mp3`]
    qz.options = numOptions(a - b, 4)
  } else if (kind === 'missing') {
    const a = 2 + rnd(12)
    const b = 1 + rnd(9)
    qz.answer = String(b)
    qz.display = `${a} + ? = ${a + b}`
    qz.seq = [`${A}/n${a}.mp3`, `${A}/zh-plus.mp3`, `${A}/zh-ji.mp3`, `${A}/zh-equals.mp3`, `${A}/n${a + b}.mp3`]
    qz.options = numOptions(b, 4)
  } else if (kind === 'compareNum') {
    const a = 1 + rnd(19)
    let b = 1 + rnd(19)
    while (b === a) b = 1 + rnd(19)
    const bigger = Math.random() < 0.5
    qz.groups = [
      { n: a },
      { n: b },
    ]
    if (Math.random() < 0.5) qz.groups.reverse()
    const target = qz.groups.findIndex((g) => g.n === (bigger ? Math.max(a, b) : Math.min(a, b)))
    qz.answer = String(target)
    qz.seq = [bigger ? `${A}/zh-bigger.mp3` : `${A}/zh-smaller.mp3`]
  } else if (kind === 'mul') {
    const a = 2 + rnd(8)
    const b = 2 + rnd(8)
    qz.answer = String(a * b)
    qz.display = `${a} × ${b} = ?`
    qz.seq = [`${A}/n${a}.mp3`, `${A}/zh-times.mp3`, `${A}/n${b}.mp3`, `${A}/zh-howmany.mp3`]
    qz.options = numOptions(a * b, 4)
  } else if (kind === 'div') {
    const b = 2 + rnd(8)
    const c = 2 + rnd(8)
    const a = b * c
    qz.answer = String(c)
    qz.display = `${a} ÷ ${b} = ?`
    qz.seq = [`${A}/n${a}.mp3`, `${A}/zh-divided.mp3`, `${A}/n${b}.mp3`, `${A}/zh-howmany.mp3`]
    qz.options = numOptions(c, 4)
  }
  return qz
}

function buildQuestions(lvId) {
  const list = []
  const used = new Set()
  while (list.length < 10) {
    const qz = makeQuestion(lvId)
    const key = qz.kind + '|' + qz.answer + '|' + (qz.display || '')
    if (used.has(key)) continue
    used.add(key)
    list.push(qz)
  }
  return list
}

onLoad((query) => {
  const lvId = Number(query.level) || 1
  level.value = LEVELS[lvId]
  questions.value = buildQuestions(lvId)
  preload(['/static/audio/zh-great.mp3', '/static/audio/zh-try.mp3', '/static/audio/zh-awesome.mp3'])
  startQuestion()
})

onUnload(() => stopSeq())

function startQuestion() {
  flash.value = ''
  preload(q.value.seq || [])
  setTimeout(() => playSeq(q.value.seq), 350)
}

function respeak() {
  playSeq(q.value.seq)
}

function pickById(id) {
  if (flash.value) return
  flash.value = id
  isRight.value = id === q.value.answer
  if (isRight.value) {
    score.value++
    playSeq([`/static/audio/${Math.random() < 0.4 ? 'zh-awesome' : 'zh-great'}.mp3`], nextQuestion)
  } else {
    q.value.firstTry = false
    playSeq(['/static/audio/zh-try.mp3'])
    setTimeout(() => {
      flash.value = ''
    }, 900)
  }
}

function nextQuestion() {
  if (qIdx.value < questions.value.length - 1) {
    qIdx.value++
    startQuestion()
  } else {
    finished.value = true
  }
}

function restart() {
  score.value = 0
  qIdx.value = 0
  finished.value = false
  questions.value = buildQuestions(level.value.id)
  startQuestion()
}
function goBack() {
  uni.navigateBack()
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  min-height: 100dvh;
  background: #fff8ec;
  box-sizing: border-box;
  padding-bottom: env(safe-area-inset-bottom);
}
.topbar {
  display: flex;
  align-items: center;
  padding: calc(24rpx + env(safe-area-inset-top)) 32rpx 12rpx;
}
.back {
  width: 84rpx;
  height: 84rpx;
  border-radius: 50%;
  background: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6rpx 16rpx rgba(120, 90, 40, 0.1);
}
.back-icon {
  font-size: 44rpx;
  font-weight: 700;
  color: #4a3f35;
}
.title {
  flex: 1;
  text-align: center;
  font-size: 40rpx;
  font-weight: 800;
  color: #4a3f35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.score {
  min-width: 84rpx;
  text-align: right;
  font-size: 34rpx;
  font-weight: 700;
  color: #ff8c42;
}
.round-info {
  text-align: center;
  font-size: 27rpx;
  color: #b3a492;
  font-weight: 600;
  margin-top: 8rpx;
}
.stage {
  min-height: 380rpx;
  margin: 26rpx 44rpx 0;
  background: #ffffff;
  border-radius: 44rpx;
  padding: 34rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 10rpx 30rpx rgba(120, 90, 40, 0.08);
  box-sizing: border-box;
}
.dots {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 18rpx;
}
.dot-emoji {
  font-size: 64rpx;
  line-height: 1.15;
}
/* 看图加/减法里两组圆点空间紧张，略缩保证并排 */
.groups .dot-emoji {
  font-size: 54rpx;
}
.dot-emoji.faded {
  opacity: 0.25;
}
.groups {
  display: flex;
  align-items: center;
  gap: 20rpx;
  flex-wrap: wrap;
  justify-content: center;
}
.group {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10rpx;
  max-width: 280rpx;
}
.op-symbol {
  font-size: 72rpx;
  font-weight: 800;
  flex-shrink: 0;
}
.compare {
  display: flex;
  gap: 30rpx;
  width: 100%;
  justify-content: center;
}
.compare-card {
  flex: 1;
  min-width: 0;
  min-height: 240rpx;
  border-radius: 36rpx;
  background: #fff8ec;
  border: 6rpx solid transparent;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  align-content: center;
  gap: 12rpx;
  padding: 20rpx;
  box-sizing: border-box;
}
.compare-card:active {
  transform: scale(0.97);
}
.compare-card.right {
  border-color: #3bb273;
  background: #e8f8ee;
}
.compare-num {
  font-size: 110rpx;
  font-weight: 800;
  color: #4a3f35;
}
.compare-card.wrong {
  border-color: #ff6b6b;
  background: #fdecec;
}
.equation-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
}
.equation {
  font-size: 96rpx;
  font-weight: 800;
  color: #4a3f35;
  letter-spacing: 2rpx;
  white-space: nowrap;
}
/* 数列题「10  12  ?  16」字符串最长，单独降号保证单行 */
.equation-seq {
  font-size: 68rpx;
  letter-spacing: 0;
}
.listen-icon {
  font-size: 130rpx;
}
.options {
  margin: 34rpx 60rpx;
  display: flex;
  flex-wrap: wrap;
  gap: 26rpx;
}
.options.opts-3 .opt,
.options.opts-4 .opt {
  width: calc(50% - 13rpx);
}
.opt {
  height: 150rpx;
  background: #ffffff;
  border-radius: 36rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 10rpx 30rpx rgba(120, 90, 40, 0.08);
  border: 6rpx solid transparent;
  box-sizing: border-box;
}
.opt:active {
  transform: scale(0.96);
}
.opt.right {
  border-color: #3bb273;
  background: #e8f8ee;
}
.opt.wrong {
  border-color: #ff6b6b;
  background: #fdecec;
}
.opt-text {
  font-size: 64rpx;
  font-weight: 800;
  color: #4a3f35;
}
.shake {
  animation: shake 0.45s;
}
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-16rpx); }
  50% { transform: translateX(16rpx); }
  75% { transform: translateX(-10rpx); }
}
.result {
  padding-top: 22vh;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.result-emoji {
  font-size: 140rpx;
}
.result-score {
  margin-top: 30rpx;
  font-size: 48rpx;
  font-weight: 800;
  color: #4a3f35;
}
.result-stars {
  margin-top: 20rpx;
  font-size: 52rpx;
  letter-spacing: 8rpx;
}
.result-btn {
  margin-top: 56rpx;
  width: 420rpx;
  height: 110rpx;
  border-radius: 55rpx;
  background: linear-gradient(135deg, #ffb84d, #ff8c42);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 12rpx 30rpx rgba(255, 140, 66, 0.35);
}
.result-btn:active {
  transform: scale(0.97);
}
.result-btn-text {
  color: #ffffff;
  font-size: 38rpx;
  font-weight: 800;
}
.result-btn.ghost {
  margin-top: 28rpx;
  background: #ffffff;
  box-shadow: 0 8rpx 20rpx rgba(120, 90, 40, 0.1);
}
.ghost-text {
  color: #8a8073;
}
</style>

<template>
  <view class="page">
    <view class="topbar">
      <view class="back" @tap="goBack">
        <text class="back-icon">←</text>
      </view>
      <text class="title">{{ titleText }}</text>
      <text class="score">⭐ {{ firstCorrect }}</text>
    </view>

    <template v-if="!finished">
      <view class="round-info">第 {{ qIdx + 1 }} / {{ questions.length }} 题（点题目可以再听一遍）</view>

      <view class="stage" @tap="respeak">
        <!-- 点数题：喜欢的物品 + 彩色卡片拼贴（超过 6 个自动缩卡，防溢出） -->
        <view v-if="q.kind === 'count'" class="tiles" :class="{ 'tiles-many': q.emojiList.length > 6 }">
          <view v-for="(e, i) in q.emojiList" :key="i" class="tile" :class="'tilt' + i % 4">
            <text class="tile-emoji">{{ e }}</text>
          </view>
        </view>

        <!-- 看图加法：两组圆点 -->
        <view v-else-if="q.kind === 'add'" class="groups">
          <view class="group" :class="{ 'tiles-many': q.leftEmojis.length > 6 }">
            <view v-for="(e, i) in q.leftEmojis" :key="'l' + i" class="tile sm" :class="'tilt' + i % 4">
              <text class="tile-emoji">{{ e }}</text>
            </view>
          </view>
          <text class="op-symbol" :style="{ color: level.color }">+</text>
          <view class="group">
            <view v-for="(e, i) in q.rightEmojis" :key="'r' + i" class="tile sm" :class="'tilt' + (i + 2) % 4">
              <text class="tile-emoji">{{ e }}</text>
            </view>
          </view>
        </view>

        <!-- 看图减法：划掉一部分 -->
        <view v-else-if="q.kind === 'sub'" class="groups">
          <view class="group" :class="{ 'tiles-many': q.leftEmojis.length > 6 }">
            <view
              v-for="(e, i) in q.leftEmojis"
              :key="'s' + i"
              class="tile sm"
              :class="['tilt' + i % 4, { faded: i >= q.leftEmojis.length - q.takeAway }]"
            >
              <text class="tile-emoji">{{ e }}</text>
            </view>
          </view>
          <text class="op-symbol" :style="{ color: level.color }">−</text>
          <view class="group" :class="{ 'tiles-many': q.rightEmojis.length > 6 }">
            <view v-for="(e, i) in q.rightEmojis" :key="'t' + i" class="tile sm" :class="'tilt' + (i + 1) % 4">
              <text class="tile-emoji">{{ e }}</text>
            </view>
          </view>
        </view>

        <!-- 比一比：两边直接点（compare=比多少 emoji 组，compareNum=比数字） -->
        <view v-else-if="q.kind === 'compare' || q.kind === 'compareNum'" class="compare">
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

        <!-- 应用题：读一句小故事再选答案（长句用小字可换行） -->
        <view v-else-if="q.kind === 'wordAdd' || q.kind === 'wordSub' || q.kind === 'wordMul'" class="equation-wrap">
          <text class="word-problem">{{ q.display }}</text>
        </view>

        <!-- 数字算式 / 数列 / 听音 -->
        <view v-else class="equation-wrap">
          <text v-if="q.kind === 'listen'" class="listen-icon">🔊</text>
          <text v-else class="equation" :class="{ 'equation-seq': q.kind === 'sequence' }" :style="{ fontSize: equationSize }">{{ q.display }}</text>
        </view>
      </view>

      <!-- 选项：比大小两种题型直接点组卡片，没有数字选项 -->
      <view v-if="q.kind !== 'compare' && q.kind !== 'compareNum'" class="options" :class="'opts-' + q.options.length">
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
        <text class="result-emoji">{{ reviewMode ? '✅' : '🎉' }}</text>
        <text class="result-score">{{ resultText }}</text>
        <text v-if="!reviewMode" class="result-stars">{{ starsText }}</text>
        <text class="result-note">{{ starsNote }}</text>
        <view v-if="!reviewMode" class="result-btn" @tap="restart">
          <text class="result-btn-text">再玩一次</text>
        </view>
        <view class="result-btn ghost" @tap="goBack">
          <text class="result-btn-text ghost-text">返回</text>
        </view>
      </view>
    </template>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { onLoad, onUnload } from '@dcloudio/uni-app'
import { playSeq, preload, stopSeq } from '@/platform/audio.js'
import { assetUrl } from '@/platform/assets.js'
import { getLesson } from '@/content/catalog.js'
import { buildQuestions, normalizeMathLevel, mathText, mathItemId, MATH_LEVELS } from '@/domain/mathgen.js'
import { isPickCorrect } from '@/domain/judge.js'
import { starsForFirstAttempt, starsText as starsBar } from '@/domain/progress.js'
import { getSessionService } from '@/services/session.js'
import { getCollectionService } from '@/services/collection.js'
import { getReviewService } from '@/services/review.js'
import { getReviewPool } from '@/services/review-pools.js'

const level = ref(MATH_LEVELS[1])
const questions = ref([])
const qIdx = ref(0)
const score = ref(0)
const firstCorrect = ref(0)
const finished = ref(false)
const flash = ref('')
const isRight = ref(false)
const q = computed(() => questions.value[qIdx.value] || {})

/** 算式按长度缩字：万以内/四则混合的长算式（831 + ? = 1415）96rpx 定字会顶破卡片 */
const equationSize = computed(() => {
  const len = (q.value?.display || '').length
  if (len <= 8) return '96rpx'
  if (len <= 12) return '72rpx'
  if (len <= 16) return '56rpx'
  return '44rpx'
})

const svc = getSessionService()
const review = getReviewService()
const lesson = ref(null) // 有 lessonId 才记录会话；旧入口只玩不记录
const reviewMode = ref(false) // 错题重练：?review=1——到期错题原题重放，不计课时会话
const firstPickMap = new Map()

const starsText = computed(() => starsBar(starsForFirstAttempt(firstCorrect.value, questions.value.length)))
const titleText = computed(() => (reviewMode.value ? '错题重练' : level.value.name))
const resultText = computed(() =>
  reviewMode.value
    ? `重练答对 ${firstCorrect.value} / ${questions.value.length} 题`
    : `一次答对 ${firstCorrect.value} / ${questions.value.length} 题`,
)
const starsNote = computed(() =>
  reviewMode.value ? '连对的错题会毕业，答错明天再见' : `共 ${questions.value.length} 题 · 首次选对得星`,
)

onLoad((query) => {
  preload([assetUrl('/static/audio/zh-great.mp3'), assetUrl('/static/audio/zh-try.mp3'), assetUrl('/static/audio/zh-awesome.mp3')])

  // 错题重练模式：题目来自错题本到期条目（存的是答错那道的整题快照），原题重放
  if (query.review === '1') {
    reviewMode.value = true
    const pool = getReviewPool('math')
    if (!pool.length) {
      uni.showToast({ title: '太棒了，暂无待复习', icon: 'none' })
      // 直链进入无返回历史：回主页而不是 navigateBack
      setTimeout(() => uni.reLaunch({ url: '/pages/map/map' }), 700)
      return
    }
    // 主题色按第一题所属关卡
    const lvId = normalizeMathLevel((pool[0].reviewItemId || '').match(/^math-l(\d)/)?.[1])
    level.value = MATH_LEVELS[lvId]
    questions.value = pool
    qIdx.value = 0
    score.value = 0
    firstCorrect.value = 0
    finished.value = false
    startQuestion()
    return
  }

  // 有 lessonId 时以课程目录的关卡为准，URL 参数不可信；非法关卡安全回退第 1 关
  const l = getLesson(query.lessonId)
  const lvId = normalizeMathLevel(l && l.ref?.kind === 'math-level' ? l.ref.id : query.level)
  level.value = MATH_LEVELS[lvId]

  if (l) {
    lesson.value = l
    const resumed = svc.resumeSessionFor(l.id)
    if (resumed?.snapshot?.questions?.length) {
      restoreSnapshot(resumed.snapshot)
      return
    }
    svc.startSession({ lessonId: l.id, kind: 'challenge', skillIds: l.skillIds || [] })
  }
  startFresh()
})

onUnload(() => {
  stopSeq()
  if (lesson.value && !finished.value) svc.pauseSession()
})

/** 恢复：题目快照原样回来，重进不是重新出题，记录与题目不错配 */
function restoreSnapshot(snap) {
  questions.value = snap.questions
  qIdx.value = Math.max(0, Math.min(snap.qIdx || 0, snap.questions.length - 1))
  score.value = snap.score || 0
  firstCorrect.value = snap.firstCorrect || 0
  finished.value = false
  startQuestion()
}

function currentSnapshot() {
  return { questions: questions.value, qIdx: qIdx.value, score: score.value, firstCorrect: firstCorrect.value }
}

function startFresh() {
  questions.value = buildQuestions(level.value.id, { audioBase: assetUrl('/static/audio') })
  qIdx.value = 0
  score.value = 0
  firstCorrect.value = 0
  firstPickMap.clear()
  finished.value = false
  if (lesson.value) svc.saveSnapshot(currentSnapshot())
  startQuestion()
}

function startQuestion() {
  flash.value = ''
  preload(q.value.seq || [])
  if (lesson.value) svc.saveSnapshot(currentSnapshot())
  setTimeout(() => playSeq(q.value.seq), 350)
}

function respeak() {
  playSeq(q.value.seq)
}

function pickById(id) {
  if (flash.value) return
  const correct = isPickCorrect(q.value, id)
  let firstTry = true
  if (lesson.value) {
    const attempt = svc.recordAttempt({ activityId: 'math-gen', order: qIdx.value, answer: id, correct, itemId: mathItemId(level.value.id, q.value) })
    firstTry = attempt ? attempt.firstTry : true
  } else {
    firstTry = !firstPickMap.has(qIdx.value)
    firstPickMap.set(qIdx.value, true)
  }
  // 错题本：答错进本/归零，已在本的答对晋级（不在本的答对不收录）。
  // 重练模式用条目原 id（reviewItemId），日常练习用「关卡:签名」定位整题
  const itemId = q.value.reviewItemId || mathItemId(level.value.id, q.value)
  review.recordResult(itemId, correct, {
    subject: 'math',
    text: mathText(q.value),
    lessonId: lesson.value?.id,
    payload: q.value,
  })
  flash.value = id
  isRight.value = correct
  if (correct) {
    score.value++
    if (firstTry) firstCorrect.value++
    // 字符串拼接而非反引号模板：反引号路径发布脚本改写不到 → GitHub Pages 上 404
    playSeq([assetUrl("/static/audio/" + (Math.random() < 0.4 ? 'zh-awesome' : 'zh-great') + ".mp3")], nextQuestion)
  } else {
    playSeq([assetUrl('/static/audio/zh-try.mp3')])
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
    if (lesson.value) {
      const done = svc.completeSession()
      // 图鉴点亮：数学无词表，完成关卡即点亮徽章
      if (done) getCollectionService().recordChallengeDone(done)
    }
  }
}

function restart() {
  playSeq([assetUrl('/static/audio/zh-btn-again.mp3')])
  if (lesson.value) {
    // 重开必须重新建会话，否则这一局的作答会被静默丢弃
    svc.clearActive()
    svc.startSession({ lessonId: lesson.value.id, kind: 'challenge', skillIds: lesson.value.skillIds || [] })
  }
  startFresh()
}
function goBack() {
  playSeq([assetUrl('/static/audio/zh-btn-back.mp3')])
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
/* 物品卡片拼贴：马卡龙底色 + 轻微错落旋转，比一排相同 emoji 更抓眼 */
.tiles {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 18rpx;
  max-width: 460rpx;
}
.tile {
  width: 120rpx;
  height: 120rpx;
  border-radius: 32rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6rpx 14rpx rgba(120, 90, 40, 0.1);
}
.tile.sm {
  width: 92rpx;
  height: 92rpx;
  border-radius: 26rpx;
}
.tile-emoji {
  font-size: 72rpx;
  line-height: 1;
}
.tile.sm .tile-emoji {
  font-size: 54rpx;
}
.tile.faded {
  opacity: 0.25;
}
/* 图案超过 6 个自动缩卡：一行能排 4-5 个，避免挤出卡片 */
.tiles-many .tile {
  width: 88rpx;
  height: 88rpx;
  border-radius: 24rpx;
}
.tiles-many .tile-emoji {
  font-size: 50rpx;
}
.tilt0 { background: #ffe8cc; transform: rotate(-4deg); }
.tilt1 { background: #ddebff; transform: rotate(3deg); }
.tilt2 { background: #e3f6e8; transform: rotate(-2deg); }
.tilt3 { background: #fde3ee; transform: rotate(4deg); }
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
/* 应用题题干：一句小故事，小字号可换行 */
.word-problem {
  font-size: 44rpx;
  font-weight: 700;
  color: #4a3f35;
  line-height: 1.7;
  text-align: left;
  white-space: normal;
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
.result-note {
  margin-top: 14rpx;
  font-size: 27rpx;
  color: #b3a492;
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

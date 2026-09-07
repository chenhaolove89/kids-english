<template>
  <view class="page">
    <view class="topbar">
      <view class="back" @tap="goBack">
        <text class="back-icon">←</text>
      </view>
      <text class="title">{{ pageTitle }}</text>
      <text class="score">⭐ {{ firstCorrect }}</text>
    </view>

    <template v-if="!finished">
      <view class="prompt" @tap="speakQuestion">
        <text class="prompt-speaker">🔊</text>
        <text class="prompt-hint">{{ subject === 'zh' ? '听一听，选出对应的汉字' : '听一听，选出对应的图片' }}</text>
      </view>

      <view class="round-info">第 {{ roundIdx + 1 }} / {{ rounds.length }} 题</view>

      <view class="options" :class="{ 'options-text': subject === 'zh' }">
        <view
          v-for="opt in options"
          :key="opt.id"
          class="option"
          :class="{ right: flashId === opt.id && isRight, wrong: flashId === opt.id && !isRight, shake: flashId === opt.id && !isRight }"
          @tap="pick(opt)"
        >
          <image v-if="subject === 'en'" class="opt-img" :src="opt.image" mode="aspectFit" />
          <text v-else class="opt-char" :style="{ color: opt.color }">{{ opt.main }}</text>
        </view>
      </view>
    </template>

    <template v-else>
      <view class="result">
        <text class="result-emoji">🎉</text>
        <text class="result-score">一次答对 {{ firstCorrect }} / {{ rounds.length }} 题</text>
        <text class="result-stars">{{ starsText }}</text>
        <text class="result-note">{{ starsNote }}</text>
        <view class="result-btn" @tap="restart">
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
import { play, preload } from '@/platform/audio.js'
import { getLesson } from '@/content/catalog.js'
import { resolveEnCategory, resolveEnLevel, resolveZhLevel, mapZhOption } from '@/content/adapters.js'
import { isCategoryHidden } from '@/content/lowAge.js'
import { buildListenPickRounds } from '@/domain/rounds.js'
import { isRoundPickCorrect } from '@/domain/judge.js'
import { starsForFirstAttempt, starsText as starsBar } from '@/domain/progress.js'
import { getSessionService } from '@/services/session.js'
import { getReviewService } from '@/services/review.js'
import { getReviewPool } from '@/services/review-pools.js'

const ROUNDS = 10

const subject = ref('en')
const reviewMode = ref(false) // 错题重练模式：/?review=en|zh
const pool = ref([])
const rounds = ref([])
const roundIdx = ref(0)
const score = ref(0)
const firstCorrect = ref(0)
const options = ref([])
const flashId = ref('')
const isRight = ref(false)
const finished = ref(false)

const svc = getSessionService()
const review = getReviewService()
const lesson = ref(null) // 有 lessonId 才记录会话；旧入口只玩不记录
const firstPickMap = new Map() // 旧入口模式的「首答」标记

const starsText = computed(() => starsBar(starsForFirstAttempt(firstCorrect.value, rounds.value.length)))
const starsNote = computed(() => `共 ${rounds.value.length} 题 · 首次选对得星`)
const pageTitle = computed(() => {
  if (reviewMode.value) return '错题重练'
  return subject.value === 'zh' ? '听音识字' : '听音选图'
})

onLoad((query) => {
  // 错题重练模式：/?review=en|zh——题目来自错题本到期条目，不计课时会话
  reviewMode.value = query.review === 'en' || query.review === 'zh'
  subject.value = reviewMode.value ? query.review : query.subject || 'en'
  preload(['/static/audio/great_job.mp3', '/static/audio/try_again.mp3'])
  let p = []
  if (reviewMode.value) {
    p = getReviewPool(subject.value)
    if (!p.length) {
      uni.showToast({ title: '太棒了，暂无待复习', icon: 'none' })
      setTimeout(() => uni.reLaunch({ url: '/pages/home/home' }), 700)
      return
    }
  } else if (subject.value === 'en') {
    if (query.cat) {
      p = resolveEnCategory(query.cat)?.words ?? []
    } else {
      // 有课程时以课程目录的级别为准（URL 参数不可信）
      const l = getLesson(query.lessonId)
      const lv = l && l.ref?.kind === 'en-level' ? l.ref.id : Number(query.level) || 1
      p = resolveEnLevel(lv)
    }
  } else {
    const l = getLesson(query.lessonId)
    const lv = l && l.ref?.kind === 'zh-level' ? l.ref.id : Number(query.level) || 1
    const level = resolveZhLevel(lv)
    p = level.chars.map(mapZhOption)
    preload(p.map((x) => x.audio))
  }
  if (subject.value === 'zh') preload(p.map((x) => x.audio))
  pool.value = p
  if (!p.length) {
    // 深链参数无效（分类/级别不存在）：提示后回主页，而不是卡在空页面
    uni.showToast({ title: '内容准备中', icon: 'none' })
    setTimeout(() => uni.reLaunch({ url: '/pages/home/home' }), 600)
    return
  }

  const l = getLesson(query.lessonId)
  // 深链指向被低龄模式隐藏的分类课时，池已过滤但课程不可见，降级为不记录
  const trackable = !(l && l.ref?.kind === 'en-category' && isCategoryHidden(l.ref.id))
  if (l && trackable) {
    lesson.value = l
    const resumed = svc.resumeSessionFor(l.id)
    if (resumed?.snapshot?.rounds?.length) {
      restoreSnapshot(resumed.snapshot)
    } else {
      svc.startSession({ lessonId: l.id, kind: 'challenge', skillIds: l.skillIds || [] })
      start()
    }
  } else {
    start()
  }
})

onUnload(() => {
  if (lesson.value && !finished.value) svc.pauseSession()
})

/** 恢复：题目快照原样回来，重进不重新出题，记录与题目不错配 */
function restoreSnapshot(snap) {
  rounds.value = snap.rounds
  roundIdx.value = Math.max(0, Math.min(snap.roundIdx || 0, snap.rounds.length - 1))
  score.value = snap.score || 0
  firstCorrect.value = snap.firstCorrect || 0
  finished.value = false
  loadRound()
}

function currentSnapshot() {
  return { rounds: rounds.value, roundIdx: roundIdx.value, score: score.value, firstCorrect: firstCorrect.value }
}

function start() {
  // 出轮统一走 domain/rounds.js：与单测同一份实现，避免页面内重复实现将来漂移
  rounds.value = buildListenPickRounds(pool.value, { count: ROUNDS })
  roundIdx.value = 0
  score.value = 0
  firstCorrect.value = 0
  firstPickMap.clear()
  finished.value = false
  if (lesson.value) svc.saveSnapshot(currentSnapshot())
  loadRound()
}

function loadRound() {
  flashId.value = ''
  options.value = rounds.value[roundIdx.value].options
  if (lesson.value) svc.saveSnapshot(currentSnapshot())
  setTimeout(speakQuestion, 450)
}

function speakQuestion() {
  if (finished.value) return
  play(rounds.value[roundIdx.value].answer.audio)
}

function pick(opt) {
  if (flashId.value) return
  const round = rounds.value[roundIdx.value]
  const correct = isRoundPickCorrect(round, opt.id)
  const itemId = round.answer.id
  let firstTry = true
  if (lesson.value) {
    const attempt = svc.recordAttempt({ activityId: 'listen-pick', order: roundIdx.value, answer: opt.id, correct, itemId })
    firstTry = attempt ? attempt.firstTry : true
  } else {
    firstTry = !firstPickMap.has(roundIdx.value)
    firstPickMap.set(roundIdx.value, true)
  }
  // 错题本：答错进本（当天可重练），已在本的答对晋级；复习/课时/旧入口三种模式都生效
  review.recordResult(itemId, correct, {
    subject: subject.value,
    text: subject.value === 'zh' ? round.answer.char : round.answer.en,
    lessonId: lesson.value ? lesson.value.id : null,
  })
  flashId.value = opt.id
  isRight.value = correct
  if (correct) {
    score.value++
    if (firstTry) firstCorrect.value++
    // 立即落快照：答对后有 1.5s 才进下一题，期间退出的话恢复不能丢这一题的进度
    if (lesson.value) svc.saveSnapshot(currentSnapshot())
    play('/static/audio/great_job.mp3')
    setTimeout(nextRound, 1500)
  } else {
    play('/static/audio/try_again.mp3')
    setTimeout(() => {
      flashId.value = ''
    }, 1000)
  }
}

function nextRound() {
  if (roundIdx.value < rounds.value.length - 1) {
    roundIdx.value++
    loadRound()
  } else {
    finished.value = true
    if (lesson.value) svc.completeSession()
  }
}

function restart() {
  if (lesson.value) {
    // 重开必须重新建会话，否则这一局的作答会被静默丢弃
    svc.clearActive()
    svc.startSession({ lessonId: lesson.value.id, kind: 'challenge', skillIds: lesson.value.skillIds || [] })
  }
  start()
}
function goBack() {
  uni.navigateBack()
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #fff8ec;
  box-sizing: border-box;
  padding-bottom: env(safe-area-inset-bottom);
}
.topbar {
  display: flex;
  align-items: center;
  padding: calc(24rpx + env(safe-area-inset-top)) 32rpx 20rpx;
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
.prompt {
  margin: 30rpx 60rpx 0;
  background: #ffffff;
  border-radius: 44rpx;
  padding: 40rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-shadow: 0 10rpx 30rpx rgba(120, 90, 40, 0.08);
}
.prompt:active {
  transform: scale(0.98);
}
.prompt-speaker {
  font-size: 90rpx;
}
.prompt-hint {
  margin-top: 12rpx;
  font-size: 30rpx;
  color: #a2917d;
}
.round-info {
  margin-top: 22rpx;
  text-align: center;
  font-size: 28rpx;
  color: #b3a492;
  font-weight: 600;
}
.options {
  margin: 26rpx 48rpx;
  display: flex;
  flex-wrap: wrap;
  gap: 30rpx;
}
.option {
  width: calc(50% - 15rpx);
  height: 340rpx;
  background: #ffffff;
  border-radius: 44rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 10rpx 30rpx rgba(120, 90, 40, 0.08);
  border: 6rpx solid transparent;
  box-sizing: border-box;
}
.option:active {
  transform: scale(0.96);
}
.option.right {
  border-color: #3bb273;
  background: #e8f8ee;
}
.option.wrong {
  border-color: #ff6b6b;
  background: #fdecec;
}
.opt-img {
  width: 260rpx;
  height: 260rpx;
}
.options-text .option {
  height: 260rpx;
}
.opt-char {
  font-size: 170rpx;
  font-weight: 800;
}
.shake {
  animation: shake 0.45s;
}
/* 矮屏（iPhone SE 568px 等）压缩纵向空间，避免答题区被顶出首屏 */
@media (max-height: 620px) {
  .option {
    height: 300rpx;
  }
  .options-text .option {
    height: 230rpx;
  }
  .prompt {
    margin-top: 14rpx;
    padding: 26rpx;
  }
  .prompt-speaker {
    font-size: 72rpx;
  }
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

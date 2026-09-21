<template>
  <view class="page">
    <PageTopBar class="topbar-page" :title="pageTitle" :ellipsis="false" @back="goBack">
      <text class="count">{{ countText }}</text>
    </PageTopBar>

    <!-- 声音预加载进度：慢网下孩子能看到声音在来的路上 -->
    <view v-if="audioTotal > 0 && audioDone < audioTotal" class="load-bar">
      <view class="load-fill" :style="{ width: audioPercent + '%' }"></view>
    </view>

    <!-- 书单：本学段每篇短文一张卡 -->
    <view v-if="!current" class="list">
      <view v-for="(p, i) in passages" :key="p.id" class="passage-card" :style="cardStyle(i)" @tap="openPassage(i)">
        <view class="card-head">
          <text class="card-title">{{ p.title }}</text>
          <text class="card-kind">{{ p.kind }}</text>
        </view>
        <text class="card-first">{{ p.lines[0] }}</text>
        <text class="card-meta">{{ p.lines.length }} 句 · {{ p.questions.length }} 题</text>
      </view>
      <!-- 深链参数无效的早退路径：先渲染这张卡再跳回课程页，不留白屏 -->
      <view v-if="!passages.length" class="empty-card">
        <text class="empty-text">🚧 这一学段的短文还在准备中</text>
      </view>
    </view>

    <!-- 读短文：整篇朗读 + 开始答题（逐句点读暂不做） -->
    <template v-else-if="!quizStarted">
      <view class="reader">
        <view v-for="(line, li) in current.lines" :key="li" class="line">
          <text class="line-text">{{ line }}</text>
        </view>
      </view>

      <view class="btn-row">
        <view class="action" :style="{ background: '#F1ECFB' }" @tap="playFull">
          <text class="action-emoji">{{ playingFull ? '🎵' : '▶️' }}</text>
          <text class="action-label">听全文</text>
        </view>
        <view class="action primary" :style="{ background: '#E3F6E8' }" @tap="startQuiz">
          <text class="action-emoji">✏️</text>
          <text class="action-label">开始答题</text>
        </view>
      </view>
    </template>

    <!-- 结算：首答正确率给星（口径与其它挑战一致） -->
    <template v-else-if="finished">
      <Confetti :show="finished" />
      <view class="result">
        <text class="result-emoji" :class="{ 'result-emoji-perfect': perfect }">{{ perfect ? '🏆' : '🎉' }}</text>
        <text class="result-score">一次答对 {{ firstCorrect }} / {{ rounds.length }} 题</text>
        <text class="result-stars">{{ starsText }}</text>
        <text class="result-note">{{ starsNote }}</text>
        <view class="result-btn" @tap="backToList">
          <text class="result-btn-text">再读一篇</text>
        </view>
        <view class="result-btn ghost" @tap="goBack">
          <text class="result-btn-text ghost-text">返回</text>
        </view>
      </view>
    </template>

    <!-- 逐题作答：短文可随时「看短文」回看（真实阅读就该能回看） -->
    <template v-else-if="round">
      <view class="q-head">
        <text class="q-index">第 {{ qIdx + 1 }} / {{ rounds.length }} 题</text>
        <view class="peek" :class="{ active: showPassage }" @tap="showPassage = !showPassage">
          <text class="peek-text">{{ showPassage ? '收起短文' : '📖 看短文' }}</text>
        </view>
      </view>
      <scroll-view v-if="showPassage" class="peek-box" scroll-y>
        <text v-for="(line, li) in current.lines" :key="li" class="peek-line">{{ line }}</text>
      </scroll-view>

      <view class="q-card">
        <text class="q-text">{{ round.q }}</text>
        <text class="q-point">考点 · {{ round.point }}</text>
      </view>

      <view class="options" :class="'options-' + round.options.length">
        <view v-for="opt in round.options" :key="opt.id" class="option" :class="optionClass(opt)" @tap="pick(opt)">
          <text class="opt-label">{{ opt.label }}</text>
          <text v-if="pickedId && opt.id === round.answer" class="opt-check">✓</text>
        </view>
      </view>

      <view v-if="pickedId" class="reveal-bar">
        <text class="reveal-text">{{ revealText }}</text>
        <view class="next-btn" @tap="nextQuestion">
          <text class="next-text">{{ qIdx + 1 < rounds.length ? '下一题' : '看结果' }}</text>
        </view>
      </view>
    </template>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { onLoad, onUnload } from '@dcloudio/uni-app'
import { play, stopSeq, preload, preloadWithProgress } from '@/platform/audio.js'
import { assetUrl } from '@/platform/assets.js'
import { goBackOrHome } from '@/platform/nav.js'
import { getLesson, catalog } from '@/content/catalog.js'
import { getSessionService } from '@/services/session.js'
import { getCollectionService } from '@/services/collection-app.js'
import { nextPraiseSrc, praiseSrcs } from '@/services/encourage-app.js'
import { isPickCorrect } from '@/domain/judge.js'
import { starsForFirstAttempt, starsText as starsBar } from '@/domain/progress.js'
import { questionId } from '@/domain/passage.js'
import passagesData from '@/data/zhPassages.json'
import Confetti from '@/components/confetti.vue'
import PageTopBar from '@/components/page-top-bar.vue'

const CARD_STYLES = [
  { bg: '#E3F6E8', border: '#b8e8c6' },
  { bg: '#FFF3E4', border: '#ffd9b0' },
  { bg: '#E9F2FF', border: '#bcd7ff' },
  { bg: '#F1ECFB', border: '#d8cdf2' },
]
// 作答事件的 activityId：与课时、图鉴都无关，只用于「同一会话内这一题是否首答」的判定
const ACTIVITY = 'passage-question'

const stage = ref('g12')
const lessonId = ref('')
const currentIdx = ref(-1) // -1 = 书单
const quizStarted = ref(false)
const finished = ref(false)
const qIdx = ref(0)
const firstCorrect = ref(0)
const pickedId = ref('') // 本题点过的选项（揭晓期间不为空，兼作"已作答"标志）
const rounds = ref([]) // 题目快照：本题的题面/选项/答案，暂停恢复后原样回来
const playingFull = ref(false)
const showPassage = ref(false)
const audioDone = ref(0)
const audioTotal = ref(0)
const lesson = ref(null) // 有 lessonId 才记录会话；旧入口/直链只玩不记

const svc = getSessionService(catalog.contentVersion)

const passages = computed(() => passagesData.passages.filter((p) => p.stage === stage.value))
const current = computed(() => (currentIdx.value >= 0 ? passages.value[currentIdx.value] : null))
const round = computed(() => rounds.value[qIdx.value] || null)
const audioPercent = computed(() => (audioTotal.value ? Math.round((audioDone.value / audioTotal.value) * 100) : 0))
const starsText = computed(() => starsBar(starsForFirstAttempt(firstCorrect.value, rounds.value.length)))
const perfect = computed(() => finished.value && starsForFirstAttempt(firstCorrect.value, rounds.value.length) === 3)
const starsNote = computed(() => `共 ${rounds.value.length} 题 · 首次选对得星`)
const pageTitle = computed(() => (current.value ? current.value.title : '阅读理解 · 读短文'))
const countText = computed(() => {
  if (!current.value) return passages.value.length + ' 篇'
  if (!quizStarted.value) return current.value.questions.length + ' 题'
  return '⭐ ' + firstCorrect.value
})

const revealText = computed(() => {
  const r = round.value
  if (!r) return ''
  const ans = r.options.find((o) => o.id === r.answer) || {}
  const head = pickedId.value === r.answer ? '✅ 答对了！' : '正确答案是：'
  return head + (ans.label || '') + (r.point ? '（考点：' + r.point + '）' : '')
})

function cardStyle(i) {
  const s = CARD_STYLES[i % CARD_STYLES.length]
  return { background: s.bg, border: '4rpx solid ' + s.border }
}

function audioSrc(p) {
  return assetUrl('/static/audio-zh/' + p.id + '.mp3')
}

/**
 * 把一篇短文展开成挑战题目。
 *
 * 题目 id 用 domain/passage.js 的约定 `篇id-q题号`：作答事件的 itemId 就是它，
 * 图鉴按篇聚合（见 domain/passage.js 的口径）、将来的错题回流按题定位，两边同源。
 * 选项 id 只在本轮内用来判题（judge.js 只比 id），不进作答记录。
 */
function buildRounds(p) {
  return p.questions.map((q, qi) => {
    const qid = questionId(p.id, qi)
    const options = (q.options || []).map((label, oi) => ({ id: qid + '-o' + oi, label }))
    // 内容门禁已保证 answer 是合法下标；这里再兜一层，坏内容不至于让整题没有正确答案
    const answer = (options[q.answer] || options[0] || {}).id || ''
    return { id: qid, passageId: p.id, order: qi, q: q.q, point: q.point, options, answer }
  })
}

function currentSnapshot() {
  return {
    passageId: current.value ? current.value.id : '',
    qIdx: qIdx.value,
    firstCorrect: firstCorrect.value,
    rounds: rounds.value,
  }
}

onLoad((query) => {
  stage.value = String(query.stage || 'g12')
  lessonId.value = String(query.lessonId || '')
  const list = passages.value
  if (!list.length) {
    // 深链参数无效（学段不存在/没有短文）：提示后回课程页，而不是卡在空书单
    uni.showToast({ title: '内容准备中', icon: 'none' })
    setTimeout(() => uni.reLaunch({ url: '/pages/map/map' }), 600)
    return
  }
  // 本学段的整篇朗读一起预载（与古诗点读同做法：慢网下孩子能看到声音在来的路上）
  audioTotal.value = list.length
  preloadWithProgress(list.map(audioSrc), (done) => {
    audioDone.value = done
  })
  // 反馈语音用中文：孩子听不懂英文夸奖（与挑战页同一套表扬语池）
  preload([assetUrl('/static/audio/zh-try.mp3'), ...praiseSrcs().map((p) => assetUrl(p))])

  // 课时以目录为准（URL 参数不可信）；没有课程时只玩不记，不产生半截会话
  const l = getLesson(lessonId.value) || getLesson('zh-passage-' + stage.value)
  if (l && (l.status !== 'available' || l.ref?.kind !== 'zh-passage')) {
    uni.showToast({ title: '内容准备中', icon: 'none' })
    setTimeout(() => uni.reLaunch({ url: '/pages/map/map' }), 600)
    return
  }
  if (!l) return
  lesson.value = l
  // 中途退出再进来：恢复上次那一篇的题号与已得星，不重新出题
  const resumed = svc.resumeSessionFor(l.id, 'challenge')
  if (resumed?.snapshot) restoreSnapshot(resumed.snapshot)
})

onUnload(() => {
  stopSeq()
  // 答题中途离开：落一条带快照的 paused 会话（下次进来接着答），别把进度丢了
  if (lesson.value && quizStarted.value && !finished.value) svc.pauseSession()
})

/** 恢复：题目快照原样回来，作答与题目不错配 */
function restoreSnapshot(snap) {
  const idx = passages.value.findIndex((p) => p.id === snap.passageId)
  if (idx < 0 || !Array.isArray(snap.rounds) || !snap.rounds.length) return false
  currentIdx.value = idx
  rounds.value = snap.rounds
  qIdx.value = Math.max(0, Math.min(snap.qIdx || 0, snap.rounds.length - 1))
  firstCorrect.value = snap.firstCorrect || 0
  pickedId.value = ''
  quizStarted.value = true
  finished.value = false
  return true
}

function openPassage(i) {
  stopSeq()
  currentIdx.value = i
  quizStarted.value = false
  finished.value = false
  qIdx.value = 0
  firstCorrect.value = 0
  pickedId.value = ''
  playingFull.value = false
  showPassage.value = false
}

/**
 * 开始答题 = 开一次挑战会话。
 *
 * 一篇文章一次挑战：会话的 lessonId 是本学段的短文课，快照里记着是哪一篇、答到第几题。
 * 上一次没答完的会话由 session.js 落成 paused（快照保住），不会被静默丢弃。
 */
function startQuiz() {
  const p = current.value
  if (!p) return
  stopSeq()
  playingFull.value = false
  showPassage.value = false
  rounds.value = buildRounds(p)
  qIdx.value = 0
  firstCorrect.value = 0
  pickedId.value = ''
  finished.value = false
  quizStarted.value = true
  if (lesson.value) {
    svc.startSession({
      lessonId: lesson.value.id,
      kind: 'challenge',
      skillIds: lesson.value.skillIds || [],
      contentVersion: catalog.contentVersion,
    })
    svc.saveSnapshot(currentSnapshot())
  }
}

function playFull() {
  if (!current.value) return
  stopSeq()
  playingFull.value = true
  // play 的 onEnd 只在自然播完时触发（stop 不触发），所以这就是"听完了"的信号
  play(audioSrc(current.value), () => {
    playingFull.value = false
  })
}

function pick(opt) {
  if (pickedId.value || finished.value) return
  const r = round.value
  if (!r) return
  const correct = isPickCorrect(r, opt.id)
  pickedId.value = opt.id
  if (correct) firstCorrect.value++
  if (lesson.value) {
    // itemId 是题目稳定 id（篇id-q题号）：图鉴按篇聚合、错题回流按题定位都靠它
    svc.recordAttempt({ activityId: ACTIVITY, order: r.order, answer: opt.id, correct, itemId: r.id })
    svc.saveSnapshot(currentSnapshot())
  }
  // 揭晓：正确答案绿框 + 对勾 + 一句讲解（考点），再等孩子自己点「下一题」
  // （不自动翻页：阅读理解要留出读讲解的时间）
  if (correct) play(assetUrl(nextPraiseSrc()))
  else play(assetUrl('/static/audio/zh-try.mp3'))
}

function optionClass(opt) {
  if (!pickedId.value) return {}
  const isAnswer = opt.id === round.value?.answer
  const isPicked = opt.id === pickedId.value
  if (isAnswer) return { reveal: true, right: true }
  if (isPicked) return { wrong: true, shake: true }
  return {}
}

function nextQuestion() {
  if (!pickedId.value) return
  if (qIdx.value < rounds.value.length - 1) {
    qIdx.value++
    pickedId.value = ''
    if (lesson.value) svc.saveSnapshot(currentSnapshot())
    return
  }
  finishQuiz()
}

/** 答完最后一题：完成课时（首答星级由进度服务按 totals 算），并点亮图鉴 */
function finishQuiz() {
  finished.value = true
  pickedId.value = ''
  if (!lesson.value) return
  const done = svc.completeSession()
  if (done) getCollectionService().recordChallengeDone(done)
}

function backToList() {
  stopSeq()
  currentIdx.value = -1
  quizStarted.value = false
  finished.value = false
  qIdx.value = 0
  firstCorrect.value = 0
  pickedId.value = ''
  playingFull.value = false
  showPassage.value = false
}

function goBack() {
  if (current.value) {
    backToList()
    return
  }
  stopSeq()
  goBackOrHome()
}
</script>

<style scoped>
/**
 * 版式：书单/读短文/答题三段都是「会长的一列」，所以整页允许滚动
 * （pages.json 里本页没有 disableScroll，真机上滑得动）。
 * 短文本身比一屏长，逐题作答时还要能回看短文，固定高度反而会把内容裁掉。
 */
.page {
  min-height: 100vh;
  min-height: 100svh;
  background: #fff8ec;
  box-sizing: border-box;
  /* 底部再叠 --bottom-gap：微信内置浏览器的底部工具条会盖住「听全文/开始答题」（见 App.vue） */
  padding: calc(24rpx + env(safe-area-inset-top)) 40rpx calc(40rpx + env(safe-area-inset-bottom) + var(--bottom-gap));
  display: flex;
  flex-direction: column;
}
.topbar-page {
  padding: 0 8rpx 20rpx;
}
.count {
  min-width: 84rpx;
  text-align: right;
  font-size: 30rpx;
  font-weight: 700;
  color: #a2917d;
}
.load-bar {
  height: 10rpx;
  border-radius: 6rpx;
  background: #f0e4d7;
  overflow: hidden;
  margin: 0 8rpx 16rpx;
}
.load-fill {
  height: 100%;
  background: #ffb84d;
  transition: width 0.2s;
}

/* 书单 */
.list {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
  padding-top: 8rpx;
}
.passage-card {
  border-radius: 32rpx;
  padding: 30rpx 34rpx;
  box-shadow: 0 10rpx 26rpx rgba(120, 90, 40, 0.1);
}
.passage-card:active {
  transform: scale(0.98);
}
.card-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16rpx;
}
.card-title {
  font-size: 40rpx;
  font-weight: 800;
  color: #4a3f35;
}
.card-kind {
  font-size: 24rpx;
  font-weight: 700;
  color: #8a8073;
  background: rgba(255, 255, 255, 0.7);
  border-radius: 20rpx;
  padding: 4rpx 16rpx;
  flex-shrink: 0;
}
.card-first {
  display: block;
  margin-top: 12rpx;
  font-size: 29rpx;
  line-height: 1.5;
  color: #6f6252;
}
.card-meta {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  color: #a2917d;
}
.empty-card {
  background: #ffffff;
  border-radius: 36rpx;
  padding: 40rpx;
  display: flex;
  justify-content: center;
  box-shadow: 0 6rpx 18rpx rgba(120, 90, 40, 0.06);
}
.empty-text {
  font-size: 28rpx;
  color: #b3a492;
}

/* 读短文 */
.reader {
  background: #ffffff;
  border-radius: 40rpx;
  border: 6rpx solid #f0e4d7;
  box-shadow: 0 14rpx 40rpx rgba(120, 90, 40, 0.12);
  padding: 36rpx 32rpx;
  margin-top: 8rpx;
}
.line {
  padding: 8rpx 0;
}
.line-text {
  font-size: 34rpx;
  line-height: 1.7;
  color: #4a3f35;
  letter-spacing: 2rpx;
}
.btn-row {
  flex-shrink: 0;
  display: flex;
  gap: 24rpx;
  padding: 30rpx 0 6rpx;
}
.action {
  flex: 1;
  border-radius: 30rpx;
  padding: 26rpx 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  box-shadow: 0 8rpx 20rpx rgba(120, 90, 40, 0.1);
}
.action:active {
  transform: scale(0.97);
}
.action-emoji {
  font-size: 40rpx;
}
.action-label {
  font-size: 32rpx;
  font-weight: 800;
  color: #4a3f35;
}

/* 逐题作答 */
.q-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  padding: 4rpx 8rpx 16rpx;
}
.q-index {
  font-size: 28rpx;
  font-weight: 700;
  color: #b3a492;
}
.peek {
  background: #ffffff;
  border-radius: 26rpx;
  padding: 10rpx 22rpx;
  box-shadow: 0 6rpx 16rpx rgba(120, 90, 40, 0.08);
}
.peek.active {
  background: #e3f6e8;
}
.peek:active {
  transform: scale(0.96);
}
.peek-text {
  font-size: 26rpx;
  font-weight: 700;
  color: #6f6252;
}
.peek-box {
  max-height: 46vh;
  background: #ffffff;
  border-radius: 32rpx;
  border: 4rpx solid #f0e4d7;
  padding: 24rpx 26rpx;
  margin-bottom: 20rpx;
  box-sizing: border-box;
}
.peek-line {
  display: block;
  font-size: 30rpx;
  line-height: 1.7;
  color: #4a3f35;
}
.q-card {
  background: #ffffff;
  border-radius: 40rpx;
  padding: 30rpx 32rpx;
  box-shadow: 0 10rpx 30rpx rgba(120, 90, 40, 0.08);
}
.q-text {
  display: block;
  font-size: 38rpx;
  font-weight: 800;
  line-height: 1.45;
  color: #4a3f35;
}
.q-point {
  display: block;
  margin-top: 12rpx;
  font-size: 24rpx;
  color: #a2917d;
}
.options {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
  padding: 24rpx 0 8rpx;
}
.option {
  position: relative;
  background: #ffffff;
  border-radius: 32rpx;
  border: 6rpx solid transparent;
  box-sizing: border-box;
  padding: 26rpx 30rpx;
  box-shadow: 0 8rpx 24rpx rgba(120, 90, 40, 0.08);
}
.option:active {
  transform: scale(0.98);
}
.option.right {
  border-color: #3bb273;
  background: #e8f8ee;
}
.option.wrong {
  border-color: #ff6b6b;
  background: #fdecec;
}
.option.reveal {
  border-color: #3bb273;
  background: #e8f8ee;
  animation: reveal-pop 0.5s;
}
.opt-label {
  font-size: 34rpx;
  font-weight: 700;
  line-height: 1.45;
  color: #4a3f35;
}
.opt-check {
  position: absolute;
  top: 8rpx;
  right: 20rpx;
  font-size: 44rpx;
  font-weight: 900;
  color: #3bb273;
}
.shake {
  animation: shake 0.45s;
}
.reveal-bar {
  background: #e8f8ee;
  border-radius: 30rpx;
  padding: 24rpx 28rpx;
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}
.reveal-text {
  font-size: 30rpx;
  font-weight: 700;
  line-height: 1.5;
  color: #2f8f5b;
}
.next-btn {
  align-self: flex-end;
  background: linear-gradient(135deg, #ffb84d, #ff8c42);
  border-radius: 40rpx;
  padding: 14rpx 44rpx;
  box-shadow: 0 8rpx 20rpx rgba(255, 140, 66, 0.35);
}
.next-btn:active {
  transform: scale(0.97);
}
.next-text {
  color: #ffffff;
  font-size: 32rpx;
  font-weight: 800;
}
@keyframes reveal-pop {
  0% { transform: scale(0.96); }
  60% { transform: scale(1.02); }
  100% { transform: scale(1); }
}
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-16rpx); }
  50% { transform: translateX(16rpx); }
  75% { transform: translateX(-10rpx); }
}

/* 结算 */
.result {
  flex: 1;
  min-height: 0;
  padding-top: 12vh;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.result-emoji {
  font-size: 140rpx;
}
.result-emoji-perfect {
  animation: trophy-pop 0.7s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes trophy-pop {
  0% { transform: scale(0.2) rotate(-30deg); }
  70% { transform: scale(1.25) rotate(8deg); }
  100% { transform: scale(1) rotate(0deg); }
}
.result-score {
  margin-top: 30rpx;
  font-size: 46rpx;
  font-weight: 800;
  color: #4a3f35;
  text-align: center;
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
  height: 104rpx;
  border-radius: 52rpx;
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
  font-size: 36rpx;
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

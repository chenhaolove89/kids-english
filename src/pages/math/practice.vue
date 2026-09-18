<template>
  <view class="page">
    <PageTopBar class="topbar-page" :title="titleText" @back="goBack">
      <text class="score">⭐ {{ firstCorrect }}</text>
    </PageTopBar>

    <!-- q.kind 兜底：错题重练池为空时页面会先渲染再跳回主页（toast + 700ms 后 reLaunch），
         那段时间 questions 还是空的、finished 仍是 false —— 少了这层判断就会去读
         q.options.length 而抛 TypeError（实测：重练无到期条目时控制台报
         "Cannot read properties of undefined (reading 'length')"），同时还会显示
         「第 1 / 0 题」。有 q.kind 才渲染题目区。 -->
    <template v-if="!finished && q.kind">
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
            :class="{ right: (flash === String(gi) && isRight) || revealId === String(gi), wrong: flash === String(gi) && !isRight, shake: flash === String(gi) && !isRight, reveal: revealId === String(gi) }"
            @tap.stop="pickById(String(gi))"
          >
            <template v-if="g.emojis">
              <text v-for="(e, i) in g.emojis" :key="i" class="dot-emoji">{{ e }}</text>
            </template>
            <text v-else class="compare-num">{{ g.n }}</text>
            <text v-if="revealId === String(gi)" class="opt-check">✓</text>
          </view>
        </view>

        <!-- 应用题与长句题（时间测量/周长面积/分数/百分数/统计）：读一句题再选答案（长句用小字可换行）。
             长句题由生成器打 q.longText 标记，页面不维护题型清单——新增题型漏改一处 v-if 就会掉进下面的算式分支挤成一团。 -->
        <view v-else-if="q.longText || q.kind === 'wordAdd' || q.kind === 'wordSub' || q.kind === 'wordMul'" class="equation-wrap">
          <text class="word-problem">{{ q.display }}</text>
        </view>

        <!-- 数字算式 / 数列 / 听音 -->
        <view v-else class="equation-wrap">
          <text v-if="q.kind === 'listen'" class="listen-icon">🔊</text>
          <text v-else class="equation" :class="{ 'equation-seq': q.kind === 'sequence' }" :style="{ fontSize: equationSize }">{{ q.display }}</text>
        </view>
      </view>

      <!-- 选项：比大小两种题型直接点组卡片，没有数字选项 -->
      <view v-if="q.kind !== 'compare' && q.kind !== 'compareNum'" class="options" :class="'opts-' + (q.options || []).length">
        <view
          v-for="opt in q.options"
          :key="opt.id"
          class="opt"
          :class="{ right: (flash === opt.id && isRight) || revealId === opt.id, wrong: flash === opt.id && !isRight, shake: flash === opt.id && !isRight, reveal: revealId === opt.id }"
          @tap="pickById(opt.id)"
        >
          <text class="opt-text">{{ opt.label }}</text>
          <!-- 答错后揭晓：绿框 + 对勾 + 读一遍正确答案 -->
          <text v-if="revealId === opt.id" class="opt-check">✓</text>
        </view>
      </view>

      <view v-if="revealId" class="reveal-bar">
        <text class="reveal-text">{{ revealText }}</text>
      </view>
    </template>

    <template v-else-if="finished">
      <!-- 过关庆祝：彩带只在正式关卡出现（错题重练用 ✅，不撒花） -->
      <Confetti :show="finished && !reviewMode" />
      <view class="result">
        <text class="result-emoji" :class="{ 'result-emoji-perfect': !reviewMode && perfect }">{{ reviewMode ? '✅' : perfect ? '🏆' : '🎉' }}</text>
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
import { goBackOrHome } from '@/platform/nav.js'
import { getLesson, catalog } from '@/content/catalog.js'
import { buildQuestions, normalizeMathLevel, mathText, mathItemId, MATH_LEVELS } from '@/domain/mathgen.js'
import { isPickCorrect } from '@/domain/judge.js'
import { starsForFirstAttempt, starsText as starsBar } from '@/domain/progress.js'
import { mathExplain } from '@/domain/explain.js'
import { getSessionService } from '@/services/session.js'
import { getCollectionService } from '@/services/collection-app.js'
import { getReviewService } from '@/services/review.js'
import { getReviewPool } from '@/services/review-pools.js'
import { nextPraiseSrc, praiseSrcs } from '@/services/encourage-app.js'
import Confetti from '@/components/confetti.vue'
import PageTopBar from '@/components/page-top-bar.vue'

const level = ref(MATH_LEVELS[1])
const questions = ref([])
const qIdx = ref(0)
const score = ref(0)
const firstCorrect = ref(0)
const finished = ref(false)
const flash = ref('')
const isRight = ref(false)
// 答错后揭晓正确答案（绿框 + 对勾 + 读一遍答案），再自动进入下一题。
// 原实现只播「再想一想」并清掉红框，孩子只能反复猜，等于不教。
const revealId = ref('')
const revealing = ref(false)
const q = computed(() => questions.value[qIdx.value] || {})

/** 揭晓时长：够听完「再想一想」+ 一遍正确答案读音 */
const REVEAL_MS = 3000

/**
 * 揭晓提示文案：先讲"为什么"（domain/explain 按题型把算式补全、把两边数量说清），
 * 拿不准时退回原来那句"正确答案是 X ✓"——宁可不讲，也不讲错。
 */
const revealText = computed(() => {
  const cur = q.value
  const why = mathExplain(cur)
  if (why) return why
  if (cur.kind === 'compare' || cur.kind === 'compareNum') return '正确答案是高亮的那一边 ✓'
  const hit = (cur.options || []).find((o) => String(o.id) === String(cur.answer))
  return hit ? `正确答案是 ${hit.label} ✓` : '正确答案是绿色的这个 ✓'
})

/** 算式按长度缩字：万以内/四则混合的长算式（831 + ? = 1415）96rpx 定字会顶破卡片 */
const equationSize = computed(() => {
  const len = (q.value?.display || '').length
  if (len <= 8) return '96rpx'
  if (len <= 12) return '72rpx'
  if (len <= 16) return '56rpx'
  return '44rpx'
})

const svc = getSessionService(catalog.contentVersion)

/**
 * 定时器登记表：页面卸载时统一清掉。
 * 否则「答对后 1.5s 进下一题」「揭晓后 3s 进下一题」的定时器会在退出页面后继续跑，
 * 触发 nextQuestion 去 completeSession，把已中断的会话记成完成。
 */
let timers = []
function later(fn, ms) {
  const t = setTimeout(() => {
    timers = timers.filter((x) => x !== t)
    fn()
  }, ms)
  timers.push(t)
  return t
}
function clearTimers() {
  timers.forEach((t) => clearTimeout(t))
  timers = []
}
const review = getReviewService()
const lesson = ref(null) // 有 lessonId 才记录会话；旧入口只玩不记录
const reviewMode = ref(false) // 错题重练：?review=1——到期错题原题重放，不计课时会话
const firstPickMap = new Map()

const starsText = computed(() => starsBar(starsForFirstAttempt(firstCorrect.value, questions.value.length)))
/** 满星（首答正确率 ≥90%）：结果页换 🏆 并弹跳（重练模式不参与） */
const perfect = computed(() => finished.value && !reviewMode.value && starsForFirstAttempt(firstCorrect.value, questions.value.length) === 3)
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
  preload([assetUrl('/static/audio/zh-try.mp3'), ...praiseSrcs().map((p) => assetUrl(p))])

  // 错题重练模式：题目来自错题本到期条目（存的是答错那道的整题快照），原题重放
  if (query.review === '1') {
    reviewMode.value = true
    const pool = getReviewPool('math')
    if (!pool.length) {
      uni.showToast({ title: '太棒了，暂无待复习', icon: 'none' })
      // 直链进入无返回历史：回主页而不是 navigateBack
      later(() => uni.reLaunch({ url: '/pages/map/map' }), 700)
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
  // 兼容旧版按 level 直链：没有 lessonId 时也要从目录反查，draft 关卡不能绕过状态门禁。
  const rawLevel = Number(query.level)
  const fallbackLesson = Number.isInteger(rawLevel) && rawLevel >= 1 && rawLevel <= 9
    ? getLesson('math-practice-l' + rawLevel)
    : null
  const l = getLesson(query.lessonId) || fallbackLesson
  if (l && l.status !== 'available') {
    uni.showToast({ title: '内容准备中', icon: 'none' })
    later(() => uni.reLaunch({ url: '/pages/map/map' }), 600)
    return
  }
  const lvId = normalizeMathLevel(l && l.ref?.kind === 'math-level' ? l.ref.id : query.level)
  level.value = MATH_LEVELS[lvId]

  if (l) {
    lesson.value = l
    const resumed = svc.resumeSessionFor(l.id, 'challenge')
    if (resumed?.snapshot?.questions?.length) {
      restoreSnapshot(resumed.snapshot)
      return
    }
    svc.startSession({ lessonId: l.id, kind: 'challenge', skillIds: l.skillIds || [], contentVersion: catalog.contentVersion })
  }
  startFresh()
})

onUnload(() => {
  clearTimers()
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
  revealId.value = ''
  revealing.value = false
  preload(q.value.seq || [])
  if (lesson.value) svc.saveSnapshot(currentSnapshot())
  later(() => playSeq(q.value.seq), 350)
}

function respeak() {
  // 答对后的推进链挂在表扬音的 end 回调上（见 pickById）：此时点题目重听会顶掉
  // 推进链（seqToken 自增 + stop() 让 end 永不触发）→ 页面卡死在已答完的题上
  if (revealing.value || flash.value) return
  playSeq(q.value.seq)
}

function pickById(id) {
  if (flash.value || revealing.value) return
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
    // 立即落快照（quiz 同款口径）：表扬音播放窗口内退出，重进同题重放也不能丢首答星
    if (lesson.value) svc.saveSnapshot(currentSnapshot())
    // 推进用定时器而不是音频 end 回调：respeak/loaderror 等旁路会让 end 永不触发（卡死），
    // quiz 侧同场景全用定时器推进——两种写法统一到定时器
    later(nextQuestion, 1400)
    playSeq([assetUrl(nextPraiseSrc())])
  } else {
    // 答错：先提示，再揭晓正确答案并读一遍，停留够长后自动进入下一题。
    // 揭晓期间屏蔽点击——首答已定，不让孩子靠「被告知答案后再点」刷分或刷错题晋级。
    revealId.value = String(q.value.answer)
    revealing.value = true
    if (lesson.value) svc.saveSnapshot(currentSnapshot())
    playSeq([assetUrl('/static/audio/zh-try.mp3')], speakAnswer)
    later(nextQuestion, REVEAL_MS)
  }
}

/** 揭晓时读一遍正确答案本身：数值答案有 n0..n100 音轨；比大小答的是组序号，只给「对」的提示音 */
function speakAnswer() {
  const cur = q.value
  if (!cur || finished.value) return
  if (cur.kind === 'compare' || cur.kind === 'compareNum') {
    playSeq([assetUrl('/static/audio/zh-ok.mp3')])
    return
  }
  const n = Number(cur.answer)
  if (Number.isInteger(n) && n >= 0 && n <= 100) playSeq([assetUrl('/static/audio/n' + n + '.mp3')])
  else playSeq([assetUrl('/static/audio/zh-ok.mp3')])
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
    svc.startSession({ lessonId: lesson.value.id, kind: 'challenge', skillIds: lesson.value.skillIds || [], contentVersion: catalog.contentVersion })
  }
  startFresh()
}
function goBack() {
  playSeq([assetUrl('/static/audio/zh-btn-back.mp3')])
  goBackOrHome()
}
</script>

<style scoped>
/**
 * 纵向版式：整页按视口高度分配（同 quiz.vue）。
 *
 * 1rpx 在宽屏（≥750px）按 750 基准换算 = 1px（见 App.vue），本页设计高度约 1230rpx
 * 在 iPad 上就是 1230px —— 竖屏 1024、横屏 744 都装不下；题目区还会随题型变高
 * （点数题 10 张卡、应用题长句），旧版只写了 min-height，于是 iPad 上「只显示一半」，
 * 而且原标了 disableScroll（真机 touchmove 被 preventDefault）连滑都滑不动。
 *
 * 现在：固定高度 + flex 分配；题目区只缩不长（窄屏版式不变），
 * 选项/题面尺寸按 min(设计值, 视口比例) 收；仍装不下的极端题面靠页面滚动兜底
 * （pages.json 已去掉本页的 disableScroll）。
 */
.page {
  height: 100vh;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  background: #fff8ec;
  box-sizing: border-box;
  /* 底部再叠 --bottom-gap：微信内置浏览器的底部工具条会盖住贴底的选项卡（见 App.vue） */
  padding-bottom: env(safe-area-inset-bottom);
  padding-bottom: calc(env(safe-area-inset-bottom) + var(--bottom-gap));
}
/* 顶栏：结构与样式在 components/page-top-bar.vue，这里只保留本页内边距 */
.topbar-page {
  flex-shrink: 0;
  padding: calc(24rpx + env(safe-area-inset-top)) 32rpx 12rpx;
}
.score {
  min-width: 84rpx;
  text-align: right;
  font-size: 34rpx;
  font-weight: 700;
  color: #ff8c42;
}
.round-info {
  flex-shrink: 0;
  text-align: center;
  font-size: min(27rpx, 2.8vh);
  color: #b3a492;
  font-weight: 600;
  margin-top: min(8rpx, 0.8vh);
}
.stage {
  /* 只缩不长：窄屏上仍旧按 min-height 380rpx 撑开（版式不变），
     矮视口上缩到视口比例，把高度让给选项卡 */
  flex: 0 1 auto;
  min-height: min(380rpx, 30vh);
  margin: min(26rpx, 2.6vh) 44rpx 0;
  background: #ffffff;
  border-radius: 44rpx;
  padding: min(34rpx, 3.4vh);
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
  font-size: min(64rpx, 7vh);
  line-height: 1.15;
}
/* 物品卡片拼贴：马卡龙底色 + 轻微错落旋转，比一排相同 emoji 更抓眼 */
.tiles {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: min(18rpx, 1.8vh);
  max-width: 460rpx;
}
.tile {
  width: min(120rpx, 13vh);
  height: min(120rpx, 13vh);
  border-radius: 32rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6rpx 14rpx rgba(120, 90, 40, 0.1);
}
.tile.sm {
  width: min(92rpx, 10vh);
  height: min(92rpx, 10vh);
  border-radius: 26rpx;
}
.tile-emoji {
  font-size: min(72rpx, 7.8vh);
  line-height: 1;
}
.tile.sm .tile-emoji {
  font-size: min(54rpx, 5.8vh);
}
.tile.faded {
  opacity: 0.25;
}
/* 图案超过 6 个自动缩卡：一行能排 4-5 个，避免挤出卡片 */
.tiles-many .tile {
  width: min(88rpx, 9.6vh);
  height: min(88rpx, 9.6vh);
  border-radius: 24rpx;
}
.tiles-many .tile-emoji {
  font-size: min(50rpx, 5.4vh);
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
  min-height: min(240rpx, 22vh);
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
  position: relative;
}
/* 答错后揭晓的正确答案：绿框 + 对勾（多一条非颜色通道，不识字也看得懂） */
.compare-card.reveal {
  border-color: #3bb273;
  background: #e8f8ee;
  animation: reveal-pop 0.5s;
}
.opt-check {
  position: absolute;
  top: 6rpx;
  right: 16rpx;
  font-size: min(52rpx, 5.6vh);
  font-weight: 900;
  color: #3bb273;
}
.reveal-bar {
  flex-shrink: 0;
  margin: 8rpx 48rpx 0;
  padding: min(18rpx, 1.8vh) 24rpx;
  border-radius: 24rpx;
  background: #e8f8ee;
  text-align: center;
}
.reveal-text {
  font-size: min(34rpx, 3.6vh);
  font-weight: 700;
  color: #2f8f5b;
}
@keyframes reveal-pop {
  0% {
    transform: scale(0.94);
  }
  60% {
    transform: scale(1.03);
  }
  100% {
    transform: scale(1);
  }
}
.compare-card:active {
  transform: scale(0.97);
}
.compare-card.right {
  border-color: #3bb273;
  background: #e8f8ee;
}
.compare-num {
  font-size: min(110rpx, 11vh);
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
/* 算式字号由 :style 的 equationSize 按长度决定（见 script），这里只留基础值 */
.equation {
  font-size: 96rpx;
  font-weight: 800;
  color: #4a3f35;
  letter-spacing: 2rpx;
  white-space: nowrap;
}
/* 应用题题干：一句小故事，小字号可换行 */
.word-problem {
  font-size: min(44rpx, 4.6vh);
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
  font-size: min(130rpx, 13vh);
}
.options {
  flex-shrink: 0;
  margin: min(34rpx, 3.4vh) 60rpx;
  display: flex;
  flex-wrap: wrap;
  gap: min(26rpx, 2.6vh);
}
.options.opts-2 .opt,
.options.opts-3 .opt,
.options.opts-4 .opt {
  width: calc(50% - 13rpx);
}
.opt {
  height: min(150rpx, 12vh);
  background: #ffffff;
  border-radius: 36rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 10rpx 30rpx rgba(120, 90, 40, 0.08);
  border: 6rpx solid transparent;
  box-sizing: border-box;
  position: relative;
}
.opt.reveal {
  border-color: #3bb273;
  background: #e8f8ee;
  animation: reveal-pop 0.5s;
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
  font-size: min(64rpx, 6.6vh);
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
  flex: 1;
  min-height: 0;
  /* 结果页也可能比一屏高（iPad 横屏 744）：允许它自己滚，别把「返回」裁掉 */
  overflow-y: auto;
  padding-top: 22vh;
  display: flex;
  flex-direction: column;
  align-items: center;
}
/* 宽而矮（横屏 iPad）：22vh 的顶部留白太贵，结果页会多出一段滚动才够到「返回」 */
@media (min-width: 750px) and (max-height: 860px) {
  .result {
    padding-top: 12vh;
  }
}
.result-emoji {
  font-size: min(140rpx, 12vh);
}
/* 满星奖杯：弹出 + 轻微摇摆（quiz 同款） */
.result-emoji-perfect {
  animation: trophy-pop 0.7s cubic-bezier(0.34, 1.56, 0.64, 1), trophy-swing 2.2s 0.7s ease-in-out infinite;
}
@keyframes trophy-pop {
  0% { transform: scale(0.2) rotate(-30deg); }
  70% { transform: scale(1.25) rotate(8deg); }
  100% { transform: scale(1) rotate(0deg); }
}
@keyframes trophy-swing {
  0%, 100% { transform: rotate(0deg); }
  25% { transform: rotate(-9deg); }
  75% { transform: rotate(9deg); }
}
.result-score {
  margin-top: min(30rpx, 2.4vh);
  font-size: min(48rpx, 5vh);
  font-weight: 800;
  color: #4a3f35;
  text-align: center;
}
.result-stars {
  margin-top: min(20rpx, 1.6vh);
  font-size: min(52rpx, 5.4vh);
  letter-spacing: 8rpx;
}
.result-note {
  margin-top: min(14rpx, 1.2vh);
  font-size: min(27rpx, 2.8vh);
  color: #b3a492;
  text-align: center;
}
.result-btn {
  flex-shrink: 0;
  margin-top: min(56rpx, 4.6vh);
  width: 420rpx;
  height: min(110rpx, 9vh);
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
  font-size: min(38rpx, 4vh);
  font-weight: 800;
}
.result-btn.ghost {
  margin-top: min(28rpx, 2.4vh);
  background: #ffffff;
  box-shadow: 0 8rpx 20rpx rgba(120, 90, 40, 0.1);
}
.ghost-text {
  color: #8a8073;
}
</style>

<template>
  <view class="page">
    <PageTopBar class="topbar-page" :title="pageTitle" @back="goBack">
      <text class="score">⭐ {{ firstCorrect }}</text>
    </PageTopBar>

    <!-- 声音预加载进度：慢网下孩子能看到声音在来的路上 -->
    <view v-if="audioTotal > 0 && audioDone < audioTotal" class="load-bar">
      <view class="load-fill" :style="{ width: audioPercent + '%' }"></view>
    </view>

    <!-- rounds.length 兜底：池为空的早退路径（错题本空 / 深链参数无效）会先渲染再跳回主页，
         少了这层判断那 600~700ms 会显示「第 1 / 0 题」；结果卡片同理只在真的完成时出现 -->
    <template v-if="!finished && rounds.length">
      <view class="prompt" :class="{ 'prompt-loading': audioLoading }" @tap="speakQuestion">
        <text v-if="stemText" class="stem" :class="roundKind === 'pinyin-to-char' ? 'stem-pinyin' : roundKind === 'poem-fill' ? 'stem-line' : 'stem-char'">{{ stemText }}</text>
        <text v-if="showSpeaker" class="prompt-speaker">🔊</text>
        <text class="prompt-hint">{{ promptHint }}</text>
      </view>

      <view class="round-info">第 {{ roundIdx + 1 }} / {{ rounds.length }} 题</view>

      <view class="options" :class="[{ 'options-text': subject === 'zh' }, 'options-' + options.length]">
        <view
          v-for="opt in options"
          :key="opt.id"
          class="option"
          :class="{ right: (flashId === opt.id && isRight) || revealId === opt.id, wrong: flashId === opt.id && !isRight, shake: flashId === opt.id && !isRight, reveal: revealId === opt.id }"
          @tap="pick(opt)"
        >
          <image v-if="opt.image && !imgFail[opt.id]" class="opt-img" :src="opt.image" mode="aspectFit" @error="onImgError(opt.id)" />
          <text v-else-if="isCharOption" class="opt-char" :style="{ color: opt.color }">{{ opt.main || opt.en || opt.label }}</text>
          <text v-else class="opt-label">{{ opt.en || opt.main || opt.label }}</text>
          <!-- 答错后揭晓：绿框 + 对勾（不识字也看得懂），并读出正确答案 -->
          <text v-if="revealId === opt.id" class="opt-check">✓</text>
        </view>
      </view>

      <view v-if="revealId" class="reveal-bar">
        <text class="reveal-text">{{ revealText }}</text>
      </view>
    </template>

    <template v-else-if="finished">
      <!-- 过关庆祝：彩带 + 满星时奖杯弹出（review 重练完成也值得庆祝） -->
      <Confetti :show="finished" />
      <view class="result">
        <text class="result-emoji" :class="{ 'result-emoji-perfect': perfect }">{{ perfect ? '🏆' : '🎉' }}</text>
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
import { ref, computed, watch } from 'vue'
import { onLoad, onUnload } from '@dcloudio/uni-app'
import { play, playEn, preload, preloadWithProgress, accentEnSrc, isAudioReady, whenAudioReady, stopSeq } from '@/platform/audio.js'
import { assetUrl } from '@/platform/assets.js'
import { goBackOrHome } from '@/platform/nav.js'
import { getLesson } from '@/content/catalog.js'
import { resolveEnCategory, resolveEnLevel, resolveZhLevel, resolveAllEnWords, mapZhOption } from '@/content/adapters.js'
import { isCategoryHidden } from '@/content/lowAge.js'
import { buildListenPickRounds, buildZhCharRounds, buildPoemFillRounds } from '@/domain/rounds.js'
import poemsData from '@/data/poems.json'
import { isRoundPickCorrect } from '@/domain/judge.js'
import { starsForFirstAttempt, starsText as starsBar } from '@/domain/progress.js'
import { roundExplain } from '@/domain/explain.js'
import { getSessionService } from '@/services/session.js'
import { getCollectionService } from '@/services/collection-app.js'
import { getReviewService } from '@/services/review.js'
import { getReviewPool } from '@/services/review-pools.js'
import { nextPraiseSrc, praiseSrcs } from '@/services/encourage-app.js'
import Confetti from '@/components/confetti.vue'
import PageTopBar from '@/components/page-top-bar.vue'

const ROUNDS = 10

const subject = ref('en')
const reviewMode = ref(false) // 错题重练模式：/?review=en|zh
const zhWordsMode = ref(false) // 语文词语挑战：听中文音选图（池与英语分类同源）
const poemMode = ref(false) // 古诗填字：/?poem=<stage> 听句选字（池来自 data/poems.json）
const pool = ref([])
const rounds = ref([])
const roundIdx = ref(0)
const score = ref(0)
const firstCorrect = ref(0)
const options = ref([])
const flashId = ref('')
const isRight = ref(false)
const finished = ref(false)
// 答错后揭晓正确答案：绿框 + 对勾 + 读一遍正确读音，再自动进入下一题。
// 原实现只播「再想一想」让红框消失，孩子只能反复猜，等于不教。
const revealId = ref('')
const revealing = ref(false)

const svc = getSessionService()

/**
 * 定时器登记表：页面卸载时统一清掉。
 * 否则「答对 1.5s 后进下一题」「揭晓后 3s 进下一题」的定时器会在退出后继续跑，
 * 触发 nextRound → completeSession，把已中断的会话记成完成。
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
// 错题重练小池的候补干扰项（仅 review 模式赋值）：池只有两三个词时 2 选 1 近乎送分
const extraPool = ref(null)
// 选项图加载失败（线上漏传/断网）：降级成文字卡，避免「半页空白选项看起来只有 2 个」
const imgFail = ref({})
const firstPickMap = new Map() // 旧入口模式的「首答」标记
// 声音预加载进度 + 当前题题干音频加载态（慢网下喇叭呼吸闪烁，防误以为没声音）
const audioDone = ref(0)
const audioTotal = ref(0)
const audioLoading = ref(false)

const audioPercent = computed(() => (audioTotal.value ? Math.round((audioDone.value / audioTotal.value) * 100) : 0))

/** 古诗填字池：阶段内每首诗每行的每个汉字（id 含行/列位置，保证全局唯一） */
function poemFillPool(stage) {
  const items = []
  for (const poem of poemsData.poems) {
    if (poem.stage !== stage) continue
    poem.lines.forEach((line, li) => {
      ;[...line].forEach((ch, ci) => {
        if (!/[\u4e00-\u9fff]/.test(ch)) return
        items.push({
          id: `${poem.id}-${li}-${ci}`,
          char: ch,
          lineText: line,
          lineAudio: assetUrl('/static/audio-poem/' + poem.id + '-l' + li + '.mp3'),
          poemTitle: poem.title,
        })
      })
    })
  }
  return items
}

function startAudioPreload(srcs) {
  const list = [...new Set(srcs.filter(Boolean))]
  audioTotal.value = list.length
  audioDone.value = 0
  preloadWithProgress(list, (done) => {
    audioDone.value = done
  })
}

function refreshAudioLoading() {
  const r = rounds.value[roundIdx.value]
  if (!r || r.kind !== 'listen-pick') {
    audioLoading.value = false
    return
  }
  const src = subject.value === 'en' ? accentEnSrc(r.answer.audio) : r.answer.audio
  audioLoading.value = !!src && !isAudioReady(src)
  if (!src) return
  whenAudioReady(src).then(() => {
    const cur = rounds.value[roundIdx.value]
    if (cur && (subject.value === 'en' ? accentEnSrc(cur.answer.audio) : cur.answer.audio) === src) {
      audioLoading.value = false
    }
  })
}
watch([roundIdx, rounds], refreshAudioLoading)

const starsText = computed(() => starsBar(starsForFirstAttempt(firstCorrect.value, rounds.value.length)))

/** 满星（首答正确率 ≥90%）：结果页换 🏆 并弹跳 */
const perfect = computed(() => finished.value && starsForFirstAttempt(firstCorrect.value, rounds.value.length) === 3)

/**
 * 答错后的讲解（domain/explain 按题型生成）：听音题说出听到的词与中文释义、
 * 看拼音选字说出读音对应的字、组词题给出它组成的词、古诗填字把整句说出来。
 * 拿不准时保留原来那句兜底文案——宁可不讲，也不讲错。
 */
const revealText = computed(() => {
  const r = rounds.value[roundIdx.value]
  return roundExplain(r) || '正确答案是绿色的这个 ✓'
})
const starsNote = computed(() => `共 ${rounds.value.length} 题 · 首次选对得星`)
const pageTitle = computed(() => {
  if (reviewMode.value) return '错题重练'
  if (poemMode.value) return '古诗填字'
  if (subject.value === 'zh') return zhWordsMode.value ? '词语挑战' : '汉字挑战'
  return '听音选图'
})
// 语文混合题型：当前轮的 kind 决定题干（字/拼音）与选项渲染（大字/文本）
const roundKind = computed(() => rounds.value[roundIdx.value]?.kind || 'listen-pick')
const stemText = computed(() => {
  const r = rounds.value[roundIdx.value]
  if (!r || r.kind === 'listen-pick') return ''
  if (r.kind === 'poem-fill') return r.prompt
  return r.kind === 'pinyin-to-char' ? r.answer.pinyin : r.answer.char
})
const showSpeaker = computed(() => roundKind.value === 'listen-pick' || roundKind.value === 'poem-fill')
const isCharOption = computed(() => ['listen-pick', 'pinyin-to-char', 'poem-fill'].includes(roundKind.value))
const promptHint = computed(() => {
  if (poemMode.value) return '听一听，选出句中缺的字'
  if (zhWordsMode.value) return '听一听，选出对应的图片'
  if (subject.value === 'en') return '听一听，选出对应的图片'
  switch (roundKind.value) {
    case 'char-to-pinyin': return '看一看，选出正确的读音'
    case 'pinyin-to-char': return '读一读，选出对应的汉字'
    case 'char-to-word': return '想一想，选出含这个字的词'
    default: return '听一听，选出对应的汉字'
  }
})

onLoad((query) => {
  // 错题重练模式：/?review=en|zh——题目来自错题本到期条目，不计课时会话
  reviewMode.value = query.review === 'en' || query.review === 'zh'
  subject.value = reviewMode.value ? query.review : query.subject || 'en'
  // 反馈语音用中文：孩子听不懂英文夸奖（口音试听仍用英文，见家长中心）。
  // 表扬语整池预载（每条 ~10KB）：轮换短语答对瞬间就要响，不能等网络
  preload([assetUrl('/static/audio/zh-try.mp3'), ...praiseSrcs().map((p) => assetUrl(p))])
  let p = []
  if (reviewMode.value) {
    p = getReviewPool(subject.value)
    if (!p.length) {
      uni.showToast({ title: '太棒了，暂无待复习', icon: 'none' })
      later(() => uni.reLaunch({ url: '/pages/map/map' }), 700)
      return
    }
    // 错题重练借全库词当候补干扰项：保证每题仍有 4 选 1 的分辨度。
    // 语文池混汉字条目时不补（汉字干扰必须同池同型），英语/词语池借图卡词补
    if (subject.value === 'en') extraPool.value = resolveAllEnWords()
    else if (p.every((x) => x.image)) extraPool.value = resolveAllEnWords().filter((w) => w.zhAudio)
  } else if (subject.value === 'en') {
    if (query.cat) {
      p = resolveEnCategory(query.cat)?.words ?? []
    } else {
      // 有课程时以课程目录的级别为准（URL 参数不可信）
      const l = getLesson(query.lessonId)
      const lv = l && l.ref?.kind === 'en-level' ? l.ref.id : Number(query.level) || 1
      p = resolveEnLevel(lv)
    }
  } else if (query.poem) {
    // 古诗填字：池来自该阶段古诗（听整句选缺字），课时记在古诗学一学课上
    poemMode.value = true
    subject.value = 'zh'
    p = poemFillPool(String(query.poem))
  } else if (query.cat) {
    // 语文词语挑战：与英语分类同池，主音频换中文读音
    zhWordsMode.value = true
    const c = resolveEnCategory(query.cat)
    p = (c?.words ?? []).map((w) => ({ ...w, audio: w.zhAudio || w.audio }))
  } else {
    const l = getLesson(query.lessonId)
    const lv = l && l.ref?.kind === 'zh-level' ? l.ref.id : Number(query.level) || 1
    const level = resolveZhLevel(lv)
    p = level.chars.map(mapZhOption)
  }
  // 音频预载已移到 start()/restoreSnapshot()：出轮后只预载本轮题目要播的音频，
  // 不再整池预载（sightwords 池 308 词整池压缓存是 iPad 内存杀手）
  pool.value = p
  if (!p.length) {
    // 深链参数无效（分类/级别不存在）：提示后回课程页，而不是卡在空页面
    uni.showToast({ title: '内容准备中', icon: 'none' })
    later(() => uni.reLaunch({ url: '/pages/map/map' }), 600)
    return
  }

  const l = getLesson(query.lessonId)
  // 深链指向被低龄模式隐藏的分类课时，池已过滤但课程不可见，降级为不记录
  const trackable = !(l && l.ref?.kind === 'en-category' && isCategoryHidden(l.ref.id))
  if (l && trackable) {
    lesson.value = l
    const resumed = svc.resumeSessionFor(l.id, 'challenge')
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
  clearTimers()
  stopSeq()
  if (lesson.value && !finished.value) svc.pauseSession()
})

/** 恢复：题目快照原样回来，重进不重新出题，记录与题目不错配 */
function restoreSnapshot(snap) {
  rounds.value = snap.rounds
  roundIdx.value = Math.max(0, Math.min(snap.roundIdx || 0, snap.rounds.length - 1))
  score.value = snap.score || 0
  firstCorrect.value = snap.firstCorrect || 0
  finished.value = false
  preloadRoundAudio()
  loadRound()
}

function currentSnapshot() {
  return { rounds: rounds.value, roundIdx: roundIdx.value, score: score.value, firstCorrect: firstCorrect.value }
}

/** 只预载本轮题目实际要播的音频（每题 1 条）。
 * 旧做法整池预载，sightwords 池 308 词会一次性压进音频缓存（MAX_CACHED=60 形同虚设），
 * iPad Safari 内存吃紧易被系统回收。未被预到的词由 play() 按需加载兜底。 */
function preloadRoundAudio() {
  startAudioPreload(
    rounds.value.map((r) => {
      const src = r.kind === 'poem-fill' ? r.audio : r.answer?.audio
      if (!src) return ''
      return subject.value === 'en' ? accentEnSrc(src) : src
    }),
  )
}

function start() {
  // 出轮统一走 domain/rounds.js：与单测同一份实现，避免页面内重复实现将来漂移
  // 语文汉字课（含纯汉字错题重练）走多题型；词语课/英语/混池错题走听音选图
  const allChars = pool.value.length > 0 && pool.value.every((x) => typeof x.char === 'string' && typeof x.pinyin === 'string')
  rounds.value = poemMode.value
    ? buildPoemFillRounds(pool.value, { count: ROUNDS })
    : subject.value === 'zh' && !zhWordsMode.value && allChars
      ? buildZhCharRounds(pool.value, { count: ROUNDS })
      : buildListenPickRounds(pool.value, { count: ROUNDS, distractorPool: extraPool.value || undefined })
  roundIdx.value = 0
  score.value = 0
  firstCorrect.value = 0
  firstPickMap.clear()
  finished.value = false
  if (lesson.value) svc.saveSnapshot(currentSnapshot())
  preloadRoundAudio()
  loadRound()
}

function loadRound() {
  flashId.value = ''
  revealId.value = ''
  revealing.value = false
  options.value = rounds.value[roundIdx.value].options
  if (lesson.value) svc.saveSnapshot(currentSnapshot())
  later(speakQuestion, 450)
}

/** 选项图 404（线上漏传/弱网）：记住并降级文字卡，下次同样不显示破图 */
function onImgError(id) {
  imgFail.value = { ...imgFail.value, [id]: true }
}

function speakQuestion() {
  if (finished.value) return
  // 文本题干（看字选拼音等）不播音频：读了题干等于报答案；古诗填字例外——播整句朗读不报哪一字
  if (!showSpeaker.value) return
  const r = rounds.value[roundIdx.value]
  // 英语按所选口音发音；语文听音选字不动；古诗填字播整句
  if (subject.value === 'en') playEn(r.answer.audio)
  else play(r.audio || r.answer.audio)
}

function pick(opt) {
  if (flashId.value || revealing.value) return
  const round = rounds.value[roundIdx.value]
  const correct = isRoundPickCorrect(round, opt.id)
  const itemId = round.answer.id
  let firstTry = true
  if (lesson.value) {
    const attempt = svc.recordAttempt({ activityId: round.kind, order: roundIdx.value, answer: opt.id, correct, itemId })
    firstTry = attempt ? attempt.firstTry : true
  } else {
    firstTry = !firstPickMap.has(roundIdx.value)
    firstPickMap.set(roundIdx.value, true)
  }
  // 错题本：答错进本（当天可重练），已在本的答对晋级；复习/课时/旧入口三种模式都生效
  // 古诗填字不进错题本：条目是「字在句中位置」而非知识点，重练解析器无法还原句卡
  if (round.kind !== 'poem-fill') {
    review.recordResult(itemId, correct, {
      subject: subject.value,
      text: round.answer.char || round.answer.zh || round.answer.en,
      lessonId: lesson.value ? lesson.value.id : null,
    })
  }
  flashId.value = opt.id
  isRight.value = correct
  if (correct) {
    score.value++
    if (firstTry) firstCorrect.value++
    // 立即落快照：答对后有 1.5s 才进下一题，期间退出的话恢复不能丢这一题的进度
    if (lesson.value) svc.saveSnapshot(currentSnapshot())
    play(assetUrl(nextPraiseSrc()))
    later(nextRound, 1500)
  } else {
    // 答错：先提示，再揭晓正确答案（绿框 + 对勾 + 读一遍正确读音），停留够长后自动进下一题。
    // 揭晓期间屏蔽点击——这一题首答已定，不让孩子靠「被告诉答案后再点一次」刷分或刷错题晋级。
    revealId.value = round.answer.id
    revealing.value = true
    if (lesson.value) svc.saveSnapshot(currentSnapshot())
    play(assetUrl('/static/audio/zh-try.mp3'), () => speakAnswer(round))
    later(nextRound, REVEAL_MS)
  }
}

// 揭晓时长：够听完「再想一想」+ 一遍正确读音，又不至于让孩子等得不耐烦
const REVEAL_MS = 3000

/** 读出正确答案本身（英语按当前口音；语文优先该条目自己的读音，古诗回退整句） */
function speakAnswer(round) {
  if (finished.value) return
  const a = round?.answer
  if (!a) return
  const src = a.audio || a.wordAudio || round.audio
  if (!src) return
  if (subject.value === 'en') playEn(src)
  else play(src)
}

function nextRound() {
  if (roundIdx.value < rounds.value.length - 1) {
    roundIdx.value++
    loadRound()
  } else {
    finished.value = true
    if (lesson.value) {
      const done = svc.completeSession()
      // 图鉴点亮：首答答对的条目进「掌握」（复习重练无会话，不点亮）
      if (done) getCollectionService().recordChallengeDone(done)
    }
  }
}

function restart() {
  play(assetUrl('/static/audio/zh-btn-again.mp3'))
  if (lesson.value) {
    // 重开必须重新建会话，否则这一局的作答会被静默丢弃
    svc.clearActive()
    svc.startSession({ lessonId: lesson.value.id, kind: 'challenge', skillIds: lesson.value.skillIds || [] })
  }
  start()
}
function goBack() {
  play(assetUrl('/static/audio/zh-btn-back.mp3'))
  goBackOrHome()
}
</script>

<style scoped>
/**
 * 纵向版式：整页是一根「按视口高度分配」的弹性列，选项格吃掉剩余空间。
 *
 * 为什么不能靠 min-height + 滚动兜底：挑战一屏一题，孩子不该为了看选项而滑屏；
 * 而且 1rpx 在宽屏（≥750px）按 750 基准换算 = 1px（见 App.vue），
 * 本页设计高度约 1210rpx 在 iPad 上就是 1210px —— 竖屏 1024、横屏 744 都装不下，
 * 旧版正是因此「只显示一半」（pages.json 里本页原标了 disableScroll，
 * uni 给 document 挂的 touchmove+preventDefault 让真机上连滑都滑不动）。
 *
 * 现在：固定高度（100dvh）+ flex 分配，放不下时先压提示卡、再压选项卡，
 * 结构上不可能溢出；万一某台设备仍装不下（老 Safari 不认 dvh 时 100vh 是"大视口"），
 * 页面本身仍可滚动，不再是一堵墙。
 */
.page {
  height: 100vh;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  background: #fff8ec;
  box-sizing: border-box;
  /* 底部再叠 --bottom-gap：微信内置浏览器的底部工具条会盖住贴底的那排选项卡（见 App.vue） */
  padding-bottom: env(safe-area-inset-bottom);
  padding-bottom: calc(env(safe-area-inset-bottom) + var(--bottom-gap));
}
/* 顶栏：结构在 components/page-top-bar.vue，这里只给本页的内边距
  （该页 .page 不带安全区，所以顶栏自带 safe-area-inset-top） */
.topbar-page {
  flex-shrink: 0;
  padding: calc(24rpx + env(safe-area-inset-top)) 32rpx 20rpx;
}
.score {
  min-width: 84rpx;
  text-align: right;
  font-size: 34rpx;
  font-weight: 700;
  color: #ff8c42;
}
.prompt {
  /* min(设计值, 视口比例)：窄屏（1rpx≈0.5px）永远取设计值，像素不变；
     宽屏横屏（1rpx=1px）才收，省下的高度全给选项卡 */
  margin: min(30rpx, 3vh) 60rpx 0;
  background: #ffffff;
  border-radius: 44rpx;
  padding: min(40rpx, 3vh);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-shadow: 0 10rpx 30rpx rgba(120, 90, 40, 0.08);
  box-sizing: border-box;
}
.prompt:active {
  transform: scale(0.98);
}
.prompt-speaker {
  font-size: min(90rpx, 7vh);
}
/* 题干音频还在下载：喇叭呼吸闪烁，孩子知道声音在来的路上 */
.prompt-loading .prompt-speaker {
  animation: speaker-pulse 1.1s ease-in-out infinite;
}
@keyframes speaker-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
/* 课内音频预加载进度条（顶栏下方细条） */
.load-bar {
  height: 6rpx;
  margin: 0 48rpx 4rpx;
  background: #f0e4d7;
  border-radius: 3rpx;
  overflow: hidden;
  flex-shrink: 0;
}
.load-fill {
  height: 100%;
  background: linear-gradient(90deg, #ffd76e, #ff8c42);
  transition: width 0.25s;
}
.prompt-hint {
  margin-top: min(12rpx, 1vh);
  font-size: min(30rpx, 3vh);
  color: #a2917d;
}
.stem {
  font-weight: 800;
  color: #4a3f35;
}
.stem-char {
  font-size: min(120rpx, 12vh);
  line-height: 1.15;
}
.stem-pinyin {
  font-size: min(76rpx, 8vh);
  color: #ff8c42;
}
/* 古诗填字题干：整句挖空展示，比单字小一号 */
.stem-line {
  font-size: min(56rpx, 5vh);
  letter-spacing: 4rpx;
}
.round-info {
  flex-shrink: 0;
  margin-top: min(22rpx, 2.2vh);
  text-align: center;
  font-size: min(28rpx, 3vh);
  color: #b3a492;
  font-weight: 600;
}
.options {
  /* 吃掉剩余高度：两行卡片 = (可用高 - 间距) / 2，一行（2 选项）时用满 */
  flex: 1;
  min-height: 0;
  margin: min(26rpx, 2.6vh) 48rpx;
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  gap: 30rpx;
}
.option {
  width: calc(50% - 15rpx);
  height: 340rpx;
  /* 百分比只降不升：矮视口上卡片随剩余空间缩，高视口上仍是设计尺寸。
     不用 min-height 兜底——卡片一旦被地板顶住就会溢出到揭晓条上，
     宁可让字小一点，也不要两个元素叠在一起 */
  max-height: calc((100% - 30rpx) / 2);
  background: #ffffff;
  border-radius: 44rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 10rpx 30rpx rgba(120, 90, 40, 0.08);
  border: 6rpx solid transparent;
  box-sizing: border-box;
  position: relative;
}
/* 只有 2 个选项时是一行，可以占满整块可用高度 */
.options-2 .option {
  max-height: 100%;
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
/* 答错后揭晓的正确答案：与「答对」同款绿框，另加对勾与轻微呼吸，多一条非颜色通道 */
.option.reveal {
  border-color: #3bb273;
  background: #e8f8ee;
  animation: reveal-pop 0.5s;
}
.opt-check {
  position: absolute;
  top: 12rpx;
  right: 20rpx;
  font-size: 52rpx;
  font-weight: 900;
  color: #3bb273;
}
.reveal-bar {
  flex-shrink: 0;
  margin: 0 48rpx min(18rpx, 1.8vh);
  padding: min(18rpx, 1.8vh) 24rpx;
  border-radius: 24rpx;
  background: #e8f8ee;
  text-align: center;
}
.reveal-text {
  font-size: min(32rpx, 3.4vh);
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
/* 图片卡：拿满设计尺寸，但绝不超出卡片（矮视口上卡片只有一半高） */
.opt-img {
  width: 260rpx;
  height: 260rpx;
  max-width: 100%;
  max-height: 100%;
}
/* 文字选项（语文）：比图片卡矮一档 */
.options-text .option {
  height: 260rpx;
}
.opt-char {
  /* 汉字卡的字号必须跟着卡片高走：字形的行盒约 1.32×字号，
     148rpx 的字放不进 118px 的卡（iPad 横屏实测溢出 20px），所以按 13vh 封顶 */
  font-size: min(170rpx, 13vh);
  font-weight: 800;
}
.opt-label {
  font-size: min(52rpx, 6vh);
  font-weight: 800;
  color: #4a3f35;
  padding: 0 16rpx;
  text-align: center;
}
.shake {
  animation: shake 0.45s;
}
/* 矮屏（iPhone SE 568px、横屏手机、iPad 分屏）再压一档纵向空间 */
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
/* 满星奖杯：弹出 + 轻微摇摆，庆祝感给足但不吵 */
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

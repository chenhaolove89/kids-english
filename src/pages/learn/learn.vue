<template>
  <view class="page" :style="{ background: theme.bg }">
    <view class="topbar">
      <view class="back" @tap="goBack">
        <text class="back-icon">←</text>
      </view>
      <text class="cat-title">{{ title }}</text>
      <text class="progress">{{ current + 1 }}/{{ items.length }}</text>
    </view>

    <!-- 声音预加载进度：慢网下孩子能看到声音在来的路上，而不是以为没声音 -->
    <view v-if="audioTotal > 0 && audioDone < audioTotal" class="load-bar">
      <view class="load-fill" :style="{ width: audioPercent + '%' }"></view>
    </view>

    <swiper class="swiper" :current="current" duration="250" @change="onChange">
      <swiper-item v-for="(it, idx) in items" :key="it.id">
        <view class="card" @tap="speakIdx(idx)">
          <template v-if="subject === 'en'">
            <view class="img-wrap">
              <image class="word-img" :src="it.image" mode="aspectFit" />
            </view>
            <text class="word-en" :style="{ color: theme.color, fontSize: enSize(it.main) }">{{ it.main }}</text>
            <text class="word-phonetic">{{ it.phon }}</text>
            <text class="word-zh">{{ it.sub }}</text>
            <view class="tap-hint">
              <text class="tap-hint-text" :class="{ 'hint-loading': audioLoading }">{{ cardHint }}</text>
            </view>
          </template>
          <template v-else-if="wordsMode">
            <view class="img-wrap">
              <image class="word-img" :src="it.image" mode="aspectFit" />
            </view>
            <text class="word-en" :style="{ color: theme.color, fontSize: zhWordSize(it.main) }">{{ it.main }}</text>
            <view class="word-row" @tap.stop="speakExtra(idx)">
              <text class="word-zh word-sub">{{ it.phon }}</text>
              <text class="word-speaker">🔊</text>
            </view>
            <view class="tap-hint">
              <text class="tap-hint-text" :class="{ 'hint-loading': audioLoading }">{{ cardHint }}</text>
            </view>
          </template>
          <template v-else-if="sentencesMode">
            <view class="sent-wrap">
              <view v-if="it.image" class="sent-img-tile">
                <image class="sent-img" :src="it.image" mode="aspectFit" />
              </view>
              <text class="sent-text" :style="{ color: theme.color, fontSize: sentSize(it.main) }">{{ it.main }}</text>
              <view class="sent-play">
                <text class="sent-speaker">🔊</text>
              </view>
            </view>
            <view class="tap-hint">
              <text class="tap-hint-text" :class="{ 'hint-loading': audioLoading }">{{ cardHint }}</text>
            </view>
          </template>
          <template v-else>
            <view class="char-wrap" :class="{ 'has-emoji': it.emoji }">
              <view v-if="it.emoji" class="hz-emoji-tile">
                <image class="hz-emoji-img" :src="it.emoji" mode="aspectFit" />
              </view>
              <text class="char-big" :class="{ 'char-sm': it.emoji }" :style="{ color: theme.color }">{{ it.main }}</text>
            </view>
            <text class="word-pinyin">{{ it.phon }}</text>
            <view class="word-row" @tap.stop="speakExtra(idx)">
              <text class="word-zh">{{ it.sub }}</text>
              <text class="word-speaker">🔊</text>
            </view>
            <view class="write-btn" @tap.stop="goWrite(it)">
              <text class="write-btn-text">✍️ 写一写</text>
            </view>
            <view class="tap-hint">
              <text class="tap-hint-text">点字卡听发音，点词语听例词</text>
            </view>
          </template>
        </view>
      </swiper-item>
    </swiper>

    <view class="footer">
      <view class="nav-btn" @tap="prev">
        <text class="nav-text">←</text>
      </view>
      <text class="page-num">{{ current + 1 }} / {{ items.length }}</text>
      <view class="nav-btn" @tap="next">
        <text class="nav-text">→</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { onLoad, onUnload } from '@dcloudio/uni-app'
import enData from '@/data/words.json'
import zhData from '@/data/hanzi.json'
import { play, playEn, playSeq, accentEnSrc, stopSeq, preloadWithProgress, isAudioReady, whenAudioReady } from '@/platform/audio.js'
import { createThrottle } from '@/platform/nav.js'
import { LESSONS, getLesson } from '@/content/catalog.js'
import { getQimengAudioOrder } from '@/content/lowAge.js'
import { resolveEnCategory, resolveZhLevel } from '@/content/adapters.js'
import { nextLessonAfter, lessonUrl } from '@/services/curriculum.js'
import { getSessionService } from '@/services/session.js'
import { getCollectionService } from '@/services/collection.js'

const subject = ref('en')
const title = ref('')
const theme = ref({ bg: '#FFF8EC', color: '#FF8C42' })
const items = ref([])
const current = ref(0)
// 语文词语模式（subject=zh 且带 cat）：复用英语分类配图，主音频中文、小喇叭切英文
const wordsMode = ref(false)
// 语文小短句模式（subject=zh 且带 sentences）：只念例句，不混排字词
const sentencesMode = ref(false)
// 声音预加载进度：进页面后并行下载本课音频，慢网下让孩子看到「声音在来的路上」
const audioDone = ref(0)
const audioTotal = ref(0)
// 当前卡主音频是否还在下载：true 时提示「声音加载中」，防孩子误以为没声音
const audioLoading = ref(false)

const audioPercent = computed(() => (audioTotal.value ? Math.round((audioDone.value / audioTotal.value) * 100) : 0))

/** 统一入口：排队列数即总数，每条 load/loaderror 都推进度（失败不许卡死进度条） */
function startAudioPreload(srcs) {
  const list = [...new Set(srcs.filter(Boolean))]
  audioTotal.value = list.length
  audioDone.value = 0
  preloadWithProgress(list, (done) => {
    audioDone.value = done
  })
}

/** 当前卡的主音频路径（=播放序列的第一条，「声音加载中」提示跟随先播的那条） */
function mainAudioSrc(it) {
  if (!it) return ''
  if (it.zhAudio) return bilingualSeq(it)[0]
  return subject.value === 'en' ? accentEnSrc(it.audio) : it.audio
}

function refreshAudioLoading() {
  const src = mainAudioSrc(items.value[current.value])
  audioLoading.value = !!src && !isAudioReady(src)
  if (!src) return
  whenAudioReady(src).then(() => {
    // 只在还停在这张卡时清态：期间翻页了就让新卡的刷新逻辑接管
    if (mainAudioSrc(items.value[current.value]) === src) audioLoading.value = false
  })
}
watch(current, refreshAudioLoading)

const cardHint = computed(() => {
  if (audioLoading.value) return '🔊 声音加载中…'
  if (subject.value === 'en') return '点一点卡片再听一次 🔊'
  if (wordsMode.value) return '点卡片听中文，点小喇叭听英文'
  if (sentencesMode.value) return '点一点卡片，再听一遍句子 🔊'
  return '点字卡听发音，点词语听例词'
})

const svc = getSessionService()
const lesson = ref(null) // 有 lessonId 才记录会话；旧入口不记录
let completed = false
let entryRef = null // 旧入口无 lessonId 时，用入口参数反查目录定位当前课
let advancing = false // toast 600ms 窗口内防重复触发跳转

onLoad((query) => {
  subject.value = query.subject || 'en'
  let resolvedCatId = null
  if (subject.value === 'en') {
    // 走适配器：低龄模式隐藏的分类深链会回退到第一个可见分类
    const c = resolveEnCategory(query.cat) || resolveEnCategory(enData.categories[0]?.id)
    if (!c) {
      uni.showToast({ title: '内容准备中', icon: 'none' })
      setTimeout(() => uni.reLaunch({ url: '/pages/map/map' }), 600)
      return
    }
    resolvedCatId = c.id
    entryRef = { kind: 'en-category', id: c.id }
    const lv = enData.levels.find((l) => l.id === c.level)
    theme.value = { bg: lv ? lv.bg : '#FFF8EC', color: c.color }
    title.value = `${c.zh} · ${c.en}`
    // 启蒙阶段双语卡配中文读音（播放顺序家长中心可调）；其他级别仍只念英文
    const isQimeng = c.level === 1
    items.value = c.words.map((w) => ({
      id: w.id, main: w.en, phon: w.phonetic, sub: w.zh, image: w.image, audio: w.audio,
      // 字符串拼接而非反引号模板：反引号路径打包后原样保留，发布脚本改写不到 → 线上 404
      zhAudio: isQimeng ? "/static/audio-zh/" + w.id + ".mp3" : '',
    }))
    startAudioPreload(items.value.flatMap((i) => [accentEnSrc(i.audio), i.zhAudio]))
  } else if (query.cat) {
    // 语文词语课：与 en 词卡同一批图，主音频换中文（zhAudio 由内容管线保证存在）
    const c = resolveEnCategory(query.cat) || resolveEnCategory(enData.categories[0]?.id)
    if (!c) {
      uni.showToast({ title: '内容准备中', icon: 'none' })
      setTimeout(() => uni.reLaunch({ url: '/pages/map/map' }), 600)
      return
    }
    resolvedCatId = c.id
    entryRef = { kind: 'en-category', id: c.id }
    wordsMode.value = true
    const lv = enData.levels.find((l) => l.id === c.level)
    theme.value = { bg: lv ? lv.bg : '#FDEBE7', color: c.color }
    title.value = `词语 · ${c.zh}`
    items.value = c.words.map((w) => ({
      id: w.id, main: w.zh, phon: w.en, sub: '', image: w.image,
      audio: w.zhAudio || '', extraAudio: w.audio, enExtra: true, emoji: '',
    }))
    startAudioPreload(items.value.map((i) => i.audio))
  } else if (query.sentences) {
    // 小短句：只念整句，不带字卡/拼音/例词/描红（那是识字课的事）
    const lv = zhData.levels.find((l) => String(l.id) === String(query.level)) || zhData.levels[0]
    const chars = lv.chars.filter((h) => h.sentence && h.sentenceAudio)
    if (!chars.length) {
      uni.showToast({ title: '内容准备中', icon: 'none' })
      setTimeout(() => uni.reLaunch({ url: '/pages/map/map' }), 600)
      return
    }
    entryRef = { kind: 'zh-sentences', id: String(lv.id) }
    sentencesMode.value = true
    theme.value = { bg: lv.bg, color: lv.color }
    title.value = `小短句 · ${lv.zh}`
    // 每句配句意图（画句子本身，不是目标字）：孩子先看图猜意，再听整句，图文对应
    items.value = chars.map((h) => ({
      id: h.id, main: h.sentence, phon: '', sub: '', audio: h.sentenceAudio,
      extraAudio: '', image: h.sentenceEmoji || '', emoji: h.emoji || '',
    }))
    startAudioPreload(items.value.map((i) => i.audio))
  } else {
    const lv = zhData.levels.find((l) => String(l.id) === String(query.level)) || zhData.levels[0]
    entryRef = { kind: 'zh-level', id: String(lv.id) }
    theme.value = { bg: lv.bg, color: lv.color }
    title.value = `识字 · ${lv.zh}`
    items.value = lv.chars.map((h) => ({
      id: h.id, main: h.char, phon: h.pinyin, sub: h.word, audio: h.audio, extraAudio: h.wordAudio,
      emoji: h.emoji || '',
    }))
    startAudioPreload(items.value.flatMap((i) => [i.audio, i.extraAudio]))
  }

  refreshAudioLoading()
  wireSession(query.lessonId, resolvedCatId)
  // 进页先播第一个（用户点卡片进来时已有点击手势，iOS 可正常发声）
  setTimeout(() => speakIdx(current.value), 400)
})

/** 会话接入：恢复未完成进度；没有 lessonId（旧入口）则不记录。
 *  深链指向被低龄模式隐藏的分类时内容会回退到别的分类，课程与所见不一致，降级为不记录。 */
function wireSession(lessonId, resolvedCatId) {
  const l = getLesson(lessonId)
  if (!l) return
  if (l.ref?.kind === 'en-category' && resolvedCatId && l.ref.id !== resolvedCatId) return
  lesson.value = l
  const resumed = svc.resumeSessionFor(l.id)
  if (resumed) {
    const idx = resumed.snapshot && Number(resumed.snapshot.idx)
    if (Number.isInteger(idx)) current.value = Math.min(Math.max(0, idx), items.value.length - 1)
    if (current.value >= items.value.length - 1) completeLearn()
  } else {
    svc.startSession({ lessonId: l.id, kind: 'learn', skillIds: l.skillIds || [] })
  }
  svc.saveSnapshot({ idx: current.value })
}

function completeLearn() {
  if (!lesson.value) return
  const done = svc.completeSession()
  if (done) {
    completed = true
    // 图鉴点亮：学一学完成 → 该课全部词/字进「认识」
    getCollectionService().recordLearnDone(done)
  }
}

// 中文释义与英文读音之间的停顿：太短孩子来不及把两边对上
const ZH_EN_GAP_MS = 400

/** 启蒙双语卡的两段读音：默认先中文后英文；家长中心「启蒙读音顺序」可切先英后中 */
function bilingualSeq(it) {
  const en = accentEnSrc(it.audio)
  return getQimengAudioOrder() === 'en-first' ? [en, it.zhAudio] : [it.zhAudio, en]
}

function speakIdx(i) {
  const it = items.value[i]
  if (!it) return
  // 启蒙双语卡按家长所选顺序播；playSeq 内部走 play，英文腿需自己按所选口音解析路径
  if (it.zhAudio) playSeq(bilingualSeq(it), null, { gapMs: ZH_EN_GAP_MS })
  // 英语按家长中心所选口音发音；语文不动
  else if (subject.value === 'en') playEn(it.audio)
  else play(it.audio)
}

// 英文长短不一：单词 88rpx，长短语逐步缩号，保证最长词例（20 字符）单行放下
function enSize(text) {
  const len = (text || '').length
  if (len <= 7) return '88rpx'
  if (len <= 10) return '72rpx'
  if (len <= 14) return '56rpx'
  if (len <= 17) return '46rpx'
  return '40rpx'
}
// 中文词语长短不一：两字词大号，长词（最长「巴布亚新几内亚」7 字）逐步缩号
function zhWordSize(text) {
  const len = (text || '').length
  if (len <= 2) return '88rpx'
  if (len <= 4) return '72rpx'
  return '48rpx'
}
// 小短句 7~9 字，按长度缩号保证一句一行放下（最窄机型也尽量不折行）
function sentSize(text) {
  const len = (text || '').length
  if (len <= 6) return '88rpx'
  if (len <= 7) return '76rpx'
  if (len <= 8) return '66rpx'
  return '58rpx'
}
function speakExtra(i) {
  const it = items.value[i]
  if (!it || !it.extraAudio) return
  // 词语模式的小喇叭是英文读音，走口音解析；识字模式的例词是中文
  if (it.enExtra) playEn(it.extraAudio)
  else play(it.extraAudio)
}

/** 描红页：带字/码点/拼音/字音，纯练习不记会话 */
function goWrite(it) {
  if (!it || !it.id) return
  uni.navigateTo({
    url: `/pages/write/write?char=${encodeURIComponent(it.main)}&cp=${it.id}&pinyin=${encodeURIComponent(it.phon || '')}&audio=${encodeURIComponent(it.audio || '')}`,
  })
}
function onChange(e) {
  current.value = e.detail.current
  if (lesson.value) svc.saveSnapshot({ idx: current.value })
  if (current.value >= items.value.length - 1) completeLearn()
  speakIdx(current.value)
}
// 翻页节流：小朋友连点只认第一次，防止一口气翻好几张、音频追着叠
const tapGate = createThrottle(450)

function prev() {
  if (!tapGate()) return
  if (current.value > 0) current.value--
}
function next() {
  if (!tapGate()) return
  if (current.value < items.value.length - 1) {
    current.value++
    if (current.value >= items.value.length - 1) completeLearn()
    return
  }
  // 已在最后一张再点「→」：顺序进入下一课（低龄隐藏课已被目录过滤跳过）
  completeLearn()
  goNextLesson()
}

// 旧入口（自由探索）不带 lessonId：用入口参数反查目录定位当前课
function findCurrentLesson() {
  if (lesson.value) return lesson.value
  if (!entryRef) return null
  return LESSONS.find((l) => l.kind === 'learn' && l.ref && l.ref.kind === entryRef.kind
    && String(l.ref.id) === entryRef.id) || null
}

/** 翻到最后再点「→」：toast 过渡 600ms 后切下一课；科目学完回课程页 */
function goNextLesson() {
  if (advancing) return
  advancing = true
  const cur = findCurrentLesson()
  const nxt = cur && nextLessonAfter(cur.id)
  uni.showToast({ title: nxt ? '学完啦！去下一个 ✨' : '本科目全部学完啦 🏆', icon: 'none', duration: 900 })
  setTimeout(() => uni.reLaunch({ url: nxt ? lessonUrl(nxt) : '/pages/map/map' }), 600)
}
onUnload(() => {
  // 中文→英文之间有停顿：不作废序列，孩子退出后还会在页面外念出英文
  stopSeq()
  if (lesson.value && !completed) {
    svc.saveSnapshot({ idx: current.value })
    svc.pauseSession()
  }
})
function goBack() {
  uni.navigateBack()
}
</script>

<style scoped>
.page {
  height: 100vh;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow: hidden;
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
  background: rgba(255, 255, 255, 0.85);
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
.cat-title {
  flex: 1;
  text-align: center;
  font-size: 40rpx;
  font-weight: 800;
  color: #4a3f35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.progress {
  min-width: 84rpx;
  text-align: right;
  font-size: 32rpx;
  font-weight: 700;
  color: #4a3f35;
  flex-shrink: 0;
}
.swiper {
  flex: 1;
}
.card {
  margin: 16rpx 44rpx;
  height: calc(100% - 32rpx);
  background: #ffffff;
  border-radius: 56rpx;
  box-shadow: 0 14rpx 40rpx rgba(120, 90, 40, 0.12);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40rpx;
  box-sizing: border-box;
}
.card:active {
  transform: scale(0.98);
}
.img-wrap {
  flex: 1;
  min-height: 0;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10rpx 0;
}
.word-img {
  width: 100%;
  height: 100%;
}
.char-wrap {
  flex: 1;
  min-height: 0;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
/* 图文搭配：图标在前，字在后；没有映射的字回退独占大字排版 */
.char-wrap.has-emoji {
  flex-direction: column;
  gap: 20rpx;
}
.hz-emoji-tile {
  width: 210rpx;
  height: 210rpx;
  border-radius: 56rpx;
  background: #ffffff;
  box-shadow: 0 12rpx 26rpx rgba(120, 90, 40, 0.14);
  display: flex;
  align-items: center;
  justify-content: center;
  transform: rotate(-3deg);
}
.hz-emoji-img {
  width: 156rpx;
  height: 156rpx;
}
.char-big {
  font-size: 360rpx;
  font-weight: 800;
  line-height: 1;
}
.char-sm {
  font-size: 220rpx;
}
.word-en {
  margin-top: 30rpx;
  font-size: 88rpx;
  font-weight: 800;
  line-height: 1.15;
  text-align: center;
  align-self: stretch;
}
.word-pinyin {
  margin-top: 20rpx;
  font-size: 60rpx;
  color: #8a8073;
  font-weight: 700;
}
.word-phonetic {
  margin-top: 12rpx;
  font-size: 36rpx;
  color: #a2917d;
  font-family: 'Doulos SIL', 'Charis SIL', Georgia, serif;
}
.word-row {
  margin-top: 16rpx;
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 10rpx 34rpx;
  border-radius: 40rpx;
  background: #f7f3ec;
}
.word-zh {
  margin-top: 16rpx;
  font-size: 46rpx;
  color: #4a3f35;
  font-weight: 600;
  text-align: center;
  line-height: 1.3;
  align-self: stretch;
}
.word-speaker {
  font-size: 34rpx;
}
/* 小短句卡：句意图在上、整句居中大字、喇叭居中在下，三者不抢视线 */
.sent-wrap {
  flex: 1;
  min-height: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 34rpx;
  padding: 0 20rpx;
  box-sizing: border-box;
}
/* 句意图：与识字卡图标同款白底圆角卡，视觉口径一致 */
.sent-img-tile {
  width: 288rpx;
  height: 288rpx;
  border-radius: 64rpx;
  background: #ffffff;
  box-shadow: 0 12rpx 26rpx rgba(120, 90, 40, 0.14);
  display: flex;
  align-items: center;
  justify-content: center;
  transform: rotate(-3deg);
  flex-shrink: 0;
}
.sent-img {
  width: 216rpx;
  height: 216rpx;
}
.sent-text {
  font-size: 76rpx;
  font-weight: 800;
  line-height: 1.4;
  text-align: center;
}
.sent-play {
  width: 108rpx;
  height: 108rpx;
  border-radius: 50%;
  background: #f4f0fb;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.sent-speaker {
  font-size: 52rpx;
}
/* 词语模式：小喇叭行里的英文释义不再带 word-zh 的顶部间距 */
.word-sub {
  margin-top: 0;
  font-size: 40rpx;
}
/* 识字卡：描红入口（词语卡不显示） */
.write-btn {
  margin-top: 18rpx;
  padding: 10rpx 34rpx;
  border-radius: 40rpx;
  background: #e3f6e8;
  border: 3rpx solid #3bb273;
}
.write-btn:active {
  transform: scale(0.96);
}
.write-btn-text {
  font-size: 27rpx;
  font-weight: 800;
  color: #2d8a55;
}
.tap-hint {
  margin-top: 34rpx;
  padding: 12rpx 36rpx;
  border-radius: 40rpx;
  background: #fff3df;
}
.tap-hint-text {
  font-size: 26rpx;
  color: #c99b52;
}
/* 声音还没下载完：提示语呼吸闪烁，孩子知道声音在来的路上 */
.hint-loading {
  animation: hint-pulse 1.1s ease-in-out infinite;
}
@keyframes hint-pulse {
  0%, 100% { opacity: 0.95; }
  50% { opacity: 0.4; }
}
/* 课内音频预加载进度条（顶栏下方细条） */
.load-bar {
  height: 6rpx;
  margin: 0 44rpx 4rpx;
  background: #f0e4d7;
  border-radius: 3rpx;
  overflow: hidden;
}
.load-fill {
  height: 100%;
  background: linear-gradient(90deg, #ffd76e, #ff8c42);
  transition: width 0.25s;
}
.footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20rpx 44rpx calc(34rpx + env(safe-area-inset-bottom));
}
.nav-btn {
  width: 110rpx;
  height: 110rpx;
  border-radius: 50%;
  background: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8rpx 20rpx rgba(120, 90, 40, 0.12);
}
.nav-btn:active {
  transform: scale(0.94);
}
.nav-text {
  font-size: 48rpx;
  font-weight: 700;
  color: #4a3f35;
}
.page-num {
  flex: 1;
  text-align: center;
  font-size: 36rpx;
  font-weight: 700;
  color: #8a8073;
}
</style>

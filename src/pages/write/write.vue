<template>
  <view class="page">
    <PageTopBar class="topbar-page" :title="char + ' · 写一写'" :ellipsis="false" @back="goBack">
      <text class="pinyin">{{ pinyin }}</text>
    </PageTopBar>

    <!-- 田字格 + 笔顺画布 -->
    <view class="board-wrap">
      <view class="board">
        <view class="grid-line v"></view>
        <view class="grid-line h"></view>
        <view id="hanzi-target" class="target"></view>
      </view>
      <view v-if="done" class="done-badge">🎉 写对啦！</view>
    </view>

    <view class="hint"><text class="hint-text">{{ hintText }}</text></view>

    <!-- 三个大按钮：听发音 / 笔顺演示 / 开始描红 -->
    <view class="btn-row">
      <view class="action" :style="{ background: '#FFF3E4' }" @tap="speak">
        <text class="action-emoji">🔊</text>
        <text class="action-label">听发音</text>
      </view>
      <view class="action" :style="{ background: '#E9F2FF' }" @tap="demo">
        <text class="action-emoji">▶️</text>
        <text class="action-label">看笔顺</text>
      </view>
      <view class="action primary" :style="{ background: '#E3F6E8' }" @tap="startQuiz">
        <text class="action-emoji">✏️</text>
        <text class="action-label">{{ done ? '再写一次' : '我来写' }}</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onLoad, onUnload } from '@dcloudio/uni-app'
import HanziWriter from 'hanzi-writer'
import { play, preload } from '@/platform/audio.js'
import { assetUrl } from '@/platform/assets.js'
import { goBackOrHome } from '@/platform/nav.js'
import { getLesson } from '@/content/catalog.js'
import { getSessionService } from '@/services/session.js'
import { getCollectionService } from '@/services/collection-app.js'
import PageTopBar from '@/components/page-top-bar.vue'

const char = ref('')
const pinyin = ref('')
const done = ref(false)
const hintText = ref('先看笔顺，再自己写写看！')
const loadFailed = ref(false)

let writer = null
let writerSize = 0
let mode = 'demo' // 'demo' | 'quiz'：重建画布后要恢复当前模式
let strokeData = null // 已加载的笔顺数据（自己加载，见 loadStrokeData 注释）
let audioPath = ''
let cp = ''
// 从识字卡进来时带的课时：有它才记进度（直链/open 单字不计）
let lesson = null
// 连错 2 笔自动高亮下一笔起笔，别让小朋友瞎猜
let misses = 0

const DEFAULT_HINT = '先看笔顺，再自己写写看！'

/**
 * 可绘制区域的 CSS 像素边长。
 * .board 是 640rpx（窄屏 277px、iPad 652px），clientWidth 不含 6rpx 边框，
 * 正是画布应该占满的区域。
 */
function boardSize() {
  const board = document.querySelector('.board')
  if (!board) return 0
  return Math.round(board.clientWidth)
}

/**
 * 自己加载笔顺数据，而不是交给 HanziWriter 的 charDataLoader 去失败。
 *
 * 原因：HanziWriter 的加载器若失败（onError / 返回 reject 的 promise），它会 reject
 * 一个内部 promise，而库外没有地方挂 catch——实测浏览器报 unhandledrejection（HTTP 404）。
 * 改成「数据先到手，再建画布」，失败路径就完全由我们掌控：显示提示、点按钮重试，
 * 且创建时用的加载器永远成功（同数据直接回填），不会有任何未处理拒绝。
 */
async function loadStrokeData(code) {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = ctrl ? setTimeout(() => ctrl.abort(), 8000) : null
  try {
    // 引号字符串拼接而非反引号模板：发布脚本的 /static/ → ./static/ 改写只认引号字符串
    const res = await fetch(assetUrl("/static/hanzi-data/") + code + ".json", ctrl ? { signal: ctrl.signal } : undefined)
    if (!res.ok) throw new Error('HTTP ' + res.status)
    return await res.json()
  } finally {
    if (timer) clearTimeout(timer)
  }
}

onLoad((query) => {
  char.value = decodeURIComponent(query.char || '')
  pinyin.value = decodeURIComponent(query.pinyin || '')
  audioPath = decodeURIComponent(query.audio || '')
  cp = query.cp || ''
  if (!char.value || !cp) {
    uni.showToast({ title: '内容准备中', icon: 'none' })
    setTimeout(() => uni.navigateBack(), 600)
    return
  }
  // 从识字卡进来时带着 lessonId：描红也算这门课的学习进度（记作答 + 按单字点亮）。
  // 注意**不自己开会话、也不 pause/complete 别人的会话**：
  //  - 复用/顶替学一学的活跃会话会把那节课的进度抢走或标成完成（写一个字 ≠ 学完一课）；
  //  - 用 kind:'challenge' 又会被算成挑战给星。
  // 所以只在"这门课的会话正在进行"时把作答记进去（通常就是刚才那节学一学）。
  const lid = decodeURIComponent(query.lessonId || '')
  if (lid) lesson = getLesson(lid)
  if (audioPath) preload([audioPath])
  // 等容器渲染完成后再建画布
  setTimeout(setupWriter, 60)
  // 旋转屏/改窗口大小要重建画布（尺寸写死在 create 时）
  if (typeof window !== 'undefined') window.addEventListener('resize', onViewportResize)
})

/**
 * 写完一个字：记一条作答 + 按单字点亮（认识）。
 *
 * 会话处理原则（见 onLoad 注释）：**不自己开会话、不动别人的会话**。
 *  - 只有「从识字卡进来（带 lessonId）且这门课的会话正在进行」时才把作答记进去；
 *    从识字卡进来时通常就是那节学一学，于是这次书写会出现在家长页「最近记录／周报／累计作答」里；
 *  - 直链 / 直接打开某个字（没有 lessonId）→ 只练不记，避免把任意码点写进图鉴；
 *  - 绝不 complete：否则整门识字课会被标成"学一学完成"（progress.lessonProgressMap），
 *    而孩子只写了这一课里的一个字。
 *
 * 点亮与"首答正确"分开：onComplete 只在整字按笔顺写完时才触发（中途写错也算写完），
 * 所以**写完了就点亮认识**；`firstTryClean` 只进作答记录的首答正确率。
 * order 用汉字码点：这样同一节课里每个字各自算一道题，firstTry 才是"这个字第一次就写对"。
 * 不进错题本：错题重练是认读复习，书写错误在那里无法复现（同古诗填字的取舍）。
 */
function recordPractice(firstTryClean) {
  if (!lesson) return
  const svc = getSessionService()
  const active = svc.getActive()
  if (active && active.session && active.session.lessonId === lesson.id) {
    svc.recordAttempt({ activityId: 'stroke-write', order: cp, answer: cp, correct: firstTryClean, itemId: cp })
  }
  getCollectionService().recordCharPracticed(cp)
}

async function setupWriter() {
  const el = document.getElementById('hanzi-target')
  const size = boardSize()
  if (!el || !size) {
    setTimeout(setupWriter, 120)
    return
  }
  // 尺寸变了要重建：HanziWriter 的字形变换在 create 时按 width/height 算好，
  // 只改 SVG 属性（updateDimensions）不会重新缩放字形
  if (writer) {
    try {
      writer.cancelQuiz()
    } catch (e) {
      /* 未在测验中 */
    }
    try {
      writer.destroy()
    } catch (e) {
      /* 已销毁 */
    }
    el.innerHTML = ''
    writer = null
  }
  if (!strokeData) {
    try {
      strokeData = await loadStrokeData(cp)
      loadFailed.value = false
    } catch (e) {
      // 可降级、且有可见提示与重试入口 → 记 warn 而不是 error（错误监控里不该算异常）
      loadFailed.value = true
      hintText.value = '笔顺数据没加载出来，点「看笔顺」再试一次'
      console.warn('[write] 笔顺数据加载失败:', cp, e && e.message)
      return
    }
  }
  writer = HanziWriter.create(el, char.value, {
    // 画布跟随面板实际尺寸：原来写死 300px——
    // 320px 窄屏上面板只有 277px（画布比面板还宽，外圈笔画落在可视区之外），
    // iPad 上面板 652px（字只占中间 46%，田字格对不上，写起来很小）。
    width: size,
    height: size,
    // padding 按比例（原 24/300 = 8%），保证字形在不同屏幕上都占面板约 84%
    padding: Math.round(size * 0.08),
    strokeColor: '#E4573D',
    outlineColor: '#F0E4D7',
    drawingColor: '#4A90D9',
    strokeAnimationSpeed: 1.4,
    delayBetweenStrokes: 260,
    highlightColor: '#FFB84D',
    leniency: 1.3,
    showHintAfterMisses: 2,
    // 数据已在上面加载好：这里的加载器只做同步回填，永远不会失败
    charDataLoader: (c, onComplete) => onComplete(strokeData),
  })
  writerSize = size
  if (mode === 'quiz') startQuiz()
  else writer.loopCharacterAnimation()
}

/** 尺寸真的变了才重建（旋转屏、窗口缩放、iPad 分屏） */
function onViewportResize() {
  const size = boardSize()
  if (!size || !writer || Math.abs(size - writerSize) < 4) return
  setupWriter()
}

function speak() {
  if (audioPath) play(audioPath)
}

function demo() {
  // 数据没加载出来时点「看笔顺」＝重试（清掉缓存的数据并重建画布）
  if (loadFailed.value) {
    strokeData = null
    hintText.value = DEFAULT_HINT
    setupWriter()
    return
  }
  if (!writer) return
  mode = 'demo'
  done.value = false
  misses = 0
  hintText.value = '看好每一笔的顺序和方向～'
  // 取消进行中的描红/动画再演示，避免两个动画叠在画布上
  writer.cancelQuiz()
  writer.hideCharacter()
  writer.animateCharacter({ onComplete: () => writer.showCharacter() })
}

function startQuiz() {
  if (loadFailed.value) {
    strokeData = null
    hintText.value = DEFAULT_HINT
    setupWriter()
    return
  }
  if (!writer) return
  mode = 'quiz'
  done.value = false
  misses = 0
  hintText.value = '按笔顺描，写错两笔会给提示哦'
  writer.cancelQuiz()
  writer.hideCharacter()
  writer.quiz({
    onMistake: () => {
      misses++
      if (misses === 2) hintText.value = '没关系，看橙色提示再试一次 💛'
    },
    onComplete: () => {
      done.value = true
      hintText.value = '太棒了，再写一遍巩固一下！'
      play(assetUrl('/static/audio/zh-great.mp3'))
      // 一次写对（没写错过）＝ 作答记录里的首答正确；写错过也算练过（照样点亮认识）
      recordPractice(misses === 0)
    },
  })
}

function goBack() {
  goBackOrHome()
}

onUnload(() => {
  if (typeof window !== 'undefined') window.removeEventListener('resize', onViewportResize)
  if (writer) writer.destroy()
  writer = null
  // 这里刻意不动会话：描红借用的可能是学一学正在进行的会话，
  // pause/complete 都会让那节课的状态错位（详见 recordPractice 注释）。
})
</script>

<style scoped>
.page {
  min-height: 100vh;
  min-height: 100svh;
  background: #fff8ec;
  box-sizing: border-box;
  padding: calc(24rpx + env(safe-area-inset-top)) 40rpx calc(40rpx + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
}
/* 顶栏：结构与样式在 components/page-top-bar.vue，这里只保留本页内边距 */
.topbar-page {
  padding: 0 8rpx 20rpx;
}
.pinyin {
  min-width: 84rpx;
  text-align: right;
  font-size: 32rpx;
  font-weight: 700;
  color: #a2917d;
}
.board-wrap {
  position: relative;
  display: flex;
  justify-content: center;
  padding: 20rpx 0;
}
.board {
  position: relative;
  width: 640rpx;
  height: 640rpx;
  background: #ffffff;
  border-radius: 40rpx;
  border: 6rpx solid #f0e4d7;
  box-shadow: 0 14rpx 40rpx rgba(120, 90, 40, 0.12);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}
/* 田字格：虚线中线 */
.grid-line {
  position: absolute;
  background-image: linear-gradient(to right, #f0e4d7 55%, transparent 45%);
  background-size: 24rpx 4rpx;
}
.grid-line.v {
  left: 50%;
  top: 4%;
  width: 0;
  height: 92%;
  border-left: 4rpx dashed #f0e4d7;
  background: none;
}
.grid-line.h {
  top: 50%;
  left: 4%;
  height: 0;
  width: 92%;
  border-top: 4rpx dashed #f0e4d7;
  background: none;
}
.target {
  position: relative;
  z-index: 1;
}
.done-badge {
  position: absolute;
  top: 44rpx;
  left: 50%;
  transform: translateX(-50%);
  background: linear-gradient(90deg, #ffd76e, #ffb84d);
  color: #6b4a17;
  font-size: 30rpx;
  font-weight: 800;
  padding: 12rpx 34rpx;
  border-radius: 40rpx;
  box-shadow: 0 10rpx 24rpx rgba(200, 140, 40, 0.25);
}
.hint {
  display: flex;
  justify-content: center;
  padding: 8rpx 0 26rpx;
}
.hint-text {
  font-size: 27rpx;
  color: #a2917d;
}
.btn-row {
  display: flex;
  gap: 24rpx;
  padding: 0 10rpx;
}
.action {
  flex: 1;
  border-radius: 36rpx;
  padding: 26rpx 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10rpx;
  box-shadow: 0 8rpx 24rpx rgba(120, 90, 40, 0.08);
}
.action:active {
  transform: scale(0.96);
}
.action.primary {
  border: 4rpx solid #3bb273;
}
.action-emoji {
  font-size: 52rpx;
  line-height: 1.1;
}
.action-label {
  font-size: 27rpx;
  font-weight: 800;
  color: #4a3f35;
}
@media (max-height: 620px) {
  .board {
    width: 520rpx;
    height: 520rpx;
  }
  .btn-row {
    padding: 0 40rpx;
  }
}
</style>

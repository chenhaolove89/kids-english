<template>
  <view class="page">
    <view class="header">
      <view class="title-wrap">
        <text class="title">家长中心</text>
        <text class="subtitle">记录都保存在这台设备上，不上传网络</text>
      </view>
    </view>

    <!-- 存储写不进去时的常驻告警：本地存储是唯一数据源，静默失败等于记录全丢 -->
    <view v-if="storageError" class="storage-warn">
      <text class="storage-warn-title">⚠️ 这台设备的存储写不进去了</text>
      <text class="storage-warn-body">
        可能空间已满、或浏览器禁止了本站存储（无痕模式）。最近的星星和课程记录没有保存。
        请先导出备份，再清理设备空间后重试。
      </text>
      <text class="storage-warn-at">最近一次失败：{{ fmtTime(storageError.at) }}（{{ storageError.key }}）</text>
    </view>

    <!-- 摘要 -->
    <view class="summary">
      <view class="summary-item">
        <text class="summary-num">⭐ {{ summary.totalStars }}</text>
        <text class="summary-label">小星星</text>
      </view>
      <view class="summary-item">
        <text class="summary-num">🏁 {{ summary.lessonsCompleted }}</text>
        <text class="summary-label">完成课程</text>
      </view>
      <view class="summary-item">
        <text class="summary-num">📖 {{ summary.learnDoneCount }}</text>
        <text class="summary-label">学一学</text>
      </view>
    </view>

    <!-- 本周周报 -->
    <view class="section-head"><text class="section-title">本周（近 7 天）</text></view>
    <view class="card week-card">
      <view class="week-item">
        <text class="week-num">{{ week.completedLessons }}</text>
        <text class="week-label">完成课程</text>
      </view>
      <view class="week-item">
        <text class="week-num">⭐ {{ week.stars }}</text>
        <text class="week-label">获得星星</text>
      </view>
      <view class="week-item">
        <text class="week-num">{{ week.minutes }}</text>
        <text class="week-label">练习分钟</text>
      </view>
      <view class="week-item">
        <text class="week-num">📖 {{ week.learnDone }}</text>
        <text class="week-label">学一学</text>
      </view>
    </view>

    <!-- 分科目进度 -->
    <view class="section-head"><text class="section-title">各科进度</text></view>
    <view class="card">
      <view v-for="row in bySubject" :key="row.subject.id" class="subject-row">
        <image class="subject-icon" :src="row.subject.icon" mode="aspectFit" />
        <view class="subject-info">
          <text class="subject-name" :style="{ color: row.subject.color }">{{ row.subject.name }}</text>
          <view class="bar">
            <view class="bar-fill" :style="{ width: row.percent + '%', background: row.subject.color }" />
          </view>
        </view>
        <view class="subject-nums">
          <text class="subject-done">{{ row.done }}/{{ row.total }} 课</text>
          <text class="subject-stars">⭐ {{ row.stars }}</text>
        </view>
      </view>
    </view>

    <!-- 错题本 -->
    <view class="section-head"><text class="section-title">错题本</text></view>
    <view class="card">
      <view class="meta-row">
        <text class="meta-label">待复习</text>
        <text class="meta-value">{{ reviewDue }} 题</text>
      </view>
      <view v-if="topWrongText" class="meta-row">
        <text class="meta-label">最常错</text>
        <text class="meta-value">{{ topWrongText }}</text>
      </view>
      <view v-if="!topWrongText" class="meta-row">
        <text class="meta-label">答错的词会自动收进这里，首页会出现「错题重练」</text>
      </view>
    </view>

    <!-- 薄弱知识点：attempts 一直带 skillIds，此前没有任何消费方 -->
    <view v-if="weakSkills.length" class="section-head"><text class="section-title">需要多练的知识点</text></view>
    <view v-if="weakSkills.length" class="card">
      <view v-for="s in weakSkills" :key="s.skillId" class="weak-row">
        <view class="weak-info">
          <text class="weak-title">{{ s.title }}</text>
          <text class="weak-sub">首答对 {{ s.firstCorrect }}/{{ s.first }} 题</text>
        </view>
        <view class="weak-bar">
          <view class="weak-fill" :style="{ width: s.percent + '%', background: s.color }" />
        </view>
        <text class="weak-pct">{{ s.percent }}%</text>
      </view>
      <text class="weak-note">按「第一次就答对」统计，只列作答 3 题以上的知识点</text>
    </view>

    <!-- 最近记录 -->
    <view class="section-head"><text class="section-title">最近记录</text></view>
    <view class="card">
      <view v-if="!recent.length" class="empty-row">
        <text class="empty-text">还没有记录，去上一节课吧</text>
      </view>
      <view v-for="(s, i) in recent" :key="i" class="record-row">
        <text class="record-dot" :class="s.status">{{ s.status === 'completed' ? '✓' : '…' }}</text>
        <view class="record-info">
          <text class="record-title">{{ s.title }}</text>
          <text class="record-sub">{{ s.kindLabel }} · {{ s.statusLabel }} · {{ fmtTime(s.startedAt) }}</text>
        </view>
        <text v-if="s.stars" class="record-stars">⭐ {{ s.stars }}</text>
      </view>
    </view>

    <!-- 数据管理 -->
    <view class="section-head"><text class="section-title">数据</text></view>
    <view class="card">
      <view class="meta-row" @longpress="revealLowAge">
        <text class="meta-label">课程版本（长按进入内容分级设置）</text>
        <text class="meta-value">{{ catalogVersion }}</text>
      </view>
      <view class="meta-row">
        <text class="meta-label">累计作答</text>
        <text class="meta-value">{{ attemptCount }} 次</text>
      </view>
      <!-- 备份：本地存储会被系统清理（iOS 长期不访问会回收站点数据），没有导出就无法挽回 -->
      <view class="data-actions">
        <view class="data-btn" @tap="exportData">
          <text class="data-btn-text">⬇️ 导出学习记录</text>
        </view>
        <view class="data-btn ghost" @tap="importData">
          <text class="data-btn-text ghost">⬆️ 导入学习记录</text>
        </view>
      </view>
        <!-- 三胶囊放不进单行（会挤压竖排标签）：标签独占一行，胶囊整行在下 -->
        <view class="meta-row stacked">
          <text class="meta-label">英语发音</text>
          <view class="accent-pills">
            <view class="accent-pill" :class="{ on: accent === 'us' }" @tap="setAccent('us')">
              <text class="accent-pill-text">🇺🇸 美式</text>
            </view>
            <view class="accent-pill" :class="{ on: accent === 'gb' }" @tap="setAccent('gb')">
              <text class="accent-pill-text">🇬🇧 英式</text>
            </view>
            <view class="accent-pill" :class="{ on: accent === 'az' }" @tap="setAccent('az')">
              <text class="accent-pill-text">🏫 课堂</text>
            </view>
          </view>
        </view>
      <view class="meta-row">
        <text class="meta-label">启蒙读音顺序</text>
        <view class="accent-pills">
          <view class="accent-pill" :class="{ on: qimengOrder === 'zh-first' }" @tap="setQimengOrder('zh-first')">
            <text class="accent-pill-text">先中文后英文</text>
          </view>
          <view class="accent-pill" :class="{ on: qimengOrder === 'en-first' }" @tap="setQimengOrder('en-first')">
            <text class="accent-pill-text">先英文后中文</text>
          </view>
        </view>
      </view>
      <view v-if="lowAgeVisible" class="meta-row lowage-row">
        <text class="meta-label">低龄模式（隐藏惊悚角色类内容）</text>
        <switch :checked="lowAge" color="#3BB273" style="transform: scale(0.85)" @change="onLowAgeChange" />
      </view>
      <view class="clear-btn" @tap="clearRecords">
        <text class="clear-text">清空学习记录</text>
      </view>
    </view>

    <view class="footer">
      <text class="footer-text">星级按「第一次就答对」计算，鼓励不刷分 🌟</text>
    </view>

    <TabBar active="parent" />
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onShow, onUnload } from '@dcloudio/uni-app'
import { getStorage, getStorageError, clearStorageError, onStorageError, SCHEMA_VERSION } from '@/platform/storage.js'
import { getProgressService } from '@/services/progress.js'
import { getReviewService } from '@/services/review.js'
import { getLowAgeMode, setLowAgeMode, updatePrefs, getQimengAudioOrder, setQimengAudioOrder } from '@/content/lowAge.js'
import { getAccent, playEn } from '@/platform/audio.js'
import TabBar from '@/components/tab-bar.vue'
import { assetUrl } from '@/platform/assets.js'
import { hideNativeTabBar } from '@/platform/router-ui.js'
import { SUBJECTS, getLesson, catalog, LESSONS } from '@/content/catalog.js'
import { visibleLessons } from '@/services/curriculum-app.js'
import { starsForFirstAttempt } from '@/domain/progress.js'

const KIND_LABEL = { learn: '学一学', challenge: '挑战', practice: '练习' }
const STATUS_LABEL = { completed: '完成', paused: '中断' }

const summary = ref({ totalStars: 0, lessonsCompleted: 0, learnDoneCount: 0 })
const bySubject = ref([])
const recent = ref([])
const attemptCount = ref(0)
const catalogVersion = catalog.contentVersion
const week = ref({ completedLessons: 0, stars: 0, minutes: 0, learnDone: 0 })
const reviewDue = ref(0)
const topWrongText = ref('')
const weakSkills = ref([])
const lowAge = ref(true)
const lowAgeVisible = ref(false)
const accent = ref('us')
const qimengOrder = ref('zh-first')
const storageError = ref(null)

/** 学习记录的键清单：导出/导入/清空都以它为准，避免漏掉某一类数据 */
const DATA_KEYS = ['attempts', 'sessions', 'active', 'review', 'collection', 'prefs']
/** 导入时的形状校验：形状不对就让页面拿到脏数据崩掉，宁可拒绝导入 */
const DATA_SHAPE = {
  attempts: Array.isArray,
  sessions: Array.isArray,
  active: (v) => v === null || (typeof v === 'object' && !Array.isArray(v)),
  review: (v) => !!v && typeof v === 'object' && !Array.isArray(v),
  collection: (v) => !!v && typeof v === 'object' && !Array.isArray(v),
  prefs: (v) => !!v && typeof v === 'object' && !Array.isArray(v),
}

// 存储写入失败要立刻反映到页面上（不能只在进页面时查一次）
let offStorageError = null
onShow(() => {
  // 自定义悬浮底栏替代原生 tabBar
  hideNativeTabBar()
  if (!offStorageError) offStorageError = onStorageError((e) => { storageError.value = e })
  refresh()
})

onUnload(() => {
  if (offStorageError) { offStorageError(); offStorageError = null }
})

function refresh() {
  const store = getStorage()
  const prog = getProgressService()
  const reviewSvc = getReviewService()
  // 内容下线/改名后历史会话会留下目录里不存在的 lessonId；
  // 不过滤会让「完成课程」总数含孤儿、而下面「各科进度」按目录算，同屏自相矛盾
  const isKnownLesson = (id) => !!getLesson(id)
  summary.value = prog.summary({ isKnownLesson })
  week.value = prog.weeklyReport(Date.now(), { isKnownLesson })
  attemptCount.value = store.get('attempts', []).length
  lowAge.value = getLowAgeMode()
  accent.value = getAccent()
  qimengOrder.value = getQimengAudioOrder()
  reviewDue.value = reviewSvc.dueCount('en') + reviewSvc.dueCount('zh') + reviewSvc.dueCount('math')
  topWrongText.value = reviewSvc
    .topWrong(3)
    .map((e) => e.text || e.itemId)
    .join('、')

  // 存储健康自检：写失败状态只活在当前文档的模块内存里，而家长往往是**后来**才打开这一页
  // （那时上一次失败早随页面刷新没了，本页自己又不写任何东西）→ 告警永远不出现。
  // 所以进页面时主动写一个探针键：写不进去就立刻把告警亮出来，写完即删不留痕。
  // 注意：配额满时「覆盖已有键且不变大」仍会成功，所以探针必须用一个新键。
  const probeOk = store.set('自检', Date.now())
  if (probeOk) store.remove('自检')
  storageError.value = getStorageError()

  // 薄弱知识点：skillId 是内部标识（en-word-animals / math-l4），
  // 用目录里含该 skill 的课程标题给家长看
  weakSkills.value = prog
    .skillBreakdown({ isKnownLesson, limit: 5 })
    .map((s) => {
      const lesson = LESSONS.find((l) => (l.skillIds || []).includes(s.skillId))
      return {
        ...s,
        title: lesson ? lesson.title : s.skillId,
        color: lesson?.color || '#FF8C42',
        percent: Math.round(s.accuracy * 100),
      }
    })

  const progressMap = prog.lessonProgressMap()
  const lessons = visibleLessons()
  bySubject.value = SUBJECTS.map((subject) => {
    const subjectLessons = lessons.filter((l) => l.subject === subject.id)
    const done = subjectLessons.filter((l) => (progressMap.get(l.id)?.completed || 0) > 0).length
    const stars = subjectLessons.reduce((sum, l) => sum + (progressMap.get(l.id)?.bestStars || 0), 0)
    return {
      subject,
      done,
      total: subjectLessons.length,
      stars,
      percent: subjectLessons.length ? Math.round((done / subjectLessons.length) * 100) : 0,
    }
  })

  recent.value = prog.recentSessions(8).map((s) => {
    const lesson = getLesson(s.lessonId)
    return {
      // 课程已下线时不要再把内部 lessonId 甩给家长看
      title: lesson ? lesson.title : '（已下线的课程）',
      kindLabel: KIND_LABEL[s.kind] || s.kind,
      statusLabel: STATUS_LABEL[s.status] || s.status,
      startedAt: s.startedAt,
      stars:
        s.status === 'completed' && s.kind === 'challenge'
          ? starsForFirstAttempt(s.totals?.firstCorrect || 0, s.totals?.questions || 0)
          : 0,
    }
  })
}

/** 隐藏入口：长按版本行 500ms 出现低龄模式开关 */
function revealLowAge() {
  lowAgeVisible.value = true
  uni.showToast({ title: '已显示内容分级设置', icon: 'none' })
}

function onLowAgeChange(e) {
  const next = !!e.detail.value
  if (next === getLowAgeMode()) return // 事件重发时幂等
  setLowAgeMode(next)
  lowAge.value = getLowAgeMode()
  refresh()
  uni.showToast({ title: lowAge.value ? '已开启低龄模式' : '已关闭低龄模式', icon: 'none' })
}

/** 切换英语口音：立即生效并播一个反馈音试听 */
function setAccent(a) {
  if (accent.value === a) return
  accent.value = a
  updatePrefs({ accent: a })
  playEn(assetUrl('/static/audio/great_job.mp3'))
}

/** 切换启蒙单词读音顺序：学词页点卡片时按新顺序播 */
function setQimengOrder(o) {
  if (qimengOrder.value === o) return
  qimengOrder.value = o
  setQimengAudioOrder(o)
  uni.showToast({ title: o === 'en-first' ? '已切换：先英文后中文' : '已切换：先中文后英文', icon: 'none' })
}

function fmtTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function clearRecords() {
  uni.showModal({
    title: '清空学习记录',
    content: '将删除这台设备上的星星和课程记录，无法恢复。确定吗？',
    confirmText: '清空',
    confirmColor: '#E4573D',
    success: (r) => {
      if (!r.confirm) return
      const store = getStorage()
      store.remove('attempts')
      store.remove('sessions')
      store.remove('active')
      // 错题本也是学习记录：不清的话「清空」之后首页错题重练入口、家长页待复习数
      // 和孩子答错过的词全都还在，清空等于没清干净
      store.remove('review')
      // 图鉴点亮集合同属学习记录：一并清空，庆祝基线归零
      store.remove('collection')
      updatePrefs({ lastCollectionLit: null })
      clearStorageError()
      refresh()
      uni.showToast({ title: '已清空', icon: 'success' })
    },
  })
}

/**
 * 导出学习记录为 JSON 文件。
 * 本地存储是唯一数据源，而系统会回收站点数据（iOS 长期不访问），没有导出就等于没有备份。
 * 文件带 schemaVersion 与 contentVersion：将来数据结构变化时，导入侧能据此决定怎么迁移。
 */
function exportData() {
  const store = getStorage()
  const data = {}
  for (const k of DATA_KEYS) data[k] = store.get(k, null)
  const payload = {
    app: 'kids-english',
    schemaVersion: SCHEMA_VERSION,
    contentVersion: catalog.contentVersion,
    exportedAt: new Date().toISOString(),
    data,
  }
  const text = JSON.stringify(payload, null, 2)
  // #ifdef H5
  try {
    const blob = new Blob([text], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `快乐学园-学习记录-${fmtFileStamp(new Date())}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 2000)
    uni.showToast({ title: '已导出备份文件', icon: 'success' })
    return
  } catch (e) {
    console.error('[parent] 导出失败，回退剪贴板:', e)
  }
  // #endif
  // 非 H5 或下载失败：退回复制到剪贴板，至少能把文本带走
  try {
    uni.setClipboardData({ data: text, success: () => uni.showToast({ title: '已复制到剪贴板', icon: 'none' }) })
  } catch (e) {
    uni.showToast({ title: '导出失败', icon: 'none' })
  }
}

function fmtFileStamp(d) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

/**
 * 选择备份文件并导入（H5 用隐藏 file input；其他端提示不支持）。
 *
 * 用「常驻复用的 input」而不是每次新建：少一次 DOM 增删，change 监听只绑一次；
 * 每次点击前清空 value，否则选同一个文件不会再次触发 change。
 * （实测：原「新建 → click → 立刻 removeChild」在真实用户手势下同样能打开选择器，
 *   所以这不是修 bug，只是更稳妥的写法；判定这一点必须用真实输入事件——
 *   脚本 `element.click()` 没有 user activation，浏览器不会打开文件选择器，
 *   用它会得出"导入完全没反应"的错误结论。）
 */
let importInput = null

function onImportFilePicked() {
  const file = importInput && importInput.files && importInput.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => applyImport(String(reader.result || ''))
  reader.onerror = () => uni.showToast({ title: '读取文件失败', icon: 'none' })
  reader.readAsText(file)
}

function importData() {
  // #ifdef H5
  if (!importInput) {
    importInput = document.createElement('input')
    importInput.type = 'file'
    importInput.accept = 'application/json,.json'
    importInput.style.display = 'none'
    importInput.addEventListener('change', onImportFilePicked)
    document.body.appendChild(importInput)
  }
  importInput.value = ''
  importInput.click()
  return
  // #endif
  uni.showToast({ title: '当前端暂不支持导入', icon: 'none' })
}

/** 校验并写入导入的数据（形状不对一律拒绝，避免脏数据让页面崩掉） */
function applyImport(text) {
  let payload
  try {
    payload = JSON.parse(text)
  } catch (e) {
    uni.showToast({ title: '文件不是有效的 JSON', icon: 'none' })
    return
  }
  if (!payload || payload.app !== 'kids-english' || !payload.data || typeof payload.data !== 'object') {
    uni.showToast({ title: '这不是本应用导出的记录', icon: 'none' })
    return
  }
  const usable = DATA_KEYS.filter((k) => {
    const v = payload.data[k]
    if (v === null || v === undefined) return false
    return DATA_SHAPE[k] ? DATA_SHAPE[k](v) : false
  })
  if (!usable.length) {
    uni.showToast({ title: '文件里没有可恢复的记录', icon: 'none' })
    return
  }
  const versionNote =
    payload.schemaVersion === SCHEMA_VERSION
      ? ''
      : `（备份来自 v${payload.schemaVersion ?? '?'}，当前 v${SCHEMA_VERSION}）`
  uni.showModal({
    title: '导入学习记录',
    content: `将用文件里的记录覆盖这台设备上的 ${usable.length} 类数据${versionNote}，无法撤销。确定吗？`,
    confirmText: '导入',
    success: (r) => {
      if (!r.confirm) return
      const store = getStorage()
      let failed = 0
      for (const k of usable) if (!store.set(k, payload.data[k])) failed++
      clearStorageError()
      refresh()
      if (failed) uni.showToast({ title: `有 ${failed} 类数据写入失败`, icon: 'none' })
      else uni.showToast({ title: '已恢复学习记录', icon: 'success' })
    },
  })
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  min-height: 100svh;
  padding: calc(30rpx + env(safe-area-inset-top)) 40rpx calc(200rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
}
.header {
  padding: 16rpx 8rpx 26rpx;
}
.title-wrap {
  min-width: 0;
}
.title {
  display: block;
  font-size: 52rpx;
  font-weight: 800;
  color: #4a3f35;
}
.subtitle {
  display: block;
  margin-top: 8rpx;
  font-size: 28rpx;
  color: #a2917d;
}

.summary {
  display: flex;
  gap: 22rpx;
  margin-bottom: 36rpx;
}
.summary-item {
  flex: 1;
  background: #ffffff;
  border-radius: 36rpx;
  padding: 22rpx 10rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-shadow: 0 8rpx 24rpx rgba(120, 90, 40, 0.07);
}
.summary-num {
  font-size: 36rpx;
  font-weight: 800;
  color: #4a3f35;
}
.summary-label {
  margin-top: 6rpx;
  font-size: 24rpx;
  color: #a89d8e;
}

.section-head {
  padding: 0 6rpx 18rpx;
  margin-top: 10rpx;
}
.section-title {
  font-size: 32rpx;
  font-weight: 800;
  color: #a2917d;
}
.card {
  background: #ffffff;
  border-radius: 40rpx;
  padding: 10rpx 30rpx;
  box-shadow: 0 8rpx 24rpx rgba(120, 90, 40, 0.07);
  margin-bottom: 34rpx;
}

/* 本周周报 */
.week-card {
  display: flex;
  padding: 26rpx 10rpx;
}
.week-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 0;
}
.week-num {
  font-size: 34rpx;
  font-weight: 800;
  color: #4a3f35;
}
.week-label {
  margin-top: 6rpx;
  font-size: 23rpx;
  color: #a89d8e;
}

/* 分科目进度 */
.subject-row {
  display: flex;
  align-items: center;
  gap: 22rpx;
  padding: 24rpx 0;
}
.subject-row + .subject-row {
  border-top: 2rpx solid #f7f3ec;
}
.subject-icon {
  width: 72rpx;
  height: 72rpx;
  flex-shrink: 0;
}
.subject-info {
  flex: 1;
  min-width: 0;
}
.subject-name {
  display: block;
  font-size: 30rpx;
  font-weight: 800;
}
.bar {
  margin-top: 12rpx;
  height: 14rpx;
  border-radius: 7rpx;
  background: #f7f3ec;
  overflow: hidden;
}
.bar-fill {
  height: 100%;
  border-radius: 7rpx;
  transition: width 0.3s;
}
.subject-nums {
  flex-shrink: 0;
  text-align: right;
}
.subject-done {
  display: block;
  font-size: 26rpx;
  font-weight: 700;
  color: #4a3f35;
}
.subject-stars {
  display: block;
  margin-top: 6rpx;
  font-size: 24rpx;
  color: #a89d8e;
}

/* 最近记录 */
.record-row {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 22rpx 0;
}
.record-row + .record-row {
  border-top: 2rpx solid #f7f3ec;
}
.record-dot {
  width: 52rpx;
  height: 52rpx;
  border-radius: 50%;
  background: #e8f8ee;
  color: #3bb273;
  font-size: 30rpx;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.record-dot.paused {
  background: #fff3df;
  color: #c99b52;
}
.record-info {
  flex: 1;
  min-width: 0;
}
.record-title {
  display: block;
  font-size: 29rpx;
  font-weight: 700;
  color: #4a3f35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.record-sub {
  display: block;
  margin-top: 4rpx;
  font-size: 23rpx;
  color: #b3a492;
}
.record-stars {
  flex-shrink: 0;
  font-size: 26rpx;
  font-weight: 800;
  color: #c99b52;
}
.empty-row {
  padding: 30rpx 0;
  display: flex;
  justify-content: center;
}
.empty-text {
  font-size: 27rpx;
  color: #b3a492;
}

/* 数据 */
.meta-row {
  display: flex;
  justify-content: space-between;
  padding: 22rpx 0;
}
.meta-row + .meta-row {
  border-top: 2rpx solid #f7f3ec;
}
/* 三胶囊的行：标签横排在上，胶囊整行在下（压成单行会把标签挤成竖排字） */
.meta-row.stacked {
  flex-direction: column;
  align-items: flex-start;
  gap: 14rpx;
}
.meta-label {
  font-size: 27rpx;
  color: #8a8073;
}
.meta-value {
  font-size: 27rpx;
  font-weight: 700;
  color: #4a3f35;
}
/* 英语发音口音胶囊 */
.accent-pills {
  display: flex;
  gap: 12rpx;
}
/* 英语发音/启蒙读音顺序 胶囊等宽：两行按钮组左右边缘各自成列 */
.accent-pill {
  min-width: 184rpx;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8rpx 20rpx;
  border-radius: 30rpx;
  background: #f7f3ec;
}
.accent-pills {
  flex-shrink: 0;
}
.accent-pill.on {
  background: #ffedd9;
  box-shadow: inset 0 0 0 3rpx #ffb84d;
}
.accent-pill-text {
  font-size: 24rpx;
  font-weight: 700;
  color: #4a3f35;
  white-space: nowrap;
}
.clear-btn {
  margin: 20rpx 0 28rpx;
  height: 96rpx;
  border-radius: 48rpx;
  background: #fdecec;
  display: flex;
  align-items: center;
  justify-content: center;
}
.clear-btn:active {
  transform: scale(0.98);
}
.clear-text {
  font-size: 30rpx;
  font-weight: 800;
  color: #e4573d;
}

/* 备份动作：导出/导入，最小高度 96rpx（≥44px 可点） */
.data-actions {
  display: flex;
  gap: 16rpx;
  margin-top: 8rpx;
}
.data-btn {
  flex: 1;
  min-width: 0;
  min-height: 96rpx;
  border-radius: 48rpx;
  background: #e8f8ee;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 12rpx;
  box-sizing: border-box;
}
.data-btn.ghost {
  background: #f2ede4;
}
.data-btn:active {
  transform: scale(0.98);
}
.data-btn-text {
  font-size: 28rpx;
  font-weight: 800;
  color: #2f8f5b;
}
.data-btn-text.ghost {
  color: #8a7c68;
}

/* 薄弱知识点 */
.weak-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 14rpx 0;
}
.weak-info {
  flex: 0 0 40%;
  min-width: 0;
}
.weak-title {
  display: block;
  font-size: 28rpx;
  font-weight: 700;
  color: #4a3f35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.weak-sub {
  display: block;
  margin-top: 4rpx;
  font-size: 24rpx;
  color: #a89d8e;
}
.weak-bar {
  flex: 1;
  min-width: 0;
  height: 20rpx;
  border-radius: 10rpx;
  background: #f2ede4;
  overflow: hidden;
}
.weak-fill {
  height: 100%;
  border-radius: 10rpx;
}
.weak-pct {
  flex: 0 0 auto;
  min-width: 80rpx;
  text-align: right;
  font-size: 28rpx;
  font-weight: 800;
  color: #4a3f35;
}
.weak-note {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  color: #a89d8e;
}

/* 存储写入失败告警：醒目但不吓人，给出可执行的下一步 */.storage-warn {
  margin-bottom: 26rpx;
  padding: 24rpx 28rpx;
  border-radius: 28rpx;
  background: #fff4e0;
  border: 4rpx solid #f0a500;
}
.storage-warn-title {
  display: block;
  font-size: 30rpx;
  font-weight: 800;
  color: #b37400;
}
.storage-warn-body {
  display: block;
  margin-top: 10rpx;
  font-size: 26rpx;
  line-height: 1.5;
  color: #8a6a20;
}
.storage-warn-at {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  color: #a08a5c;
}

.footer {
  display: flex;
  justify-content: center;
  padding: 10rpx 0 20rpx;
}
.footer-text {
  font-size: 25rpx;
  color: #c9bba7;
}
</style>

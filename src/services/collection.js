/**
 * 收集图鉴服务：点亮集合的持久化与派生（**不 import 任何数据 JSON，Node 可测**）。
 *
 * 写入时机（只增不减）：
 *   - learn.vue 完成学一学 → recordLearnDone(session)：该课全部词/字进 seen（认识）
 *   - quiz.vue / practice.vue 完成挑战 → recordChallengeDone(session)：
 *       英语/语文：该会话首答答对的 itemId 进 mastered（掌握）
 *       数学：无词表，完成即点亮该关徽章（done）
 * 首次读取且存储无该键时，从已存 sessions+attempts 一次性回填（老用户进度不丢）。
 *
 * 口径说明：错题重练无课时会话、不记 attempt，与星数口径一致——不产生点亮。
 *
 * 依赖注入（与 services/review.js + review-pools.js 同一模式）：
 * 目录/数据解析器由应用侧注入，本文件因此能被 Node 单测覆盖。
 * 「我的百宝箱」是核心留存功能，而且它是**唯一**同时读 sessions + attempts
 * 两个事件流、再写第三个存储键的地方——静默失效（孩子学了但图鉴不亮）
 * 之前完全测不到。
 */
import { normalizeColl, addIds, deriveMastersFromAttempts, deriveFromHistory } from '../domain/collection.js'
import { passageLightsFromAttempts } from '../domain/passage.js'

const KEY = 'collection'

export function createCollectionService(store, resolvers) {
  if (!resolvers || typeof resolvers.getLesson !== 'function') {
    throw new Error('collection resolvers 未注入（应用侧请用 services/collection-app.js）')
  }
  const { getLesson, resolveEnCategory, resolveZhLevel } = resolvers

  /** 课程 → 应点亮的条目 id 列表（学一学用）；隐藏分类/无词表课程返回 null */
  function lessonItemIds(lesson) {
    const r = lesson?.ref
    if (!r) return null
    if (r.kind === 'en-category') {
      const c = resolveEnCategory(r.id)
      return c ? c.words.map((w) => w.id) : null
    }
    if (r.kind === 'zh-level') {
      const lv = resolveZhLevel(r.id)
      return lv ? lv.chars.map((h) => h.id) : null
    }
    // 小短句按字码点点亮（一字节一句），与识字课分开成桶
    if (r.kind === 'zh-sentences') {
      const lv = resolveZhLevel(r.id)
      return lv ? lv.chars.filter((h) => h.sentenceAudio).map((h) => h.id) : null
    }
    // 阅读理解（zh-passage）也返回 null：图鉴的一格是一篇，不能按"整课"点亮
    // （一个阶段 5 篇，读完一篇就把整课算学会会虚高）。它的点亮走 recordChallengeDone 的按篇聚合。
    return null
  }

  /** 语文的点亮桶：识字课进 zh（字码点），词语课（ref=en-category）进 zhWords（词 id），
   *  小短句（ref=zh-sentences）进 zhSentences，阅读理解（ref=zh-passage）进 zhPassages，
   *  各自分开统计不互混 */
  function collectionBucket(lesson) {
    if (lesson.subject !== 'zh') return lesson.subject
    if (lesson.ref?.kind === 'en-category') return 'zhWords'
    if (lesson.ref?.kind === 'zh-sentences') return 'zhSentences'
    if (lesson.ref?.kind === 'zh-passage') return 'zhPassages'
    return 'zh'
  }

  /** 回填用课程解析器：目录 + 适配器展开（未知课程返回 null 跳过） */
  function lessonResolver(lessonId) {
    const lesson = getLesson(lessonId)
    if (!lesson) return null
    return {
      subject: collectionBucket(lesson),
      kind: lesson.kind,
      itemIds: lessonItemIds(lesson),
      // 篇章课要按「篇」聚合（itemId 是题目 id），见 domain/passage.js
      passageLevel: lesson.ref?.kind === 'zh-passage',
    }
  }

  let migrated = false

  function load() {
    const raw = store.get(KEY, null)
    if (raw === null && !migrated) {
      migrated = true
      return migrateFromHistory()
    }
    return normalizeColl(raw)
  }

  /** 一次性回填：从历史会话推导点亮集合并落盘（attempts 有裁剪上限，推导结果必须持久化） */
  function migrateFromHistory() {
    const coll = deriveFromHistory(store.get('sessions', []), store.get('attempts', []), lessonResolver)
    store.set(KEY, coll)
    return normalizeColl(coll)
  }

  function save(coll) {
    store.set(KEY, normalizeColl(coll))
  }

  /** 学一学完成：该课全部词/字进 seen */
  function recordLearnDone(session) {
    const lesson = getLesson(session?.lessonId)
    if (!lesson || lesson.kind !== 'learn' || lesson.subject === 'math') return
    const ids = lessonItemIds(lesson)
    if (!ids) return
    save(addIds(load(), collectionBucket(lesson), 'seen', ids))
  }

  /**
   * 描红写好一个字：**只点亮这一个字**（按单字点亮）。
   *
   * 为什么不能复用 recordLearnDone：它按"整课"点亮（识字课一堂 48 字），
   * 写一个字就把整课算学会，图鉴与家长统计都会虚高。
   * 只进 seen（认识）不进 mastered：掌握的口径是"挑战里首答认出"，描红练的是书写，
   * 拿它当认读掌握会高估。
   * @param {string} cp 汉字码点（与 hanzi.json 的 id 同口径，图鉴按它计数）
   */
  function recordCharPracticed(cp) {
    const id = String(cp || '').trim().toLowerCase()
    if (!/^[0-9a-f]{4,6}$/.test(id)) return false
    save(addIds(load(), 'zh', 'seen', [id]))
    return true
  }

  /** 挑战完成：英语/语文首答答对条目进 mastered；数学点亮徽章 */
  function recordChallengeDone(session) {
    const lesson = getLesson(session?.lessonId)
    if (!lesson) return
    // 阅读理解：课卡在目录里是 learn（要作为学一学卡出现在课程地图上、进软解锁路径），
    // 但页面的作答记的是 challenge 会话——所以这一支必须排在下面的 kind 守卫**之前**，
    // 否则完成事件会被静默丢掉（孩子答完了图鉴不亮，不报错、没人发现）。
    // 一格是一篇短文：作答事件的 itemId 是题目 id（`篇id-q序号`），先按篇聚合再入桶。
    if (lesson.ref?.kind === 'zh-passage') {
      if (session.kind !== 'challenge') return
      const { seen, mastered } = passageLightsFromAttempts(store.get('attempts', []), session.sessionId)
      if (!seen.length) return
      save(addIds(addIds(load(), 'zhPassages', 'seen', seen), 'zhPassages', 'mastered', mastered))
      return
    }
    if (lesson.kind !== 'challenge') return
    if (lesson.subject === 'math') {
      save(addIds(load(), 'math', 'done', [lesson.id]))
      return
    }
    const masters = deriveMastersFromAttempts(store.get('attempts', []), session.sessionId)
    if (!masters.length) return
    save(addIds(load(), collectionBucket(lesson), 'mastered', masters))
  }

  /** 各桶计数：庆祝条对比与页头统计用 */
  function counts() {
    const c = load()
    return {
      enSeen: c.en.seen.length,
      enMastered: c.en.mastered.length,
      zhSeen: c.zh.seen.length,
      zhMastered: c.zh.mastered.length,
      zhWordsSeen: c.zhWords.seen.length,
      zhWordsMastered: c.zhWords.mastered.length,
      zhSentencesSeen: c.zhSentences.seen.length,
      zhSentencesMastered: c.zhSentences.mastered.length,
      zhPassagesSeen: c.zhPassages.seen.length,
      zhPassagesMastered: c.zhPassages.mastered.length,
      mathDone: c.math.done.length,
    }
  }

  return {
    get: load,
    recordLearnDone,
    recordCharPracticed,
    recordChallengeDone,
    counts,
  }
}

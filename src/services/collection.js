/**
 * 收集图鉴服务：点亮集合的持久化与派生（Vite 运行时模块，依赖目录/数据 JSON，不进 Node 单测）。
 *
 * 写入时机（只增不减）：
 *   - learn.vue 完成学一学 → recordLearnDone(session)：该课全部词/字进 seen（认识）
 *   - quiz.vue / practice.vue 完成挑战 → recordChallengeDone(session)：
 *       英语/语文：该会话首答答对的 itemId 进 mastered（掌握）
 *       数学：无词表，完成即点亮该关徽章（done）
 * 首次读取且存储无该键时，从已存 sessions+attempts 一次性回填（老用户进度不丢）。
 *
 * 口径说明：错题重练无课时会话、不记 attempt，与星数口径一致——不产生点亮。
 */
import { getStorage } from '../platform/storage.js'
import { getLesson } from '../content/catalog.js'
import { resolveEnCategory, resolveZhLevel } from '../content/adapters.js'
import { normalizeColl, addIds, deriveMastersFromAttempts, deriveFromHistory } from '../domain/collection.js'

const KEY = 'collection'

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
  return null
}

/** 回填用课程解析器：目录 + 适配器展开（未知课程返回 null 跳过） */
function lessonResolver(lessonId) {
  const lesson = getLesson(lessonId)
  if (!lesson) return null
  return { subject: lesson.subject, kind: lesson.kind, itemIds: lessonItemIds(lesson) }
}

export function createCollectionService(store) {
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
    save(addIds(load(), lesson.subject, 'seen', ids))
  }

  /** 挑战完成：英语/语文首答答对条目进 mastered；数学点亮徽章 */
  function recordChallengeDone(session) {
    const lesson = getLesson(session?.lessonId)
    if (!lesson || lesson.kind !== 'challenge') return
    if (lesson.subject === 'math') {
      save(addIds(load(), 'math', 'done', [lesson.id]))
      return
    }
    const masters = deriveMastersFromAttempts(store.get('attempts', []), session.sessionId)
    if (!masters.length) return
    save(addIds(load(), lesson.subject, 'mastered', masters))
  }

  /** 五计数：庆祝条对比与页头统计用 */
  function counts() {
    const c = load()
    return {
      enSeen: c.en.seen.length,
      enMastered: c.en.mastered.length,
      zhSeen: c.zh.seen.length,
      zhMastered: c.zh.mastered.length,
      mathDone: c.math.done.length,
    }
  }

  return {
    get: load,
    recordLearnDone,
    recordChallengeDone,
    counts,
  }
}

let _svc = null
export function getCollectionService() {
  if (!_svc) _svc = createCollectionService(getStorage())
  return _svc
}

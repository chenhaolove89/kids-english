/**
 * 错题重练池构建（应用侧）：把到期条目按 id 还原成完整词卡对象。
 * 独立于 services/review.js（存储层 Node 可测）：本模块引入数据 JSON，仅 Vite 运行时使用。
 * 与 getReviewService() 共享同一存储键，落本/出池口径一致。
 * 词查找不受低龄模式影响——能进错题本的词都是孩子真实答错过的。
 */
import { createReviewService } from './review.js'
import { getStorage } from '../platform/storage.js'
import { mapZhOption } from '../content/adapters.js'
import wordsData from '../data/words.json'
import hanziData from '../data/hanzi.json'

const enById = new Map(wordsData.categories.flatMap((c) => c.words).map((w) => [w.id, w]))
const zhById = new Map(hanziData.levels.flatMap((l) => l.chars).map((c) => [c.id, c]))

const RESOLVERS = {
  en: (id) => enById.get(id) || null,
  zh: (id) => {
    const c = zhById.get(id)
    return c ? mapZhOption(c) : null
  },
}

let _poolSvc = null
function poolService() {
  if (!_poolSvc) _poolSvc = createReviewService(getStorage(), RESOLVERS)
  return _poolSvc
}

/** 某科目到期错题的重练池（最多 10 题，完整词卡对象） */
export function getReviewPool(subject) {
  return poolService().buildReviewPool(subject)
}

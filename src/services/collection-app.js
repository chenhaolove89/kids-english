/**
 * 收集图鉴应用侧入口（Vite 运行时）：把目录与数据 JSON 作为解析器注入
 * createCollectionService，从而让 services/collection.js 保持纯净可测。
 * 与 services/review.js + review-pools.js 是同一模式。
 *
 * 页面一律从这里取服务（不要直接 import services/collection.js，
 * 那会拿到未注入解析器的版本并直接抛错）。
 */
import { getStorage } from '../platform/storage.js'
import { getLesson } from '../content/catalog.js'
import { resolveEnCategory, resolveZhLevel } from '../content/adapters.js'
import { createCollectionService } from './collection.js'

let _svc = null

export function getCollectionService() {
  if (!_svc) {
    _svc = createCollectionService(getStorage(), { getLesson, resolveEnCategory, resolveZhLevel })
  }
  return _svc
}

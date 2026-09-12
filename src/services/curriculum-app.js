/**
 * 课程查询服务的应用侧入口（Vite 运行时）：把目录数据、低龄过滤与存储注入
 * createCurriculum，从而让 services/curriculum.js 保持纯净可测。
 * 与 services/review-pools.js、services/collection-app.js 是同一模式。
 *
 * 页面一律从这里取（import 纯 services/curriculum.js 会拿到未注入的工厂）。
 */
import { getStorage } from '../platform/storage.js'
import { isCategoryHidden } from '../content/lowAge.js'
import * as catalog from '../content/catalog.js'
import { createCurriculum } from './curriculum.js'

export { STAGES, SUBJECTS, normalizeStage } from '../content/catalog.js'

let _c = null

export function getCurriculum() {
  if (!_c) _c = createCurriculum({ catalog, isCategoryHidden, store: getStorage() })
  return _c
}

export const stageBlocks = (...args) => getCurriculum().stageBlocks(...args)
export const lessonUrl = (...args) => getCurriculum().lessonUrl(...args)
export const randomLesson = (...args) => getCurriculum().randomLesson(...args)
export const visibleLessons = (...args) => getCurriculum().visibleLessons(...args)
export const nextLessonAfter = (...args) => getCurriculum().nextLessonAfter(...args)
export const continueTarget = (...args) => getCurriculum().continueTarget(...args)

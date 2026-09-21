/**
 * 课程目录运行时入口。catalog.json 由 tools/validate-content.mjs 从
 * content-packages/curriculum.json + 数据文件校验生成，禁止手改。
 */
import catalogJson from './catalog.json'
import { collectAssetFieldsInPlace } from '../platform/assets.js'

export const catalog = catalogJson
export const STAGES = catalogJson.stages
export const SUBJECTS = catalogJson.subjects
export const LESSONS = catalogJson.lessons

// catalog 里带资源路径的字段（stages 目前没有 icon，一并列上以免将来加了漏收）
const CATALOG_ASSET_FIELDS = ['icon']

/**
 * 把课程目录里的 icon 收口到 assetUrl，由 asset-source.js 在资源源确定后调用一次。
 * 就地改数据单例：map / parent / collection 都是直接 import catalog 的。幂等。
 */
export function applyCatalogAssetBase() {
  collectAssetFieldsInPlace(catalogJson.stages, CATALOG_ASSET_FIELDS)
  collectAssetFieldsInPlace(catalogJson.subjects, CATALOG_ASSET_FIELDS)
  collectAssetFieldsInPlace(catalogJson.lessons, CATALOG_ASSET_FIELDS)
}

export function getLesson(lessonId) {
  if (!lessonId) return null
  return LESSONS.find((l) => l.id === lessonId) || null
}

export function lessonsForStage(stageId, subjectId = null) {
  return LESSONS.filter(
    (l) => l.stage === stageId && l.status === 'available' && (!subjectId || l.subject === subjectId),
  )
}

export function lessonsOfSubject(subjectId) {
  return LESSONS.filter((l) => l.subject === subjectId && l.status === 'available')
}

export function normalizeStage(stageId) {
  return STAGES.some((s) => s.id === stageId) ? stageId : STAGES[0]?.id || 'qimeng'
}

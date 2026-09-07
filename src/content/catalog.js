/**
 * 课程目录运行时入口。catalog.json 由 tools/validate-content.mjs 从
 * content-packages/curriculum.json + 数据文件校验生成，禁止手改。
 */
import catalogJson from './catalog.json'

export const catalog = catalogJson
export const STAGES = catalogJson.stages
export const SUBJECTS = catalogJson.subjects
export const LESSONS = catalogJson.lessons

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

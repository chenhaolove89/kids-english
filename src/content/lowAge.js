/**
 * 低龄模式：隐藏惊悚/暗黑向内容（默认开启）。
 * 开关藏在家长中心的版本信息行（长按出现），孩子不可见。
 *
 * 过滤点集中在 content 层：目录查询（services/curriculum）与题池构建（adapters）
 * 都经过这里，保证课程地图、快速开始、继续学习、挑战题池口径一致。
 */
import { getStorage } from '../platform/storage.js'

// 低龄模式下整类隐藏的分类（词与例句偏惊悚/暗黑）
export const LOW_AGE_HIDDEN_CATEGORIES = ['characters', 'story']

export function getLowAgeMode() {
  const prefs = getStorage().get('prefs', {})
  // 默认开启：没设置过时按低龄保护
  return prefs?.lowAge === undefined ? true : !!prefs.lowAge
}

/** 偏好合并写入：任何写 prefs 的地方都要走这里，防止整对象覆盖抹掉其他键 */
export function updatePrefs(patch) {
  const store = getStorage()
  const prefs = store.get('prefs', {}) || {}
  store.set('prefs', { ...prefs, ...patch })
}

export function setLowAgeMode(on) {
  updatePrefs({ lowAge: !!on })
}

export function isCategoryHidden(catId) {
  return getLowAgeMode() && LOW_AGE_HIDDEN_CATEGORIES.includes(catId)
}

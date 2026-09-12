/**
 * 内容层偏好（家长中心的设置项）：低龄模式 + 启蒙读音顺序。
 * 低龄模式隐藏惊悚/暗黑向内容（**默认开启**），开关藏在版本信息行（长按出现），孩子不可见。
 *
 * 过滤点集中在 content 层：目录查询（services/curriculum-app）与题池构建（adapters）
 * 都经过这里，保证课程地图、快速开始、继续学习、挑战题池口径一致。
 *
 * 纯核心在 content/prefs.js（可注入存储、Node 可测）；本文件只是应用侧门面，
 * 页面继续用原来的具名导出，因此这次拆分对页面零改动。
 */
import { getStorage } from '../platform/storage.js'
import { createPrefs, LOW_AGE_HIDDEN_CATEGORIES } from './prefs.js'

export { LOW_AGE_HIDDEN_CATEGORIES }

let _prefs = null

function prefs() {
  if (!_prefs) _prefs = createPrefs(getStorage())
  return _prefs
}

export function getLowAgeMode() {
  return prefs().getLowAgeMode()
}

export function updatePrefs(patch) {
  prefs().updatePrefs(patch)
}

export function setLowAgeMode(on) {
  prefs().setLowAgeMode(on)
}

export function isCategoryHidden(catId) {
  return prefs().isCategoryHidden(catId)
}

export function getQimengAudioOrder() {
  return prefs().getQimengAudioOrder()
}

export function setQimengAudioOrder(order) {
  prefs().setQimengAudioOrder(order)
}

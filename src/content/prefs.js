/**
 * 偏好的纯核心（可注入存储，Node 可测）。
 *
 * 应用侧门面是 content/lowAge.js（页面沿用原有具名导出，无需改动）。
 *
 * 为什么值得单独测：低龄模式是**内容安全开关**——它默认开启并整类隐藏
 * 惊悚/暗黑向词汇与例句（characters / story）。这条路径静默失效的后果是
 * 四五岁的孩子直接看到惊悚角色内容，而不是某个功能不好用。
 * 另一个易错点是「写偏好必须合并」：直接覆盖会抹掉家长刚改的其他设置
 * （读音顺序 / 口音 / 上次访问阶段）。
 */

/** 低龄模式下整类隐藏的分类（词与例句偏惊悚/暗黑） */
export const LOW_AGE_HIDDEN_CATEGORIES = ['characters', 'story']

/** 偏好键：prefs 是一个共享对象，多个设置项共存 */
export const PREFS_KEY = 'prefs'

export function createPrefs(store) {
  function readPrefs() {
    const p = store.get(PREFS_KEY, {})
    // 容错：损坏/异常结构（字符串、数组、null）一律当成"没设置过"
    if (!p || typeof p !== 'object' || Array.isArray(p)) return {}
    return p
  }

  /** 默认开启：没设置过时按低龄保护 */
  function getLowAgeMode() {
    const prefs = readPrefs()
    return prefs.lowAge === undefined ? true : !!prefs.lowAge
  }

  /** 偏好合并写入：任何写 prefs 的地方都要走这里，防止整对象覆盖抹掉其他键 */
  function updatePrefs(patch) {
    const prefs = readPrefs()
    store.set(PREFS_KEY, { ...prefs, ...(patch || {}) })
  }

  function setLowAgeMode(on) {
    updatePrefs({ lowAge: !!on })
  }

  /** 是否隐藏某分类：只有低龄模式开启时才隐藏 */
  function isCategoryHidden(catId) {
    return getLowAgeMode() && LOW_AGE_HIDDEN_CATEGORIES.includes(catId)
  }

  /** 启蒙双语卡读音顺序：'zh-first'（默认）| 'en-first' */
  function getQimengAudioOrder() {
    return readPrefs().qimengAudioOrder === 'en-first' ? 'en-first' : 'zh-first'
  }

  function setQimengAudioOrder(order) {
    updatePrefs({ qimengAudioOrder: order === 'en-first' ? 'en-first' : 'zh-first' })
  }

  return {
    LOW_AGE_HIDDEN_CATEGORIES,
    readPrefs,
    getLowAgeMode,
    updatePrefs,
    setLowAgeMode,
    isCategoryHidden,
    getQimengAudioOrder,
    setQimengAudioOrder,
  }
}

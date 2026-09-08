/**
 * 身体部位（body，10 词）：统一的小人剪影 + 目标部位暖红高亮，其余淡蓝灰。
 * 同分类里 ear/hand/brain 等是 Noto 位图 emoji，这里用同类的扁平明快风保持一家人。
 */
import { svg, hl, limb, rrect, dot } from './_shared.mjs'

const SKIN = '#FFD9B3'
const FAINT = '#C9D4E4'
const HOT = '#FF6B4A'
const HOT_D = '#D14A2E'
const INK = '#4A342E'

/** 小人：head=头填充色；showFace=画五官；bentArms=手肘弯曲姿态（腿始终站直，避免交叠） */
function kid({ head = SKIN, showFace = true, bentArms = false } = {}) {
  const face = showFace
    ? `
  ${dot(234, 104, 7, INK)}${dot(278, 104, 7, INK)}
  ${limb('M238 126 Q256 140 274 126', INK, 6)}`
    : ''
  return `
  ${rrect(234, 118, 44, 52, 14, SKIN)}
  ${dot(256, 98, 58, head)}
  ${limb(`M206 190 L${bentArms ? '170 264 L206 332' : '170 322'}`, FAINT, 34)}
  ${limb(`M306 190 L${bentArms ? '342 264 L306 332' : '342 322'}`, FAINT, 34)}
  ${limb('M232 314 L224 440', FAINT, 36)}
  ${limb('M280 314 L288 440', FAINT, 36)}
  ${rrect(196, 164, 120, 152, 26, FAINT)}
  ${face}`
}

export const icons = {
  /** 头发：头顶碗形发盖 */
  hair: svg(`
  ${kid({ showFace: false })}
  <path d="M199 88 A58 58 0 0 1 313 88 L313 92 Q286 78 262 84 Q234 76 210 90 Q202 92 199 96 Z" fill="${HOT}"/>`),

  /** 手臂：双臂高亮 */
  arm: svg(`
  ${kid({ bentArms: true })}
  ${limb('M206 190 L170 264 L206 332', HOT, 34)}
  ${limb('M306 190 L342 264 L306 332', HOT, 34)}`),

  /** 膝盖：弯腿 + 膝关节高亮 */
  knee: svg(`
  ${kid({ bentArms: true })}
  ${dot(222, 380, 24, HOT)}${dot(290, 380, 24, HOT)}`),

  /** 肩膀：肩关节两点高亮 */
  shoulder: svg(`
  ${kid()}
  ${dot(208, 184, 26, HOT)}${dot(304, 184, 26, HOT)}`),

  /** 脸：头部高亮 + 五官 */
  face: svg(`
  ${kid({ head: HOT, showFace: false })}
  ${dot(234, 104, 7, INK)}${dot(278, 104, 7, INK)}
  ${limb('M238 126 Q256 140 274 126', INK, 6)}`),

  /** 后背：背面小人 + 整个背板高亮 + 脊柱线 */
  back: svg(`
  ${kid({ showFace: false })}
  ${rrect(196, 164, 120, 152, 26, HOT)}
  ${limb('M256 190 L256 300', HOT_D, 8)}`),

  /** 手肘：弯臂 + 肘关节高亮 */
  elbow: svg(`
  ${kid({ bentArms: true })}
  ${dot(170, 264, 24, HOT)}${dot(342, 264, 24, HOT)}`),

  /** 脖子：颈柱高亮 */
  neck: svg(`
  ${kid({ showFace: false })}
  ${rrect(234, 118, 44, 56, 14, HOT)}`),

  /** 胸口：上身前侧高亮 */
  chest: svg(`
  ${kid()}
  ${rrect(214, 176, 84, 84, 16, HOT)}`),

  /** 腰：腰带式高亮 */
  waist: svg(`
  ${kid({ showFace: false })}
  ${rrect(196, 250, 120, 42, 14, HOT)}`),
}

export const category = 'body'

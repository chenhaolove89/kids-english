/**
 * 家人 8（family）：成套的小人家庭造型。uncle/aunt/cousin 属档3认读白名单，不在此列。
 * mom/dad 用发髻/发型与身形区分，twins 双胞胎同款，friend 击掌，best friend 拥抱+爱心。
 */
import { svg, hl, limb, rrect, dot } from './_shared.mjs'

const SKIN = '#FFD9B3'
const INK = '#4A342E'

/**
 * 小人：x=中心，y=头顶基准，s=缩放；shirt=上衣色，hair=发色；
 * dress=裙装；hairStyle: bun 发髻 | side 侧分 | pigtail 双马尾 | cap 短发
 */
function person({ x, y, s = 1, shirt, hair, dress = false, hairStyle = 'cap', armsUp = false }) {
  const headR = 40 * s
  const bodyY = y + 68 * s
  const hairCap = `<path d="M${x - headR} ${y} A${headR} ${headR} 0 0 1 ${x + headR} ${y} L${x + headR} ${y - 6 * s} Q${x + 14 * s} ${y - 20 * s} ${x - 10 * s} ${y - 12 * s} Q${x - 30 * s} ${y - 8 * s} ${x - headR} ${y - 4 * s} Z" fill="${hair}"/>`
  let hairExtra = ''
  if (hairStyle === 'bun') hairExtra = dot(x, y - headR - 14 * s, 15 * s, hair)
  if (hairStyle === 'pigtail') hairExtra = dot(x - headR - 8 * s, y + 4 * s, 13 * s, hair) + dot(x + headR + 8 * s, y + 4 * s, 13 * s, hair)
  const face = dot(x - 14 * s, y + 6 * s, 4.5 * s, INK) + dot(x + 14 * s, y + 6 * s, 4.5 * s, INK)
    + limb(`M${x - 11 * s} ${y + 20 * s} Q${x} ${y + 28 * s} ${x + 11 * s} ${y + 20 * s}`, INK, 4.5 * s)
  const body = dress
    ? `<path d="M${x - 26 * s} ${bodyY} L${x + 26 * s} ${bodyY} L${x + 46 * s} ${bodyY + 96 * s} L${x - 46 * s} ${bodyY + 96 * s} Z" fill="${shirt}"/>`
    : rrect(x - 34 * s, bodyY, 68 * s, 96 * s, 22 * s, shirt)
  const legs = dress
    ? limb(`M${x - 16 * s} ${bodyY + 96 * s} L${x - 18 * s} ${bodyY + 140 * s}`, SKIN, 12 * s) + limb(`M${x + 16 * s} ${bodyY + 96 * s} L${x + 18 * s} ${bodyY + 140 * s}`, SKIN, 12 * s)
    : limb(`M${x - 16 * s} ${bodyY + 96 * s} L${x - 18 * s} ${bodyY + 148 * s}`, '#5B6B7E', 14 * s) + limb(`M${x + 16 * s} ${bodyY + 96 * s} L${x + 18 * s} ${bodyY + 148 * s}`, '#5B6B7E', 14 * s)
  const armL = armsUp
    ? limb(`M${x - 26 * s} ${bodyY + 14 * s} L${x - 52 * s} ${bodyY - 40 * s}`, shirt, 16 * s)
    : limb(`M${x - 26 * s} ${bodyY + 14 * s} L${x - 40 * s} ${bodyY + 74 * s}`, shirt, 16 * s)
  const armR = armsUp
    ? limb(`M${x + 26 * s} ${bodyY + 14 * s} L${x + 52 * s} ${bodyY - 40 * s}`, shirt, 16 * s)
    : limb(`M${x + 26 * s} ${bodyY + 14 * s} L${x + 40 * s} ${bodyY + 74 * s}`, shirt, 16 * s)
  return `
  ${legs}
  ${rrect(x - 15 * s, y + 40 * s, 30 * s, 36 * s, 10 * s, SKIN)}
  ${dot(x, y, headR, SKIN)}
  ${hairCap}
  ${hairExtra}
  ${face}
  ${body}
  ${armL}
  ${armR}`
}

/** 小爱心 */
function heart(x, y, s, fill = '#F06C9C') {
  return `<path d="M${x} ${y + 12 * s} C${x - 26 * s} ${y - 8 * s} ${x - 10 * s} ${y - 30 * s} ${x} ${y - 14 * s} C${x + 10 * s} ${y - 30 * s} ${x + 26 * s} ${y - 8 * s} ${x} ${y + 12 * s} Z" fill="${fill}"/>`
}

export const icons = {
  /** 全家福：爸妈 + 儿子女儿 */
  family: svg(`
  ${person({ x: 150, y: 130, s: 1, shirt: '#4A90D9', hair: '#4A342E' })}
  ${person({ x: 340, y: 130, s: 1, shirt: '#E86A5C', hair: '#6B4420', dress: true, hairStyle: 'bun' })}
  ${person({ x: 150, y: 240, s: 0.62, shirt: '#F5B841', hair: '#4A342E' })}
  ${person({ x: 340, y: 240, s: 0.62, shirt: '#F06C9C', hair: '#6B4420', dress: true, hairStyle: 'pigtail' })}`),

  /** 妈妈：棕发髻 + 粉裙 */
  mom: svg(`
  ${person({ x: 256, y: 120, s: 1.15, shirt: '#F06C9C', hair: '#6B4420', dress: true, hairStyle: 'bun' })}
  ${hl(216, 96, 16, 10, -20, 0.4)}`),

  /** 爸爸：短发 + 蓝上衣 */
  dad: svg(`
  ${person({ x: 256, y: 120, s: 1.15, shirt: '#4A90D9', hair: '#37474F' })}
  ${hl(216, 96, 16, 10, -20, 0.4)}`),

  /** 儿子：小男孩 */
  son: svg(`
  ${person({ x: 256, y: 150, s: 1, shirt: '#F5B841', hair: '#4A342E' })}
  ${hl(226, 130, 14, 9, -20, 0.4)}`),

  /** 女儿：双马尾小女孩 */
  daughter: svg(`
  ${person({ x: 256, y: 150, s: 1, shirt: '#E86A5C', hair: '#6B4420', dress: true, hairStyle: 'pigtail' })}
  ${hl(226, 130, 14, 9, -20, 0.4)}`),

  /** 双胞胎：一模一样的两个孩子 */
  twins: svg(`
  ${person({ x: 180, y: 150, s: 0.95, shirt: '#5CC0F0', hair: '#4A342E' })}
  ${person({ x: 330, y: 150, s: 0.95, shirt: '#5CC0F0', hair: '#4A342E' })}
  ${hl(150, 130, 14, 9, -20, 0.4)}`),

  /** 朋友：击掌的两个孩子 */
  friend: svg(`
  ${person({ x: 170, y: 150, s: 0.95, shirt: '#5CB85C', hair: '#4A342E', armsUp: true })}
  ${person({ x: 330, y: 150, s: 0.95, shirt: '#F5B841', hair: '#6B4420', armsUp: true })}
  ${limb('M262 148 Q256 138 250 148', '#FFD54F', 0.1)}
  ${hl(140, 130, 14, 9, -20, 0.4)}`),

  /** 最好的朋友：拥抱 + 爱心 */
  'best friend': svg(`
  ${heart(256, 120, 1.6)}
  ${person({ x: 220, y: 160, s: 0.95, shirt: '#B07CC6', hair: '#4A342E' })}
  ${person({ x: 300, y: 160, s: 0.95, shirt: '#E86A5C', hair: '#6B4420' })}
  ${limb('M282 240 Q260 214 238 240', '#E86A5C', 15)}`),
}

export const category = 'family'

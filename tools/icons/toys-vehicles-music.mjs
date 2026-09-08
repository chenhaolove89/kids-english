/**
 * 玩具 8 + 交通工具 2 + 乐器 2（toys/vehicles/music）。
 * 游乐设施/工程车/小乐器在 Noto 里没有对应 emoji（slide 除外，已走 emoji）。
 */
import { svg, hl, limb, rrect, dot } from './_shared.mjs'

const SKIN = '#FFD9B3'
const INK = '#4A342E'

/** 玩具积木上的白色五角星（底左块装饰） */
function star(cx, cy, rOut, rIn) {
  const pts = []
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? rOut : rIn
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`)
  }
  return `<polygon points="${pts.join(' ')}" fill="#FFFFFF"/>`
}

export const icons = {
  /** 积木：三块彩色方块叠放（星/圆/三角装饰） */
  blocks: svg(`
  ${rrect(116, 300, 132, 132, 16, '#F25C54')}
  ${star(182, 366, 38, 16)}
  ${rrect(264, 300, 132, 132, 16, '#4A90D9')}
  ${dot(330, 366, 34, '#FFFFFF')}
  ${rrect(190, 162, 132, 132, 16, '#F5B841')}
  <polygon points="256,196 296,266 216,266" fill="#FFFFFF"/>
  ${hl(150, 330, 30, 18, -24, 0.25)}${hl(300, 330, 30, 18, -24, 0.25)}${hl(226, 194, 30, 18, -24, 0.3)}`),

  /** 跳棋：棋盘 4×4 + 红黑棋子 */
  checkers: svg(`
  ${(() => {
    let s = ''
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++)
      s += rrect(116 + c * 60, 116 + r * 60, 60, 60, 0, (r + c) % 2 ? '#C8862A' : '#F5D76E')
    return s
  })()}
  ${rrect(116, 116, 240, 240, 0, 'none', 'stroke="#8B5A2B" stroke-width="10"')}
  ${dot(206, 206, 40, '#D64541')}${dot(206, 206, 22, 'none', 'stroke="#A83632" stroke-width="8"')}
  ${dot(266, 266, 40, '#37474F')}${dot(266, 266, 22, 'none', 'stroke="#263238" stroke-width="8"')}
  ${hl(196, 194, 14, 9, -30, 0.5)}`),

  /** 骨牌：两张白色骨牌，一点数面 */
  domino: svg(`
  <g transform="rotate(-14 320 260)">
    ${rrect(276, 120, 88, 268, 14, '#F7F7F7', 'stroke="#D5DBE1" stroke-width="6"')}
    ${limb('M276 254 L364 254', '#B0BEC5', 6)}
    ${dot(320, 176, 14, '#37474F')}${dot(320, 216, 14, '#37474F')}${dot(320, 256, 14, '#37474F')}
    ${dot(320, 300, 14, '#37474F')}${dot(320, 340, 14, '#37474F')}
  </g>
  ${rrect(130, 150, 96, 288, 14, '#FFFFFF', 'stroke="#D5DBE1" stroke-width="6"')}
  ${limb('M130 294 L226 294', '#B0BEC5', 6)}
  ${dot(178, 206, 15, '#37474F')}${dot(154, 252, 15, '#37474F')}${dot(202, 252, 15, '#37474F')}
  ${dot(178, 338, 15, '#37474F')}${dot(178, 386, 15, '#37474F')}${dot(178, 434, 15, '#37474F')}
  ${hl(160, 180, 26, 10, -24, 0.5)}`),

  /** 呼啦圈：小孩转圈，粉色圈环跨在腰上 */
  'hula hoop': svg(`
  ${limb('M238 288 L230 402', SKIN, 26)}
  ${limb('M274 288 L282 402', SKIN, 26)}
  ${rrect(214, 176, 84, 122, 24, '#5CC0F0')}
  ${limb('M228 200 L188 128', SKIN, 22)}
  ${limb('M284 200 L324 128', SKIN, 22)}
  ${dot(256, 122, 46, SKIN)}
  ${dot(240, 116, 6, INK)}${dot(272, 116, 6, INK)}
  ${limb('M242 140 Q256 150 270 140', INK, 5)}
  <ellipse cx="256" cy="298" rx="132" ry="34" fill="none" stroke="#FF5CA8" stroke-width="16"/>
  ${hl(150, 288, 22, 8, 0, 0.55)}`),

  /** 跳绳：小孩起跳，绳子弧线过头顶 */
  'jump rope': svg(`
  <path d="M186 168 Q256 48 326 168" stroke="#FF5CA8" stroke-width="11" fill="none" stroke-linecap="round"/>
  ${dot(184, 172, 13, '#E8437C')}${dot(328, 172, 13, '#E8437C')}
  ${limb('M244 296 L226 352', SKIN, 24)}
  ${limb('M268 296 L296 342', SKIN, 24)}
  ${rrect(222, 186, 68, 112, 22, '#FFB13B')}
  ${limb('M234 206 L200 158', SKIN, 20)}
  ${limb('M278 206 L312 158', SKIN, 20)}
  ${dot(256, 138, 44, SKIN)}
  ${dot(242, 132, 6, INK)}${dot(270, 132, 6, INK)}
  ${limb('M244 154 Q256 164 268 154', INK, 5)}
  <ellipse cx="256" cy="428" rx="72" ry="13" fill="#37474F" opacity="0.12"/>
  ${limb('M196 408 L226 408', '#B0BEC5', 7)}
  ${limb('M286 408 L316 408', '#B0BEC5', 7)}`),

  /** 跷跷板：蓝色支点 + 红色跷板 + 两端座椅 */
  seesaw: svg(`
  <ellipse cx="256" cy="416" rx="190" ry="18" fill="#37474F" opacity="0.1"/>
  <path d="M256 262 L212 396 L300 396 Z" fill="#4A90D9"/>
  ${dot(256, 292, 16, '#2E6BB0')}
  <g transform="rotate(-9 256 310)">
    ${rrect(84, 296, 344, 28, 14, '#F25C54')}
    ${rrect(84, 270, 54, 18, 9, '#F5B841')}
    ${rrect(374, 270, 54, 18, 9, '#F5B841')}
    ${limb('M104 270 Q104 236 130 244', '#8B5A2B', 9)}
    ${limb('M408 270 Q408 236 382 244', '#8B5A2B', 9)}
  </g>
  ${hl(140, 306, 46, 9, -9, 0.25)}`),

  /** 秋千：A 字架 + 双绳吊椅 */
  swing: svg(`
  <ellipse cx="256" cy="432" rx="180" ry="16" fill="#37474F" opacity="0.1"/>
  ${limb('M172 420 L228 152', '#4A90D9', 20)}
  ${limb('M340 420 L284 152', '#4A90D9', 20)}
  ${limb('M206 150 L306 150', '#4A90D9', 20)}
  ${limb('M236 158 L236 306', '#C8862A', 9)}
  ${limb('M276 158 L276 306', '#C8862A', 9)}
  ${rrect(220, 300, 72, 18, 9, '#5CB85C')}`),

  /** 蹦床：蓝面黑腿 + 上方弹跳小孩与动感线 */
  trampoline: svg(`
  ${limb('M180 300 Q150 230 186 162', '#B0BEC5', 7, 0.8)}
  ${limb('M332 300 Q362 230 326 162', '#B0BEC5', 7, 0.8)}
  <path d="M238 296 L228 348 M274 296 L292 344" stroke="${SKIN}" stroke-width="22" fill="none" stroke-linecap="round"/>
  ${rrect(228, 208, 56, 96, 20, '#F25C54')}
  ${limb('M238 228 L206 176', SKIN, 18)}
  ${limb('M274 228 L306 176', SKIN, 18)}
  ${dot(256, 162, 40, SKIN)}
  ${dot(243, 156, 5.5, INK)}${dot(269, 156, 5.5, INK)}
  ${limb('M244 176 Q256 186 268 176', INK, 5)}
  <path d="M116 352 Q256 314 396 352 L384 378 Q256 344 128 378 Z" fill="#4A90D9"/>
  ${limb('M148 372 L118 444', '#37474F', 13)}
  ${limb('M364 372 L394 444', '#37474F', 13)}
  ${limb('M256 356 L256 444', '#37474F', 13)}
  ${hl(150, 360, 30, 8, 4, 0.35)}`),

  /** 垃圾车：绿色车厢 + 驾驶室 + 后斗垃圾桶 */
  'garbage truck': svg(`
  ${dot(170, 396, 44, '#37474F')}${dot(170, 396, 20, '#B0BEC5')}
  ${dot(330, 396, 44, '#37474F')}${dot(330, 396, 20, '#B0BEC5')}
  ${rrect(88, 218, 258, 148, 14, '#5CB85C')}
  ${rrect(346, 262, 96, 104, 12, '#F5B841')}
  ${rrect(362, 276, 52, 44, 8, '#BEE3F5')}
  ${limb('M346 320 L442 320', '#E0A32E', 8)}
  <g transform="rotate(-10 130 208)">${rrect(94, 172, 76, 64, 8, '#90A4AE')}</g>
  ${limb('M120 262 L314 262', '#46A24E', 10)}
  ${limb('M120 300 L240 300', '#46A24E', 10)}
  ${hl(120, 240, 40, 14, -18, 0.28)}
  ${dot(394, 388, 26, '#37474F')}${dot(394, 388, 12, '#B0BEC5')}`),

  /** 拖车：蓝色车斗 + 黄色驾驶室 + 起重臂吊钩 */
  'tow truck': svg(`
  ${dot(170, 396, 44, '#37474F')}${dot(170, 396, 20, '#B0BEC5')}
  ${dot(320, 396, 44, '#37474F')}${dot(320, 396, 20, '#B0BEC5')}
  ${rrect(88, 246, 252, 120, 14, '#4A90D9')}
  ${rrect(340, 262, 100, 104, 12, '#F5B841')}
  ${rrect(356, 276, 54, 44, 8, '#BEE3F5')}
  ${limb('M340 322 L440 322', '#E0A32E', 8)}
  ${limb('M136 248 L216 118', '#F25C54', 16)}
  ${dot(136, 248, 13, '#37474F')}
  ${limb('M216 118 L216 168', '#78909C', 9)}
  <path d="M216 168 L216 186 Q216 208 194 204 Q180 200 184 186" stroke="#37474F" stroke-width="10" fill="none" stroke-linecap="round"/>
  ${hl(112, 268, 36, 12, -18, 0.28)}`),

  /** 口琴：银色琴身 + 红色琴格 + 双排吹孔 */
  harmonica: svg(`
  ${rrect(92, 214, 328, 96, 20, '#B0BEC5')}
  ${rrect(92, 206, 58, 112, 16, '#F25C54')}
  ${rrect(362, 206, 58, 112, 16, '#F25C54')}
  ${(() => {
    let s = ''
    for (let i = 0; i < 9; i++) {
      const x = 162 + i * 21
      s += rrect(x, 226, 14, 26, 3, '#546E7A') + rrect(x, 272, 14, 26, 3, '#546E7A')
    }
    return s
  })()}
  ${hl(130, 220, 20, 8, -16, 0.5)}`),

  /** 尤克里里：小号四弦琴，原木色琴身 */
  ukulele: svg(`
  ${rrect(240, 66, 32, 74, 8, '#6B4A2B')}
  ${dot(248, 80, 6, '#FFD9B3')}${dot(264, 80, 6, '#FFD9B3')}${dot(248, 108, 6, '#FFD9B3')}${dot(264, 108, 6, '#FFD9B3')}
  <ellipse cx="256" cy="300" rx="96" ry="110" fill="#F5B841"/>
  ${dot(256, 288, 28, '#6B4A2B')}
  ${rrect(234, 372, 44, 16, 6, '#6B4A2B')}
  ${limb('M250 80 L250 378', '#FBE8C8', 3)}
  ${limb('M256 80 L256 380', '#FBE8C8', 3)}
  ${limb('M262 80 L262 378', '#FBE8C8', 3)}
  ${hl(214, 258, 26, 40, 24, 0.35)}`),
}

export const categories = {
  blocks: 'toys', checkers: 'toys', domino: 'toys', 'hula hoop': 'toys', 'jump rope': 'toys',
  seesaw: 'toys', swing: 'toys', trampoline: 'toys',
  'garbage truck': 'vehicles', 'tow truck': 'vehicles',
  harmonica: 'music', ukulele: 'music',
}

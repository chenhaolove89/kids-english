/**
 * 食物 16（food）+ 蔬菜 4（vegetables）。
 * 早餐/午餐/晚餐共用「餐盘 + 时间天体」模板：日出+煎蛋 / 正午日+三明治 / 月亮+鸡腿。
 */
import { svg, hl, limb, rrect, dot } from './_shared.mjs'

/** 餐盘底盘（三餐共用） */
function plate() {
  return `
  ${dot(256, 380, 160, '#E3E7EC')}
  ${dot(256, 372, 132, '#FAFAFA')}`
}

/** 蒸汽卷曲（灶食/热汤上方） */
function steam(x, y, s = 1) {
  return limb(`M${x} ${y} Q${x - 12 * s} ${y - 30 * s} ${x + 2 * s} ${y - 52 * s} Q${x + 16 * s} ${y - 74 * s} ${x + 2 * s} ${y - 96 * s}`, '#B0BEC5', 9, 0.7)
}

function sun(cx, cy, r) {
  let rays = ''
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4
    const x1 = cx + Math.cos(a) * (r + 14)
    const y1 = cy + Math.sin(a) * (r + 14)
    const x2 = cx + Math.cos(a) * (r + 38)
    const y2 = cy + Math.sin(a) * (r + 38)
    rays += limb(`M${x1.toFixed(0)} ${y1.toFixed(0)} L${x2.toFixed(0)} ${y2.toFixed(0)}`, '#FFB300', 10)
  }
  return `${dot(cx, cy, r, '#FFD54F')}${rays}`
}

/** 月牙：外圆减内圆的真实路径（卡片底是彩色的，不能用白色遮罩） */
function moon(cx, cy, r) {
  const r2 = r * 0.85
  const c2x = cx + r * 0.38
  const c2y = cy - r * 0.22
  const dx = c2x - cx
  const dy = c2y - cy
  const d = Math.hypot(dx, dy)
  const a = (d * d + r * r - r2 * r2) / (2 * d)
  const h = Math.sqrt(Math.max(r * r - a * a, 0))
  const mx = cx + (a * dx) / d
  const my = cy + (a * dy) / d
  const p1 = [mx + (h * dy) / d, my - (h * dx) / d]
  const p2 = [mx - (h * dy) / d, my + (h * dx) / d]
  const f = (n) => n.toFixed(1)
  return `<path d="M${f(p1[0])} ${f(p1[1])} A${r} ${r} 0 1 0 ${f(p2[0])} ${f(p2[1])} A${r2} ${r2} 0 0 1 ${f(p1[0])} ${f(p1[1])} Z" fill="#FFD54F"/>`
}

export const icons = {
  /** 吐司：两片面包（背面片微倾） */
  toast: svg(`
  <g transform="rotate(-14 210 220)">
    <path d="M116 190 Q116 128 216 128 Q316 128 316 190 L316 300 Q316 320 296 320 L136 320 Q116 320 116 300 Z" fill="#C8862A"/>
  </g>
  <path d="M156 224 Q156 162 256 162 Q356 162 356 224 L356 340 Q356 360 336 360 L176 360 Q156 360 156 340 Z" fill="#D99A4E"/>
  <path d="M186 232 Q186 196 256 196 Q326 196 326 232 L326 324 Q326 334 316 334 L196 334 Q186 334 186 324 Z" fill="#F7E3B8"/>
  ${hl(206, 220, 30, 20, -20, 0.45)}`),

  /** 麦片：蓝碗牛奶麦圈 + 勺子 */
  cereal: svg(`
  ${limb('M338 252 L388 152', '#B0BEC5', 18)}
  ${dot(392, 142, 20, '#B0BEC5')}${dot(392, 142, 10, '#90A4AE')}
  <path d="M132 262 Q132 372 256 372 Q380 372 380 262 Z" fill="#4A90D9"/>
  <ellipse cx="256" cy="262" rx="124" ry="28" fill="#F7F7F7"/>
  ${dot(206, 256, 17, '#C8862A')}${dot(252, 270, 17, '#C8862A')}${dot(302, 254, 17, '#C8862A')}${dot(256, 244, 13, '#C8862A')}
  ${limb('M132 300 Q256 344 380 300', '#2E6BB0', 0.1)}
  ${hl(160, 300, 26, 34, 18, 0.25)}`),

  /** 粥：白粥 + 粉碗 + 热气 */
  porridge: svg(`
  ${steam(200, 208)}${steam(256, 196)}${steam(312, 208)}
  <path d="M136 266 Q136 372 256 372 Q376 372 376 266 Z" fill="#F25C54"/>
  <ellipse cx="256" cy="266" rx="120" ry="27" fill="#FAF6EA"/>
  ${dot(206, 262, 9, '#EDE2C8')}${dot(262, 272, 9, '#EDE2C8')}${dot(312, 262, 9, '#EDE2C8')}
  ${hl(168, 306, 22, 30, 14, 0.3)}`),

  /** 豆腐：等距立方体三面 */
  tofu: svg(`
  <path d="M256 168 L360 228 L256 288 L152 228 Z" fill="#FAFAFA" stroke="#D8DEE4" stroke-width="4"/>
  <path d="M152 228 L256 288 L256 420 L152 360 Z" fill="#F0F0F0" stroke="#D8DEE4" stroke-width="4"/>
  <path d="M360 228 L256 288 L256 420 L360 356 Z" fill="#E3E7EC" stroke="#D8DEE4" stroke-width="4"/>
  ${hl(214, 216, 26, 12, -26, 0.5)}`),

  /** 果酱：草莓酱玻璃罐 */
  jam: svg(`
  ${rrect(172, 168, 168, 46, 14, '#C8862A')}
  ${limb('M172 212 L340 212', '#A8721F', 6)}
  ${rrect(184, 210, 144, 192, 22, '#F25C54')}
  ${rrect(206, 286, 100, 66, 10, '#FFF8EC')}
  ${dot(256, 314, 13, '#D64541')}
  <ellipse cx="256" cy="300" rx="10" ry="6" fill="#5CB85C" transform="rotate(-24 256 300)"/>
  ${hl(210, 250, 14, 44, -6, 0.4)}`),

  /** 酸奶：蓝色酸奶杯 + 锡纸盖 + 芒果标 */
  yogurt: svg(`
  <ellipse cx="256" cy="196" rx="102" ry="26" fill="#C7CED6"/>
  <ellipse cx="256" cy="192" rx="94" ry="22" fill="#ECEFF3"/>
  ${limb('M176 188 Q256 154 336 188', '#FFFFFF', 6, 0.8)}
  <path d="M172 210 L340 210 L318 398 Q256 416 194 398 Z" fill="#5CC0F0"/>
  ${dot(256, 306, 36, '#F5B841')}
  <ellipse cx="266" cy="272" rx="16" ry="8" fill="#5CB85C" transform="rotate(-28 266 272)"/>
  ${limb('M196 254 L316 254', '#4FA8D8', 5)}
  ${hl(212, 290, 14, 60, -8, 0.35)}`),

  /** 香肠：两根交叉的香肠 */
  sausage: svg(`
  <g transform="rotate(-26 256 280)">${rrect(140, 248, 232, 66, 33, '#C9503F')}</g>
  <g transform="rotate(24 256 280)">${rrect(140, 248, 232, 66, 33, '#E06666')}</g>
  ${dot(140, 248, 8, '#8B3A2E')}${dot(372, 248, 8, '#8B3A2E')}${dot(140, 314, 8, '#8B3A2E')}${dot(372, 314, 8, '#8B3A2E')}
  ${hl(196, 236, 34, 12, 22, 0.35)}`),

  /** 肉丸：盘子上三颗牛肉丸 */
  meatball: svg(`
  ${dot(256, 384, 152, '#E3E7EC')}
  ${dot(256, 374, 132, '#FAFAFA')}
  ${dot(198, 338, 48, '#8B5A2B')}${dot(312, 332, 52, '#7A4E24')}${dot(256, 378, 46, '#8B5A2B')}
  ${dot(184, 324, 7, '#6B4420')}${dot(324, 316, 7, '#5E3D1C')}${dot(246, 366, 7, '#6B4420')}
  ${hl(180, 318, 16, 10, -20, 0.4)}${hl(294, 312, 16, 10, -20, 0.35)}`),

  /** 糖：糖罐 + 方糖 */
  sugar: svg(`
  ${rrect(96, 330, 52, 52, 8, '#FAFAFA', 'stroke="#D8DEE4" stroke-width="5"')}
  ${rrect(366, 338, 46, 46, 8, '#FAFAFA', 'stroke="#D8DEE4" stroke-width="5"')}
  <path d="M162 266 Q162 372 256 372 Q350 372 350 266 Z" fill="#5CC0F0"/>
  <path d="M172 266 Q256 190 340 266 Z" fill="#4FA8D8"/>
  ${dot(256, 210, 16, '#2E6BB0')}
  ${limb('M162 268 L350 268', '#2E6BB0', 0.1)}
  ${hl(190, 308, 20, 34, 12, 0.3)}`),

  /** 面粉：纸袋 + 麦穗标签 */
  flour: svg(`
  ${rrect(190, 172, 132, 46, 10, '#E5D5AE')}
  <path d="M182 216 Q256 186 330 216 L346 386 Q256 418 166 386 Z" fill="#F0E3C8"/>
  ${dot(256, 300, 56, '#FFF8EC')}
  ${limb('M256 272 L256 332', '#C8862A', 6)}
  <ellipse cx="242" cy="284" rx="7" ry="14" fill="#D9A441" transform="rotate(-32 242 284)"/>
  <ellipse cx="270" cy="284" rx="7" ry="14" fill="#D9A441" transform="rotate(32 270 284)"/>
  <ellipse cx="242" cy="304" rx="7" ry="14" fill="#D9A441" transform="rotate(-32 242 304)"/>
  <ellipse cx="270" cy="304" rx="7" ry="14" fill="#D9A441" transform="rotate(32 270 304)"/>
  <ellipse cx="242" cy="324" rx="7" ry="14" fill="#D9A441" transform="rotate(-32 242 324)"/>
  <ellipse cx="270" cy="324" rx="7" ry="14" fill="#D9A441" transform="rotate(32 270 324)"/>
  ${hl(196, 250, 18, 50, -8, 0.4)}`),

  /** 零食：薯片袋（红袋黄窗） */
  snack: svg(`
  ${rrect(162, 166, 188, 36, 10, '#D64541')}
  <path d="M170 200 L342 200 L362 396 Q256 422 150 396 Z" fill="#F25C54"/>
  <path d="M172 202 L192 188 L212 202 L232 188 L252 202 L272 188 L292 202 L312 188 L332 202" stroke="#D64541" stroke-width="6" fill="none"/>
  <ellipse cx="256" cy="308" rx="72" ry="62" fill="#F5B841"/>
  ${hl(232, 288, 22, 14, -24, 0.5)}
  ${limb('M330 240 L340 372', '#FFFFFF', 8, 0.35)}`),

  /** 早餐：日出 + 煎蛋 */
  breakfast: svg(`
  ${sun(150, 116, 42)}
  ${plate()}
  <ellipse cx="240" cy="366" rx="84" ry="52" fill="#FFFFFF" stroke="#E3E7EC" stroke-width="4"/>
  ${dot(246, 362, 24, '#F5B841')}
  ${hl(216, 344, 14, 9, -20, 0.6)}`),

  /** 午餐：正午太阳 + 三明治 */
  lunch: svg(`
  ${sun(256, 104, 44)}
  ${plate()}
  <path d="M256 214 L326 292 L186 292 Z" fill="#F5D76E" stroke="#D9A441" stroke-width="5"/>
  ${rrect(196, 292, 120, 24, 10, '#5CB85C')}
  ${rrect(192, 316, 128, 26, 8, '#F0C860')}
  ${limb('M206 330 L306 330', '#D9A441', 5)}
  ${hl(226, 238, 20, 12, -30, 0.5)}`),

  /** 晚餐：月亮星星 + 鸡腿 */
  dinner: svg(`
  ${moon(180, 116, 46)}
  ${dot(300, 96, 7, '#FFD54F')}${dot(342, 140, 5, '#FFD54F')}${dot(258, 172, 5, '#FFD54F')}
  ${plate()}
  <g transform="rotate(-30 256 344)">
    ${rrect(212, 312, 92, 62, 31, '#C8862A')}
    ${rrect(228, 328, 60, 30, 15, '#D99A4E')}
    ${limb('M304 342 L340 342', '#FFF8F0', 15)}
    ${dot(348, 334, 11, '#FFF8F0')}${dot(348, 352, 11, '#FFF8F0')}
  </g>
  ${hl(230, 322, 18, 10, -20, 0.35)}`),

  /** 点心：竹蒸笼 + 三个饺子 + 热气 */
  'dim sum': svg(`
  ${steam(196, 232, 0.8)}${steam(300, 232, 0.8)}
  <path d="M106 336 L406 336 L384 402 Q256 434 128 402 Z" fill="#C8862A"/>
  ${limb('M160 344 L152 410', '#A8721F', 7)}
  ${limb('M256 346 L256 420', '#A8721F', 7)}
  ${limb('M352 344 L360 410', '#A8721F', 7)}
  <ellipse cx="256" cy="332" rx="150" ry="42" fill="#E8C878"/>
  <ellipse cx="256" cy="330" rx="124" ry="34" fill="#D9A441"/>
  <path d="M206 326 Q206 282 254 282 Q302 282 302 326 Z" fill="#FAF5E6"/>
  ${limb('M254 284 L240 306', '#E0D5B8', 5)}
  ${limb('M254 284 L254 308', '#E0D5B8', 5)}
  ${limb('M254 284 L268 306', '#E0D5B8', 5)}
  <path d="M148 330 Q148 296 188 296 Q228 296 228 330 Z" fill="#FAF5E6"/>
  <path d="M284 330 Q284 296 324 296 Q364 296 364 330 Z" fill="#FAF5E6"/>
  ${hl(232, 296, 20, 9, -14, 0.6)}`),

  /** 火锅：铜锅红汤 + 中央烟囱 + 热气 */
  'hot pot': svg(`
  ${steam(196, 168, 0.9)}${steam(256, 156, 0.9)}${steam(316, 168, 0.9)}
  <path d="M186 402 Q256 436 326 402 L316 430 Q256 454 196 430 Z" fill="#C8862A"/>
  ${rrect(90, 286, 38, 28, 9, '#C8862A')}${rrect(384, 286, 38, 28, 9, '#C8862A')}
  ${dot(256, 296, 132, '#C8862A')}
  ${dot(256, 296, 110, '#B03A2E')}
  ${dot(256, 296, 32, '#C8862A')}${dot(256, 296, 18, '#8B5A2B')}
  ${dot(206, 268, 6, '#FFFFFF')}${dot(300, 262, 5, '#FFFFFF')}${dot(330, 306, 6, '#FFFFFF')}${dot(196, 322, 5, '#FFFFFF')}
  ${rrect(268, 320, 20, 8, 4, '#5CB85C')}${rrect(180, 288, 18, 8, 4, '#5CB85C')}
  ${hl(176, 232, 26, 14, -30, 0.3)}`),

  /** 莲藕：两段藕 + 切面孔洞 */
  'lotus root': svg(`
  <g transform="rotate(-22 256 290)">
    ${rrect(110, 258, 250, 78, 39, '#A8B878')}
    ${dot(150, 297, 7, '#8FA06A')}${dot(190, 288, 6, '#8FA06A')}${dot(230, 300, 7, '#8FA06A')}${dot(270, 290, 6, '#8FA06A')}${dot(308, 298, 7, '#8FA06A')}
  </g>
  <g transform="rotate(-22 256 290)">
    ${rrect(330, 254, 96, 86, 42, '#B5C48A')}
    <ellipse cx="426" cy="297" rx="26" ry="40" fill="#EDEDD8" stroke="#8FA06A" stroke-width="5"/>
    ${dot(426, 282, 6, '#8FA06A')}${dot(426, 312, 6, '#8FA06A')}${dot(414, 297, 6, '#8FA06A')}${dot(438, 297, 6, '#8FA06A')}${dot(420, 288, 4, '#8FA06A')}${dot(432, 306, 4, '#8FA06A')}
  </g>
  ${hl(170, 268, 40, 12, -22, 0.35)}`),

  /** 豆芽：三根芽苗 + 黄豆瓣头 */
  'bean sprout': svg(`
  ${limb('M256 444 Q216 360 238 296', '#E8E2C0', 15)}
  ${limb('M256 444 Q254 330 282 252', '#E8E2C0', 15)}
  ${limb('M256 444 Q298 372 322 318', '#E8E2C0', 15)}
  ${limb('M256 444 L238 456', '#E8E2C0', 7)}
  ${limb('M256 444 L272 458', '#E8E2C0', 7)}
  <ellipse cx="234" cy="284" rx="27" ry="17" fill="#F0D264" transform="rotate(-38 234 284)"/>
  <ellipse cx="288" cy="238" rx="28" ry="18" fill="#F0D264" transform="rotate(-20 288 238)"/>
  <ellipse cx="328" cy="304" rx="27" ry="17" fill="#F0D264" transform="rotate(28 328 304)"/>
  ${hl(228, 278, 10, 5, -38, 0.55)}${hl(282, 232, 10, 5, -20, 0.55)}`),

  /** 山药：深褐长棒 + 白色切面 */
  yam: svg(`
  <g transform="rotate(14 256 280)">
    ${rrect(218, 108, 76, 348, 38, '#8B6B4A')}
    <ellipse cx="256" cy="112" rx="38" ry="15" fill="#F5EFE0" stroke="#6E5238" stroke-width="5"/>
    ${dot(240, 190, 5, '#6E5238')}${dot(274, 240, 5, '#6E5238')}${dot(244, 300, 5, '#6E5238')}${dot(276, 352, 5, '#6E5238')}
    ${limb('M238 220 L222 214', '#6E5238', 4)}
    ${limb('M276 286 L292 280', '#6E5238', 4)}
    ${limb('M240 386 L226 382', '#6E5238', 4)}
  </g>
  ${hl(238, 180, 14, 60, 12, 0.25)}`),

  /** 芋头：褐色球茎 + 环状绒毛纹 + 顶芽 */
  taro: svg(`
  <path d="M238 214 Q256 158 274 214 Z" fill="#8FA06A"/>
  ${limb('M256 200 L256 178', '#6E7F4E', 6)}
  <ellipse cx="256" cy="304" rx="112" ry="96" fill="#9A7B5A"/>
  ${limb('M150 274 Q256 250 362 274', '#7E6146', 9)}
  ${limb('M146 312 Q256 290 366 312', '#7E6146', 9)}
  ${limb('M158 350 Q256 330 354 350', '#7E6146', 9)}
  ${limb('M196 262 L188 246', '#7E6146', 4)}
  ${limb('M268 258 L266 240', '#7E6146', 4)}
  ${limb('M330 268 L340 254', '#7E6146', 4)}
  ${limb('M256 400 L256 428', '#7E6146', 5)}
  ${limb('M210 392 L202 416', '#7E6146', 5)}
  ${hl(204, 262, 26, 16, -24, 0.3)}`),
}

export const category = 'food'
export const categories = {
  'lotus root': 'vegetables', 'bean sprout': 'vegetables', yam: 'vegetables', taro: 'vegetables',
}

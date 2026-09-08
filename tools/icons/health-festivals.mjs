/**
 * 批次12：健康 10（health）+ 节日 8（festivals）。
 * 约束（与既有 emoji 互斥）：
 * - medicine 画糖浆瓶+量杯、vitamin 画双胶囊+橙角（pill 1f48a 是圆药片）；
 * - firstaid 画急救箱（bandage 1fa79 是创可贴）；
 * - SpringFestival 画红包+元宝（lantern/firecracker emoji 已占用）；
 * - Mid-AutumnFestival 画满月+祥云（moon 1f319 是弯月、mooncake 1f96e 已占用）；
 * - LanternFestival 画汤圆碗（避开 lantern 1f3ee）；Easter 画彩蛋花纹（egg 1f95a 是素蛋）。
 */
import { svg, hl, limb, rrect, dot } from './_shared.mjs'

const SKIN = '#FFD9B3'
const ell = (cx, cy, rx, ry, fill, extra = '') =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}"${extra ? ` ${extra}` : ''}/>`

/** 表情头：eyes/mouth 传 SVG 片段 */
function face({ x = 256, y = 220, r = 90, hair = '#4A342E', cheeks = null }) {
  return `
  ${dot(x, y, r, SKIN)}
  <path d="M${x - r} ${y - 10} A${r} ${r} 0 0 1 ${x + r} ${y - 10} L${x + r} ${y - 26} Q${x} ${y - r - 34} ${x - r} ${y - 26} Z" fill="${hair}"/>
  ${cheeks || ''}`
}

export const categories = {
  medicine: 'health', cough: 'health', flu: 'health', healthy: 'health', headache: 'health',
  vitamin: 'health', 'sore throat': 'health', 'runny nose': 'health', toothache: 'health', 'first aid': 'health',
  'Christmas stocking': 'festivals', 'candy cane': 'festivals', 'party hat': 'festivals',
  'Spring Festival': 'festivals', 'Mid-Autumn Festival': 'festivals', 'Dragon Boat Festival': 'festivals',
  'Lantern Festival': 'festivals', Easter: 'festivals',
}

export const icons = {
  /** 药：橙色糖浆瓶+白标签+旁边量杯 */
  medicine: svg(`
  ${rrect(150, 130, 150, 260, 24, '#F28C28')}
  ${rrect(166, 92, 118, 46, 10, '#D94A3D')}
  ${rrect(186, 70, 78, 28, 8, '#A83A3A')}
  ${rrect(168, 190, 114, 140, 12, '#F5F0E8')}
  ${limb('M186 226 L264 226', '#5A9BC4', 8)}
  ${rrect(218, 246, 16, 58, 8, '#5A9BC4')}
  ${rrect(210, 266, 32, 18, 8, '#5A9BC4')}
  <path d="M330 300 L344 400 C344 414 396 414 396 400 L410 300 Z" fill='#DFF1F7' stroke="#9FB4C4" stroke-width="4"/>
  ${limb('M338 340 L402 340', '#7FC4EA', 6)}
  ${dot(370, 372, 6, '#7FC4EA')}
  ${hl(176, 170, 10, 30, 0, 0.35)}`),

  /** 咳嗽：皱眉张嘴的脸+嘴边三团咳气 */
  cough: svg(`
  ${face({ cheeks: dot(176, 250, 14, '#FFAB91', 'opacity="0.5"') + dot(336, 250, 14, '#FFAB91', 'opacity="0.5"') })}
  ${ell(256, 272, 30, 36, '#8A4A3A')}
  ${ell(256, 292, 20, 12, '#D94A3D')}
  ${dot(218, 212, 9, '#4A342E')}${dot(294, 212, 9, '#4A342E')}
  ${limb('M204 190 L232 196', '#4A342E', 6)}
  ${limb('M308 190 L280 196', '#4A342E', 6)}
  ${limb('M392 200 A26 26 0 0 1 392 252', '#9FB4C4', 8)}
  ${limb('M416 180 A40 40 0 0 1 416 272', '#9FB4C4', 8, 0.7)}
  ${limb('M440 160 A54 54 0 0 1 440 292', '#9FB4C4', 8, 0.45)}
  ${dot(120, 320, 8, '#C9D4DC')}${dot(96, 280, 6, '#C9D4DC')}`),

  /** 流感：蔫脸+嘴里体温计+汗滴+纸巾 */
  flu: svg(`
  ${face({ hair: '#4A342E', cheeks: dot(180, 252, 16, '#9BC09B', 'opacity="0.6"') + dot(332, 252, 16, '#9BC09B', 'opacity="0.6"') })}
  ${limb('M216 216 Q228 224 240 216', '#4A342E', 6)}
  ${limb('M272 216 Q284 224 296 216', '#4A342E', 6)}
  ${limb('M232 282 Q256 272 280 282', '#8A4A3A', 6)}
  ${rrect(268, 268, 130, 18, 9, '#F5F0E8', 'transform="rotate(18 333 277)" stroke="#D8D8D8" stroke-width="2"')}
  ${dot(392, 306, 10, '#D94A3D', 'transform="rotate(18 392 306)"')}
  ${dot(150, 170, 8, '#7FC4EA')}
  ${limb('M150 158 C144 148 140 142 140 136 A10 10 0 0 1 160 136 C160 144 154 152 150 158 Z', '#7FC4EA', 0)}
  ${rrect(330, 360, 120, 60, 10, '#9FCFF0')}
  <path d="M348 360 C352 336 372 336 376 360" fill="#F5F0E8" stroke="#D8D8D8" stroke-width="3"/>
  ${hl(168, 200, 8, 14, -20, 0.4)}`),

  /** 健康：笑脸+竖大拇指手臂+绿心+勾 */
  healthy: svg(`
  ${face({ cheeks: dot(178, 248, 15, '#FFAB91', 'opacity="0.6"') + dot(334, 248, 15, '#FFAB91', 'opacity="0.6"') })}
  ${dot(220, 214, 9, '#4A342E')}${dot(292, 214, 9, '#4A342E')}
  ${limb('M222 258 Q256 286 290 258', '#8A4A3A', 7)}
  ${limb('M150 330 L110 300', '#58ABDF', 26)}
  ${dot(104, 296, 18, SKIN)}
  ${rrect(96, 262, 14, 30, 7, SKIN, 'transform="rotate(-20 103 277)"')}
  ${rrect(330, 320, 110, 110, 26, '#63B068')}
  <path d="M352 372 L376 396 L418 348" fill="none" stroke="#FFFFFF" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M420 130 C412 116 394 118 394 132 C394 148 412 158 420 166 C428 158 446 148 446 132 C446 118 428 116 420 130 Z" fill="#63B068"/>
  ${hl(200, 180, 10, 16, -20, 0.4)}`),

  /** 头疼：痛苦脸+额头红色闪电+冰袋 */
  headache: svg(`
  ${face({ cheeks: dot(178, 252, 15, '#E88A7A', 'opacity="0.7"') + dot(334, 252, 15, '#E88A7A', 'opacity="0.7"') })}
  ${limb('M210 210 L236 222 L210 228', '#4A342E', 6)}
  ${limb('M302 210 L276 222 L302 228', '#4A342E', 6)}
  ${limb('M232 280 Q256 268 280 280', '#8A4A3A', 7)}
  <path d="M250 96 L226 150 L248 150 L232 196 L282 138 L256 138 L276 96 Z" fill="#D94A3D"/>
  ${limb('M170 120 L196 142', '#E88A7A', 6)}${limb('M342 120 L316 142', '#E88A7A', 6)}
  ${rrect(330, 330, 120, 90, 18, '#9FCFF0', 'stroke="#7FB3D8" stroke-width="4"')}
  ${limb('M350 350 L430 410 M430 350 L350 410', '#DFF1F7', 8)}
  ${hl(352, 348, 10, 16, -20, 0.5)}`),

  /** 维生素：黄红双胶囊+橙角+闪光 */
  vitamin: svg(`
  ${rrect(120, 180, 160, 64, 32, '#F5C542', 'transform="rotate(-24 200 212)"')}
  <path d="M120 212 A32 32 0 0 1 152 180 L200 180 L200 244 L152 244 A32 32 0 0 1 120 212 Z" fill="#E8834A" transform="rotate(-24 200 212)"/>
  ${rrect(240, 300, 160, 64, 32, '#D94A3D', 'transform="rotate(14 320 332)"')}
  <path d="M360 332 A32 32 0 0 1 328 364 L278 364 L278 300 L328 300 A32 32 0 0 1 360 332 Z" fill="#F5F0E8" transform="rotate(14 320 332)"/>
  <path d="M356 140 A66 66 0 0 0 356 268 Z" fill="#F2A93B" stroke="#E8B93A" stroke-width="5"/>
  ${limb('M356 156 L398 150 M356 204 L406 204 M356 252 L398 258', '#E8B93A', 4)}
  ${dot(392, 128, 5, '#F5C542')}
  <path d="M96 340 L102 358 L120 364 L102 370 L96 388 L90 370 L72 364 L90 358 Z" fill="#F5C542"/>
  ${hl(160, 196, 10, 22, -24, 0.4)}`),

  /** 嗓子疼：脸+喉咙红色发光+手摸脖子+疼符号 */
  'sore throat': svg(`
  ${face({ cheeks: null })}
  ${dot(220, 214, 9, '#4A342E')}${dot(292, 214, 9, '#4A342E')}
  ${ell(256, 268, 24, 28, '#8A4A3A')}
  ${limb('M206 194 L230 202', '#4A342E', 6)}
  ${limb('M306 194 L282 202', '#4A342E', 6)}
  ${dot(256, 380, 56, '#E88A7A', 'opacity="0.55"')}
  ${dot(256, 380, 36, '#D94A3D', 'opacity="0.8"')}
  ${limb('M256 356 L256 336', '#D94A3D', 6)}
  ${limb('M232 360 L220 344', '#D94A3D', 6)}${limb('M280 360 L292 344', '#D94A3D', 6)}
  ${limb('M150 330 C120 350 116 390 140 410', '#58ABDF', 26)}
  ${dot(146, 416, 17, SKIN)}
  ${hl(200, 180, 10, 16, -20, 0.4)}`),

  /** 流鼻涕：脸+鼻孔蓝色滴落+抽纸巾 */
  'runny nose': svg(`
  ${face({ cheeks: dot(178, 250, 14, '#FFAB91', 'opacity="0.6"') + dot(334, 250, 14, '#FFAB91', 'opacity="0.6"') })}
  ${dot(220, 214, 9, '#4A342E')}${dot(292, 214, 9, '#4A342E')}
  ${limb('M228 280 Q256 290 284 280', '#8A4A3A', 6)}
  ${ell(244, 252, 8, 6, '#D98F7A')}${ell(268, 252, 8, 6, '#D98F7A')}
  <path d="M244 258 C240 300 246 340 256 360 C266 340 270 300 266 258 Z" fill="#7FC4EA"/>
  ${dot(254, 366, 9, '#7FC4EA')}
  ${rrect(320, 340, 130, 80, 12, '#9FCFF0')}
  <path d="M344 340 C348 306 376 306 380 340" fill="#F5F0E8" stroke="#D8D8D8" stroke-width="3"/>
  ${limb('M150 330 L116 306', '#58ABDF', 26)}
  ${dot(110, 302, 17, SKIN)}
  ${hl(200, 180, 10, 16, -20, 0.4)}`),

  /** 牙疼：大牙+红蛀洞+闪电+泪滴 */
  toothache: svg(`
  ${rrect(150, 140, 212, 200, 60, '#FFFFFF', 'stroke="#D8D8D8" stroke-width="5"')}
  <path d="M186 336 L200 420 C204 436 224 436 228 420 L240 350 L272 350 L284 420 C288 436 308 436 312 420 L326 336 Z" fill="#FFFFFF" stroke="#D8D8D8" stroke-width="5" stroke-linejoin="round"/>
  ${dot(300, 210, 26, '#D94A3D')}
  ${dot(300, 210, 14, '#A83A3A')}
  <path d="M312 120 L296 158 L314 158 L298 196 L338 148 L318 148 L334 120 Z" fill="#F5C542" stroke="#E8B93A" stroke-width="3"/>
  ${limb('M210 176 Q228 188 246 176', '#5A9BC4', 6)}
  ${limb('M268 176 Q286 188 304 176', '#5A9BC4', 6)}
  ${dot(214, 210, 8, '#5A9BC4')}
  <path d="M206 232 C200 248 200 258 206 264 C212 258 212 248 206 232 Z" fill="#7FC4EA"/>
  ${hl(186, 170, 12, 26, -15, 0.5)}`),

  /** 急救：白急救箱红十字+旁边绷带卷 */
  'first aid': svg(`
  ${rrect(196, 150, 120, 34, 12, '#5A6470')}
  ${rrect(96, 176, 320, 220, 24, '#F5F0E8', 'stroke="#D8D8D8" stroke-width="5"')}
  ${limb('M96 240 L416 240', '#D8D8D8', 6)}
  ${rrect(232, 258, 48, 120, 10, '#D94A3D')}
  ${rrect(196, 294, 120, 48, 10, '#D94A3D')}
  ${dot(48, 300, 10, '#63B068')}
  ${rrect(396, 330, 84, 66, 14, '#E8D5B8', 'stroke="#C9B87E" stroke-width="4"')}
  ${ell(438, 363, 22, 22, '#F5F0E8')}
  ${limb('M438 341 A22 22 0 0 1 438 385', '#C9B87E', 4)}
  ${hl(130, 210, 12, 20, -10, 0.4)}`),

  /** 圣诞袜：红袜白袜口+雪花补丁+挂绳 */
  'Christmas stocking': svg(`
  ${limb('M256 60 L256 100', '#8A6242', 6)}
  ${rrect(170, 96, 176, 52, 16, '#F5F0E8', 'stroke="#D8D8D8" stroke-width="4"')}
  <path d="M186 148 L330 148 L330 290 C330 316 356 322 380 340 C412 364 408 410 372 424 C330 440 296 416 250 416 C204 416 186 396 186 360 Z" fill="#D94A3D" stroke="#A83A3A" stroke-width="5" stroke-linejoin="round"/>
  <path d="M250 416 C296 416 330 440 372 424 C396 414 406 392 398 372 C380 396 340 396 310 384 L250 384 Z" fill="#F5F0E8"/>
  <path d="M236 210 L242 228 L260 234 L242 240 L236 258 L230 240 L212 234 L230 228 Z" fill="#F5F0E8"/>
  ${dot(296, 296, 6, '#F5F0E8')}${dot(220, 320, 5, '#F5F0E8')}
  ${hl(210, 180, 10, 24, 0, 0.3)}`),

  /** 拐杖糖：红白斜纹钩形糖 */
  'candy cane': svg(`
  <path d="M200 440 L200 200 C200 130 320 130 320 200 L320 240" fill="none" stroke="#D94A3D" stroke-width="66" stroke-linecap="round"/>
  <path d="M200 440 L200 200 C200 130 320 130 320 200 L320 240" fill="none" stroke="#FFFFFF" stroke-width="66" stroke-linecap="butt" stroke-dasharray="20 64"/>
  ${hl(180, 380, 10, 40, 0, 0.35)}
  ${dot(340, 140, 6, '#F5C542')}${dot(120, 160, 5, '#F5C542')}`),

  /** 派对帽：粉紫条纹圆锥+顶部绒球+彩屑 */
  'party hat': svg(`
  <path d="M256 80 L356 380 L156 380 Z" fill="#F06C9C" stroke="#D94A78" stroke-width="5" stroke-linejoin="round"/>
  <path d="M226 160 L286 160 L300 200 L212 200 Z" fill="#F5C542"/>
  <path d="M204 250 L308 250 L322 290 L190 290 Z" fill="#7FC4EA"/>
  <path d="M182 340 L330 340 L340 376 L172 376 Z" fill="#9B6BD9"/>
  ${rrect(150, 376, 212, 26, 13, '#F5F0E8')}
  ${dot(256, 66, 26, '#F5C542')}
  ${dot(120, 120, 7, '#63B068')}${dot(400, 160, 8, '#F06C9C')}${dot(90, 300, 6, '#9B6BD9')}${dot(430, 320, 7, '#F5C542')}
  ${hl(226, 220, 8, 30, 20, 0.3)}`),

  /** 春节：两个红包+金元宝+梅花 */
  'Spring Festival': svg(`
  ${rrect(150, 160, 150, 220, 16, '#D94A3D', 'transform="rotate(-8 225 270)"')}
  ${ell(225, 220, 30, 30, '#F5C542', 'transform="rotate(-8 225 270)"')}
  ${rrect(230, 190, 150, 220, 16, '#C94A4A', 'transform="rotate(9 305 300)"')}
  ${ell(305, 250, 30, 30, '#F5C542', 'transform="rotate(9 305 300)"')}
  <path d="M100 400 C100 372 200 372 200 400 C200 428 100 428 100 400 Z" fill="#F5C542" stroke="#E8B93A" stroke-width="4"/>
  <path d="M120 388 C120 372 180 372 180 388 Z" fill="#F7D94A"/>
  ${dot(150, 402, 10, '#E8B93A')}
  ${dot(380, 120, 10, '#F06C9C')}${dot(404, 100, 8, '#F06C9C')}${dot(416, 128, 8, '#F06C9C')}
  ${dot(398, 116, 5, '#F5F0E8')}
  ${hl(180, 200, 10, 30, -8, 0.3)}`),

  /** 中秋节：大满月+白祥云+小星 */
  'Mid-Autumn Festival': svg(`
  ${dot(256, 230, 150, '#F7D94A')}
  ${dot(256, 230, 150, '#F5C542', 'opacity="0.5"')}
  ${dot(200, 180, 22, '#E8B93A', 'opacity="0.6"')}
  ${dot(300, 260, 16, '#E8B93A', 'opacity="0.6"')}
  ${dot(270, 160, 10, '#E8B93A', 'opacity="0.6"')}
  <path d="M120 330 C120 306 160 306 168 318 C176 296 220 296 226 316 C236 302 264 306 266 324 C280 320 292 332 286 346 L128 346 C118 344 116 338 120 330 Z" fill="#F5F0E8"/>
  <path d="M280 400 C280 380 314 380 320 390 C328 372 362 372 368 388 C380 376 402 384 398 400 L288 404 C280 404 278 402 280 400 Z" fill="#F5F0E8" opacity="0.9"/>
  <path d="M400 100 L406 118 L424 124 L406 130 L400 148 L394 130 L376 124 L394 118 Z" fill="#F5F0E8"/>
  ${dot(110, 130, 6, '#F5F0E8')}${dot(140, 90, 4, '#F5F0E8')}`),

  /** 端午节：龙头船+桨+水波 */
  'Dragon Boat Festival': svg(`
  <path d="M60 340 L420 340 C440 340 448 360 436 376 C420 396 396 408 372 408 L120 408 C92 408 72 392 64 370 Z" fill="#63B068" stroke="#3E8C4A" stroke-width="5" stroke-linejoin="round"/>
  ${limb('M100 340 L400 340', '#3E8C4A', 6)}
  ${rrect(120, 356, 260, 18, 9, '#F5C542')}
  <path d="M400 336 C430 300 452 280 460 250 C470 262 476 280 470 296 C484 292 494 300 492 314 C480 312 470 316 464 326 C456 344 436 352 416 350 Z" fill="#D94A3D" stroke="#A83A3A" stroke-width="4"/>
  ${dot(452, 282, 6, '#F5F0E8')}${dot(454, 282, 3, '#2E3A42')}
  <path d="M462 250 L480 232 L474 256 Z" fill="#F5C542"/>
  ${limb('M170 340 L150 280', '#8A6242', 8)}${limb('M250 340 L250 278', '#8A6242', 8)}${limb('M330 340 L350 280', '#8A6242', 8)}
  ${rrect(142, 268, 18, 14, 4, '#F2A93B', 'transform="rotate(-14 151 275)"')}
  ${rrect(241, 266, 18, 14, 4, '#F2A93B')}${rrect(342, 268, 18, 14, 4, '#F2A93B', 'transform="rotate(14 351 275)"')}
  ${limb('M60 440 Q100 428 140 440 T220 440 T300 440 T380 440 T460 440', '#58ABDF', 8)}
  ${limb('M80 470 Q120 458 160 470 T240 470 T320 470 T400 470', '#58ABDF', 8, 0.6)}`),

  /** 元宵节：一碗汤圆+热气+小勺 */
  'Lantern Festival': svg(`
  <path d="M110 300 C110 400 402 400 402 300 Z" fill="#F5F0E8" stroke="#D8D8D8" stroke-width="5"/>
  ${ell(256, 300, 146, 26, '#9FCFF0')}
  ${dot(200, 296, 30, '#FFFFFF', 'stroke="#E0E8EC" stroke-width="3"')}
  ${dot(262, 302, 30, '#FFFFFF', 'stroke="#E0E8EC" stroke-width="3"')}
  ${dot(318, 292, 26, '#FFFFFF', 'stroke="#E0E8EC" stroke-width="3"')}
  ${dot(192, 288, 6, '#F5F0E8', 'opacity="0.8"')}
  <path d="M110 300 C110 330 140 352 176 362 L176 320 Z" fill="#E8D5B8" opacity="0.6"/>
  ${limb('M180 250 C172 226 192 214 184 190', '#C9D4DC', 7, 0.8)}
  ${limb('M256 246 C248 220 268 208 260 182', '#C9D4DC', 7, 0.8)}
  ${limb('M326 248 C318 224 338 212 330 188', '#C9D4DC', 7, 0.8)}
  ${rrect(370, 200, 14, 130, 7, '#9FB4C4', 'transform="rotate(24 377 265)"')}
  ${ell(404, 196, 26, 16, '#9FB4C4', 'transform="rotate(24 404 196)"')}
  ${hl(150, 330, 10, 24, -20, 0.4)}`),

  /** 复活节：粉色彩蛋+锯齿彩纹+圆点+蝴蝶结 */
  Easter: svg(`
  ${ell(256, 280, 120, 150, '#F5D7E8', 'stroke="#E0AAC8" stroke-width="5"')}
  <path d="M148 250 L256 220 L364 250 L364 280 L256 250 L148 280 Z" fill="#7FC4EA"/>
  <path d="M150 320 L256 290 L362 320 L360 346 L256 316 L152 346 Z" fill="#F5C542"/>
  ${dot(190, 190, 9, '#63B068')}${dot(256, 172, 9, '#F06C9C')}${dot(322, 190, 9, '#9B6BD9')}
  ${dot(186, 386, 8, '#F06C9C')}${dot(256, 402, 8, '#63B068')}${dot(326, 386, 8, '#7FC4EA')}
  <path d="M256 430 C236 414 208 420 210 436 C212 452 240 452 256 438 C272 452 300 452 302 436 C304 420 276 414 256 430 Z" fill="#D94A3D"/>
  ${dot(256, 434, 8, '#A83A3A')}
  ${hl(200, 210, 16, 26, -20, 0.5)}`),
}

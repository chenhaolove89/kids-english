/**
 * 厨房 13（kitchen）+ 学校 8（school）。
 */
import { svg, hl, limb, rrect, dot } from './_shared.mjs'

function steam(x, y, s = 1) {
  return limb(`M${x} ${y} Q${x - 12 * s} ${y - 30 * s} ${x + 2 * s} ${y - 52 * s} Q${x + 16 * s} ${y - 74 * s} ${x + 2 * s} ${y - 96 * s}`, '#B0BEC5', 9, 0.7)
}

export const icons = {
  /** 冰箱：双门冰箱 */
  fridge: svg(`
  ${rrect(146, 92, 220, 330, 22, '#ECEFF3', 'stroke="#C7CED6" stroke-width="6"')}
  ${rrect(154, 100, 204, 110, 14, '#FAFAFA')}
  ${rrect(154, 218, 204, 196, 14, '#FAFAFA')}
  ${rrect(322, 130, 14, 44, 7, '#90A4AE')}
  ${rrect(322, 250, 14, 70, 7, '#90A4AE')}
  ${limb('M156 216 L356 216', '#C7CED6', 6)}
  ${dot(200, 150, 10, '#5CC0F0', 'opacity="0.7"')}
  ${hl(176, 140, 14, 30, -4, 0.5)}`),

  /** 烤箱：灶台烤箱一体 */
  oven: svg(`
  ${rrect(126, 96, 260, 330, 18, '#B0BEC5')}
  ${rrect(136, 106, 240, 74, 10, '#78909C')}
  ${dot(170, 143, 13, '#ECEFF3')}${dot(216, 143, 13, '#ECEFF3')}${dot(298, 143, 13, '#ECEFF3')}${dot(344, 143, 13, '#ECEFF3')}
  ${limb('M154 132 L190 132', '#546E7A', 6)}
  ${rrect(140, 192, 232, 216, 12, '#ECEFF3')}
  ${rrect(158, 232, 196, 140, 10, '#37474F')}
  ${rrect(166, 240, 180, 124, 8, '#546E7A')}
  ${limb('M180 216 L340 216', '#90A4AE', 8)}
  ${limb('M240 240 L240 364', '#37474F', 5)}
  ${limb('M166 310 L348 310', '#37474F', 5)}`),

  /** 锅：带盖双耳汤锅 */
  pot: svg(`
  ${steam(220, 150, 0.8)}${steam(292, 150, 0.8)}
  ${rrect(196, 96, 120, 20, 10, '#B0BEC5')}
  ${dot(256, 92, 16, '#90A4AE')}
  <ellipse cx="256" cy="150" rx="122" ry="24" fill="#CFD8DC"/>
  <path d="M134 150 L142 268 Q144 320 196 322 L316 322 Q368 320 370 268 L378 150 Z" fill="#ECEFF3"/>
  ${rrect(84, 168, 44, 18, 9, '#B0BEC5')}
  ${rrect(384, 168, 44, 18, 9, '#B0BEC5')}
  ${limb('M136 176 L92 177', '#B0BEC5', 0.1)}
  ${hl(170, 200, 20, 46, 8, 0.4)}`),

  /** 水壶：烧水壶 */
  kettle: svg(`
  ${steam(320, 140, 0.7)}
  ${dot(256, 132, 16, '#90A4AE')}
  ${rrect(238, 120, 36, 18, 9, '#78909C')}
  <path d="M156 196 Q256 148 356 196 L340 330 Q256 368 172 330 Z" fill="#E86A5C"/>
  ${limb('M352 200 L416 172', '#C9503F', 16)}
  ${limb('M408 186 Q438 176 430 208', '#C9503F', 12)}
  <path d="M186 216 Q256 170 326 216" stroke="#C9503F" stroke-width="20" fill="none" stroke-linecap="round"/>
  ${hl(196, 250, 22, 40, 10, 0.35)}`),

  /** 锅铲：带孔铲面 + 木柄 */
  spatula: svg(`
  ${rrect(236, 250, 40, 190, 18, '#A8721F')}
  ${dot(256, 424, 9, '#8B5A2B')}
  <path d="M196 120 L316 120 Q330 120 330 136 L330 224 Q330 258 296 258 L216 258 Q182 258 182 224 L182 136 Q182 120 196 120 Z" fill="#B0BEC5"/>
  ${rrect(214, 142, 24, 84, 12, '#90A4AE')}
  ${rrect(244, 142, 24, 84, 12, '#90A4AE')}
  ${rrect(274, 142, 24, 84, 12, '#90A4AE')}
  ${hl(200, 132, 16, 10, -8, 0.5)}`),

  /** 托盘：双耳托盘 */
  tray: svg(`
  <ellipse cx="256" cy="290" rx="170" ry="90" fill="#C8862A"/>
  <ellipse cx="256" cy="278" rx="170" ry="86" fill="#D99A4E"/>
  <ellipse cx="256" cy="278" rx="132" ry="62" fill="#C8862A"/>
  ${rrect(66, 258, 44, 22, 11, '#A8721F')}
  ${rrect(402, 258, 44, 22, 11, '#A8721F')}
  ${hl(170, 244, 40, 14, -12, 0.35)}`),

  /** 滤网：长柄漏勺 */
  strainer: svg(`
  ${limb('M330 132 L434 96', '#A8721F', 18)}
  <path d="M130 220 Q130 330 240 330 Q350 330 350 220 L348 196 Q240 158 132 196 Z" fill="#B0BEC5"/>
  <ellipse cx="240" cy="198" rx="109" ry="26" fill="#CFD8DC"/>
  ${(() => {
    let s = ''
    for (let i = 0; i < 4; i++) s += limb(`M${158 + i * 44} 216 L${158 + i * 44} 316`, '#90A4AE', 5)
    for (let i = 0; i < 2; i++) s += limb(`M144 ${240 + i * 44} Q240 ${270 + i * 30} 336 ${240 + i * 44}`, '#90A4AE', 5)
    return s
  })()}
  ${dot(430, 96, 13, '#8B5A2B')}`),

  /** 餐巾：折叠餐巾 + 缝线 */
  napkin: svg(`
  <path d="M116 180 L396 180 L396 350 L116 350 Z" fill="#FAFAFA" stroke="#E3E7EC" stroke-width="5"/>
  <path d="M116 180 L186 130 L466 130 L396 180 Z" fill="#ECEFF3" stroke="#D8DEE4" stroke-width="5"/>
  <path d="M396 180 L466 130 L466 300 L396 350 Z" fill="#E3E7EC" stroke="#D8DEE4" stroke-width="5"/>
  ${limb('M140 210 L372 210', '#E86A5C', 5, 0.7)}
  ${limb('M140 240 L372 240', '#E86A5C', 5, 0.7)}
  ${hl(150, 156, 30, 8, -26, 0.5)}`),

  /** 吸管：可弯吸管 */
  straw: svg(`
  ${rrect(226, 130, 34, 160, 16, '#E86A5C')}
  <g transform="rotate(38 243 300)">${rrect(226, 288, 34, 130, 16, '#E86A5C')}</g>
  ${rrect(218, 268, 50, 36, 12, '#C9503F')}
  ${(() => {
    let s = ''
    for (let i = 0; i < 4; i++) s += limb(`M226 ${152 + i * 30} L260 ${152 + i * 30}`, '#FFFFFF', 6, 0.6)
    return s
  })()}
  ${hl(234, 150, 8, 40, 2, 0.5)}`),

  /** 锅盖：玻璃锅盖 */
  lid: svg(`
  <path d="M140 290 Q256 170 372 290 Z" fill="#BEE3F5" stroke="#8FC3E0" stroke-width="7"/>
  <ellipse cx="256" cy="292" rx="118" ry="22" fill="#8FC3E0"/>
  ${rrect(240, 148, 32, 22, 8, '#78909C')}
  ${dot(256, 142, 17, '#90A4AE')}
  ${hl(196, 232, 22, 12, -28, 0.55)}`),

  /** 橱柜：双门吊柜 */
  cupboard: svg(`
  ${rrect(106, 150, 300, 210, 16, '#C8862A')}
  ${rrect(120, 164, 130, 182, 10, '#D99A4E')}
  ${rrect(262, 164, 130, 182, 10, '#D99A4E')}
  ${dot(234, 256, 11, '#8B5A2B')}${dot(278, 256, 11, '#8B5A2B')}
  ${hl(146, 186, 26, 10, -6, 0.35)}
  ${rrect(96, 356, 320, 18, 9, '#8B5A2B')}`),

  /** 抽屉：拉开的一格抽屉 */
  drawer: svg(`
  ${rrect(126, 96, 260, 130, 14, '#C8862A')}
  ${rrect(146, 116, 220, 90, 10, '#D99A4E')}
  ${rrect(216, 150, 80, 22, 11, '#8B5A2B')}
  <path d="M126 236 L386 236 L406 262 L406 380 L106 380 L106 262 Z" fill="#B0BEC5"/>
  ${rrect(126, 236, 260, 26, 8, '#90A4AE')}
  ${rrect(146, 286, 220, 70, 10, '#78909C')}
  ${rrect(226, 300, 60, 20, 10, '#546E7A')}
  ${hl(160, 130, 30, 10, -6, 0.35)}`),

  /** 茶杯：带碟茶杯 + 热气 */
  teacup: svg(`
  ${steam(232, 170, 0.8)}${steam(288, 170, 0.8)}
  <path d="M156 240 L356 240 L344 330 Q340 366 300 366 L212 366 Q172 366 168 330 Z" fill="#ECEFF3"/>
  ${limb('M356 254 Q410 254 410 300 Q410 340 352 332', '#ECEFF3', 20)}
  <ellipse cx="256" cy="240" rx="100" ry="20" fill="#C8862A"/>
  <ellipse cx="256" cy="238" rx="84" ry="15" fill="#A8721F"/>
  <ellipse cx="256" cy="392" rx="140" ry="26" fill="#E86A5C"/>
  <ellipse cx="256" cy="386" rx="140" ry="24" fill="#F06C9C"/>
  ${hl(190, 280, 14, 34, 8, 0.5)}`),

  /** 橡皮：双色橡皮 + 纸套 */
  eraser: svg(`
  <g transform="rotate(-16 256 280)">
    ${rrect(146, 220, 220, 120, 16, '#F8A5C2')}
    ${rrect(146, 220, 220, 44, 16, '#F06C9C')}
    ${rrect(216, 210, 80, 140, 10, '#ECEFF3')}
    ${limb('M216 224 L296 224', '#C7CED6', 5)}
    ${limb('M216 336 L296 336', '#C7CED6', 5)}
  </g>
  ${dot(340, 380, 7, '#F06C9C')}${dot(362, 392, 5, '#F8A5C2')}${dot(322, 396, 4, '#F8A5C2')}`),

  /** 胶水：白瓶橙盖胶水 */
  glue: svg(`
  <path d="M236 96 L276 96 L284 150 L228 150 Z" fill="#F5B841"/>
  ${rrect(244, 76, 24, 24, 8, '#E0A32E')}
  <path d="M196 150 L316 150 L330 380 Q256 406 182 380 Z" fill="#FAFAFA" stroke="#E3E7EC" stroke-width="5"/>
  ${rrect(210, 240, 92, 120, 12, '#BEE3F5')}
  <path d="M256 262 Q276 292 268 310 Q256 326 244 310 Q236 292 256 262 Z" fill="#FFFFFF"/>
  ${dot(256, 300, 9, '#5CC0F0')}
  ${hl(214, 190, 12, 44, -4, 0.5)}`),

  /** 粉笔：三支彩色粉笔 */
  chalk: svg(`
  <g transform="rotate(-24 200 300)">${rrect(140, 272, 130, 44, 20, '#FAFAFA', 'stroke="#E3E7EC" stroke-width="4"')}</g>
  <g transform="rotate(-24 256 320)">${rrect(210, 300, 130, 44, 20, '#F8A5C2', 'stroke="#F0A6C0" stroke-width="4"')}</g>
  <g transform="rotate(-24 310 340)">${rrect(280, 322, 130, 44, 20, '#8BC34A', 'stroke="#7CB342" stroke-width="4"')}</g>
  ${limb('M120 420 L200 420', '#E3E7EC', 6)}
  ${limb('M226 430 L280 430', '#E3E7EC', 5, 0.7)}`),

  /** 黑板：木框黑板 + 粉笔字 + 粉笔槽 */
  blackboard: svg(`
  ${rrect(86, 120, 340, 240, 14, '#A8721F')}
  ${rrect(106, 140, 300, 200, 8, '#2E6B4F')}
  ${limb('M136 200 Q156 176 176 200', '#FAFAFA', 6)}
  ${limb('M196 200 L244 200', '#FAFAFA', 6)}
  ${limb('M264 200 L308 178', '#FAFAFA', 6)}
  ${limb('M136 260 L308 260', '#FAFAFA', 6, 0.8)}
  ${limb('M136 296 L262 296', '#FAFAFA', 6, 0.6)}
  ${rrect(110, 342, 292, 22, 10, '#C8862A')}
  ${rrect(150, 330, 70, 14, 7, '#F8A5C2')}
  ${rrect(300, 330, 70, 14, 7, '#FAFAFA')}
  ${hl(120, 152, 30, 10, -8, 0.2)}`),

  /** 课桌：学习桌 + 书本 */
  desk: svg(`
  ${rrect(120, 210, 272, 34, 10, '#D99A4E')}
  ${rrect(120, 240, 272, 16, 6, '#C8862A')}
  ${limb('M142 256 L142 424', '#8B5A2B', 16)}
  ${limb('M370 256 L370 424', '#8B5A2B', 16)}
  ${limb('M142 400 L370 400', '#8B5A2B', 0.1)}
  ${rrect(196, 150, 120, 26, 6, '#4A90D9')}
  ${rrect(204, 130, 104, 24, 6, '#5CC0F0')}
  ${limb('M196 158 L316 158', '#FFFFFF', 4, 0.6)}`),

  /** 记号笔：粗头马克笔 */
  marker: svg(`
  <g transform="rotate(-30 256 270)">
    ${rrect(226, 130, 60, 60, 10, '#4A342E')}
    <path d="M240 100 L272 100 L266 132 L246 132 Z" fill="#37474F"/>
    ${rrect(216, 190, 80, 230, 20, '#E86A5C')}
    ${rrect(216, 190, 80, 36, 20, '#C9503F')}
    ${limb('M240 230 L240 390', '#FFFFFF', 6, 0.5)}
  </g>
  ${dot(352, 372, 10, '#C9503F', 'opacity="0.5"')}`),

  /** 教室：黑板 + 讲台 + 课桌 */
  classroom: svg(`
  ${rrect(96, 96, 320, 140, 12, '#A8721F')}
  ${rrect(112, 112, 288, 108, 8, '#2E6B4F')}
  ${limb('M136 150 L200 150', '#FAFAFA', 6)}
  ${limb('M136 186 L262 186', '#FAFAFA', 6, 0.7)}
  ${rrect(196, 262, 120, 18, 8, '#D99A4E')}
  ${rrect(210, 280, 92, 60, 8, '#C8862A')}
  ${rrect(296, 320, 110, 14, 6, '#D99A4E')}
  ${limb('M310 334 L310 400', '#8B5A2B', 10)}
  ${limb('M392 334 L392 400', '#8B5A2B', 10)}
  ${dot(400, 92, 22, '#F5B841')}
  ${hl(130, 130, 30, 10, -6, 0.2)}`),

  /** 作业：写完的作业纸 + 铅笔 */
  homework: svg(`
  <path d="M150 116 L330 116 L366 152 L366 400 L150 400 Z" fill="#FAFAFA" stroke="#E3E7EC" stroke-width="5"/>
  <path d="M330 116 L330 152 L366 152 Z" fill="#E3E7EC"/>
  ${limb('M176 200 L340 200', '#C7CED6', 7)}
  ${limb('M176 240 L340 240', '#C7CED6', 7)}
  ${limb('M176 280 L300 280', '#C7CED6', 7)}
  ${limb('M176 320 L340 320', '#C7CED6', 7)}
  ${dot(196, 160, 11, '#E86A5C')}${dot(224, 160, 11, '#5CB85C')}
  <g transform="rotate(36 300 330)">
    ${rrect(282, 250, 36, 170, 14, '#F5B841')}
    <path d="M288 236 L312 236 L308 254 L292 254 Z" fill="#4A342E"/>
    ${rrect(282, 250, 36, 26, 12, '#E86A5C')}
  </g>`),
}

export const categories = {
  fridge: 'kitchen', oven: 'kitchen', pot: 'kitchen', kettle: 'kitchen', spatula: 'kitchen',
  tray: 'kitchen', strainer: 'kitchen', napkin: 'kitchen', straw: 'kitchen', lid: 'kitchen',
  cupboard: 'kitchen', drawer: 'kitchen', teacup: 'kitchen',
}
export const category = 'school'

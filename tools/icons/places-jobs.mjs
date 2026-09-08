/**
 * 批次10：场所 10（places）+ 职业 16（jobs）。
 * 约束：
 * - playground 画「秋千架+滑梯组合场景」，与 toys 分类的单件 swing/slide 图标区分（slide 词已占 1f6dd）；
 * - lighthouse/harbor 与 boat/ship emoji 区分（塔身条纹/码头双船）；
 * - 职业全部走「正面小人+标志性道具」模板，道具互斥（护士帽红十字/牙医口罩+牙齿/船长帽锚/指挥棒+音符…）。
 */
import { svg, hl, limb, rrect, dot } from './_shared.mjs'

const ell = (cx, cy, rx, ry, fill, extra = '') =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}"${extra ? ` ${extra}` : ''}/>`
const SKIN = '#FFD9B3'
const INK = '#4A342E'

/** 职业小人：正面站姿，cap=帽子类型，shirt=上衣色，armsL/armsR=手臂姿态 */
function worker({ cap = 'none', hair = INK, shirt = '#4A90D9', pants = '#5B6B7E', armL = 'down', armR = 'down' } = {}) {
  const arm = (side, pose) => {
    const x = side === 'L' ? 222 : 290
    const dx = side === 'L' ? -1 : 1
    if (pose === 'up') return limb(`M${x} 224 L${x + dx * 44} 168`, shirt, 15) + dot(x + dx * 48, 162, 9, SKIN)
    if (pose === 'out') return limb(`M${x} 224 L${x + dx * 40} 250`, shirt, 15) + dot(x + dx * 46, 252, 9, SKIN)
    return limb(`M${x} 224 L${x + dx * 12} 292`, shirt, 15) + dot(x + dx * 13, 298, 9, SKIN)
  }
  let headwear = ''
  if (cap === 'cap') headwear = `<path d="M212 142 A44 44 0 0 1 300 142 L300 138 L212 138 Z" fill="#3E7FBF"/>` + rrect(296, 132, 34, 12, 6, '#3E7FBF')
  if (cap === 'helmet') headwear = `<path d="M208 140 A48 48 0 0 1 304 140 Z" fill="#F5C542"/>` + rrect(198, 136, 116, 14, 7, '#F5C542')
  if (cap === 'brim') headwear = `<path d="M216 132 A40 40 0 0 1 296 132 Z" fill="#8A6242"/>` + ell(256, 136, 62, 12, '#8A6242')
  if (cap === 'nurse') headwear = `<path d="M222 116 L290 116 L282 92 L230 92 Z" fill="#FFFFFF" stroke="#D8D8D8" stroke-width="2"/>` + rrect(250, 96, 12, 4, 2, '#D94A3D') + rrect(254, 92, 4, 12, 2, '#D94A3D')
  if (cap === 'captain') headwear = `<path d="M214 130 A42 42 0 0 1 298 130 Z" fill="#FFFFFF"/>` + rrect(208, 126, 96, 14, 7, '#2E3A42') + ell(256, 120, 10, 7, '#F5C542')
  if (cap === 'beret') headwear = `<path d="M210 130 A46 34 0 0 1 302 126 L302 134 L210 138 Z" fill="#D94A3D"/>` + dot(296, 122, 6, '#D94A3D')
  const hairCap = cap === 'none' ? `<path d="M212 148 A44 44 0 0 1 300 148 L300 140 Q256 112 212 140 Z" fill="${hair}"/>` : ''
  return `
  ${limb('M240 316 L236 396', pants, 16)}${limb('M272 316 L276 396', pants, 16)}
  ${ell(232, 402, 16, 9, '#3A4550')}${ell(280, 402, 16, 9, '#3A4550')}
  ${rrect(216, 200, 80, 118, 26, shirt)}
  ${arm('L', armL)}${arm('R', armR)}
  ${rrect(244, 178, 24, 28, 10, SKIN)}
  ${dot(256, 146, 44, SKIN)}
  ${hairCap}${headwear}
  ${dot(240, 146, 5, INK)}${dot(272, 146, 5, INK)}
  ${limb('M242 164 Q256 172 270 164', INK, 4)}`
}

export const categories = {
  airport: 'places', park: 'places', zoo: 'places', cinema: 'places', museum: 'places',
  library: 'places', playground: 'places', temple: 'places', lighthouse: 'places', harbor: 'places',
  soldier: 'jobs', nurse: 'jobs', dentist: 'jobs', waiter: 'jobs', librarian: 'jobs',
  engineer: 'jobs', driver: 'jobs', postman: 'jobs', conductor: 'jobs', vet: 'jobs',
  captain: 'jobs', coach: 'jobs', reporter: 'jobs', tailor: 'jobs', dancer: 'jobs', fisherman: 'jobs',
}

export const icons = {
  /** 机场：塔台+航站楼窗带+右上起飞的小飞机 */
  airport: svg(`
  ${rrect(60, 300, 300, 100, 16, '#C4AE9F')}
  ${rrect(76, 322, 268, 34, 8, '#7FC4EA')}
  ${limb('M120 322 L120 356', '#C4AE9F', 6)}${limb('M180 322 L180 356', '#C4AE9F', 6)}${limb('M240 322 L240 356', '#C4AE9F', 6)}${limb('M300 322 L300 356', '#C4AE9F', 6)}
  ${rrect(330, 200, 56, 200, 10, '#9FB4C4')}
  ${rrect(316, 176, 84, 44, 12, '#3E7FBF')}
  ${rrect(326, 186, 64, 24, 8, '#BFE0F5')}
  ${limb('M358 176 L358 148', '#9FB4C4', 6)}
  <path d="M392 96 L452 108 L392 120 L404 108 Z" fill="#4A5A64"/>
  ${rrect(352, 100, 52, 14, 7, '#4A5A64')}
  <path d="M372 92 L384 78 L396 92 Z" fill="#4A5A64"/>
  ${limb('M60 428 L440 428', '#8A766A', 8)}
  ${hl(200, 340, 20, 8, 0, 0.3)}`),

  /** 公园：两棵树+长椅+草地小径 */
  park: svg(`
  ${ell(256, 448, 200, 26, '#8FCE63')}
  ${rrect(96, 240, 22, 160, 8, '#8A6242')}
  ${dot(107, 196, 66, '#63B068')}${dot(70, 232, 40, '#63B068')}${dot(146, 232, 40, '#63B068')}
  ${rrect(370, 268, 20, 132, 8, '#8A6242')}
  ${dot(380, 232, 52, '#4C9450')}${dot(348, 262, 32, '#4C9450')}${dot(414, 262, 32, '#4C9450')}
  ${rrect(176, 300, 140, 16, 8, '#A08B7E')}
  ${rrect(176, 330, 140, 12, 6, '#A08B7E')}
  ${rrect(180, 300, 10, 78, 5, '#6E584A')}${rrect(302, 300, 10, 78, 5, '#6E584A')}
  ${limb('M176 312 L176 288', '#6E584A', 8)}${limb('M316 312 L316 288', '#6E584A', 8)}
  ${dot(210, 420, 5, '#F5C542')}${dot(236, 430, 5, '#F06C9C')}${dot(262, 420, 5, '#F5C542')}
  ${hl(90, 176, 16, 10, -20, 0.3)}`),

  /** 动物园：木拱门+长颈鹿探头 */
  zoo: svg(`
  ${rrect(70, 160, 34, 270, 10, '#8A6242')}
  ${rrect(408, 160, 34, 270, 10, '#8A6242')}
  <path d="M70 200 C70 110 442 110 442 200 L442 160 C442 78 70 78 70 160 Z" fill="#A08B7E"/>
  ${rrect(150, 132, 212, 56, 14, '#F2DFAE')}
  ${limb('M60 430 L452 430', '#8FCE63', 14)}
  ${limb('M330 380 C330 320 336 280 356 250', '#F5C542', 34)}
  ${dot(368, 232, 30, '#F5C542')}
  ${ell(398, 240, 16, 10, '#F5C542', 'transform="rotate(20 398 240)"')}
  ${dot(352, 226, 5, INK)}
  ${dot(344, 204, 8, '#E8B93A')}${dot(372, 200, 8, '#E8B93A')}
  ${limb('M352 202 L348 184', '#E8B93A', 6)}${limb('M374 200 L378 182', '#E8B93A', 6)}
  ${dot(348, 180, 5, '#E8B93A')}${dot(378, 178, 5, '#E8B93A')}
  ${dot(330, 300, 9, '#E8B93A')}${dot(340, 340, 9, '#E8B93A')}`),

  /** 电影院：红幕布+白银幕+底部胶片格 */
  cinema: svg(`
  ${rrect(60, 90, 392, 40, 12, '#8A6242')}
  <path d="M70 110 C110 240 90 330 60 400 L150 400 C130 320 140 200 120 110 Z" fill="#C94A4A"/>
  <path d="M442 110 C402 240 422 330 452 400 L362 400 C382 320 372 200 392 110 Z" fill="#C94A4A"/>
  <path d="M70 110 C100 150 100 200 84 250 C70 200 66 150 60 110 Z" fill="#A83A3A" opacity="0.5"/>
  ${rrect(140, 130, 232, 240, 10, '#F5F0E8')}
  ${rrect(156, 146, 200, 208, 6, '#FFFFFF')}
  <path d="M210 200 L290 240 L210 280 Z" fill="#F2A93B"/>
  ${rrect(120, 396, 272, 40, 8, '#37444C')}
  ${rrect(136, 404, 30, 24, 4, '#F5F0E8')}${rrect(186, 404, 30, 24, 4, '#F5F0E8')}${rrect(236, 404, 30, 24, 4, '#F5F0E8')}${rrect(286, 404, 30, 24, 4, '#F5F0E8')}${rrect(336, 404, 30, 24, 4, '#F5F0E8')}`),

  /** 博物馆：三角山花+四根白柱+台阶 */
  museum: svg(`
  ${rrect(70, 400, 372, 26, 8, '#C4AE9F')}
  ${rrect(90, 374, 332, 26, 8, '#D8C8BC')}
  <path d="M256 96 L436 190 L76 190 Z" fill="#9FB4C4"/>
  ${rrect(96, 190, 320, 26, 6, '#B8C8D4')}
  ${dot(256, 152, 22, '#F5F0E8')}
  ${dot(256, 152, 12, '#F2A93B')}
  ${rrect(116, 216, 40, 158, 6, '#F5F0E8')}
  ${rrect(196, 216, 40, 158, 6, '#F5F0E8')}
  ${rrect(276, 216, 40, 158, 6, '#F5F0E8')}
  ${rrect(356, 216, 40, 158, 6, '#F5F0E8')}
  ${limb('M116 240 L156 240', '#D8D8D8', 5)}${limb('M196 240 L236 240', '#D8D8D8', 5)}${limb('M276 240 L316 240', '#D8D8D8', 5)}${limb('M356 240 L396 240', '#D8D8D8', 5)}
  ${hl(140, 300, 8, 40, 0, 0.4)}`),

  /** 图书馆：木书架+两排彩色书 */
  library: svg(`
  ${rrect(80, 100, 352, 320, 16, '#8A6242')}
  ${rrect(98, 118, 316, 130, 8, '#F5E6D3')}
  ${rrect(98, 272, 316, 130, 8, '#F5E6D3')}
  ${rrect(110, 150, 26, 98, 4, '#D94A3D')}
  ${rrect(142, 138, 22, 110, 4, '#3E7FBF')}
  ${rrect(170, 156, 26, 92, 4, '#63B068')}
  <path d="M204 160 L228 148 L236 246 L212 250 Z" fill="#F2A93B"/>
  ${rrect(246, 142, 24, 106, 4, '#9B6BD9')}
  ${rrect(276, 158, 26, 90, 4, '#E8834A')}
  <path d="M310 152 L334 160 L326 248 L302 244 Z" fill='#3E9BD6'/>
  ${rrect(344, 140, 22, 108, 4, '#D94A3D')}
  ${rrect(372, 154, 26, 94, 4, '#63B068')}
  ${rrect(112, 300, 24, 102, 4, '#3E7FBF')}
  ${rrect(142, 312, 26, 90, 4, '#F2A93B')}
  ${rrect(174, 296, 22, 106, 4, '#D94A3D')}
  ${rrect(202, 316, 26, 86, 4, '#9B6BD9')}
  ${rrect(234, 302, 24, 100, 4, '#63B068')}
  ${rrect(264, 314, 22, 88, 4, '#E8834A')}
  ${rrect(292, 298, 26, 104, 4, '#3E9BD6')}
  ${rrect(324, 310, 24, 92, 4, '#F2A93B')}
  <path d="M356 300 L404 296 L404 396 L356 400 Z" fill="#C94A4A"/>
  ${limb('M380 306 L380 390', '#F5F0E8', 4)}`),

  /** 游乐场：秋千架+滑梯组合场景（区别于单件 swing/slide 图标） */
  playground: svg(`
  ${limb('M60 430 L452 430', '#8FCE63', 14)}
  ${limb('M120 160 L80 420', '#D94A3D', 12)}${limb('M120 160 L160 420', '#D94A3D', 12)}
  ${limb('M280 160 L240 420', '#D94A3D', 12)}${limb('M280 160 L320 420', '#D94A3D', 12)}
  ${rrect(100, 148, 200, 16, 8, '#D94A3D')}
  ${limb('M168 160 L168 260', '#5A4632', 5)}${limb('M212 160 L212 260', '#5A4632', 5)}
  ${rrect(158, 260, 64, 14, 6, '#F2A93B')}
  <path d="M330 210 C400 250 412 330 366 410 L326 410 C368 330 360 260 306 226 Z" fill="#3E9BD6"/>
  ${rrect(296, 192, 70, 26, 12, '#3E9BD6')}
  ${limb('M306 218 L306 410', '#9FB4C4', 9)}
  ${limb('M306 250 L280 250', '#9FB4C4', 6)}${limb('M306 290 L280 290', '#9FB4C4', 6)}${limb('M306 330 L280 330', '#9FB4C4', 6)}${limb('M306 370 L280 370', '#9FB4C4', 6)}
  ${dot(190, 236, 12, SKIN)}
  ${rrect(178, 246, 24, 26, 8, '#63B068')}
  ${limb('M168 252 L160 262', '#63B068', 6)}${limb('M212 252 L220 262', '#63B068', 6)}`),

  /** 寺庙：双层飞檐宝塔+红柱+门 */
  temple: svg(`
  ${rrect(90, 400, 332, 26, 8, '#C4AE9F')}
  ${rrect(130, 260, 252, 140, 8, '#E8E0D8')}
  ${rrect(150, 260, 26, 140, 6, '#C94A4A')}
  ${rrect(336, 260, 26, 140, 6, '#C94A4A')}
  ${rrect(226, 316, 60, 84, 6, '#8A6242')}
  ${dot(256, 352, 7, '#F5C542')}
  <path d="M256 150 L388 236 C360 246 300 250 256 250 C212 250 152 246 124 236 Z" fill="#4A5A64"/>
  <path d="M124 236 C118 226 116 218 118 210 L136 228 Z" fill="#4A5A64"/>
  <path d="M388 236 C394 226 396 218 394 210 L376 228 Z" fill="#4A5A64"/>
  ${rrect(196, 250, 120, 12, 6, '#C94A4A')}
  <path d="M256 82 L344 148 C320 156 288 158 256 158 C224 158 192 156 168 148 Z" fill="#4A5A64"/>
  <path d="M168 148 C162 140 160 134 162 128 L178 142 Z" fill="#4A5A64"/>
  <path d="M344 148 C350 140 352 134 350 128 L334 142 Z" fill="#4A5A64"/>
  ${dot(256, 74, 9, '#F5C542')}
  ${rrect(236, 158, 40, 30, 6, '#C94A4A')}
  ${hl(170, 200, 16, 8, -20, 0.25)}`),

  /** 灯塔：红白条纹塔+顶部灯室+两道光束+礁石 */
  lighthouse: svg(`
  ${ell(256, 440, 190, 26, '#58ABDF')}
  <path d="M196 420 L216 160 L296 160 L316 420 Z" fill="#F5F0E8"/>
  <path d="M203 340 L309 340 L313 396 L199 396 Z" fill="#D94A3D"/>
  <path d="M209 232 L303 232 L307 288 L205 288 Z" fill="#D94A3D"/>
  ${rrect(206, 136, 100, 30, 8, '#37444C')}
  ${rrect(222, 96, 68, 44, 8, '#F5C542')}
  ${limb('M222 118 L290 118', '#37444C', 5)}
  <path d="M256 60 L232 96 L280 96 Z" fill="#D94A3D"/>
  ${dot(256, 54, 7, '#F5C542')}
  ${limb('M212 108 L120 84', '#F5C542', 10, 0.7)}
  ${limb('M300 108 L392 84', '#F5C542', 10, 0.7)}
  ${ell(120, 396, 46, 20, '#8A766A')}
  ${ell(180, 408, 30, 14, '#6E584A')}
  ${hl(232, 300, 8, 40, 0, 0.35)}`),

  /** 海港：木栈桥+帆船+小渔船+水面 */
  harbor: svg(`
  ${ell(256, 440, 210, 30, '#58ABDF')}
  ${limb('M60 416 Q100 406 140 416', '#BFE0F5', 6)}
  ${limb('M330 424 Q370 414 410 424', '#BFE0F5', 6)}
  ${rrect(60, 380, 180, 18, 6, '#8A6242')}
  ${rrect(76, 398, 14, 44, 4, '#6E584A')}${rrect(140, 398, 14, 44, 4, '#6E584A')}${rrect(204, 398, 14, 44, 4, '#6E584A')}
  ${limb('M300 380 L300 150', '#5A4632', 10)}
  <path d="M306 160 L396 340 L306 340 Z" fill="#F5F0E8"/>
  <path d="M306 160 L396 340 L352 340 L306 200 Z" fill="#E8D5B8" opacity="0.6"/>
  <path d="M294 176 L214 330 L294 330 Z" fill="#D94A3D"/>
  <path d="M252 340 L356 340 L336 384 L272 384 Z" fill="#4A5A64"/>
  ${limb('M300 150 L322 138 L300 132', '#37444C', 5)}
  ${rrect(108, 330, 96, 34, 10, '#3E7FBF')}
  <path d="M120 330 L192 330 L176 300 L136 300 Z" fill="#F5F0E8"/>
  ${dot(148, 316, 6, '#7FC4EA')}${dot(168, 316, 6, '#7FC4EA')}
  ${limb('M156 300 L156 258', '#5A4632', 6)}
  <path d="M160 260 L196 292 L160 292 Z" fill="#F2A93B"/>`),

  /** 士兵：绿军帽+军装+抱拳站姿 */
  soldier: svg(`
  ${worker({ cap: 'none', shirt: '#4C7A3A', pants: '#3A5C2C' })}
  <path d="M210 138 A46 40 0 0 1 302 138 L302 146 L210 146 Z" fill="#3A5C2C"/>
  ${rrect(206, 140, 100, 12, 6, '#2E4A22')}
  ${dot(256, 122, 8, '#F5C542')}
  ${rrect(220, 214, 72, 14, 6, '#2E4A22')}
  ${dot(256, 221, 5, '#F5C542')}`),

  /** 护士：白帽红十字+浅蓝护士服+病历板 */
  nurse: svg(`
  ${worker({ cap: 'nurse', hair: '#6B4420', shirt: '#9FCFF0', pants: '#7FB3D8', armL: 'down', armR: 'out' })}
  ${rrect(296, 240, 54, 70, 8, '#F5F0E8', 'transform="rotate(8 323 275)"')}
  ${rrect(304, 252, 38, 6, 3, '#9FB4C4', 'transform="rotate(8 323 255)"')}
  ${rrect(304, 266, 38, 6, 3, '#9FB4C4', 'transform="rotate(8 323 269)"')}
  ${rrect(304, 280, 24, 6, 3, '#9FB4C4', 'transform="rotate(8 316 283)"')}
  ${rrect(228, 240, 56, 8, 4, '#D94A3D')}
  ${rrect(252, 228, 8, 32, 4, '#D94A3D')}`),

  /** 牙医：白大褂+蓝口罩+手持大牙齿 */
  dentist: svg(`
  ${worker({ shirt: '#F5F0E8', pants: '#9FB4C4', armL: 'down', armR: 'up' })}
  <path d="M218 152 Q216 178 256 180 Q296 178 294 152 L294 168 Q294 186 256 188 Q218 186 218 168 Z" fill="#7FC4EA"/>
  ${limb('M222 158 L290 158', '#5A9BC4', 4)}
  ${dot(240, 146, 5, INK)}${dot(272, 146, 5, INK)}
  ${rrect(322, 110, 76, 82, 24, '#BFE0F5', 'stroke="#5A9BC4" stroke-width="3"')}
  <path d="M336 190 L346 224 L358 192 Z" fill="#BFE0F5" stroke="#5A9BC4" stroke-width="3"/>
  <path d="M364 192 L376 224 L386 190 Z" fill="#BFE0F5" stroke="#5A9BC4" stroke-width="3"/>
  ${hl(342, 132, 12, 16, 0, 0.5)}
  ${dot(372, 160, 10, '#D94A3D')}
  ${limb('M240 300 L240 340', '#5A4632', 5)}
  ${dot(240, 352, 12, '#9FB4C4', 'stroke="#37444C" stroke-width="3"')}`),

  /** 服务员：黑白礼服+托盘+咖啡杯 */
  waiter: svg(`
  ${worker({ shirt: '#37444C', pants: '#2E3A42', armL: 'down', armR: 'up' })}
  ${rrect(222, 214, 68, 60, 8, '#F5F0E8')}
  ${limb('M256 214 L256 274', '#D8D8D8', 4)}
  ${dot(256, 236, 5, '#37444C')}${dot(256, 256, 5, '#37444C')}
  ${ell(318, 158, 56, 10, '#9FB4C4')}
  ${rrect(296, 128, 36, 30, 6, '#F5F0E8')}
  <path d="M332 134 C346 134 346 152 332 152" fill="none" stroke="#F5F0E8" stroke-width="7"/>
  ${ell(314, 128, 14, 5, '#8A6242')}
  ${limb('M306 122 Q312 112 306 104', '#C9B8A8', 3, 0.8)}
  ${limb('M320 122 Q326 112 320 104', '#C9B8A8', 3, 0.8)}`),

  /** 图书管理员：圆框眼镜+抱一摞书 */
  librarian: svg(`
  ${worker({ shirt: '#9B6BD9', pants: '#6E4A9C', armL: 'out', armR: 'out' })}
  ${dot(240, 146, 13, 'none', 'stroke="#37444C" stroke-width="4"')}
  ${dot(272, 146, 13, 'none', 'stroke="#37444C" stroke-width="4"')}
  ${limb('M253 146 L259 146', '#37444C', 4)}
  ${rrect(212, 240, 88, 20, 4, '#D94A3D')}
  ${rrect(218, 220, 78, 20, 4, '#3E7FBF')}
  ${rrect(214, 200, 84, 20, 4, '#63B068')}
  ${limb('M220 210 L290 210', '#F5F0E8', 3)}
  ${dot(240, 146, 4, INK)}${dot(272, 146, 4, INK)}`),

  /** 工程师：黄安全帽+手持图纸筒 */
  engineer: svg(`
  ${worker({ cap: 'helmet', shirt: '#F2A93B', pants: '#5B6B7E', armL: 'down', armR: 'out' })}
  ${rrect(300, 236, 84, 22, 11, '#F5F0E8', 'transform="rotate(-14 342 247)"')}
  ${ell(384, 240, 8, 13, '#D8D8D8', 'transform="rotate(-14 384 240)"')}
  ${limb('M310 240 L370 226', '#3E7FBF', 4, 0.7)}
  ${rrect(224, 220, 64, 46, 6, '#9FB4C4')}
  ${limb('M232 232 L280 232', '#F5F0E8', 4)}
  ${limb('M232 246 L268 246', '#F5F0E8', 4)}
  ${limb('M232 258 L276 258', '#F5F0E8', 4)}`),

  /** 司机：鸭舌帽+双手握大方向盘 */
  driver: svg(`
  ${worker({ cap: 'cap', shirt: '#3E7FBF', pants: '#2E3A42', armL: 'out', armR: 'out' })}
  ${dot(256, 268, 58, 'none', 'stroke="#37444C" stroke-width="16"')}
  ${dot(256, 268, 14, '#37444C')}
  ${limb('M256 268 L256 226', '#37444C', 10)}
  ${limb('M256 268 L306 296', '#37444C', 10)}
  ${limb('M256 268 L206 296', '#37444C', 10)}
  ${dot(200, 252, 9, SKIN)}${dot(312, 252, 9, SKIN)}`),

  /** 邮递员：蓝帽+挎包+飘动信封 */
  postman: svg(`
  ${worker({ cap: 'cap', shirt: '#3E9BD6', pants: '#2E6FA8', armL: 'down', armR: 'up' })}
  ${limb('M226 216 L286 286', '#8A6242', 8)}
  ${rrect(268, 262, 62, 54, 10, '#A08B7E')}
  ${rrect(276, 272, 46, 12, 6, '#6E584A')}
  ${rrect(330, 120, 66, 44, 6, '#F5F0E8', 'stroke="#D8D8D8" stroke-width="2" transform="rotate(12 363 142)"')}
  <path d="M334 128 L363 150 L392 128" fill="none" stroke="#3E9BD6" stroke-width="4" transform="rotate(12 363 142)"/>
  ${dot(256, 122, 7, '#F5C542')}`),

  /** 指挥家：燕尾服+指挥棒+音符 */
  conductor: svg(`
  ${worker({ shirt: '#2E3A42', pants: '#1E2830', armL: 'down', armR: 'up' })}
  ${rrect(226, 214, 60, 16, 6, '#F5F0E8')}
  ${dot(256, 252, 5, '#F5F0E8')}${dot(256, 268, 5, '#F5F0E8')}
  ${limb('M302 168 L346 122', '#F5F0E8', 6)}
  ${dot(348, 120, 5, '#F5F0E8')}
  ${dot(120, 150, 10, '#5A7A9C')}${limb('M129 150 L129 108', '#5A7A9C', 5)}${limb('M129 108 Q148 114 150 130', '#5A7A9C', 5)}
  ${dot(84, 226, 8, '#5A7A9C')}${limb('M91 226 L91 192', '#5A7A9C', 4)}
  ${dot(388, 210, 8, '#5A7A9C')}${limb('M395 210 L395 176', '#5A7A9C', 4)}`),

  /** 兽医：绿刷手服+听诊器+大爪印 */
  vet: svg(`
  ${worker({ shirt: '#63B068', pants: '#3E8C4A', armL: 'down', armR: 'out' })}
  ${limb('M234 210 C226 246 236 268 256 270', '#37444C', 5)}
  ${limb('M278 210 C286 246 276 268 256 270', '#37444C', 5)}
  ${dot(256, 274, 8, '#37444C')}
  ${dot(340, 320, 20, '#F2A93B')}
  ${dot(312, 292, 10, '#F2A93B')}${dot(338, 282, 10, '#F2A93B')}${dot(366, 292, 10, '#F2A93B')}
  ${rrect(224, 240, 40, 14, 6, '#3E8C4A')}`),

  /** 船长：白帽蓝檐+深蓝制服+金色肩章 */
  captain: svg(`
  ${worker({ cap: 'captain', shirt: '#2E5A8C', pants: '#1E3A5C', armL: 'down', armR: 'down' })}
  ${rrect(218, 214, 26, 10, 4, '#F5C542')}${rrect(268, 214, 26, 10, 4, '#F5C542')}
  ${dot(256, 250, 11, 'none', 'stroke="#F5C542" stroke-width="5"')}
  ${limb('M256 239 L256 262', '#F5C542', 5)}
  ${limb('M246 256 L266 256', '#F5C542', 5)}
  ${dot(256, 120, 7, '#F5C542')}`),

  /** 教练：哨子+橙色背心+秒表 */
  coach: svg(`
  ${worker({ cap: 'cap', shirt: '#F28C28', pants: '#37444C', armL: 'down', armR: 'up' })}
  ${rrect(222, 214, 68, 96, 10, '#F5C542')}
  ${rrect(222, 214, 20, 96, 10, '#F28C28')}
  ${rrect(270, 214, 20, 96, 10, '#F28C28')}
  ${limb('M262 172 L286 196', '#37444C', 4)}
  ${dot(290, 200, 9, '#9FB4C4', 'stroke="#37444C" stroke-width="3"')}
  ${dot(330, 156, 16, '#F5F0E8', 'stroke="#37444C" stroke-width="4"')}
  ${limb('M330 144 L330 156 L340 160', '#D94A3D', 4)}
  ${rrect(324, 132, 12, 8, 3, '#37444C')}`),

  /** 记者：手持话筒+采访本+PRESS 牌 */
  reporter: svg(`
  ${worker({ shirt: '#E8C48A', pants: '#5B6B7E', armL: 'out', armR: 'up' })}
  ${rrect(300, 130, 22, 52, 10, '#37444C', 'transform="rotate(18 311 156)"')}
  ${dot(322, 126, 13, '#5A6470', 'transform="rotate(18 322 126)"')}
  ${rrect(180, 240, 48, 62, 6, '#F5F0E8')}
  ${limb('M188 254 L220 254', '#9FB4C4', 4)}
  ${limb('M188 268 L220 268', '#9FB4C4', 4)}
  ${limb('M188 282 L210 282', '#9FB4C4', 4)}
  ${rrect(222, 216, 68, 22, 6, '#F5C542')}
  ${limb('M236 227 L276 227', '#37444C', 5)}
  ${dot(204, 252, 9, SKIN)}`),

  /** 裁缝：颈挂软尺+大剪刀+布卷 */
  tailor: svg(`
  ${worker({ shirt: '#9B6BD9', pants: '#4A5A64', armL: 'out', armR: 'down' })}
  ${limb('M232 196 C226 226 230 246 240 258', '#F5C542', 7)}
  ${limb('M280 196 C286 226 282 246 272 258', '#F5C542', 7)}
  ${limb('M240 258 L240 286', '#F5C542', 7)}
  ${limb('M272 258 L272 286', '#F5C542', 7)}
  ${limb('M312 236 L360 288', '#9FB4C4', 9)}
  ${limb('M360 236 L312 288', '#9FB4C4', 9)}
  ${dot(336, 262, 8, '#D94A3D')}
  ${rrect(150, 300, 70, 30, 8, '#C94A4A')}
  ${ell(150, 315, 10, 15, '#A83A3A')}
  ${dot(196, 252, 9, SKIN)}`),

  /** 舞蹈家：粉色蓬蓬裙+双臂上举+立脚尖 */
  dancer: svg(`
  ${worker({ shirt: '#F06C9C', pants: '#FFD9B3', armL: 'up', armR: 'up' })}
  <path d="M212 300 C212 286 300 286 300 300 L318 336 C280 348 232 348 194 336 Z" fill="#F5A8C4"/>
  ${limb('M240 316 L236 396', '#FFD9B3', 14)}
  ${limb('M272 316 L276 396', '#FFD9B3', 14)}
  ${ell(234, 402, 14, 8, '#F06C9C')}${ell(278, 402, 14, 8, '#F06C9C')}
  <path d="M212 110 A44 44 0 0 1 300 110 L300 118 Q256 96 212 118 Z" fill="#6B4420"/>
  ${dot(256, 84, 14, '#6B4420')}
  ${dot(150, 200, 5, '#F5C542')}${dot(362, 240, 5, '#F5C542')}${dot(330, 140, 4, '#F5C542')}`),

  /** 渔夫：斗笠+鱼竿+钓线挂一条鱼+鱼篓 */
  fisherman: svg(`
  ${worker({ shirt: '#5A8CA8', pants: '#3E6E88', armL: 'down', armR: 'up' })}
  <path d="M206 138 A50 42 0 0 1 306 138 Z" fill="#C9A176"/>
  ${ell(256, 140, 66, 14, '#C9A176')}
  ${limb('M302 168 L400 78', '#8A6242', 8)}
  ${limb('M400 78 C404 120 396 160 380 190', '#F5F0E8', 3)}
  <path d="M356 196 C372 180 396 184 402 202 C396 220 372 224 356 208 Z" fill="#7FB3D8"/>
  <path d="M402 202 L420 190 L418 214 Z" fill="#5A8CA8"/>
  ${dot(368, 198, 3, INK)}
  ${rrect(150, 320, 64, 70, 10, '#A08B7E')}
  ${limb('M150 340 L214 340', '#6E584A', 5)}
  ${limb('M158 320 C170 306 194 306 206 320', '#6E584A', 5)}
  ${dot(316, 168, 9, SKIN)}`),
}

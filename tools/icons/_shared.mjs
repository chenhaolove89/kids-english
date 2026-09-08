/**
 * 图标库共享助手。设计语言与水果自绘卡一致（Noto 扁平风）：
 * 512×512 viewBox、透明底、平涂色块、白色高光椭圆、圆头线条。
 */

/** 包一层 SVG 根元素 */
export function svg(body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${body}
</svg>`
}

/** 白色高光椭圆（与水果卡同款高光语言） */
export function hl(cx, cy, rx, ry, rot = 0, op = 0.3) {
  const t = rot ? ` transform="rotate(${rot} ${cx} ${cy})"` : ''
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#FFFFFF" opacity="${op}"${t}/>`
}

/** 圆头折线（四肢/枝干/动感线） */
export function limb(d, color, w, op = 1) {
  return `<path d="${d}" stroke="${color}" stroke-width="${w}" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="${op}"/>`
}

/** 圆角矩形 */
export function rrect(x, y, w, h, r, fill, extra = '') {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"${extra ? ' ' + extra : ''}/>`
}

/** 圆 */
export function dot(cx, cy, r, fill, extra = '') {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"${extra ? ' ' + extra : ''}/>`
}

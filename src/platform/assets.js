/**
 * 资源地址统一出口。数据 JSON 里的图片/音频路径当前是本地 /static/... 绝对路径。
 * 将来小程序/CDN 阶段（主包 2MB 限制，49MB 静态资源必须远程化）只需在这里
 * 加远程前缀或条件编译，页面与数据文件零改动。
 */
let base = ''

export function setAssetBase(b) {
  base = b || ''
}

export function assetUrl(p) {
  if (!p) return p
  if (/^(https?:|data:|blob:)/.test(p)) return p
  return base + p
}

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

/**
 * 英语发音口音重写：/static/audio/x.mp3 → /static/audio-gb/x.mp3（两目录文件名一致）。
 * 只放行英文词/反馈音（字母开头、非 zh- 前缀、非 n数字、非四位码点）——语文与数学
 * 音频一律原样返回，即使调用方误传也不会读错科目。
 * 首字母必须兼容大写：Monday / China / CD 这类专有名词文件就是大写命名，
 * 只认小写会让 audio-gb 里现成的英式音轨永远取不到。
 */
export function withAccent(src, accent) {
  if (accent !== 'gb' || !src) return src
  if (!/^\/static\/audio\/(?!zh-)(?!n\d)[A-Za-z][A-Za-z0-9'_-]*\.mp3$/.test(src)) return src
  return src.replace('/static/audio/', '/static/audio-gb/')
}

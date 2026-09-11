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
 * 英语发音口音重写：/static/audio/x.mp3 → 对应口音镜像目录。
 * us=原样；gb=audio-gb（Edge 英式）；az=audio-azure（英音底 Azure 课堂音，语速更慢）。
 * 只放行英文词/反馈音（字母开头、非 zh- 前缀、非 n数字、非四位码点）——语文与数学
 * 音频一律原样返回，即使调用方误传也不会读错科目。
 * 首字母必须兼容大写：Monday / China / CD 这类专有名词文件就是大写命名，
 * 只认小写会让现成的英式/课堂音轨永远取不到。
 * 路径前缀兼容 ./：GitHub Pages 发布脚本会把 /static/ 改写成 ./static/（子路径部署），
 * 锚死 ^/static/ 会让线上口音切换静默失效回美音。
 */
export function withAccent(src, accent) {
  if ((!accent || accent === 'us') || !src) return src
  const dir = accent === 'gb' ? 'audio-gb' : accent === 'az' ? 'audio-azure' : null
  if (!dir) return src
  // 前缀兼容 ./：GitHub Pages 发布脚本会把 /static/ 改写成 ./static/（子路径部署），
  // 锚死 ^/static/ 会让线上口音切换静默失效回美音
  const m = /^(\.\/|\/)static\/audio\//.exec(src)
  if (!m) return src
  const name = src.slice(m[0].length)
  if (!/^(?!zh-)(?!n\d)[A-Za-z][A-Za-z0-9'_-]*\.mp3$/.test(name)) return src
  return `${m[1]}static/${dir}/${name}`
}

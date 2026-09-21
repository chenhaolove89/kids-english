/**
 * 资源地址统一出口。数据 JSON 里的图片/音频路径是本地 /static/... 绝对路径，
 * 发布脚本会把它们改写成 ./static/...（子路径部署）。
 *
 * 资源源由 asset-source.js 在启动时决定：服务器可达就设远程前缀，不可达就保持
 * 本地相对路径。base 为空时本文件所有函数都是恒等变换，行为与改造前逐字一致。
 */
let base = ''
// 曾经生效过的远程资源源根。base 被收回本地后仍然记得，供 toLocalAsset 换算——
// 兜底发生在加载失败的回调里，那时 base 可能已经翻回本地了。
let remoteRoot = ''

export function setAssetBase(b) {
  base = b || ''
  if (base) remoteRoot = base.replace(/\/+$/, '')
}

export function getAssetBase() {
  return base
}

/**
 * 把远程资源地址换回包内同名文件（服务器不可达时的兜底）。
 * 不是远程资源源下的地址就返回空串，调用方据此判断"没有可回退的本地副本"。
 */
export function toLocalAsset(src) {
  if (!remoteRoot || !src || src.indexOf(remoteRoot + '/') !== 0) return ''
  return './' + src.slice(remoteRoot.length + 1)
}

/**
 * 把 base 与资源路径拼成完整地址。
 * 必须吃掉路径开头的 ./ 或 /：发布脚本会把 /static/ 改写成 ./static/，
 * 直接拼会得到 https://host/xxx./static/... 这种坏地址。
 * base 为空时原样返回——本地与子路径部署的行为完全不变。
 */
function joinBase(p) {
  if (!base) return p
  return base.replace(/\/+$/, '') + '/' + p.replace(/^\.?\//, '')
}

export function assetUrl(p) {
  if (!p) return p
  if (/^(https?:|data:|blob:)/.test(p)) return p
  return joinBase(p)
}

/**
 * 就地收口：把 list 里每项的指定资源字段挂成"读取时才解析"的懒取值。
 *
 * 为什么必须"就地改"而不是返回新对象：words/hanzi/enSentences 这几份 JSON 是模块单例，
 * 而 index / learn / collection / chinese / review-pools 都是**直接 import 数据**的，
 * 并不经过 adapters。只有就地改才能让这些绕过 adapters 的调用方也拿到收口后的地址。
 *
 * 为什么是懒取值而不是当场算成字符串：资源源要先乐观用服务器、探测失败再收回本地
 * （见 asset-source.js）。当场算成字符串就冻死了，翻转 base 对已收口的条目一律无效。
 * 挂成 getter 后，任何一次读取都按"当时的 base"解析，翻转立刻对后续读取生效。
 *
 * 幂等：已是 getter 的字段直接跳过，原始值不会被覆盖成解析结果。
 * base 为空时读取结果与原始值逐字相同，所以本地/子路径部署的表现不变。
 */
export function collectAssetFieldsInPlace(list, fields) {
  if (!list) return
  for (const item of list) {
    if (!item) continue
    for (const k of fields) {
      const raw = item[k]
      if (!raw || typeof raw !== 'string') continue
      const desc = Object.getOwnPropertyDescriptor(item, k)
      if (desc && desc.get) continue
      Object.defineProperty(item, k, {
        get() {
          return assetUrl(raw)
        },
        enumerable: true,
        configurable: true,
      })
    }
  }
}

/**
 * 英语发音口音重写：/static/audio/x.mp3 → 对应口音镜像目录。
 * us=有道有雅婷；gb=有道有小英。旧 az 偏好兼容到 gb。
 * 只放行英文词/反馈音（字母开头、非 zh- 前缀、非 n数字、非四位码点）——语文与数学
 * 音频一律原样返回，即使调用方误传也不会读错科目。
 * 首字母必须兼容大写：Monday / China / CD 这类专有名词文件就是大写命名，
 * 只认小写会让现成的英式音轨永远取不到。
 *
 * 前缀三态都要认：/static/、./static/（GitHub Pages 发布脚本改写后的形态），
 * 以及加了远程资源源的完整地址（https://host/kids-english/static/...）。
 * 少认一种就会静默回美音——不报错，只是切口音没反应。
 */
export function withAccent(src, accent) {
  if ((!accent || accent === 'us') || !src) return src
  if (accent !== 'gb' && accent !== 'az') return src
  const m = /^(.*?)((?:\.)?\/static\/)audio\/([^/?#]+)$/.exec(src)
  if (!m) return src
  const name = m[3]
  if (!/^(?!zh-)(?!n\d)[A-Za-z][A-Za-z0-9'_-]*\.mp3$/.test(name)) return src
  return `${m[1]}${m[2]}audio-gb/${name}`
}

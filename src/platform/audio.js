/**
 * 音频统一入口（H5 实现：Howler）。
 * 新增业务一律 import 这里，不直接碰 Howler——将来小程序端用条件编译换成
 * uni.createInnerAudioContext，页面代码不动。
 *
 * 加固原则：音频任何失败（加载失败/播放抛错）都不允许让作答流程卡死，
 * 播放失败时会照常触发 onEnd，顺序播报的链不会断。
 */
import { Howl, Howler } from 'howler'
import volumes from '../data/audio-volumes.json'
import volumesGb from '../data/audio-volumes-gb.json'
import { withAccent } from './assets.js'
import { getStorage } from './storage.js'

const cache = new Map()

// 按 tools/gen-audio-volumes.mjs 实测生成的每词增益（安静词放大更多），
// WebAudio GainNode 支持 >1 的音量，因子已按峰值钳制不会削波。
// 英式与美音分开实测，同名文件响度不同，各查各的表。
const DEFAULT_VOLUME = 1.2

/** 当前英语口音：prefs.accent，'us'（默认）| 'gb'。家长中心切换，播放时即时生效 */
export function getAccent() {
  try {
    return getStorage().get('prefs', {})?.accent === 'gb' ? 'gb' : 'us'
  } catch (e) {
    return 'us'
  }
}

/** 英文音频按当前口音解析实际路径（语文/数学路径原样透传，见 withAccent 守卫） */
export function accentEnSrc(src) {
  return withAccent(src, getAccent())
}

// iPad Safari 兼容：iOS 在 锁屏/切走/Siri/来电/系统回收 后会把 AudioContext 置为
// interrupted 或 suspended。Howler 只恢复自己触发的挂起——ctx 被系统挂起后它的
// 记账状态仍是 running，_autoResume 不会再 resume()，声音从此全部无声。
// 对策1：关闭 Howler 的 30 秒空闲自动挂起，少一个风险点。
if (Howler.usingWebAudio) Howler.autoSuspend = false

// 对策2：页面重新可见时尽力恢复（能配合到下一次点击手势前的场景）。
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && Howler.ctx && Howler.ctx.state !== 'running') {
      Howler.ctx.resume().catch(() => {})
    }
  })
}

function getHowl(src) {
  if (!cache.has(src)) {
    const id = src.split('/').pop().replace(/\.mp3$/, '')
    const isGb = src.includes('/audio-gb/')
    const gain = (isGb ? volumesGb[id] : undefined) ?? volumes[id] ?? DEFAULT_VOLUME
    const howl = new Howl({ src: [src], preload: true, volume: gain })
    // 加载失败（部署漏传文件/网络抖动）时不要永远沉默：移出缓存，下次点击重试。
    // 英式缺文件（uniCloud 漏传新目录）时顺带预取美音兜底，下一次点击就能出声。
    howl.once('loaderror', () => {
      console.error('[player] 音频加载失败，将在下次点击时重试:', src)
      cache.delete(src)
      if (isGb) {
        const usSrc = src.replace('/audio-gb/', '/audio/')
        console.warn('[player] 英式音频缺失，回退美音:', usSrc)
        try {
          if (!cache.has(usSrc)) getHowl(usSrc)
          cache.set(src, cache.get(usSrc))
        } catch (e) { /* 下次点击再试 */ }
      }
    })
    cache.set(src, howl)
  }
  return cache.get(src)
}

// 全局同一时刻只播一条单发音轨：换新音源前先停掉上一条。
// 小朋友快速连点时（翻卡片、点选项）新音频会立即压掉旧的，不会叠加混音。
let lastOneShot = null

/**
 * 播放音频。Howler 内部会在首次触摸事件时解锁 iOS 的 WebAudio，
 * 我们的"点一下发音"天然是用户手势，iPad 静音开关也不影响。
 * 对策3（关键）：每次播放前检查 ctx 状态，非 running 就同步发起 resume()——
 * 此处正处点击手势内，iOS 允许恢复；等恢复完成再起播，Chrome 下 ctx 恒为
 * running 走原同步路径，行为不变。
 */
export function play(src, onEnd) {
  let howl
  try {
    howl = getHowl(src)
  } catch (e) {
    console.error('[player] 音频初始化失败:', src, e)
    if (onEnd) safeNext(onEnd)
    return null
  }
  if (lastOneShot && lastOneShot !== howl) {
    try {
      lastOneShot.stop()
    } catch (e) {
      /* 未加载完成时 stop 可能报错，忽略 */
    }
  }
  lastOneShot = howl
  const ctx = Howler.ctx
  const start = () => {
    try {
      howl.stop()
      const id = howl.play()
      if (onEnd) howl.once('end', onEnd, id)
    } catch (e) {
      console.error('[player] 播放失败（流程继续）:', src, e)
      if (onEnd) safeNext(onEnd)
    }
  }
  if (ctx && ctx.state !== 'running') {
    ctx.resume().then(start, start)
  } else {
    start()
  }
  return howl
}

function safeNext(fn) {
  // 让流程继续但不阻塞当前调用栈
  setTimeout(() => {
    try {
      fn()
    } catch (e) {
      /* 回调自身异常不再扩散 */
    }
  }, 0)
}

/** 批量预加载（进入页面时预热本分类音频） */
export function preload(srcList) {
  ;(srcList || []).forEach((src) => {
    try {
      getHowl(src)
    } catch (e) {
      /* 预加载失败不影响页面 */
    }
  })
}

/** 某条音频是否已下载就绪（页面显示「加载中」态用） */
export function isAudioReady(src) {
  try {
    const howl = cache.get(src)
    return !!howl && howl.state() === 'loaded'
  } catch (e) {
    return false
  }
}

/** 等某条音频就绪：已就绪立即返回 true；加载失败返回 false（调用方据此决定是否提示重试） */
export function whenAudioReady(src) {
  return new Promise((resolve) => {
    let howl
    try {
      howl = getHowl(src)
    } catch (e) {
      resolve(false)
      return
    }
    if (howl.state() === 'loaded') {
      resolve(true)
      return
    }
    howl.once('load', () => resolve(true))
    howl.once('loaderror', () => resolve(false))
  })
}

/**
 * 批量预加载 + 进度回调：每条只报一次（load/loaderror 都算完成，失败不许卡死进度条）。
 * 传给页面的 done/total 用于画「声音加载中」进度条——慢网下孩子能看到声音在来的路上。
 */
export function preloadWithProgress(srcList, onProgress) {
  const list = [...new Set((srcList || []).filter(Boolean))]
  const total = list.length
  if (!total) return
  let done = 0
  const bump = () => {
    done += 1
    try {
      onProgress?.(done, total)
    } catch (e) {
      /* 页面回调异常不扩散 */
    }
  }
  list.forEach((src) => {
    let howl
    try {
      howl = getHowl(src)
    } catch (e) {
      bump()
      return
    }
    if (howl.state() === 'loaded') {
      bump()
      return
    }
    howl.once('load', bump)
    howl.once('loaderror', bump)
  })
}

/** 英文词批量预加载 + 进度（按当前口音解析路径） */
export function preloadEnWithProgress(srcList, onProgress) {
  preloadWithProgress((srcList || []).map((s) => accentEnSrc(s)), onProgress)
}

/** 英文词/反馈音播放：按当前口音取音频（家长中心切美式/英式，播放时即时生效） */
export function playEn(src, onEnd) {
  return play(accentEnSrc(src), onEnd)
}

/** 英文词批量预加载（按当前口音解析路径） */
export function preloadEn(srcList) {
  preload((srcList || []).map((s) => accentEnSrc(s)))
}

// 顺序播放：数学题里把「3 + 5 = ?」拆成多段中文语音连着播。
// token 防串音：新序列开始后，旧序列的 onEnd 链自动失效。
// gapMs 用于需要停顿的序列（启蒙「中文 → 英文」），默认 0 保持连播行为不变。
let seqToken = 0

export function playSeq(srcList, onDone, { gapMs = 0 } = {}) {
  const token = ++seqToken
  const list = (srcList || []).filter(Boolean)
  const next = () => {
    if (token !== seqToken) return
    if (!list.length) {
      if (onDone) onDone()
      return
    }
    play(list.shift(), () => {
      // 只在还有下一条时停顿；末尾也等会让 onDone 白白晚一个间隔
      // 停顿期间孩子可能已翻页：next() 里的 token 校验会作废这条序列
      if (gapMs && list.length) setTimeout(next, gapMs)
      else next()
    })
  }
  next()
}

export function stopSeq() {
  seqToken++
  // 序列作废时连当前正在播的一条一起停，避免退出页面后声音残留
  if (lastOneShot) {
    try {
      lastOneShot.stop()
    } catch (e) {
      /* 忽略 */
    }
  }
}

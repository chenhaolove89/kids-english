import { Howl, Howler } from 'howler'
import volumes from '@/data/audio-volumes.json'

const cache = new Map()

// 按 tools/gen-audio-volumes.mjs 实测生成的每词增益（安静词放大更多），
// WebAudio GainNode 支持 >1 的音量，因子已按峰值钳制不会削波
const DEFAULT_VOLUME = 1.2

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
    const howl = new Howl({ src: [src], preload: true, volume: volumes[id] || DEFAULT_VOLUME })
    // 加载失败（部署漏传文件/网络抖动）时不要永远沉默：移出缓存，下次点击重试
    howl.once('loaderror', () => {
      console.error('[player] 音频加载失败，将在下次点击时重试:', src)
      cache.delete(src)
    })
    cache.set(src, howl)
  }
  return cache.get(src)
}

/**
 * 播放音频。Howler 内部会在首次触摸事件时解锁 iOS 的 WebAudio，
 * 我们的"点一下发音"天然是用户手势，iPad 静音开关也不影响。
 * 对策3（关键）：每次播放前检查 ctx 状态，非 running 就同步发起 resume()——
 * 此处正处点击手势内，iOS 允许恢复；等恢复完成再起播，Chrome 下 ctx 恒为
 * running 走原同步路径，行为不变。
 */
export function play(src, onEnd) {
  const howl = getHowl(src)
  const ctx = Howler.ctx
  const start = () => {
    try { howl.stop() } catch (e) { /* 未加载完成时 stop 可能报错，忽略 */ }
    const id = howl.play()
    if (onEnd) howl.once('end', onEnd, id)
  }
  if (ctx && ctx.state !== 'running') {
    ctx.resume().then(start, start)
  } else {
    start()
  }
  return howl
}

/** 批量预加载（进入页面时预热本分类音频） */
export function preload(srcList) {
  srcList.forEach(getHowl)
}

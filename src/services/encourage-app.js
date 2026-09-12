/**
 * 鼓励语轮换应用侧入口：把生成的表扬语清单（data/encourage.json，
 * tools/gen-encourage.mjs / gen-zh-azure --misc 维护）注入 domain/encourage.js。
 * 页面从这里取下一句表扬语的资源路径；清单缺的短语不进池，不会静音。
 */
import encourageData from '../data/encourage.json'
import { pickPraise } from '../domain/encourage.js'

const POOL = (encourageData && Array.isArray(encourageData.praise) ? encourageData.praise : []).filter(Boolean)

let lastKey = null

/** 下一句表扬语的资源路径；池为空回退 zh-great。
 * 字符串拼接而非反引号模板：反引号路径打包后原样保留，发布脚本改写不到 → 线上 404 */
export function nextPraiseSrc(rng = Math.random) {
  const key = pickPraise(POOL, lastKey, rng) || 'zh-great'
  lastKey = key
  return '/static/audio/' + key + '.mp3'
}

/** 全部表扬语资源路径（页面 preload 用，答对时零延迟） */
export function praiseSrcs() {
  return POOL.map((k) => '/static/audio/' + k + '.mp3')
}

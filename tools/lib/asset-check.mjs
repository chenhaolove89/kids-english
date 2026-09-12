/**
 * 静态资源可用性判定（生成器与审计共用一份口径）。
 *
 * 为什么需要它：原来增量生成与资源审计都只查 `existsSync` / `size > 0`，
 * 于是「TTS 中断留下的半截 mp3」「写盘失败留下的 0 字节 png」会**永久**通过
 * gen-assets 的增量跳过 + audit-assets 的门禁，孩子听到的第一个字就是断的，
 * 而两道门禁都报绿。这里按类型给一个最小合理字节数，低于即视为截断。
 *
 * 阈值取法：一条 24kHz/48kbps 单声道口语音频最短（「一」「a」）约 5~9KB，
 * 留足余量取 800B；最小有效 SVG 约 150B，PNG 空图约 70B，取 60B。
 */
import fs from 'node:fs'
import path from 'node:path'

export const MIN_BYTES = {
  audio: 800,
  image: 60,
  json: 2,
  other: 1,
}

const AUDIO_EXT = new Set(['.mp3', '.m4a', '.ogg', '.wav', '.aac'])
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.svg', '.webp', '.gif', '.ico', '.avif'])

export function kindOf(file) {
  const ext = path.extname(file).toLowerCase()
  if (AUDIO_EXT.has(ext)) return 'audio'
  if (IMAGE_EXT.has(ext)) return 'image'
  if (ext === '.json' || ext === '.webmanifest') return 'json'
  return 'other'
}

/**
 * @returns {'ok'|'missing'|'empty'|'truncated'}
 */
export function assetState(absPath, kind = kindOf(absPath)) {
  let st
  try {
    st = fs.statSync(absPath)
  } catch (e) {
    return 'missing'
  }
  if (!st.isFile()) return 'missing'
  if (st.size === 0) return 'empty'
  if (st.size < (MIN_BYTES[kind] ?? 1)) return 'truncated'
  return 'ok'
}

export function isUsableAsset(absPath, kind) {
  return assetState(absPath, kind) === 'ok'
}

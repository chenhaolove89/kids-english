/**
 * 生成每词音量增益表 src/data/audio-volumes.json：
 * 解码全部 MP3 实测 峰值/RMS → 计算每文件增益因子（目标 RMS ≈ -20dBFS），
 * 因子按峰值钳制（增益后峰值 ≤ 0.95）杜绝削波，且不低于 1.0（只放大不缩小）。
 * 播放端 player.js 读取该表设置 Howler volume（WebAudio GainNode，支持 >1）。
 * 重新生成词表音频后可重跑：node tools/gen-audio-volumes.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MPEGDecoder } from 'mpg123-decoder'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const AUDIO_DIR = path.join(ROOT, 'src/static/audio')
const AUDIO_GB_DIR = path.join(ROOT, 'src/static/audio-gb')
const OUT = path.join(ROOT, 'src/data/audio-volumes.json')
const OUT_GB = path.join(ROOT, 'src/data/audio-volumes-gb.json')

const TARGET_RMS = -20 // dBFS，日常语音响度
const PEAK_LIMIT = 0.95 // 增益后峰值上限，防削波

async function decode(file) {
  const decoder = new MPEGDecoder()
  await decoder.ready
  const { channelData, samplesDecoded, sampleRate } = decoder.decode(fs.readFileSync(file))
  decoder.free()
  let peak = 0
  let sumSq = 0
  let n = 0
  for (const ch of channelData) {
    for (let i = 0; i < ch.length; i++) {
      const v = Math.abs(ch[i])
      if (v > peak) peak = v
      sumSq += ch[i] * ch[i]
      n++
    }
  }
  if (!n) return { peak: 0, rms: -Infinity }
  return { peak, rms: 10 * Math.log10(sumSq / n) }
}

async function measure(dir) {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.mp3')).sort()
  const map = {}
  let boosted = 0
  const afterRms = []
  for (const f of files) {
    const id = f.replace(/\.mp3$/, '')
    const { peak, rms } = await decode(path.join(dir, f))
    if (peak < 0.01) { map[id] = 1; continue } // 静音文件不放大
    let factor = Math.pow(10, (TARGET_RMS - rms) / 20) // 拉到目标响度
    factor = Math.min(factor, PEAK_LIMIT / peak)       // 峰值钳制
    // 上限 3.0：播放端音量过大对孩子听力不友好（i/o/sw-eye 曾到 3.49）
    factor = Math.max(1, Math.min(factor, 3.0))        // 只放大不缩小，设上限
    map[id] = Math.round(factor * 100) / 100
    if (map[id] > 1.01) boosted++
    afterRms.push(rms + 20 * Math.log10(map[id]))
  }
  return { map, boosted, afterRms, count: files.length }
}

async function main() {
  // 美音必跑；英式目录存在（跑过 npm run gen:assets-gb）才生成英音增益表
  const jobs = [{ dir: AUDIO_DIR, out: OUT, label: '美音' }]
  if (fs.existsSync(AUDIO_GB_DIR)) jobs.push({ dir: AUDIO_GB_DIR, out: OUT_GB, label: '英音' })
  for (const j of jobs) {
    const { map, boosted, afterRms, count } = await measure(j.dir)
    fs.writeFileSync(j.out, JSON.stringify(map, null, 1))
    afterRms.sort((a, b) => a - b)
    console.log(`[${j.label}] 共 ${count} 个文件，增益 ${boosted} 个 → ${path.relative(ROOT, j.out)}`)
    console.log(`  增益后 RMS 范围: ${Math.min(...afterRms).toFixed(1)} ~ ${Math.max(...afterRms).toFixed(1)} dBFS，最大增益 ×${Math.max(...Object.values(map))}`)
  }
}

main()

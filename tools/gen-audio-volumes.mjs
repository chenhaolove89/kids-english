/**
 * 生成每词音量增益表 src/data/audio-volumes.json：
 * 解码全部 MP3 实测 峰值/RMS → 计算每文件增益因子（目标 RMS ≈ -20dBFS），
 * 因子按峰值钳制（增益后峰值 ≤ 0.95），过响的音频允许衰减。
 * 播放端 player.js 读取该表设置 Howler volume（WebAudio GainNode，支持 >1）。
 * 重新生成词表音频后可重跑：node tools/gen-audio-volumes.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MPEGDecoder } from 'mpg123-decoder'
import { writeFileAtomic } from './lib/fs-atomic.mjs'

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
  const { channelData, samplesDecoded, errors } = decoder.decode(fs.readFileSync(file))
  decoder.free()
  if (errors.length || !samplesDecoded) throw new Error(`音频解码失败：${file}`)
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

async function measure(dir, only) {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.mp3') && (!only || only.has(f))).sort()
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
    factor = Math.min(factor, 3.0)
    map[id] = Math.floor(factor * 100) / 100 // 向下取整，不能突破峰值上限
    if (map[id] > 1.01) boosted++
    afterRms.push(rms + 20 * Math.log10(map[id]))
  }
  return { map, boosted, afterRms, count: files.length }
}

async function main() {
  // 英语迁移时仅更新英语增益，保留中文/数学已有的校准结果。
  const englishOnly = process.argv.includes('--english-only')
  const words = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/words.json'), 'utf8'))
  const englishFiles = new Set(words.categories.flatMap(c => c.words.map(w => path.basename(w.audio))))
  englishFiles.add('great_job.mp3')
  // 美音必跑；英式目录存在（跑过 npm run gen:assets-gb）才生成英音增益表
  const jobs = [{ dir: AUDIO_DIR, out: OUT, label: '美音' }]
  if (fs.existsSync(AUDIO_GB_DIR)) jobs.push({ dir: AUDIO_GB_DIR, out: OUT_GB, label: '英音' })
  for (const j of jobs) {
    const { map: measured, boosted, afterRms, count } = await measure(j.dir, englishOnly ? englishFiles : undefined)
    const map = englishOnly && fs.existsSync(j.out) ? { ...JSON.parse(fs.readFileSync(j.out, 'utf8')), ...measured } : measured
    const chantDir = j.dir === AUDIO_DIR ? 'audio-chant' : 'audio-chant-gb'
    const chants = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/chants.json'), 'utf8')).chants
    for (const id of Object.keys(chants)) {
      const { peak, rms } = await decode(path.join(ROOT, 'src/static', chantDir, id + '.mp3'))
      if (!peak || !Number.isFinite(rms)) throw new Error(`韵律音频无效：${chantDir}/${id}`)
      map['chant:' + id] = Math.floor(Math.min(Math.pow(10, (TARGET_RMS - rms) / 20), PEAK_LIMIT / peak, 3) * 100) / 100
    }
    writeFileAtomic(j.out, JSON.stringify(map, null, 1))
    afterRms.sort((a, b) => a - b)
    console.log(`[${j.label}] 共 ${count} 个文件，增益 ${boosted} 个 → ${path.relative(ROOT, j.out)}`)
    console.log(`  增益后 RMS 范围: ${Math.min(...afterRms).toFixed(1)} ~ ${Math.max(...afterRms).toFixed(1)} dBFS，最大增益 ×${Math.max(...Object.values(map))}`)
  }
}

main()

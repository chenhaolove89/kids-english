/**
 * 音频体检：解码全部 MP3，输出 时长/峰值/RMS，
 * 找出 静音/过轻/削波 文件。用法：node tools/measure-audio.mjs [输出csv路径]
 */
import fs from 'node:fs'
import path from 'node:path'
import { MPEGDecoder } from 'mpg123-decoder'

const AUDIO_DIR = path.resolve(path.dirname(fileURLToPath()), '../src/static/audio')
const OUT_CSV = process.argv[2] || ''

function fileURLToPath() {
  return import.meta.url.replace(/^file:\/\/\//, '').replace(/\//g, '\\')
}

async function decode(file) {
  const decoder = new MPEGDecoder()
  await decoder.ready
  const data = fs.readFileSync(file)
  const { channelData, samplesDecoded, sampleRate } = decoder.decode(data)
  decoder.free()
  if (!samplesDecoded) return { duration: 0, peak: 0, rms: -Infinity, sampleRate }
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
  return {
    duration: samplesDecoded / sampleRate,
    peak,
    rms: 10 * Math.log10(sumSq / n),
    sampleRate,
  }
}

async function main() {
  const files = fs.readdirSync(AUDIO_DIR).filter((f) => f.endsWith('.mp3')).sort()
  const rows = []
  for (const f of files) {
    const m = await decode(path.join(AUDIO_DIR, f))
    rows.push({ file: f, ...m })
  }
  const db = (v) => (v === -Infinity ? '-Inf' : v.toFixed(1))
  const silent = rows.filter((r) => r.peak < 0.01)
  const clip = rows.filter((r) => r.peak > 0.999)
  const short = rows.filter((r) => r.duration < 0.35)
  const byRms = [...rows].sort((a, b) => a.rms - b.rms)
  console.log(`共 ${rows.length} 个文件`)
  console.log(`静音(峰值<0.01): ${silent.length} ${silent.map((r) => r.file).join(',') || ''}`)
  console.log(`疑似截断(<0.35s): ${short.length} ${short.map((r) => r.file).join(',') || ''}`)
  console.log(`削波(峰值>0.999): ${clip.length} ${clip.map((r) => r.file).join(',') || ''}`)
  console.log('最轻10个(RMS dBFS):', byRms.slice(0, 10).map((r) => `${r.file}:${db(r.rms)}`).join('  '))
  console.log('最响5个(RMS dBFS):', byRms.slice(-5).map((r) => `${r.file}:${db(r.rms)}`).join('  '))
  const peaks = rows.map((r) => r.peak)
  console.log(`峰值范围: ${Math.min(...peaks).toFixed(3)} ~ ${Math.max(...peaks).toFixed(3)}`)
  if (OUT_CSV) {
    fs.writeFileSync(OUT_CSV, 'file,duration,peak,rms_dbfs\n' + rows.map((r) => `${r.file},${r.duration.toFixed(3)},${r.peak.toFixed(4)},${db(r.rms)}`).join('\n'))
    console.log('明细已写入', OUT_CSV)
  }
}

main()

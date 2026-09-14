// 发布前全量核对：源文本/指定音色/文件哈希/可解码性/播放增益。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectJobs } from './gen-en-youdao.mjs'
import { sha256, inspectAudio } from './lib/youdao-tts.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'tools/youdao-audio-manifest.json'), 'utf8'))
const gains = Object.fromEntries(['us', 'gb'].map(a => [a, JSON.parse(fs.readFileSync(path.join(root, 'src/data/audio-volumes' + (a === 'gb' ? '-gb' : '') + '.json'), 'utf8'))]))
const failures = [], metrics = new Map()
const jobs = collectJobs()
let short = 0, rawClipped = 0
for (const j of jobs) {
  try {
    const meta = manifest.files[j.dest]
    if (!meta || meta.key !== j.key || meta.voice !== j.voice || meta.text !== j.text) throw new Error('音色/文本/缓存参数不匹配')
    const bytes = fs.readFileSync(path.join(root, j.dest))
    if (sha256(bytes) !== meta.sha256) throw new Error('文件与生成记录哈希不一致')
    if (!metrics.has(meta.sha256)) metrics.set(meta.sha256, await inspectAudio(bytes))
    const m = metrics.get(meta.sha256)
    const gain = gains[j.accent][(j.dest.includes('audio-chant') ? 'chant:' : '') + j.id]
    if (!Number.isFinite(gain) || gain <= 0 || m.peak * gain > 0.95001) throw new Error('缺音量表或增益后峰值超限')
    if (m.duration < 0.35) short++
    if (m.peak > 0.999) rawClipped++
  } catch (e) { failures.push(`${j.dest}: ${e.message}`) }
}
console.log(`有道全量审计 ${jobs.length} 文件：失败 ${failures.length}；短音频(<0.35s) ${short}；原始峰值>0.999 ${rawClipped}`)
if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1 }

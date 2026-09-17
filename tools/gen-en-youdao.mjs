#!/usr/bin/env node
// 两套英语音频统一入口。成功结果按请求参数缓存；全批完成后才 --apply。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { VOICES, sha256, fingerprint, credentials, inspectAudio, synthesize } from './lib/youdao-tts.mjs'
import { writeFileAtomic } from './lib/fs-atomic.mjs'
import { parseCsvLine } from './lib/csv.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const readJson = (p, fallback) => fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : fallback
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export function collectJobs(root = ROOT, data = readJson(path.join(root, 'src/data/words.json'))) {
  const texts = new Map()
  for (const cat of data.categories) for (const w of cat.words) {
    if (!/^\/static\/audio\/[A-Za-z][A-Za-z0-9'_-]*\.mp3$/.test(w.audio) || /\/(zh-|n\d)/.test(w.audio)) throw new Error(`非法英语路径：${w.id}`)
    const dest = w.audio.slice('/static/'.length)
    if (texts.has(dest) && texts.get(dest) !== w.en.trim()) throw new Error(`同名音频文本冲突：${w.id}`)
    texts.set(dest, w.en.trim())
  }
  texts.set('audio/great_job.mp3', 'Great job!')
  // 英语句子层（tools/en-sentences.csv）：句音与单词同目录（美音 audio/、英音 audio-gb/），
  // 这样口音切换、音量表、资源审计全都零改动。
  const sentFile = path.join(root, 'tools/en-sentences.csv')
  if (fs.existsSync(sentFile)) {
    let raw = fs.readFileSync(sentFile, 'utf8')
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1)
    const rows = raw.split(String.fromCharCode(13)).join('').split(String.fromCharCode(10)).filter((l) => l.trim())
    if (rows[0].toLowerCase().startsWith('id,')) rows.shift()
    for (const row of rows) {
      const [id, , en] = parseCsvLine(row)
      const key = (id || '').trim()
      const text = (en || '').trim()
      if (!key || !text) continue
      const dest = `audio/${key}.mp3`
      if (texts.has(dest) && texts.get(dest) !== text) throw new Error(`同名音频文本冲突：${key}`)
      texts.set(dest, text)
    }
  }
  return [...texts].flatMap(([dest, text]) => Object.entries(VOICES).map(([accent, voice]) => ({
    text, voice, accent, id: path.basename(dest, '.mp3'),
    dest: 'src/static/' + (accent === 'gb' ? dest.replace(/^audio\//, 'audio-gb/') : dest),
    key: fingerprint(text, voice),
  })))
}

export async function main(args = process.argv.slice(2), { data, root = ROOT, fetcher = fetch } = {}) {
  const cache = path.join(root, 'tmp/youdao-en')
  const manifestFile = path.join(root, 'tools/youdao-audio-manifest.json')
  let accent, only, dryRun = false, apply = false
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--accent') { accent = args[++i]; if (!VOICES[accent]) throw new Error('--accent 只能是 us 或 gb') }
    else if (arg === '--only') { const value = args[++i]; if (!value || value.startsWith('--')) throw new Error('--only 缺少词 ID'); only = new Set(value.split(',')) }
    else if (arg === '--dry-run') dryRun = true
    else if (arg === '--apply') apply = true
    else throw new Error(`不支持参数：${arg}`)
  }
  const jobs = collectJobs(root, data).filter((j) => (!accent || j.accent === accent) && (!only || only.has(j.id)))
  if (!jobs.length) throw new Error('没有匹配的音频')
  if (only && [...only].some((id) => !jobs.some((j) => j.id === id))) throw new Error('--only 含未知 ID')
  const unique = [...new Map(jobs.map((j) => [j.key, j])).values()]
  console.log(`有道：${jobs.length} 个目标文件，${unique.length} 个去重请求；美式 ${VOICES.us} / 英式 ${VOICES.gb}`)
  if (dryRun) return
  fs.mkdirSync(cache, { recursive: true })
  const lock = path.join(cache, 'run.lock')
  if (fs.existsSync(lock)) {
    const pid = Number(fs.readFileSync(lock, 'utf8'))
    let alive = true
    try { process.kill(pid, 0) } catch (e) { if (e.code === 'ESRCH') alive = false }
    if (alive) throw new Error('另一个有道生成进程仍在运行')
    fs.unlinkSync(lock)
  }
  const fd = fs.openSync(lock, 'wx'); fs.writeFileSync(fd, String(process.pid)); fs.closeSync(fd)
  try {
    let auth // 完全复用本地文件时无需凭据，只有新合成才读取。
    const manifest = readJson(manifestFile, { version: 1, files: {} })
    const published = new Map()
    for (const [dest, meta] of Object.entries(manifest.files)) {
      const copies = published.get(meta.key) || []
      copies.push({ dest, ...meta })
      published.set(meta.key, copies)
    }
    const progressFile = path.join(cache, 'progress.json')
    const progress = readJson(progressFile, { completed: {}, lastRequestAt: 0 })
    let generated = 0, reused = 0, lastLog = 0
    for (const j of unique) {
      const file = path.join(cache, j.key + '.mp3')
      const cached = progress.completed[j.key]
      let valid = cached && fs.existsSync(file) && sha256(fs.readFileSync(file)) === cached.sha256
      if (!valid) {
        for (const old of published.get(j.key) || []) {
          if (!fs.existsSync(path.join(root, old.dest))) continue
          const bytes = fs.readFileSync(path.join(root, old.dest))
          if (sha256(bytes) === old.sha256) {
            const metrics = await inspectAudio(bytes)
            writeFileAtomic(file, bytes)
            progress.completed[j.key] = { sha256: old.sha256, ...metrics }
            writeFileAtomic(progressFile, JSON.stringify(progress))
            valid = true
            break
          }
        }
      }
      if (valid) reused++
      else {
        auth ||= credentials(root)
        // 两种音色共用节流，低于官方 3000 次/小时上限。重启后仍延续最后调用时间。
        await pause(Math.max(0, 1250 - (Date.now() - progress.lastRequestAt)))
        progress.lastRequestAt = Date.now()
        writeFileAtomic(progressFile, JSON.stringify(progress))
        const { bytes, metrics } = await synthesize(j.text, j.voice, auth, fetcher)
        writeFileAtomic(file, bytes)
        progress.completed[j.key] = { sha256: sha256(bytes), ...metrics }
        writeFileAtomic(progressFile, JSON.stringify(progress))
        generated++
      }
      if (Date.now() - lastLog >= 30000 || generated + reused === unique.length) {
        console.log(`[${generated + reused}/${unique.length}] 新生成 ${generated}，复用 ${reused}；最近 ${j.accent}/${j.id}`)
        lastLog = Date.now()
      }
    }
    if (!apply) { console.log('缓存已完成；添加 --apply 即可校验并替换正式音频，无需再次调用。'); return }
    // 全量重新解码再发布，避免缓存损坏或部分成功时覆盖现有资源。
    for (const j of unique) {
      const bytes = fs.readFileSync(path.join(cache, j.key + '.mp3'))
      if (sha256(bytes) !== progress.completed[j.key].sha256) throw new Error(`缓存校验失败：${j.id}`)
      await inspectAudio(bytes)
    }
    for (const j of jobs) {
      const dest = path.join(root, j.dest)
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      writeFileAtomic(dest, fs.readFileSync(path.join(cache, j.key + '.mp3')))
      manifest.files[j.dest] = { key: j.key, voice: j.voice, text: j.text, ...progress.completed[j.key] }
    }
    writeFileAtomic(manifestFile, JSON.stringify(manifest, null, 2) + '\n')
    console.log(`完成：已替换 ${jobs.length} 个文件，未裁剪音频。`)
    return { applied: true }
  } finally { fs.unlinkSync(lock) }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((result) => {
    if (result?.applied) execFileSync(process.execPath, [path.join(ROOT, 'tools/gen-audio-volumes.mjs'), '--english-only'], { stdio: 'inherit' })
  }).catch((e) => { console.error(e.message); process.exitCode = 1 })
}

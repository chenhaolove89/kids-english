#!/usr/bin/env node
/**
 * 英文单词 Azure TTS 生成器（第三口音「课堂」）：用 en-GB-SoniaNeural（英音底，放慢 10%）
 * 生成 audio-azure/ 镜像，与 audio-gb（英式）同命名、同改写白名单。
 * 与 Edge 管线（audio/audio-gb）的区别：语速更慢、发音更接近课堂教学的清晰拼读。
 * 语区取 en-GB 而非 en-US：用户课堂教材配套音频为英音，慢下来的美音仍对不上。
 *
 * 输入:src/data/words.json（词文本 w.en → 音频名取 w.audio 的 basename，与美式 1:1）
 *      另加反馈音 great_job。
 * 用法:
 *   node tools/gen-en-azure.mjs --dry-run   # 不需要 key,打印统计与样例
 *   node tools/gen-en-azure.mjs --only watermelon,cat   # 只重生成指定文件名(去 .mp3)
 *   node tools/gen-en-azure.mjs             # 全部(增量:已存在的跳过,--force 全重生成)
 *
 * 凭据:AZURE_SPEECH_KEY / AZURE_SPEECH_REGION,取自环境变量或项目根 .env.local(git 已忽略)。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = path.join(ROOT, 'src', 'static', 'audio-azure')
const WORDS_FILE = path.join(ROOT, 'src', 'data', 'words.json')

const VOICE = 'en-GB-SoniaNeural'
const LANG = 'en-GB' // 与 VOICE 语区一致；换成 Maisie 等其它英音也要同步改这里
const RATE = '-10%' // 稍慢:课堂跟读节奏,比默认播报更清晰
const OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3'
const CONCURRENCY = 4

const argv = new Set(process.argv.slice(2))
const DRY_RUN = argv.has('--dry-run')
const FORCE = argv.has('--force')
const ONLY = (() => {
  const i = process.argv.indexOf('--only')
  if (i < 0 || !process.argv[i + 1]) return null
  return new Set(process.argv[i + 1].split(',').map((s) => s.trim().replace(/\.mp3$/, '')).filter(Boolean))
})()

function loadCreds() {
  const creds = {
    key: process.env.AZURE_SPEECH_KEY,
    region: process.env.AZURE_SPEECH_REGION,
  }
  const envFile = path.join(ROOT, '.env.local')
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*(AZURE_SPEECH_(?:KEY|REGION))\s*=\s*(.+?)\s*$/)
      if (m && !creds[m[1].slice('AZURE_SPEECH_'.length).toLowerCase()]) {
        creds[m[1] === 'AZURE_SPEECH_KEY' ? 'key' : 'region'] = m[2].replace(/^["']|["']$/g, '')
      }
    }
  }
  return creds
}

function buildSsml(text) {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${LANG}"><voice name="${VOICE}"><prosody rate="${RATE}">${esc}</prosody></voice></speak>`
}

async function synth(ssml, creds, attempt = 1) {
  const res = await fetch(`https://${creds.region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': creds.key,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': OUTPUT_FORMAT,
      'User-Agent': 'kids-english-audio-gen',
    },
    body: ssml,
  })
  if (res.ok) return Buffer.from(await res.arrayBuffer())
  if (res.status === 429 && attempt < 5) {
    await new Promise((r) => setTimeout(r, (Number(res.headers.get('retry-after')) || 2) * 1000))
    return synth(ssml, creds, attempt + 1)
  }
  if (res.status >= 500 && attempt < 3) {
    await new Promise((r) => setTimeout(r, 1500 * attempt))
    return synth(ssml, creds, attempt + 1)
  }
  const detail = (await res.text().catch(() => '')).slice(0, 150)
  throw new Error(`HTTP ${res.status} ${detail}`)
}

async function pool(label, jobs, worker) {
  const queue = [...jobs]
  let done = 0
  const failures = []
  const next = async () => {
    while (queue.length) {
      const job = queue.shift()
      try {
        await worker(job)
      } catch (e) {
        failures.push({ id: job.name, error: String(e.message || e).slice(0, 120) })
      }
      done++
      if (done % 200 === 0) console.log(`  ${label} ${done}/${jobs.length}`)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, next))
  return failures
}

function buildJobs() {
  const words = JSON.parse(fs.readFileSync(WORDS_FILE, 'utf8'))
  const byName = new Map()
  for (const c of words.categories) {
    for (const w of c.words) {
      if (!w.audio || !w.en?.trim()) continue
      const name = path.basename(w.audio).replace(/\.mp3$/, '')
      // 同名取先出现（美式音轨本来就 1:1，这里只做防御性去重）
      if (!byName.has(name)) byName.set(name, w.en.trim())
    }
  }
  byName.set('great_job', 'great job') // 家长页口音试听反馈音，与美式/英式对齐
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const jobs = []
  for (const [name, text] of byName) {
    if (ONLY && !ONLY.has(name)) continue
    const out = path.join(OUT_DIR, `${name}.mp3`)
    if (!FORCE && !ONLY && fs.existsSync(out) && fs.statSync(out).size > 1000) continue
    jobs.push({ name, text, out })
  }
  return jobs
}

async function main() {
  const jobs = buildJobs()
  console.log(`== 英文 Azure TTS(课堂口音 ${VOICE} rate=${RATE}): ${jobs.length} 条 ==`)
  if (DRY_RUN) {
    for (const j of jobs.slice(0, 5)) console.log(`[${j.name}] ${j.text} -> ${buildSsml(j.text).slice(160, 260)}`)
    console.log(`共 ${jobs.length} 条`)
    return
  }
  const creds = loadCreds()
  if (!creds.key || !creds.region) {
    console.error('缺少 AZURE_SPEECH_KEY / AZURE_SPEECH_REGION(环境变量或 .env.local)')
    process.exit(1)
  }
  const worker = async (job) => fs.writeFileSync(job.out, await synth(buildSsml(job.text), creds))
  let failures = await pool('EN-AZURE', jobs, worker)
  if (failures.length) {
    console.log(`-- 串行重试 ${failures.length} 条 --`)
    const retry = new Set(failures.map((f) => f.name))
    failures = await pool('EN-RETRY', jobs.filter((j) => retry.has(j.name)), worker)
  }
  console.log(`\n== 完成 == 成功 ${jobs.length - failures.length} / ${jobs.length} 条`)
  if (failures.length) {
    for (const f of failures.slice(0, 20)) console.log(`  ✗ ${f.name}: ${f.error}`)
    process.exitCode = 1
  }
}

main()

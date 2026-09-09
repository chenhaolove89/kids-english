/**
 * Azure Speech TTS 生成器(方案B):用 SSML <phoneme> 强制读音,全量重生成中文音频。
 *
 * 与 Edge 免费端点的区别:Azure 官方支持 phoneme 标签(文档化能力,非碰运气);
 * 音色同为 zh-CN-XiaoxiaoNeural,输出同为 24kHz/48kbps 单声道 MP3,与现有音频无缝混用。
 * 英文音频不在此重生成(无多音字问题,继续用 Edge 管线)。
 *
 * 输入:tools/zh-pron-pinyin.json(tools/zh_pinyin_annotate.py 生成)
 *   - 汉字字音:hanzi.csv 人工校订拼音,全部 phoneme 标注
 *   - 例词/词语课词音:有逐字实证拼音的词全词标注;其余走默认读音(文本合成)
 *
 * 用法:
 *   node tools/gen-zh-azure.mjs --dry-run      # 不需要 key,打印统计与 SSML 样例
 *   node tools/gen-zh-azure.mjs --test         # 生成 5 个易错字样例到 .tmp-azure-test/,人工试听
 *   node tools/gen-zh-azure.mjs --chars        # 只重生成字音+例词(audio/zh-*.mp3)
 *   node tools/gen-zh-azure.mjs --words        # 只重生成词语课(audio-zh/*.mp3,与现存文件取交集)
 *   node tools/gen-zh-azure.mjs --only zh-897fs   # 只重生成指定条目(改单条例句/字音时用,避免整批重写产生无关 diff)
 *   node tools/gen-zh-azure.mjs --all          # 全部(默认)
 *
 * 凭据:AZURE_SPEECH_KEY / AZURE_SPEECH_REGION,取自环境变量或项目根 .env.local(git 已忽略)。
 * 免费层 F0 每月 50 万字符,本项目全部中文音频约 6 千字符,额度充裕。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const AUDIO_DIR = path.join(ROOT, 'src/static/audio')
const AUDIO_ZH_DIR = path.join(ROOT, 'src/static/audio-zh')
const PINYIN_FILE = path.join(ROOT, 'tools/zh-pron-pinyin.json')
const TEST_DIR = path.join(ROOT, '.tmp-azure-test')

const VOICE = 'zh-CN-XiaoxiaoNeural'
const OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3'
const CONCURRENCY = 4 // F0 免费层限流较严,本地代理也扛不住高并发,宁慢勿败

const argv = new Set(process.argv.slice(2))
const DRY_RUN = argv.has('--dry-run')
const TEST_MODE = argv.has('--test')
const CHARS_ONLY = argv.has('--chars')
const WORDS_ONLY = argv.has('--words')
// --only zh-897fs,zh-4e00w：精确重生成指定条目（改单条内容时用，避免整批重写）
const ONLY = (() => {
  const i = process.argv.indexOf('--only')
  if (i < 0 || !process.argv[i + 1]) return null
  return new Set(process.argv[i + 1].split(',').map((s) => s.trim()).filter(Boolean))
})()

// ---- 凭据 ----
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

// ---- 拼音 -> SAPI 音素(ü→v,轻声=5;声调与音节之间必须有空格,实测 200/400 分界) ----
const TONE_MARKS = { '\u0304': '1', '\u0301': '2', '\u030c': '3', '\u0300': '4' }
function toSapi(py) {
  const nfd = py.normalize('NFD')
  let tone = '5'
  let base = ''
  for (const ch of nfd) {
    if (TONE_MARKS[ch]) tone = TONE_MARKS[ch]
    else if (ch === '\u0308') base = base.replace(/u$/, 'v') // ü 的分音符:替换前面的 u(ǜ U+01DC 分解为 u+0308+声调)
    else base += ch
  }
  if (!/^[a-zv]+$/.test(base)) throw new Error(`异常拼音: ${py}`)
  return base + ' ' + tone
}

function buildSsml(text, pinyin) {
  const chars = [...text]
  // pinyin 槽位可为 null:非 null 注 phoneme,null 走默认读音(例句只注目标字,保韵律)
  const body = (pinyin && pinyin.length === chars.length)
    ? chars.map((ch, i) => (pinyin[i] ? `<phoneme alphabet="sapi" ph="${toSapi(pinyin[i])}">${ch}</phoneme>` : ch)).join('')
    : text
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="zh-CN"><voice name="${VOICE}">${body}</voice></speak>`
}

// ---- Azure REST ----
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
    const wait = (Number(res.headers.get('retry-after')) || 2) * 1000
    await new Promise((r) => setTimeout(r, wait))
    return synth(ssml, creds, attempt + 1)
  }
  if (res.status >= 500 && attempt < 3) {
    await new Promise((r) => setTimeout(r, 1500 * attempt))
    return synth(ssml, creds, attempt + 1)
  }
  const detail = (await res.text().catch(() => '')).slice(0, 150)
  throw new Error(`HTTP ${res.status} ${detail}`)
}

// ---- 并发池 ----
async function pool(label, jobs, worker) {
  const queue = [...jobs] // 拷贝队列:调用方的 jobs 数组还要用来统计总数,不能被 shift 空
  let done = 0
  const failures = []
  const next = async () => {
    while (queue.length) {
      const job = queue.shift()
      try {
        await worker(job)
      } catch (e) {
        failures.push({ id: job.id, error: String(e.message || e).slice(0, 120) })
      }
      done++
      if (done % 100 === 0) console.log(`  ${label} ${done}`)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, next))
  return failures
}

async function main() {
  const { items } = JSON.parse(fs.readFileSync(PINYIN_FILE, 'utf8'))
  const charIds = Object.keys(items).filter((id) => /^zh-[0-9a-f]{4}[ws]?$/.test(id))
  const existingWords = new Set(
    fs.existsSync(AUDIO_ZH_DIR) ? fs.readdirSync(AUDIO_ZH_DIR).filter((f) => f.endsWith('.mp3')).map((f) => f.replace(/\.mp3$/, '')) : []
  )
  const wordIds = Object.keys(items).filter((id) => id.startsWith('zhw-') && existingWords.has(id.slice(4)))

  let targets
  if (ONLY) {
    const missing = [...ONLY].filter((id) => !items[id])
    if (missing.length) {
      console.error(`--only 指定了不存在的条目: ${missing.join(', ')}`)
      process.exit(1)
    }
    targets = [...ONLY]
  } else if (CHARS_ONLY) targets = charIds
  else if (WORDS_ONLY) targets = wordIds
  else targets = [...charIds, ...wordIds]

  const annotated = targets.filter((id) => items[id].pinyin)
  console.log(`目标 ${targets.length} 条(phoneme 标注 ${annotated.length},默认读音 ${targets.length - annotated.length})`)

  if (DRY_RUN) {
    console.log('\n== SSML 样例(前 6 条)==')
    for (const id of targets.filter((id) => items[id].pinyin).slice(0, 3)) {
      console.log(`[${id}] ${buildSsml(items[id].text, items[id].pinyin)}`)
    }
    for (const id of targets.filter((id) => !items[id].pinyin).slice(0, 3)) {
      console.log(`[${id}] ${buildSsml(items[id].text, null)}`)
    }
    return
  }

  const creds = loadCreds()
  if (TEST_MODE) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true })
    fs.mkdirSync(TEST_DIR, { recursive: true })
    const testIds = ['zh-5e72', 'zh-6559', 'zh-559d', 'zh-7eff', 'zh-5b50']
    let failed = 0
    for (const id of testIds) {
      const it = items[id]
      try {
        const buf = await synth(buildSsml(it.text, it.pinyin), creds)
        fs.writeFileSync(path.join(TEST_DIR, `${id}-${it.text}.mp3`), buf)
        console.log(`✓ ${it.text}(${(it.pinyin || []).join(' ') || '默认'}) -> ${TEST_DIR}/${id}-${it.text}.mp3`)
      } catch (e) {
        failed++
        console.log(`✗ ${it.text}(${(it.pinyin || []).join(' ') || '默认'}): ${e.message}`)
      }
    }
    if (failed) process.exitCode = 1
    else console.log('请人工试听上述样例')
    return
  }

  if (!creds.key || !creds.region) {
    console.error('缺少 AZURE_SPEECH_KEY / AZURE_SPEECH_REGION(环境变量或 .env.local)')
    process.exit(1)
  }

  const jobs = targets.map((id) => {
    const it = items[id]
    const out = id.startsWith('zhw-')
      ? path.join(AUDIO_ZH_DIR, `${id.slice(4)}.mp3`)
      : path.join(AUDIO_DIR, `${id}.mp3`)
    return { id, text: it.text, pinyin: it.pinyin, out }
  })

  const synthWorker = async (job) => {
    let buf
    try {
      buf = await synth(buildSsml(job.text, job.pinyin), creds)
    } catch (e) {
      if (!job.pinyin) throw e
      // phoneme SSML 被拒(400 等)时该条退回默认读音,不让单条卡死全量
      buf = await synth(buildSsml(job.text, null), creds)
      console.warn(`  ↻ ${job.id} phoneme 被拒,已退回默认读音: ${e.message}`)
    }
    fs.writeFileSync(job.out, buf)
  }

  console.log(`== Azure TTS 生成开始: ${jobs.length} 条 ==`)
  let failures = await pool('ZH-AZURE', jobs, synthWorker)
  if (failures.length) {
    // 失败条目串行重试一轮(并发下的网络抖动/瞬时限流,串行大多能过)
    console.log(`-- 串行重试 ${failures.length} 条 --`)
    const retryIds = new Set(failures.map((f) => f.id))
    const retryJobs = jobs.filter((j) => retryIds.has(j.id))
    failures = await pool('RETRY', retryJobs, synthWorker)
  }

  console.log(`\n== 完成 == 成功 ${jobs.length - failures.length} / ${jobs.length} 条`)
  if (failures.length) {
    console.log(`失败 ${failures.length} 条(文件保留原样,重跑即可续),前 20 条:`)
    for (const f of failures.slice(0, 20)) console.log(`  ✗ ${f.id}: ${f.error}`)
    process.exitCode = 1
  }
}

main()

/**
 * 资源生成脚本：读 tools/words.csv → 生成
 *   - static/audio/{id}.mp3   单词发音（微软 Edge TTS，儿童音色）
 *   - static/img/{id}.png     单词配图（Noto Emoji 512px，Apache-2.0 可商用）
 *   - static/img/{id}.svg     数字卡片（本地绘制）
 *   - static/img/cat-*.png    分类图标
 *   - static/icons/icon.png   应用图标
 *   - src/data/words.json     页面数据
 * 用法：npm run gen:assets [-- --force]   （--force 重新生成已存在的音频）
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const STATIC_DIR = path.join(ROOT, 'src/static')
const AUDIO_DIR = path.join(STATIC_DIR, 'audio')
const IMG_DIR = path.join(STATIC_DIR, 'img')
const ICON_DIR = path.join(STATIC_DIR, 'icons')
const DATA_FILE = path.join(ROOT, 'src/data/words.json')
const FORCE = process.argv.includes('--force')

const NOTO_BASE = 'https://cdn.jsdelivr.net/gh/googlefonts/noto-emoji@v2.047/png/512'
const VOICES = ['en-US-AnaNeural', 'en-US-JennyNeural']

const CATEGORIES = {
  animals: { zh: '动物', en: 'Animals', icon: '1f436', color: '#3BB273', bg: '#E3F6E8' },
  fruits: { zh: '水果', en: 'Fruits', icon: '1f34e', color: '#FF6B6B', bg: '#FFE9E9' },
  vegetables: { zh: '蔬菜', en: 'Vegetables', icon: '1f955', color: '#7CB342', bg: '#EFF5E3' },
  food: { zh: '食物', en: 'Food', icon: '1f355', color: '#FF8C42', bg: '#FFEDD9' },
  vehicles: { zh: '交通工具', en: 'Vehicles', icon: '1f697', color: '#4D96FF', bg: '#E3EEFF' },
  colors: { zh: '颜色', en: 'Colors', icon: '1f308', color: '#F76BA8', bg: '#FDE3EE' },
  numbers: { zh: '数字', en: 'Numbers', icon: '1f522', color: '#9B5DE5', bg: '#F0E6FB' },
  nature: { zh: '自然', en: 'Nature', icon: '1f30d', color: '#2FA4A9', bg: '#E0F4F5' },
  body: { zh: '身体', en: 'My Body', icon: '1f440', color: '#C77D52', bg: '#F5EBE2' },
  clothes: { zh: '衣服', en: 'Clothes', icon: '1f455', color: '#5C7CFA', bg: '#E8EDFF' },
  home: { zh: '物品', en: 'Things', icon: '1f4a1', color: '#C9A227', bg: '#F8F1DC' },
  places: { zh: '场所', en: 'Places', icon: '1f3f0', color: '#8A6BD1', bg: '#EEE7FB' },
  sports: { zh: '运动', en: 'Sports', icon: '26bd', color: '#E4573D', bg: '#FBE7E3' },
  music: { zh: '乐器', en: 'Music', icon: '1f3b5', color: '#C257B5', bg: '#F7E5F4' },
  toys: { zh: '玩具', en: 'Toys', icon: '1f9f8', color: '#5FA8D3', bg: '#E5F2F8' },
  characters: { zh: '人物', en: 'Characters', icon: '1f916', color: '#D6336C', bg: '#FBE3EC' },
  actions: { zh: '动作', en: 'Actions', icon: '1f3c3', color: '#12B886', bg: '#E2F6EF' },
  emotions: { zh: '表情', en: 'Emotions', icon: '1f600', color: '#FAB005', bg: '#FFF3D6' },
}

// 额外生成的反馈语音
const FEEDBACK = [
  { id: 'great_job', text: 'Great job!' },
  { id: 'try_again', text: 'Try again!' },
]

const NUMBER_COLORS = ['#FF8C42', '#4D96FF', '#3BB273', '#F76BA8', '#9B5DE5', '#FFC94D', '#FF6B6B', '#4ECDC4', '#C77DFF', '#FF9F1C']

for (const d of [AUDIO_DIR, IMG_DIR, ICON_DIR, path.dirname(DATA_FILE)]) fs.mkdirSync(d, { recursive: true })

function readCSV() {
  const lines = fs.readFileSync(path.join(ROOT, 'tools/words.csv'), 'utf8').trim().split(/\r?\n/)
  return lines.slice(1).filter((l) => l.trim()).map((l) => {
    const [id, en, zh, phonetic, category, emoji, draw] = l.split(',')
    return { id, en, zh, phonetic, category, emoji: emoji || '', draw: draw || '' }
  })
}

let tts = null
async function makeTTS() {
  const t = new MsEdgeTTS()
  let lastErr
  for (const voice of VOICES) {
    try {
      await t.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
      console.log('TTS 音色:', voice)
      return t
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr
}

async function speak(text, outPath) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      if (!tts) tts = await makeTTS()
      const { audioStream } = tts.toStream(text)
      const chunks = []
      for await (const c of audioStream) chunks.push(c)
      const buf = Buffer.concat(chunks)
      if (buf.length < 1000) throw new Error(`音频过小 ${buf.length}B`)
      fs.writeFileSync(outPath, buf)
      return buf.length
    } catch (e) {
      tts = null
      if (attempt === 3) throw e
      console.log(`  重试 ${attempt}/3 ...(${e.message})`)
      await new Promise((r) => setTimeout(r, 1500))
    }
  }
}

async function fetchEmoji(code) {
  const candidates = [...new Set([code, code.replace(/_fe0f/g, '')])]
  for (const c of candidates) {
    try {
      const res = await fetch(`${NOTO_BASE}/emoji_u${c}.png`, { headers: { 'User-Agent': 'Mozilla/5.0' } })
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer())
        if (buf.length > 1000 && buf[0] === 0x89) return buf
      }
    } catch { /* 换下一个候选 */ }
  }
  return null
}

function numberSVG(text, i) {
  const color = NUMBER_COLORS[i % NUMBER_COLORS.length]
  const size = text.length > 1 ? 240 : 300
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect x="16" y="16" width="480" height="480" rx="110" fill="${color}"/>
  <rect x="34" y="34" width="444" height="444" rx="96" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="14"/>
  <text x="256" y="270" font-family="Arial, Helvetica, sans-serif" font-weight="bold" font-size="${size}" fill="#FFFFFF" text-anchor="middle" dominant-baseline="central">${text}</text>
</svg>`
}

async function main() {
  const words = readCSV()
  console.log(`词表 ${words.length} 个词\n`)

  // ---- 音频 ----
  const ttsJobs = [...words.map((w) => ({ id: w.id, text: w.en })), ...FEEDBACK]
  let ttsNew = 0, ttsSkip = 0
  for (const job of ttsJobs) {
    const out = path.join(AUDIO_DIR, `${job.id}.mp3`)
    if (!FORCE && fs.existsSync(out)) { ttsSkip++; continue }
    const size = await speak(job.text, out)
    ttsNew++
    console.log(`  ♪ ${job.id}.mp3 (${Math.round(size / 1024)}KB)`)
  }
  console.log(`音频完成：新增 ${ttsNew}，复用 ${ttsSkip}\n`)

  // ---- 图片 ----
  let imgNew = 0, imgSkip = 0
  const missing = []
  const numberWords = words.filter((w) => w.draw)
  for (const w of words) {
    if (w.draw) continue // 数字卡片在下面统一生成
    const out = path.join(IMG_DIR, `${w.id}.png`)
    if (!FORCE && fs.existsSync(out)) { imgSkip++; continue }
    const buf = await fetchEmoji(w.emoji)
    if (buf) { fs.writeFileSync(out, buf); imgNew++; console.log(`  ◼ ${w.id}.png`) }
    else missing.push(w.id)
  }
  numberWords.forEach((w, i) => {
    const out = path.join(IMG_DIR, `${w.id}.svg`)
    if (!FORCE && fs.existsSync(out)) { imgSkip++; return }
    fs.writeFileSync(out, numberSVG(w.draw, i))
    imgNew++
  })

  // 分类图标 + 应用图标
  for (const [id, meta] of Object.entries(CATEGORIES)) {
    const out = path.join(IMG_DIR, `cat-${id}.png`)
    if (!FORCE && fs.existsSync(out)) continue
    const buf = await fetchEmoji(meta.icon)
    if (buf) { fs.writeFileSync(out, buf) } else { missing.push(`cat-${id}`) }
  }
  const iconOut = path.join(ICON_DIR, 'icon.png')
  if (FORCE || !fs.existsSync(iconOut)) {
    const buf = await fetchEmoji('1f4da') // 📚
    if (buf) fs.writeFileSync(iconOut, buf)
    else missing.push('app-icon')
  }
  console.log(`图片完成：新增 ${imgNew}，复用 ${imgSkip}\n`)

  // ---- 数据 JSON ----
  const categories = Object.entries(CATEGORIES).map(([id, meta]) => {
    const ws = words.filter((w) => w.category === id).map((w) => ({
      id: w.id,
      en: w.en,
      zh: w.zh,
      phonetic: w.phonetic,
      image: `/static/img/${w.id}.${w.draw ? 'svg' : 'png'}`,
      audio: `/static/audio/${w.id}.mp3`,
    }))
    return { id, zh: meta.zh, en: meta.en, color: meta.color, bg: meta.bg, icon: `/static/img/cat-${id}.png`, words: ws }
  })

  // ---- 校验 ----
  let bad = 0
  for (const cat of categories) {
    for (const w of cat.words) {
      const img = path.join(STATIC_DIR, w.image.replace('/static/', ''))
      const aud = path.join(STATIC_DIR, w.audio.replace('/static/', ''))
      if (!fs.existsSync(img)) { console.log(`✗ 缺图片: ${w.id}`); bad++ }
      if (!fs.existsSync(aud)) { console.log(`✗ 缺音频: ${w.id}`); bad++ }
    }
  }
  for (const f of FEEDBACK) {
    if (!fs.existsSync(path.join(AUDIO_DIR, `${f.id}.mp3`))) { console.log(`✗ 缺反馈音频: ${f.id}`); bad++ }
  }

  fs.writeFileSync(DATA_FILE, JSON.stringify({ generatedAt: new Date().toISOString(), categories }, null, 2))
  console.log('\n========== 汇总 ==========')
  for (const cat of categories) console.log(`${cat.zh.padEnd(5)} ${String(cat.words.length).padStart(2)} 词`)
  console.log(`数据文件: src/data/words.json`)
  if (missing.length) console.log(`⚠ 图片缺失（emoji 找不到）: ${missing.join(', ')}`)
  if (bad || missing.length) {
    console.log('存在缺失资源，请处理后再构建')
    process.exitCode = 1
  } else {
    console.log('✓ 全部资源就绪')
  }
}

main().catch((e) => {
  console.error('生成失败:', e)
  process.exitCode = 1
})

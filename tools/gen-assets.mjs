/**
 * 资源生成脚本（多科目版）：
 *  输入 tools/words.csv（由 merge-words.mjs 合并） + tools/hanzi.csv
 *  输出：
 *   - static/audio/{id}.mp3        英文单词发音（Edge TTS，en-US 儿童音色）
 *   - static/audio/zh-*.mp3        中文发音：汉字/例词/数字0-100/数学用语/反馈语
 *   - static/img/{id}.png          单词配图（Noto Emoji 512px，Apache-2.0）
 *   - static/img/{id}.svg          自绘词卡（数字/字母/形状/拼读词等）
 *   - static/img/cat-*.png         分类图标
 *   - static/icons/icon.png        应用图标
 *   - src/data/words.json          英语数据（含 level）
 *   - src/data/hanzi.json          语文识字数据（字/拼音/例词/音频）
 * 用法：npm run gen:assets [-- --force]
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
const DATA_DIR = path.join(ROOT, 'src/data')
const FORCE = process.argv.includes('--force')

const NOTO_BASE = 'https://cdn.jsdelivr.net/gh/googlefonts/noto-emoji@v2.047/png/512'
// 国旗在 Noto 仓库里按 ISO 国家代码存放（CN.png），emoji 码点路径下没有
const NOTO_FLAG_BASE = 'https://cdn.jsdelivr.net/gh/googlefonts/noto-emoji@v2.047/third_party/region-flags/png'
const EN_VOICES = ['en-US-AnaNeural', 'en-US-JennyNeural']
const ZH_VOICES = ['zh-CN-XiaoxiaoNeural', 'zh-CN-XiaoyiNeural']

const LEVELS = {
  1: { id: 1, zh: '启蒙起步', en: 'Level 1', color: '#3BB273', bg: '#E3F6E8', icon: '1f331' },
  2: { id: 2, zh: '日常生活', en: 'Level 2', color: '#4D96FF', bg: '#E3EEFF', icon: '1f3e0' },
  3: { id: 3, zh: '快乐探索', en: 'Level 3', color: '#FF8C42', bg: '#FFEDD9', icon: '1f9ed' },
  4: { id: 4, zh: '挑战进阶', en: 'Level 4', color: '#9B5DE5', bg: '#F0E6FB', icon: '1f680' },
}

const CATEGORIES = {
  // L1 启蒙起步
  colors: { zh: '颜色', en: 'Colors', icon: '1f308', color: '#F76BA8', bg: '#FDE3EE', level: 1 },
  numbers: { zh: '数字', en: 'Numbers', icon: '1f522', color: '#9B5DE5', bg: '#F0E6FB', level: 1 },
  shapes: { zh: '形状', en: 'Shapes', icon: '1f536', color: '#4ECDC4', bg: '#E2F5F3', level: 1 },
  body: { zh: '身体', en: 'My Body', icon: '1f440', color: '#C77D52', bg: '#F5EBE2', level: 1 },
  alphabet: { zh: '字母', en: 'ABC', icon: '1f524', color: '#5C7CFA', bg: '#E8EDFF', level: 1 },
  animals: { zh: '动物', en: 'Animals', icon: '1f436', color: '#3BB273', bg: '#E3F6E8', level: 1 },
  fruits: { zh: '水果', en: 'Fruits', icon: '1f34e', color: '#FF6B6B', bg: '#FFE9E9', level: 1 },
  toys: { zh: '玩具', en: 'Toys', icon: '1f9f8', color: '#5FA8D3', bg: '#E5F2F8', level: 1 },
  // L2 日常生活
  food: { zh: '食物', en: 'Food', icon: '1f355', color: '#FF8C42', bg: '#FFEDD9', level: 2 },
  vegetables: { zh: '蔬菜', en: 'Vegetables', icon: '1f955', color: '#7CB342', bg: '#EFF5E3', level: 2 },
  desserts: { zh: '甜品', en: 'Desserts', icon: '1f370', color: '#F06292', bg: '#FDE7F0', level: 2 },
  drinks: { zh: '饮品', en: 'Drinks', icon: '1f964', color: '#26A69A', bg: '#E0F2F1', level: 2 },
  clothes: { zh: '衣服', en: 'Clothes', icon: '1f455', color: '#5C7CFA', bg: '#E8EDFF', level: 2 },
  home: { zh: '家居', en: 'At Home', icon: '1f6cb_fe0f', color: '#C9A227', bg: '#F8F1DC', level: 2 },
  kitchen: { zh: '厨房', en: 'Kitchen', icon: '1f37d_fe0f', color: '#E4573D', bg: '#FBE7E3', level: 2 },
  school: { zh: '学校', en: 'School', icon: '1f4d0', color: '#8A6BD1', bg: '#EEE7FB', level: 2 },
  family: { zh: '家人', en: 'Family', icon: '1f46a', color: '#D6336C', bg: '#FBE3EC', level: 2 },
  emotions: { zh: '表情', en: 'Feelings', icon: '1f600', color: '#FAB005', bg: '#FFF3D6', level: 2 },
  // L3 快乐探索
  vehicles: { zh: '交通工具', en: 'Vehicles', icon: '1f697', color: '#4D96FF', bg: '#E3EEFF', level: 3 },
  nature: { zh: '自然', en: 'Nature', icon: '1f30d', color: '#2FA4A9', bg: '#E0F4F5', level: 3 },
  ocean: { zh: '海洋', en: 'Ocean', icon: '1f420', color: '#1E88E5', bg: '#E3F2FD', level: 3 },
  insects: { zh: '昆虫', en: 'Insects', icon: '1f98b', color: '#7CB342', bg: '#EFF5E3', level: 3 },
  birds: { zh: '鸟类', en: 'Birds', icon: '1f426', color: '#00ACC1', bg: '#E0F7FA', level: 3 },
  places: { zh: '场所', en: 'Places', icon: '1f3f0', color: '#8A6BD1', bg: '#EEE7FB', level: 3 },
  time: { zh: '时间', en: 'Time', icon: '23f1_fe0f', color: '#FF7043', bg: '#FBE9E7', level: 3 },
  countries: { zh: '国家', en: 'Countries', icon: '1f6a9', color: '#E4573D', bg: '#FBE7E3', level: 3 },
  farm: { zh: '农场', en: 'Farm', icon: '1f69c', color: '#8D6E63', bg: '#EFEBE9', level: 3 },
  forest: { zh: '森林', en: 'Forest', icon: '1f332', color: '#2E7D32', bg: '#E8F5E9', level: 3 },
  city: { zh: '城市', en: 'In Town', icon: '1f3d9_fe0f', color: '#546E7A', bg: '#ECEFF1', level: 3 },
  // L4 挑战进阶
  sports: { zh: '运动', en: 'Sports', icon: '26bd', color: '#E4573D', bg: '#FBE7E3', level: 4 },
  music: { zh: '乐器', en: 'Music', icon: '1f3b5', color: '#C257B5', bg: '#F7E5F4', level: 4 },
  jobs: { zh: '职业', en: 'Jobs', icon: '1f477', color: '#F76707', bg: '#FFE8D9', level: 4 },
  space: { zh: '太空', en: 'Space', icon: '1fa90', color: '#6741D9', bg: '#EDE7FC', level: 4 },
  characters: { zh: '角色', en: 'Characters', icon: '1f9da', color: '#D6336C', bg: '#FBE3EC', level: 4 },
  tools: { zh: '工具', en: 'Tools', icon: '1f6e0_fe0f', color: '#795548', bg: '#EFEBE9', level: 4 },
  electronics: { zh: '电器', en: 'Electronics', icon: '1f4bb', color: '#0288D1', bg: '#E1F5FE', level: 4 },
  health: { zh: '健康', en: 'Health', icon: '2695_fe0f', color: '#43A047', bg: '#E8F5E9', level: 4 },
  festivals: { zh: '节日', en: 'Festivals', icon: '1f38a', color: '#E91E63', bg: '#FCE4EC', level: 4 },
  actions: { zh: '动作', en: 'Actions', icon: '1f3c3', color: '#12B886', bg: '#E2F6EF', level: 4 },
  adjectives: { zh: '形容词', en: 'Adjectives', icon: '1f3a8', color: '#F76BA8', bg: '#FDE3EE', level: 4 },
  opposites: { zh: '反义词', en: 'Opposites', icon: '2194_fe0f', color: '#7048E8', bg: '#EAE2FD', level: 4 },
  sightwords: { zh: '常用词', en: 'Sight Words', icon: '1f4ac', color: '#1C7ED6', bg: '#E7F5FF', level: 4 },
  wordfamilies: { zh: '词族', en: 'Word Families', icon: '1f524', color: '#F59F00', bg: '#FFF3BF', level: 4 },
  digraphs: { zh: '自然拼读', en: 'Phonics', icon: '1f517', color: '#2F9E44', bg: '#EBFBEE', level: 4 },
  story: { zh: '故事词', en: 'Story Words', icon: '1f4d6', color: '#A61E4D', bg: '#FDEEF4', level: 4 },
  prepositions: { zh: '介词', en: 'Prepositions', icon: '1f9ed', color: '#364FC7', bg: '#EDF2FF', level: 4 },
  ordinals: { zh: '序数词', en: 'Ordinals', icon: '1f947', color: '#E8590C', bg: '#FFE8D9', level: 4 },
  subjects: { zh: '学科', en: 'Subjects', icon: '1f393', color: '#0CA678', bg: '#E6FCF5', level: 4 },
  mathwords: { zh: '数学词', en: 'Math Words', icon: '2795', color: '#5F3DC4', bg: '#EAE2FD', level: 4 },
  routine: { zh: '日常作息', en: 'Daily Routine', icon: '1f5d3_fe0f', color: '#E67700', bg: '#FFEEDD', level: 4 },
  greetings: { zh: '礼貌用语', en: 'Greetings', icon: '1f44b', color: '#C2255C', bg: '#FDEEF4', level: 4 },
  conversation: { zh: '小会话', en: 'Conversation', icon: '1f4e3', color: '#1971C2', bg: '#E7F5FF', level: 4 },
}

// 英文反馈语音
const FEEDBACK_EN = [
  { id: 'great_job', text: 'Great job!' },
  { id: 'try_again', text: 'Try again!' },
]
// 中文反馈/指令语音（数学、语文用）
const ZH_MISC = [
  { id: 'zh-great', text: '答对啦，真棒！' },
  { id: 'zh-try', text: '再想一想！' },
  { id: 'zh-awesome', text: '太厉害了！' },
  { id: 'zh-ok', text: '没关系，再试一次。' },
  { id: 'zh-plus', text: '加' },
  { id: 'zh-minus', text: '减' },
  { id: 'zh-times', text: '乘' },
  { id: 'zh-divided', text: '除以' },
  { id: 'zh-howmany', text: '等于几？' },
  { id: 'zh-equals', text: '等于' },
  { id: 'zh-ji', text: '几' },
  { id: 'zh-total', text: '一共有几个？' },
  { id: 'zh-more', text: '哪边的更多？' },
  { id: 'zh-less', text: '哪边的更少？' },
  { id: 'zh-bigger', text: '哪个数更大？' },
  { id: 'zh-smaller', text: '哪个数更小？' },
  { id: 'zh-missing', text: '缺少的数字是几？' },
  { id: 'zh-listen', text: '请听一听' },
  { id: 'zh-countit', text: '数一数' },
  { id: 'zh-choose', text: '请选一选' },
]

// 科目图标（主页三张卡片）
const SUBJECTS = {
  english: '1f34e',
  chinese: '1f4d6',
  math: '1f522',
}

const SVG_COLORS = ['#FF8C42', '#4D96FF', '#3BB273', '#F76BA8', '#9B5DE5', '#FFC94D', '#FF6B6B', '#4ECDC4', '#C77DFF', '#FF9F1C', '#5C7CFA', '#12B886']

for (const d of [AUDIO_DIR, IMG_DIR, ICON_DIR, DATA_DIR]) fs.mkdirSync(d, { recursive: true })

function escapeXML(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function readCSV(file) {
  const lines = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').trim().split(/\r?\n/).filter((l) => l.trim())
  if (lines[0].toLowerCase().startsWith('id,')) lines.shift()
  return lines.map((l) => {
    const [id, en, zh, phonetic, category, emoji, draw] = l.split(',')
    return { id, en, zh, phonetic, category, emoji: (emoji || '').trim(), draw: (draw || '').trim() }
  })
}

function readHanzi() {
  const lines = fs.readFileSync(path.join(ROOT, 'tools/hanzi.csv'), 'utf8').replace(/^\uFEFF/, '').trim().split(/\r?\n/).filter((l) => l.trim())
  if (lines[0].toLowerCase().startsWith('char,')) lines.shift()
  return lines.map((l) => {
    const [char, pinyin, word, level] = l.split(',')
    const cp = char.codePointAt(0).toString(16).padStart(4, '0')
    return { id: cp, char, pinyin, word, level: String(level).trim() }
  })
}

// ---------- TTS ----------
async function makeTTS(voices) {
  let lastErr
  for (const voice of voices) {
    try {
      const t = new MsEdgeTTS()
      await t.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
      return t
    } catch (e) { lastErr = e }
  }
  throw lastErr
}

async function speakWith(tts, text, outPath) {
  const { audioStream } = tts.toStream(text)
  const chunks = []
  for await (const c of audioStream) chunks.push(c)
  const buf = Buffer.concat(chunks)
  if (buf.length < 800) throw new Error(`音频过小 ${buf.length}B`)
  fs.writeFileSync(outPath, buf)
  return buf.length
}

/** 池：N 个 TTS 实例并发消费任务队列 */
async function ttsPool(label, voices, jobs, concurrency = 3) {
  let created = 0
  let idx = 0
  let done = 0
  async function worker(tts) {
    while (true) {
      const i = idx++
      if (i >= jobs.length) return
      const job = jobs[i]
      for (let attempt = 1; attempt <= 4; attempt++) {
        try {
          if (!tts) { tts = await makeTTS(voices); created++ }
          await speakWith(tts, job.text, job.out)
          break
        } catch (e) {
          tts = null
          if (attempt === 4) { console.log(`  ✗ ${label} ${job.id}: ${e.message}`); break }
          await new Promise((r) => setTimeout(r, 1200 * attempt))
        }
      }
      done++
      if (done % 50 === 0 || done === jobs.length) console.log(`  ${label} ${done}/${jobs.length}`)
    }
  }
  const instances = await Promise.all(Array.from({ length: concurrency }, () => null))
  await Promise.all(instances.map((t) => worker(t)))
  console.log(`  ${label} 完成（实例 ${created}）`)
}

// ---------- 图片 ----------
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
  // 国旗：区域指示符码点 → ISO 两位代码（1f1e8_1f1f3 → CN.png）
  const parts = code.split('_')
  const isRegional = (p) => { const v = parseInt(p, 16); return v >= 0x1f1e6 && v <= 0x1f1ff }
  if (parts.length === 2 && parts.every(isRegional)) {
    const cc = parts.map((p) => String.fromCharCode(0x41 + parseInt(p, 16) - 0x1f1e6)).join('')
    try {
      const res = await fetch(`${NOTO_FLAG_BASE}/${cc}.png`, { headers: { 'User-Agent': 'Mozilla/5.0' } })
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer())
        // 简单条纹国旗的 PNG 可能只有几百字节，阈值放宽到 100
        if (buf.length > 100 && buf[0] === 0x89) return buf
      }
    } catch { /* 落到 missing */ }
  }
  return null
}

function wordSVG(text, i) {
  const color = SVG_COLORS[i % SVG_COLORS.length]
  const t = escapeXML(text)
  const len = Math.max([...text].length, 1)
  // 单字符大字；长词按宽度压缩，中英混合按字符宽度估算
  const perChar = /[A-Za-z0-9' .!?-]/.test(text) ? 0.58 : 1.0
  const size = Math.min(280, Math.floor((380 / len) / perChar))
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect x="16" y="16" width="480" height="480" rx="110" fill="${color}"/>
  <rect x="34" y="34" width="444" height="444" rx="96" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="14"/>
  <text x="256" y="270" font-family="Arial, Helvetica, sans-serif" font-weight="bold" font-size="${size}" fill="#FFFFFF" text-anchor="middle" dominant-baseline="central">${t}</text>
</svg>`
}

async function main() {
  const words = readCSV(path.join(ROOT, 'tools/words.csv'))
  const hanzi = readHanzi()
  console.log(`英语词表 ${words.length} 词，语文识字 ${hanzi.length} 字\n`)

  // ---------- 任务清单 ----------
  const enJobs = []
  for (const w of words) {
    if (!FORCE && fs.existsSync(path.join(AUDIO_DIR, `${w.id}.mp3`))) continue
    enJobs.push({ id: w.id, text: w.en, out: path.join(AUDIO_DIR, `${w.id}.mp3`) })
  }
  for (const f of FEEDBACK_EN) {
    if (!FORCE && fs.existsSync(path.join(AUDIO_DIR, `${f.id}.mp3`))) continue
    enJobs.push({ id: f.id, text: f.text, out: path.join(AUDIO_DIR, `${f.id}.mp3`) })
  }

  const zhJobs = []
  for (const h of hanzi) {
    const charOut = path.join(AUDIO_DIR, `zh-${h.id}.mp3`)
    const wordOut = path.join(AUDIO_DIR, `zh-${h.id}w.mp3`)
    if (FORCE || !fs.existsSync(charOut)) zhJobs.push({ id: `zh-${h.id}`, text: h.char, out: charOut })
    if (FORCE || !fs.existsSync(wordOut)) zhJobs.push({ id: `zh-${h.id}w`, text: h.word, out: wordOut })
  }
  for (let n = 0; n <= 100; n++) {
    const out = path.join(AUDIO_DIR, `n${n}.mp3`)
    if (FORCE || !fs.existsSync(out)) zhJobs.push({ id: `n${n}`, text: String(n), out })
  }
  for (const m of ZH_MISC) {
    const out = path.join(AUDIO_DIR, `${m.id}.mp3`)
    if (FORCE || !fs.existsSync(out)) zhJobs.push({ id: m.id, text: m.text, out })
  }
  console.log(`待生成：英文音频 ${enJobs.length}，中文音频 ${zhJobs.length}\n`)

  if (enJobs.length) {
    console.log('== 英文 TTS ==')
    await ttsPool('EN', EN_VOICES, enJobs, 3)
  }
  if (zhJobs.length) {
    console.log('== 中文 TTS ==')
    await ttsPool('ZH', ZH_VOICES, zhJobs, 3)
  }

  // ---------- 图片 ----------
  const missing = []
  const emojiWords = words.filter((w) => w.emoji)
  const drawWords = words.filter((w) => !w.emoji && w.draw)
  let imgNew = 0, imgSkip = 0
  console.log(`\n== 图片：emoji ${emojiWords.length}，自绘 ${drawWords.length} ==`)

  async function fetchPool(jobs, concurrency, onDone) {
    let idx = 0
    async function worker() {
      while (true) {
        const i = idx++
        if (i >= jobs.length) return
        await jobs[i]()
        onDone?.()
      }
    }
    await Promise.all(Array.from({ length: concurrency }, worker))
  }

  // 自绘词卡（本地生成，快）
  drawWords.forEach((w, i) => {
    const out = path.join(IMG_DIR, `${w.id}.svg`)
    if (!FORCE && fs.existsSync(out)) { imgSkip++; return }
    fs.writeFileSync(out, wordSVG(w.draw, i))
    imgNew++
  })

  // emoji 图（并发 8 下载）
  const needImg = []
  for (const w of emojiWords) {
    const out = path.join(IMG_DIR, `${w.id}.png`)
    if (!FORCE && fs.existsSync(out)) { imgSkip++; continue }
    needImg.push(async () => {
      const buf = await fetchEmoji(w.emoji)
      if (buf) { fs.writeFileSync(out, buf); imgNew++ } else missing.push(`${w.id}(${w.emoji})`)
    })
  }
  for (const [id, meta] of Object.entries(CATEGORIES)) {
    const out = path.join(IMG_DIR, `cat-${id}.png`)
    if (!FORCE && fs.existsSync(out)) continue
    needImg.push(async () => {
      const buf = await fetchEmoji(meta.icon)
      if (buf) { fs.writeFileSync(out, buf); imgNew++ } else missing.push(`cat-${id}(${meta.icon})`)
    })
  }
  for (const lv of Object.values(LEVELS)) {
    const out = path.join(IMG_DIR, `level-${lv.id}.png`)
    if (!FORCE && fs.existsSync(out)) continue
    needImg.push(async () => {
      const buf = await fetchEmoji(lv.icon)
      if (buf) { fs.writeFileSync(out, buf); imgNew++ } else missing.push(`level-${lv.id}(${lv.icon})`)
    })
  }
  for (const [sid, code] of Object.entries(SUBJECTS)) {
    const out = path.join(IMG_DIR, `subject-${sid}.png`)
    if (!FORCE && fs.existsSync(out)) continue
    needImg.push(async () => {
      const buf = await fetchEmoji(code)
      if (buf) { fs.writeFileSync(out, buf); imgNew++ } else missing.push(`subject-${sid}(${code})`)
    })
  }
  const iconOut = path.join(ICON_DIR, 'icon.png')
  if (FORCE || !fs.existsSync(iconOut)) {
    needImg.push(async () => {
      const buf = await fetchEmoji('1f4da')
      if (buf) fs.writeFileSync(iconOut, buf)
      else missing.push('app-icon')
    })
  }
  await fetchPool(needImg, 8)
  console.log(`图片完成：新增 ${imgNew}，复用 ${imgSkip}`)

  // ---------- 数据 JSON ----------
  const levelList = Object.values(LEVELS).map((lv) => ({
    ...lv,
    icon: `/static/img/level-${lv.id}.png`,
  }))

  const categories = Object.entries(CATEGORIES).map(([id, meta]) => {
    const ws = words.filter((w) => w.category === id).map((w) => ({
      id: w.id,
      en: w.en,
      zh: w.zh,
      phonetic: w.phonetic || '',
      image: `/static/img/${w.id}.${w.emoji ? 'png' : 'svg'}`,
      audio: `/static/audio/${w.id}.mp3`,
      card: w.emoji ? 'emoji' : 'word',
    }))
    return {
      id, zh: meta.zh, en: meta.en, color: meta.color, bg: meta.bg, level: meta.level,
      icon: `/static/img/cat-${id}.png`, words: ws,
    }
  })

  fs.writeFileSync(path.join(DATA_DIR, 'words.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    levels: levelList,
    categories,
  }, null, 1))

  const hanziLevels = Object.values(LEVELS).map((lv) => ({
    id: lv.id, zh: lv.zh, color: lv.color, bg: lv.bg, icon: `/static/img/level-${lv.id}.png`,
    chars: hanzi.filter((h) => h.level === String(lv.id)).map((h) => ({
      id: h.id, char: h.char, pinyin: h.pinyin, word: h.word,
      audio: `/static/audio/zh-${h.id}.mp3`,
      wordAudio: `/static/audio/zh-${h.id}w.mp3`,
    })),
  }))
  fs.writeFileSync(path.join(DATA_DIR, 'hanzi.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    total: hanzi.length,
    levels: hanziLevels,
  }, null, 1))

  // ---------- 校验 ----------
  let bad = 0
  for (const w of words) {
    const img = path.join(STATIC_DIR, 'img', `${w.id}.${w.emoji ? 'png' : 'svg'}`)
    const aud = path.join(AUDIO_DIR, `${w.id}.mp3`)
    if (!fs.existsSync(img)) { console.log(`✗ 缺图片: ${w.id}`); bad++ }
    if (!fs.existsSync(aud)) { console.log(`✗ 缺音频: ${w.id}`); bad++ }
  }
  for (const h of hanzi) {
    if (!fs.existsSync(path.join(AUDIO_DIR, `zh-${h.id}.mp3`))) { console.log(`✗ 缺字音: ${h.char}`); bad++ }
    if (!fs.existsSync(path.join(AUDIO_DIR, `zh-${h.id}w.mp3`))) { console.log(`✗ 缺词音: ${h.word}`); bad++ }
  }
  for (let n = 0; n <= 100; n++) {
    if (!fs.existsSync(path.join(AUDIO_DIR, `n${n}.mp3`))) { console.log(`✗ 缺数字音: n${n}`); bad++ }
  }
  for (const m of ZH_MISC) {
    if (!fs.existsSync(path.join(AUDIO_DIR, `${m.id}.mp3`))) { console.log(`✗ 缺中文语音: ${m.id}`); bad++ }
  }
  for (const f of FEEDBACK_EN) {
    if (!fs.existsSync(path.join(AUDIO_DIR, `${f.id}.mp3`))) { console.log(`✗ 缺反馈音频: ${f.id}`); bad++ }
  }

  console.log('\n========== 汇总 ==========')
  for (const lv of levelList) {
    const n = categories.filter((c) => c.level === lv.id).reduce((s, c) => s + c.words.length, 0)
    console.log(`${lv.zh}: ${categories.filter((c) => c.level === lv.id).length} 分类 / ${n} 词`)
  }
  console.log(`语文: ${hanziLevels.map((l) => l.chars.length).join(' + ')} = ${hanzi.length} 字`)
  console.log('数据: src/data/words.json, src/data/hanzi.json')
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

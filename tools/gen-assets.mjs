/**
 * 资源生成脚本（多科目版）：
 *  输入 tools/words.csv（由 merge-words.mjs 合并） + tools/hanzi.csv
 *  输出：
 *   - static/audio/{id}.mp3        英文单词发音（Edge TTS，en-US 儿童音色）
 *   - static/audio-gb/{id}.mp3     英式发音（--gb 模式生成，en-GB 童声，文件名与美音一致）
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
import { ICONS, ICON_CATEGORY } from './icons/index.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const STATIC_DIR = path.join(ROOT, 'src/static')
const AUDIO_DIR = path.join(STATIC_DIR, 'audio')
const AUDIO_GB_DIR = path.join(STATIC_DIR, 'audio-gb')
// 启蒙英文词的中文配音单独目录：withAccent 只改写 /static/audio/，放这里不会被口音逻辑误伤
const AUDIO_ZH_DIR = path.join(STATIC_DIR, 'audio-zh')
const IMG_DIR = path.join(STATIC_DIR, 'img')
const ICON_DIR = path.join(STATIC_DIR, 'icons')
const DATA_DIR = path.join(ROOT, 'src/data')
const FORCE = process.argv.includes('--force')
// --gb：只生成英式发音音频（static/audio-gb/，与美音同名 mp3），不碰图片/数据
const GB_MODE = process.argv.includes('--gb')
// --shapes：只重画形状卡（几何图形，非文字），不跑 TTS、不改数据
const SHAPES_MODE = process.argv.includes('--shapes')
// --learn-zh：给中文词语课涉及的英文词补中文配音到 static/audio-zh/，不跑英文/图片/数据
const LEARN_ZH_MODE = process.argv.includes('--learn-zh')
// --zh-char：用同音字替身重生成汉字字音（读错的字换同音同调替身喂 TTS），不跑英文/图片/数据
const ZH_CHAR_MODE = process.argv.includes('--zh-char')

// 中文词语课的分类取舍是内容配置，与 validate-content 共用 curriculum.json 单一来源
const CURRICULUM = JSON.parse(fs.readFileSync(path.join(ROOT, 'content-packages/curriculum.json'), 'utf8'))
const ZH_WORD_SKIP = new Set(CURRICULUM.zhWords?.skipCategories || [])
const isZhWordCategory = (id) => !ZH_WORD_SKIP.has(id)

const NOTO_BASE = 'https://cdn.jsdelivr.net/gh/googlefonts/noto-emoji@v2.047/png/512'
// 国旗在 Noto 仓库里按 ISO 国家代码存放（CN.png），emoji 码点路径下没有
const NOTO_FLAG_BASE = 'https://cdn.jsdelivr.net/gh/googlefonts/noto-emoji@v2.047/third_party/region-flags/png'
const EN_VOICES = ['en-US-AnaNeural', 'en-US-JennyNeural']
// 英式对应童声 Maisie（≈Ana 的 en-GB 版），不可用时降级成年女声 Sonia
const EN_GB_VOICES = ['en-GB-MaisieNeural', 'en-GB-SoniaNeural']
const ZH_VOICES = ['zh-CN-XiaoxiaoNeural', 'zh-CN-XiaoyiNeural']

// 汉字字音注音表（tools/zh_pron_overrides.py 生成）：多音字裸读会错的字，
// 用「同音同调且使用实证无歧义」的替身字喂 TTS——音频里只有声音没有文字。
// Edge 免费端点拒收 phoneme/sub 等 SSML 注音标签（见 tools/phoneme-probe.mjs 探针），
// 同音字替身是端点原生可行的唯一注音方式。
const ZH_PRON_OVERRIDES = fs.existsSync(path.join(ROOT, 'tools/zh-pron-overrides.json'))
  ? JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/zh-pron-overrides.json'), 'utf8'))
  : {}
const zhCharText = (h) => ZH_PRON_OVERRIDES[h.char]?.sub || h.char

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

// 汉字例句表（tools/hanzi-sentences.csv）：char,sentence，句内只用全角标点
function readHanziSentences() {
  const file = path.join(ROOT, 'tools/hanzi-sentences.csv')
  const lines = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').trim().split(/\r?\n/)
  if (lines[0].toLowerCase().startsWith('char,')) lines.shift()
  const map = new Map()
  for (const l of lines) {
    const [char, sentence] = l.split(',')
    if (char && sentence) map.set(char.trim(), sentence.trim())
  }
  return map
}

// 字→图标映射（识字卡图文搭配）：char,NotoEmoji码点。没映射的字卡片回退纯文字排版。
function readHanziEmoji() {
  const file = path.join(ROOT, 'tools/hanzi-emoji.csv')
  if (!fs.existsSync(file)) return new Map()
  const lines = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').trim().split(/\r?\n/).filter((l) => l.trim())
  if (lines[0].toLowerCase().startsWith('char,')) lines.shift()
  const map = new Map()
  for (const l of lines) {
    const [char, emoji] = l.split(',')
    if (char && emoji) map.set(char.trim(), emoji.trim())
  }
  return map
}

// 小短句配图表（tools/hanzi-sentence-emoji.csv）：char,NotoEmoji码点。
// 图必须画句子本身（不是目标字）——「我们一起去公园」配公园，不是配「一」的手势。
function readHanziSentenceEmoji() {
  const file = path.join(ROOT, 'tools/hanzi-sentence-emoji.csv')
  if (!fs.existsSync(file)) return new Map()
  const lines = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').trim().split(/\r?\n/).filter((l) => l.trim())
  if (lines[0].toLowerCase().startsWith('char,')) lines.shift()
  const map = new Map()
  for (const l of lines) {
    const [char, emoji] = l.split(',')
    if (char && emoji) map.set(char.trim(), emoji.trim())
  }
  return map
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

/**
 * 形状几何卡：wordSVG 只会把传入的字符串画成文字，`draw=circle` 于是画出一张
 * 写着 "circle" 的色块——不识字的孩子完全看不出圆形。形状类必须画几何本体。
 * 图形统一白色，需要露出内部棱线的地方用卡片底色描边。
 */
const SHAPE_WHITE = '#FFFFFF'

function regularPoints(n, r, rotDeg = 0) {
  const pts = []
  for (let k = 0; k < n; k++) {
    const a = ((-90 + rotDeg + (360 * k) / n) * Math.PI) / 180
    pts.push(`${Math.round(256 + r * Math.cos(a))},${Math.round(256 + r * Math.sin(a))}`)
  }
  return pts.join(' ')
}

const SHAPE_KINDS = {
  circle: (c) => `<circle cx="256" cy="256" r="152" fill="${SHAPE_WHITE}"/>`,
  oval: () => `<ellipse cx="256" cy="256" rx="184" ry="116" fill="${SHAPE_WHITE}"/>`,
  square: () => `<rect x="112" y="112" width="288" height="288" rx="16" fill="${SHAPE_WHITE}"/>`,
  rectangle: () => `<rect x="70" y="168" width="372" height="176" rx="16" fill="${SHAPE_WHITE}"/>`,
  triangle: () => `<polygon points="${regularPoints(3, 172)}" fill="${SHAPE_WHITE}" stroke="${SHAPE_WHITE}" stroke-width="20" stroke-linejoin="round"/>`,
  diamond: () => `<polygon points="256,84 428,256 256,428 84,256" fill="${SHAPE_WHITE}" stroke="${SHAPE_WHITE}" stroke-width="18" stroke-linejoin="round"/>`,
  pentagon: () => `<polygon points="${regularPoints(5, 172)}" fill="${SHAPE_WHITE}" stroke="${SHAPE_WHITE}" stroke-width="18" stroke-linejoin="round"/>`,
  hexagon: () => `<polygon points="${regularPoints(6, 172, 30)}" fill="${SHAPE_WHITE}" stroke="${SHAPE_WHITE}" stroke-width="18" stroke-linejoin="round"/>`,
  cross: () => `<polygon points="198,84 314,84 314,198 428,198 428,314 314,314 314,428 198,428 198,314 84,314 84,198 198,198" fill="${SHAPE_WHITE}" stroke="${SHAPE_WHITE}" stroke-width="14" stroke-linejoin="round"/>`,
  arrow: () => `<polygon points="84,214 262,214 262,140 430,256 262,372 262,298 84,298" fill="${SHAPE_WHITE}" stroke="${SHAPE_WHITE}" stroke-width="14" stroke-linejoin="round"/>`,
  line: () => `<line x1="104" y1="338" x2="408" y2="174" stroke="${SHAPE_WHITE}" stroke-width="26" stroke-linecap="round"/><circle cx="104" cy="338" r="34" fill="${SHAPE_WHITE}"/><circle cx="408" cy="174" r="34" fill="${SHAPE_WHITE}"/>`,
  // 月牙：用卡片底色在实心圆上挖掉一块，因此挖空圆必须与底色同色
  crescent: (c) => `<circle cx="232" cy="256" r="156" fill="${SHAPE_WHITE}"/><circle cx="322" cy="212" r="136" fill="${c}"/>`,
  cube: (c) => `<polygon points="216,108 416,108 416,308 336,376 136,376 136,176" fill="${SHAPE_WHITE}"/><rect x="136" y="176" width="200" height="200" fill="none" stroke="${c}" stroke-width="12"/><polyline points="136,176 216,108 416,108 336,176 336,376" fill="none" stroke="${c}" stroke-width="12"/><line x1="336" y1="176" x2="416" y2="108" stroke="${c}" stroke-width="12"/>`,
  cone: () => `<polygon points="256,96 396,330 116,330" fill="${SHAPE_WHITE}"/><ellipse cx="256" cy="336" rx="140" ry="42" fill="${SHAPE_WHITE}"/>`,
}

function shapeSVG(kind, color) {
  const body = SHAPE_KINDS[kind](color)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect x="16" y="16" width="480" height="480" rx="110" fill="${color}"/>
  <rect x="34" y="34" width="444" height="444" rx="96" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="14"/>
  ${body}
</svg>`
}

/** 沿用该卡片已有的底色，重画时只有图形变化、颜色不跳 */
function existingColor(svgPath, fallback) {
  try {
    const m = fs.readFileSync(svgPath, 'utf8').match(/rx="110" fill="(#[0-9A-Fa-f]{6})"/)
    if (m) return m[1]
  } catch (e) { /* 首次生成 */ }
  return fallback
}

/**
 * 金/银心形卡：colors 其余 10 词都是 Noto 心形 emoji（三段色位图风），Noto 没有
 * 金银心形，这两个词才掉进 wordSVG 的文字卡路径。自绘的平涂+描边心与 Noto 造型
 * 不同族（孩子一眼看出不一致），因此取 Noto 黄心 SVG 源（tools/noto-heart.svg，
 * v2.047，Apache-2.0）整体换色：base/shade/light 与黄心三段色一一对应。
 */
const METAL_HEARTS = {
  // 金：琥珀金三段（Material Amber 系），比黄心 #FFCC32 更深更暖以拉开区分
  golden: { base: '#FFB300', shade: '#C77800', light: '#FFE082' },
  // 银：冷蓝灰三段（Material BlueGrey 系），与白心暖灰 #E0E0E0 拉开冷暖差
  silver: { base: '#B0BEC5', shade: '#78909C', light: '#E7EDF2' },
}

const NOTO_HEART_TEMPLATE = fs.readFileSync(path.join(ROOT, 'tools/noto-heart.svg'), 'utf8')

function heartSVG(kind) {
  const { base, shade, light } = METAL_HEARTS[kind]
  return NOTO_HEART_TEMPLATE.replaceAll('__BASE__', base).replaceAll('__SHADE__', shade).replaceAll('__LIGHT__', light)
}

/**
 * 水果自绘卡：李子/石榴/无花果/番石榴/木瓜/荔枝/龙眼在 Unicode/Noto 里没有
 * emoji（词表 emoji 列为空），只能掉文字卡——不识字的孩子认不出词。找相近
 * emoji 顶替=配错图（零容忍），所以按 Noto 扁平风手绘几何组合：透明底 +
 * 主体色块 + 高光 + 识别特征（石榴冠/木瓜切面/荔枝凸点/龙眼成串）。
 */
const FRUIT_BODIES = {
  plum: `
  <ellipse cx="252" cy="300" rx="150" ry="140" fill="#8E4585"/>
  <path d="M252 170 C246 224 244 262 252 302" stroke="#743A6C" stroke-width="10" fill="none" stroke-linecap="round" opacity="0.55"/>
  <path d="M250 168 C240 140 224 124 202 116" stroke="#7A5230" stroke-width="14" fill="none" stroke-linecap="round"/>
  <ellipse cx="308" cy="124" rx="60" ry="26" fill="#5FA052" transform="rotate(-16 308 124)"/>
  <ellipse cx="188" cy="248" rx="46" ry="30" fill="#FFFFFF" opacity="0.32" transform="rotate(-24 188 248)"/>`,
  pomegranate: `
  <circle cx="256" cy="304" r="146" fill="#D63B2F"/>
  <path d="M212 176 L220 116 L242 160 L256 106 L270 160 L292 116 L300 176 Z" fill="#A8271D"/>
  <ellipse cx="196" cy="262" rx="44" ry="30" fill="#FFFFFF" opacity="0.3" transform="rotate(-24 196 262)"/>`,
  fig: `
  <path d="M256 150 C168 168 128 248 146 330 C162 400 216 434 256 434 C296 434 350 400 366 330 C384 248 344 168 256 150 Z" fill="#6B3FA0"/>
  <path d="M228 156 C234 130 244 116 256 110 C268 116 278 130 284 156" stroke="#7CB342" stroke-width="16" fill="none" stroke-linecap="round"/>
  <circle cx="256" cy="414" r="14" fill="#4A2C74"/>
  <ellipse cx="206" cy="242" rx="40" ry="28" fill="#FFFFFF" opacity="0.3" transform="rotate(-20 206 242)"/>`,
  guava: `
  <circle cx="256" cy="300" r="142" fill="#A8C948"/>
  <circle cx="200" cy="282" r="10" fill="#8FB03A"/><circle cx="292" cy="332" r="10" fill="#8FB03A"/>
  <circle cx="312" cy="252" r="9" fill="#8FB03A"/><circle cx="230" cy="370" r="9" fill="#8FB03A"/>
  <path d="M256 164 C250 138 238 122 220 114" stroke="#7A5230" stroke-width="14" fill="none" stroke-linecap="round"/>
  <ellipse cx="312" cy="122" rx="58" ry="25" fill="#5FA052" transform="rotate(-14 312 122)"/>
  <ellipse cx="196" cy="256" rx="42" ry="28" fill="#FFFFFF" opacity="0.35" transform="rotate(-24 196 256)"/>`,
  papaya: `
  <ellipse cx="256" cy="272" rx="118" ry="176" fill="#8FB03A"/>
  <ellipse cx="256" cy="272" rx="106" ry="164" fill="#FFB13B"/>
  <ellipse cx="256" cy="286" rx="42" ry="86" fill="#3E2A1E"/>
  <ellipse cx="212" cy="182" rx="30" ry="20" fill="#FFFFFF" opacity="0.35" transform="rotate(-30 212 182)"/>`,
  lychee: `
  <circle cx="256" cy="300" r="140" fill="#E0505E"/>
  <circle cx="176" cy="300" r="12" fill="#C43E4B"/><circle cx="216" cy="236" r="12" fill="#C43E4B"/>
  <circle cx="286" cy="222" r="12" fill="#C43E4B"/><circle cx="344" cy="272" r="12" fill="#C43E4B"/>
  <circle cx="330" cy="344" r="12" fill="#C43E4B"/><circle cx="268" cy="392" r="12" fill="#C43E4B"/>
  <circle cx="196" cy="368" r="12" fill="#C43E4B"/><circle cx="258" cy="300" r="12" fill="#C43E4B"/>
  <path d="M256 166 C252 142 244 128 230 120" stroke="#7A5230" stroke-width="12" fill="none" stroke-linecap="round"/>
  <ellipse cx="318" cy="122" rx="52" ry="22" fill="#5FA052" transform="rotate(-12 318 122)"/>
  <ellipse cx="178" cy="134" rx="44" ry="19" fill="#6FB25C" transform="rotate(14 178 134)"/>
  <ellipse cx="206" cy="262" rx="36" ry="24" fill="#FFFFFF" opacity="0.25" transform="rotate(-24 206 262)"/>`,
  longan: `
  <path d="M256 96 C240 150 208 190 172 214 M256 96 C268 148 302 182 344 206 M256 96 C252 168 252 258 258 326" stroke="#7A5230" stroke-width="12" fill="none" stroke-linecap="round"/>
  <circle cx="168" cy="272" r="88" fill="#C09A5B"/>
  <circle cx="348" cy="264" r="86" fill="#B98E4F"/>
  <circle cx="260" cy="392" r="84" fill="#C9A063"/>
  <ellipse cx="140" cy="244" rx="26" ry="17" fill="#FFFFFF" opacity="0.3" transform="rotate(-24 140 244)"/>
  <ellipse cx="322" cy="236" rx="25" ry="16" fill="#FFFFFF" opacity="0.3" transform="rotate(-24 322 236)"/>
  <ellipse cx="234" cy="364" rx="24" ry="16" fill="#FFFFFF" opacity="0.3" transform="rotate(-24 234 364)"/>`,
}

function fruitSVG(kind) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${FRUIT_BODIES[kind]}
</svg>`
}

/**
 * 自绘判据按分类收紧：draw 值只有在"该词本身就是这个形状/颜色"时才可画。
 * sight words 里 sw-silver 的 draw 也是 silver，但它是要孩子认读的单词卡，画成心形就错了。
 */
const DRAW_CATEGORY = {
  ...Object.fromEntries(Object.keys(SHAPE_KINDS).map((k) => [k, 'shapes'])),
  ...Object.fromEntries(Object.keys(METAL_HEARTS).map((k) => [k, 'colors'])),
  ...Object.fromEntries(Object.keys(FRUIT_BODIES).map((k) => [k, 'fruits'])),
  ...ICON_CATEGORY,
}

/** 该词是否走语义自绘（几何形状/金属色心形/缺图清理图标）；否则只能画文字卡 */
function isDrawnCard(w) {
  const cat = DRAW_CATEGORY[w.draw]
  return !w.emoji && !!cat && w.category === cat
}

/** 自绘卡统一出口：--shapes 重画与常规生成路径共用，避免两处判据漂移 */
function drawnCardSVG(w) {
  if (ICONS[w.draw]) return ICONS[w.draw]
  const cat = DRAW_CATEGORY[w.draw]
  if (cat === 'colors') return heartSVG(w.draw)
  if (cat === 'fruits') return fruitSVG(w.draw)
  const out = path.join(IMG_DIR, `${w.id}.svg`)
  return shapeSVG(w.draw, existingColor(out, '#5C7CFA'))
}

async function main() {
  const words = readCSV(path.join(ROOT, 'tools/words.csv'))
  const hanzi = readHanzi()
  const hanziEmoji = readHanziEmoji()
  const hanziSentEmoji = readHanziSentenceEmoji()
  // 例句逐字必须齐且含目标字，缺一处就整体失败（内容零容错）
  const sentences = readHanziSentences()
  let sentenceBad = 0
  for (const h of hanzi) {
    const s = sentences.get(h.char)
    if (!s || !s.includes(h.char)) { console.log(`✗ 例句缺失或不含目标字: ${h.char}`); sentenceBad++; continue }
    h.sentence = s
  }
  if (sentenceBad) { console.log(`例句表问题 ${sentenceBad} 处，先修 tools/hanzi-sentences.csv`); process.exitCode = 1; return }
  // 小短句配图：开放级别（curriculum.zhSentences.levels）逐字必须有句意图，缺一个就失败
  const sentenceLevels = new Set((CURRICULUM.zhSentences?.levels || []).map(String))
  let sentImgBad = 0
  for (const h of hanzi) {
    const code = hanziSentEmoji.get(h.char)
    if (code) { h.sentenceEmoji = code; continue }
    if (sentenceLevels.has(h.level)) { console.log(`✗ 小短句缺配图映射: ${h.char}（${h.sentence}）`); sentImgBad++ }
  }
  if (sentImgBad) { console.log(`小短句配图表问题 ${sentImgBad} 处，先修 tools/hanzi-sentence-emoji.csv`); process.exitCode = 1; return }
  console.log(`英语词表 ${words.length} 词，语文识字 ${hanzi.length} 字\n`)

  // ---------- 自绘卡模式：只重画形状卡与金银心形卡，不跑 TTS、不改数据 ----------
  if (SHAPES_MODE) {
    let n = 0
    for (const w of words) {
      if (!isDrawnCard(w)) continue
      fs.writeFileSync(path.join(IMG_DIR, `${w.id}.svg`), drawnCardSVG(w))
      n++
    }
    console.log(`✓ 已重画自绘卡 ${n} 张（几何形状 + 金属色心形，非文字）`)
    return
  }

  // ---------- 中文词语配音：给中文词语课覆盖的词生成中文读音，不跑英文/图片/数据 ----------
  if (LEARN_ZH_MODE) {
    fs.mkdirSync(AUDIO_ZH_DIR, { recursive: true })
    const covered = words.filter((w) => isZhWordCategory(w.category))
    const jobs = []
    for (const w of covered) {
      const out = path.join(AUDIO_ZH_DIR, `${w.id}.mp3`)
      if (!FORCE && fs.existsSync(out)) continue
      jobs.push({ id: `zhw-${w.id}`, text: w.zh, out })
    }
    console.log(`== 中文词语配音（zh-CN）待生成：${jobs.length} / 共 ${covered.length} 词 ==`)
    if (jobs.length) await ttsPool('ZH-LEARN', ZH_VOICES, jobs, 3)
    let miss = 0
    for (const w of covered) {
      if (!fs.existsSync(path.join(AUDIO_ZH_DIR, `${w.id}.mp3`))) { console.log(`✗ 缺中文配音: ${w.id}（${w.zh}）`); miss++ }
    }
    if (miss) {
      console.log(`中文词语配音仍缺 ${miss} 个，请重跑 npm run gen:learn-zh`)
      process.exitCode = 1
    } else {
      console.log(`✓ ${covered.length} 词中文配音全部就绪`)
    }
    return
  }

  // ---------- 字音注音重生成：只重生成注音表命中的汉字字音，不碰例词/图片/数据 ----------
  if (ZH_CHAR_MODE) {
    const jobs = []
    for (const h of hanzi) {
      const sub = ZH_PRON_OVERRIDES[h.char]?.sub
      if (!sub) continue
      jobs.push({ id: `zh-${h.id}`, text: sub, out: path.join(AUDIO_DIR, `zh-${h.id}.mp3`), char: h.char })
    }
    console.log(`== 字音注音重生成（同音字替身）待生成：${jobs.length} ==`)
    jobs.forEach((j) => console.log(`   ${j.char} -> ${ZH_PRON_OVERRIDES[j.char].sub} (${j.id}.mp3)`))
    if (jobs.length) await ttsPool('ZH-CHAR', ZH_VOICES, jobs, 3)
    let miss = 0
    for (const j of jobs) {
      if (!fs.existsSync(j.out)) { console.log(`✗ 缺字音: ${j.out}`); miss++ }
    }
    if (miss) {
      console.log(`字音重生成仍缺 ${miss} 个，请重跑 npm run gen:zh-char`)
      process.exitCode = 1
    } else {
      console.log(`✓ ${jobs.length} 个字音已按注音表重生成`)
    }
    return
  }

  // ---------- 英式发音模式：只生成 audio-gb，不动图片与数据 ----------
  if (GB_MODE) {
    fs.mkdirSync(AUDIO_GB_DIR, { recursive: true })
    const jobs = []
    for (const w of words) {
      if (!FORCE && fs.existsSync(path.join(AUDIO_GB_DIR, `${w.id}.mp3`))) continue
      jobs.push({ id: w.id, text: w.en, out: path.join(AUDIO_GB_DIR, `${w.id}.mp3`) })
    }
    for (const f of FEEDBACK_EN) {
      if (!FORCE && fs.existsSync(path.join(AUDIO_GB_DIR, `${f.id}.mp3`))) continue
      jobs.push({ id: f.id, text: f.text, out: path.join(AUDIO_GB_DIR, `${f.id}.mp3`) })
    }
    console.log(`== 英式发音（en-GB）待生成：${jobs.length} ==`)
    if (jobs.length) await ttsPool('EN-GB', EN_GB_VOICES, jobs, 3)
    let miss = 0
    for (const w of words) {
      if (!fs.existsSync(path.join(AUDIO_GB_DIR, `${w.id}.mp3`))) { console.log(`✗ 缺英式音频: ${w.id}`); miss++ }
    }
    for (const f of FEEDBACK_EN) {
      if (!fs.existsSync(path.join(AUDIO_GB_DIR, `${f.id}.mp3`))) { console.log(`✗ 缺英式反馈音频: ${f.id}`); miss++ }
    }
    if (miss) {
      console.log(`英式音频缺失 ${miss} 个，请重跑 npm run gen:assets-gb 补齐`)
      process.exitCode = 1
    } else {
      console.log(`✓ 英式音频全部就绪（${words.length + FEEDBACK_EN.length} 个）`)
    }
    return
  }

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
    // 字音用注音表的替身字（多音字裸读会错的字，音频即正确读音）；例词是词语上下文，保持原文
    if (FORCE || !fs.existsSync(charOut)) zhJobs.push({ id: `zh-${h.id}`, text: zhCharText(h), out: charOut })
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

  // 自绘词卡（本地生成，快）；语义可画的画图形，其余画文字卡
  drawWords.forEach((w, i) => {
    const out = path.join(IMG_DIR, `${w.id}.svg`)
    if (!FORCE && fs.existsSync(out)) { imgSkip++; return }
    fs.writeFileSync(out, isDrawnCard(w) ? drawnCardSVG(w) : wordSVG(w.draw, i))
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
  // 识字卡图标（字→emoji 映射，并发下载）
  for (const h of hanzi) {
    const code = hanziEmoji.get(h.char)
    if (!code) continue
    const out = path.join(IMG_DIR, `hz-${h.id}.png`)
    if (!FORCE && fs.existsSync(out)) { imgSkip++; continue }
    needImg.push(async () => {
      const buf = await fetchEmoji(code)
      if (buf) { fs.writeFileSync(out, buf); imgNew++ } else missing.push(`hz-${h.id}(${h.char},${code})`)
    })
  }
  // 小短句配图（句意图标，与目标字图标分开命名，互不覆盖）
  for (const h of hanzi) {
    if (!h.sentenceEmoji) continue
    const out = path.join(IMG_DIR, `sent-${h.id}.png`)
    if (!FORCE && fs.existsSync(out)) { imgSkip++; continue }
    needImg.push(async () => {
      const buf = await fetchEmoji(h.sentenceEmoji)
      if (buf) { fs.writeFileSync(out, buf); imgNew++ } else missing.push(`sent-${h.id}(${h.char},${h.sentenceEmoji})`)
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
  // 小短句课程图标（说话气泡）：与分类图标同级，避免手放文件被 --force 冲掉
  {
    const out = path.join(IMG_DIR, 'cat-sentences.png')
    if (FORCE || !fs.existsSync(out)) {
      needImg.push(async () => {
        const buf = await fetchEmoji('1f4ac')
        if (buf) { fs.writeFileSync(out, buf); imgNew++ } else missing.push('cat-sentences(1f4ac)')
      })
    }
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
      // 中文词语课的中文读音路径只在覆盖分类上输出；validate-content 按此字段校验文件
      ...(isZhWordCategory(id) ? { zhAudio: `/static/audio-zh/${w.id}.mp3` } : {}),
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
      sentence: h.sentence,
      // 例句音频走 Azure 管线（tools/gen-zh-azure.mjs），不在本脚本生成
      sentenceAudio: `/static/audio/zh-${h.id}s.mp3`,
      // 句意图标：画句子本身，与目标字图标 emoji 分开（只开放级别有）
      sentenceEmoji: h.sentenceEmoji ? `/static/img/sent-${h.id}.png` : '',
      emoji: hanziEmoji.has(h.char) ? `/static/img/hz-${h.id}.png` : '',
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
    if (!fs.existsSync(path.join(AUDIO_DIR, `zh-${h.id}s.mp3`))) { console.log(`✗ 缺例句音: ${h.char}(${h.sentence})`); bad++ }
    if (h.sentenceEmoji && !fs.existsSync(path.join(IMG_DIR, `sent-${h.id}.png`))) { console.log(`✗ 缺例句配图: ${h.char}(${h.sentence})`); bad++ }
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

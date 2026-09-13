#!/usr/bin/env node
/**
 * 英语韵律 chant 生成器（Edge 免费端点，en-US-AnaNeural 儿童音色——
 * 与单词正典发音同一个音色，孩子听到的口音一致）。
 *
 * 每个英语分类生成一条 chant：取分类前 6 个词做「Word, word, word!」三连节奏
 * （经典 children chant 模式），落到 src/static/audio-chant/<catId>.mp3，
 * 并把清单写入 src/data/chants.json（learn 页只给清单里有的分类显示 🎵 按钮）。
 *
 * 用法：
 *   node tools/gen-chant.mjs           # 跳过已存在且 >1KB 的文件
 *   node tools/gen-chant.mjs --force   # 全部重生成
 *   node tools/gen-chant.mjs --only <catId>,<catId>
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'
import { writeFileAtomic } from './lib/fs-atomic.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = path.join(ROOT, 'src/static/audio-chant')
const MANIFEST = path.join(ROOT, 'src/data/chants.json')
const WORDS = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/words.json'), 'utf8'))

const VOICES = ['en-US-AnaNeural', 'en-US-JennyNeural'] // 与 gen-assets 的 EN_VOICES 同序：主 Ana，备 Jenny
const WORDS_PER_CHANT = 6 // 控制时长/体积：6 词三连 ≈ 18s ≈ 100KB，52 个分类全量 ~5MB

const argv = new Set(process.argv.slice(2))
const FORCE = argv.has('--force')
const ONLY = (() => {
  const i = process.argv.indexOf('--only')
  if (i < 0 || !process.argv[i + 1]) return null
  return new Set(process.argv[i + 1].split(',').map((s) => s.trim()).filter(Boolean))
})()

const exists = (p) => fs.existsSync(p) && fs.statSync(p).size > 1000

/** chant 文本：每个词三连（Cat, cat, cat!），词间留逗号给 TTS 换气，句尾感叹号给节奏。
 * 全大写缩写（PE/USA/TV/CD）与单字符（字母 A）三连保持原文——
 * 小写后 TTS 会把 PE 读成音节、把单写的 a 读成冠词 /ə/ 而不是字母名 /eɪ/ */
function chantText(words) {
  const picks = words.slice(0, WORDS_PER_CHANT).map((w) => w.en)
  // 逐词保护：单字符（字母 A）与全大写缩写（PE/USA/UK/TV）保持原样，
  // 其余小写——「the USA」这类多词条目只降普通词，不把缩写降成会被读成音节的「usa」
  const rep = (x) =>
    x
      .split(/\s+/)
      .map((t) => (t.length === 1 || t === t.toUpperCase() ? t : t.toLowerCase()))
      .join(' ')
  return picks.map((w) => `${w}, ${rep(w)}, ${rep(w)}!`).join(' ') + ' Hooray!'
}

async function makeTTS() {
  let lastErr
  for (const voice of VOICES) {
    try {
      const t = new MsEdgeTTS()
      await t.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
      return t
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr
}

async function speak(tts, text, outPath) {
  const { audioStream } = tts.toStream(text)
  const chunks = []
  for await (const c of audioStream) chunks.push(c)
  const buf = Buffer.concat(chunks)
  if (buf.length <= 1000) throw new Error(`生成内容过小（${buf.length}B）`)
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  const tmp = outPath + '.tmp'
  fs.writeFileSync(tmp, buf)
  fs.renameSync(tmp, outPath)
  return buf.length
}

async function main() {
  const cats = WORDS.categories.filter((c) => c.words?.length && (!ONLY || ONLY.has(c.id)))
  const jobs = cats.map((c) => ({ id: c.id, zh: c.zh, text: chantText(c.words), out: path.join(OUT_DIR, `${c.id}.mp3`) }))
  const todo = jobs.filter((j) => FORCE || !exists(j.out))
  console.log(`chant ${jobs.length} 条，待生成 ${todo.length} 条（voices=${VOICES.join('/')}）`)
  if (todo.length) {
    const tts = await makeTTS()
    let ok = 0
    for (const j of todo) {
      try {
        const n = await speak(tts, j.text, j.out)
        console.log(`  ✓ ${j.id}（${n}B）`)
        ok++
      } catch (e) {
        console.error(`  ✗ ${j.id}: ${e.message}`)
        process.exitCode = 1
      }
    }
    console.log(`生成完成：${ok}/${todo.length}`)
  }
  // 清单：只收真实存在的文件（learn 页据此决定是否显示 🎵）
  const chants = {}
  for (const j of jobs) {
    if (exists(j.out)) chants[j.id] = `/static/audio-chant/${j.id}.mp3`
  }
  writeFileAtomic(MANIFEST, JSON.stringify({ chants }, null, 2) + '\n')
  console.log(`✓ 清单已更新：${MANIFEST}（${Object.keys(chants).length} 条）`)
}

main().catch((e) => {
  console.error('生成失败：', e.message)
  process.exit(1)
})

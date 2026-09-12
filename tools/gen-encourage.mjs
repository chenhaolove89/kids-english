#!/usr/bin/env node
/**
 * 表扬语/鼓励语生成器（Edge 免费端点兜底）：
 * 生成 tools/zh-praise.mjs 清单里的 zh-*.mp3（与 Azure 正典管线同一音色 Xiaoyi），
 * 并把「确认存在且有效」的表扬语清单写入 src/data/encourage.json——
 * 运行时的鼓励语轮换池以这份清单为准，缺文件的短语不进池（不会 404 静音）。
 *
 * 有 AZURE_SPEECH_KEY 的机器请优先正典管线覆盖：
 *   npm run gen:zh-azure -- --misc --force
 *
 * 用法：
 *   node tools/gen-encourage.mjs            # 跳过已存在且 >1KB 的文件
 *   node tools/gen-encourage.mjs --force    # 全部重生成
 *   node tools/gen-encourage.mjs --manifest # 不生成音频，只按现状重写清单
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'
import { writeFileAtomic } from './lib/fs-atomic.mjs'
import { ZH_PRAISE } from './zh-praise.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const AUDIO_DIR = path.join(ROOT, 'src/static/audio')
const MANIFEST = path.join(ROOT, 'src/data/encourage.json')
const VOICE = 'zh-CN-XiaoyiNeural' // 与正典管线同音色：gen-assets/gen-zh-azure 均已统一到 Xiaoyi

const argv = new Set(process.argv.slice(2))
const FORCE = argv.has('--force')
const MANIFEST_ONLY = argv.has('--manifest')

const exists = (p) => fs.existsSync(p) && fs.statSync(p).size > 1000

async function makeTTS() {
  const t = new MsEdgeTTS()
  await t.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
  return t
}

async function speak(tts, text, outPath) {
  const { audioStream } = tts.toStream(text)
  const chunks = []
  for await (const c of audioStream) chunks.push(c)
  const buf = Buffer.concat(chunks)
  if (buf.length <= 1000) throw new Error(`生成内容过小（${buf.length}B），疑似空音频`)
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  // 先写临时再改名，避免半截文件被清单收录
  const tmp = outPath + '.tmp'
  fs.writeFileSync(tmp, buf)
  fs.renameSync(tmp, outPath)
  return buf.length
}

async function main() {
  if (!MANIFEST_ONLY) {
    const jobs = ZH_PRAISE.filter(([, text]) => Boolean(text)).map(([id, text]) => ({
      id,
      text,
      out: path.join(AUDIO_DIR, `${id}.mp3`),
    }))
    const todo = jobs.filter((j) => FORCE || !exists(j.out))
    console.log(`表扬语 ${jobs.length} 条，待生成 ${todo.length} 条（voice=${VOICE}）`)
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
    if (todo.length) console.log(`生成完成：${ok}/${todo.length}`)
  }

  // 清单：只收真实存在的文件（审计口径一致）
  const praise = []
  for (const [id] of ZH_PRAISE) {
    if (exists(path.join(AUDIO_DIR, `${id}.mp3`))) praise.push(id)
    else console.warn(`  ⚠ ${id} 缺文件，不进运行时轮换池（先跑生成，或在 Azure 机器上 gen:zh-azure --misc --force）`)
  }
  writeFileAtomic(MANIFEST, JSON.stringify({ praise }, null, 2) + '\n')
  console.log(`✓ 清单已更新：${MANIFEST}（${praise.length} 条）`)
}

main().catch((e) => {
  console.error('生成失败：', e.message)
  process.exit(1)
})

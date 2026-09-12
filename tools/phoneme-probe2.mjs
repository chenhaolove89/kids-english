/**
 * 探针第2轮:phoneme 被拒后,绘制 Edge 端点的 SSML 白名单,重点验证 <sub alias>:
 *  - sub-mao      「长」alias=猫 —— 机制探针:若生效,音频变成 māo(时长/字节明显不同)
 *  - sub-tongyin  「长」alias=常 —— 同音字方案:若生效,读 cháng(常的无歧义同音字)
 *  - sub-pinyin   「长」alias=cháng —— 拼音别名探针:若被当字母念,时长远超单字(5 个字母音)
 *  - break / say-as  摸底过滤器放行范围
 *  - phonene-nomstts  排除 mstts 命名空间声明导致的拒绝
 */
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

// 相对本文件定位仓库根：写死 E:/kids-english 换机即坏
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, '.tmp-phoneme2')
const VOICE = 'zh-CN-XiaoxiaoNeural'

const SSML = (inner, mstts = true) =>
  `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis"${mstts ? ' xmlns:mstts="https://www.w3.org/2001/mstts"' : ''} xml:lang="zh-CN"><voice name="${VOICE}">${inner}</voice></speak>`

const cases = [
  { id: 'bare', ssml: SSML('长') },
  { id: 'sub-mao', ssml: SSML('<sub alias="猫">长</sub>') },
  { id: 'sub-tongyin', ssml: SSML('<sub alias="常">长</sub>') },
  { id: 'sub-pinyin', ssml: SSML('<sub alias="cháng">长</sub>') },
  { id: 'break', ssml: SSML('<break time="200ms"/>长') },
  { id: 'say-as', ssml: SSML('<say-as interpret-as="cardinal">123</say-as>') },
  { id: 'phoneme-nomstts', ssml: SSML('<phoneme alphabet="sapi" ph="chang2">长</phoneme>', false) },
]

fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT, { recursive: true })

const tts = new MsEdgeTTS()
await tts.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)

const results = []
for (const c of cases) {
  const dir = path.join(OUT, c.id)
  fs.mkdirSync(dir, { recursive: true })
  try {
    const { audioFilePath } = await tts.rawToFile(dir, c.ssml)
    const buf = fs.readFileSync(audioFilePath)
    const target = path.join(dir, 'audio.mp3')
    if (audioFilePath !== target) fs.renameSync(audioFilePath, target)
    results.push({
      id: c.id,
      bytes: buf.length,
      ms: Math.round((buf.length * 8) / 48),
      md5: crypto.createHash('md5').update(buf).digest('hex').slice(0, 10),
    })
  } catch (e) {
    results.push({ id: c.id, error: String(e.message || e).slice(0, 100) })
  }
}

const bare = results.find((r) => r.id === 'bare')
console.log('case            | bytes |  ms  | md5       | vs bare')
for (const r of results) {
  if (r.error) {
    console.log(`${r.id.padEnd(15)} | ERROR: ${r.error}`)
    continue
  }
  const same = bare && !bare.error && r.md5 === bare.md5 ? 'SAME' : 'diff'
  console.log(
    `${r.id.padEnd(15)} | ${String(r.bytes).padStart(5)} | ${String(r.ms).padStart(4)} | ${r.md5} | ${r.id === 'bare' ? '(base)' : same}`
  )
}

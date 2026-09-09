/**
 * 方案A验证实验:Edge TTS 免费端点是否执行 SSML <phoneme> 标签?
 *
 * 对照设计(都听不了,靠音频字节/时长差异判定):
 *  - bare       裸文本「长」(对照组)
 *  - sapi-chang2  SAPI 注音 chang2(阴平外的二声,期望变 cháng)
 *  - sapi-zhang3  SAPI 注音 zhang3(期望读 zhǎng)
 *  - ipa-t2/ipa-t3  IPA 注音两声调
 *  - probe-mao  把「长」注成完全无关的音节 mao1 —— 若音频仍与 bare 相同,则注音被忽略;
 *               若差异明显(时长/字节都不同),则端点确实执行 phoneme
 *  - yinyue-bare / yinyue-yue4  词语级测试:「音乐」的乐默认常被读成 lè,注 yue4 看是否生效
 *
 * 判定口径:
 *  probe-mao 与 bare 不同  → phoneme 被执行(方案A可行)
 *  probe-mao 与 bare 相同  → phoneme 被忽略(方案A不可行,转方案B)
 */
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const OUT = 'E:/kids-english/.tmp-phoneme'
const VOICE = 'zh-CN-XiaoxiaoNeural'

const SSML = (inner) =>
  `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="zh-CN"><voice name="${VOICE}">${inner}</voice></speak>`
const SAPI = (p, t) => `<phoneme alphabet="sapi" ph="${p}">${t}</phoneme>`
const IPA = (p, t) => `<phoneme alphabet="ipa" ph="${p}">${t}</phoneme>`

const cases = [
  { id: 'bare', ssml: SSML('长') },
  { id: 'sapi-chang2', ssml: SSML(SAPI('chang2', '长')) },
  { id: 'sapi-chang2-space', ssml: SSML(SAPI('chang 2', '长')) },
  { id: 'sapi-zhang3', ssml: SSML(SAPI('zhang3', '长')) },
  { id: 'ipa-t2', ssml: SSML(IPA('ʈʂʰɑŋ˧˥', '长')) },
  { id: 'ipa-t3', ssml: SSML(IPA('ʈʂɑŋ˨˩˦', '长')) },
  { id: 'probe-mao', ssml: SSML(SAPI('mao1', '长')) },
  { id: 'yinyue-bare', ssml: SSML('音乐') },
  { id: 'yinyue-yue4', ssml: SSML('音' + SAPI('yue4', '乐')) },
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
      ms: Math.round((buf.length * 8) / 48), // 48kbps CBR
      md5: crypto.createHash('md5').update(buf).digest('hex').slice(0, 10),
    })
  } catch (e) {
    results.push({ id: c.id, error: String(e.message || e).slice(0, 120) })
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

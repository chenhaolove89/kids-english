import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { MPEGDecoder } from 'mpg123-decoder'

export const VOICES = { us: 'youyating', gb: 'youxiaoying' }
export const sha256 = (value) => createHash('sha256').update(value).digest('hex')
export function signatureInput(text) {
  const chars = Array.from(text)
  return chars.length <= 20 ? text : chars.slice(0, 10).join('') + chars.length + chars.slice(-10).join('')
}
export function fingerprint(text, voice) {
  return sha256(JSON.stringify({ provider: 'youdao-ttsapi-v3', text, voice, speed: '1', volume: '1.00', format: 'mp3' }))
}
export function credentials(root) {
  const env = { ...process.env }
  for (const name of ['.env.local', '.env']) {
    const file = path.join(root, name)
    if (!fs.existsSync(file)) continue
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = /^\s*(YOUDAO_APP_KEY|YOUDAO_APP_SECRET)\s*=\s*(.*?)\s*$/.exec(line)
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2')
    }
  }
  if (!env.YOUDAO_APP_KEY || !env.YOUDAO_APP_SECRET) throw new Error('请配置 YOUDAO_APP_KEY 和 YOUDAO_APP_SECRET')
  return { appKey: env.YOUDAO_APP_KEY, secret: env.YOUDAO_APP_SECRET }
}
export async function inspectAudio(bytes) {
  const decoder = new MPEGDecoder()
  await decoder.ready
  try {
    const result = decoder.decode(bytes)
    let peak = 0, sum = 0, count = 0
    for (const ch of result.channelData) for (const x of ch) {
      if (!Number.isFinite(x)) throw new Error('音频含无效采样')
      peak = Math.max(peak, Math.abs(x)); sum += x * x; count++
    }
    if (result.errors.length || !result.samplesDecoded || !count || peak < 0.001) throw new Error('音频解码失败或静音')
    return { duration: result.samplesDecoded / result.sampleRate, peak, rms: 10 * Math.log10(sum / count) }
  } finally { decoder.free() }
}
export async function synthesize(text, voice, auth, fetcher = fetch) {
  if (!text.trim() || Buffer.byteLength(text, 'utf8') > 2048) throw new Error('文本为空或超过 2048 UTF-8 字节')
  const salt = randomUUID(), curtime = String(Math.floor(Date.now() / 1000))
  const sign = sha256(auth.appKey + signatureInput(text) + salt + curtime + auth.secret)
  let response
  try {
    response = await fetcher('https://openapi.youdao.com/ttsapi', {
      method: 'POST', signal: AbortSignal.timeout(45000),
      body: new URLSearchParams({ q: text, appKey: auth.appKey, salt, curtime, sign, signType: 'v3', format: 'mp3', speed: '1', volume: '1.00', voiceName: voice }),
    })
  } catch { throw new Error('有道请求未完成，进度已缓存，请稍后续跑') }
  if (!response.ok || !/^audio\//i.test(response.headers.get('content-type') || '')) {
    let code = 'unknown'
    try { const body = await response.json(); if (/^\d+$/.test(String(body.errorCode))) code = String(body.errorCode) } catch {}
    // 不输出响应原文，避免上游回显凭据/签名。
    throw new Error(`有道调用失败 HTTP ${response.status}，errorCode=${code}${code === '401' ? '（余额不足）' : ''}`)
  }
  const bytes = Buffer.from(await response.arrayBuffer())
  const metrics = await inspectAudio(bytes)
  return { bytes, metrics }
}


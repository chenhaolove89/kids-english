#!/usr/bin/env node
/**
 * 有道 TTS 账号可用性检查（余额探针）。
 *
 * 为什么需要这个而不是在生成器里做预检：有道的 TTS 接口**不返回剩余额度**，也没有查余额的 API
 * （余额只能到有道智云控制台的费用中心看），欠费时只表现为调用返回 errorCode=401。
 * 生成器本身已经是「首个 401 立刻中止、不落盘、已成功的项有缓存」的全或无行为，
 * 所以这里做成一条显式命令：想在铺一大批音频前确认账号还能用，就跑它。
 *
 * 用法：npm run check:youdao
 * 成本：1 次 TTS 调用（用一段带时间戳的一次性短文本，不会命中历史缓存）。
 * 退出码：0=可用；1=不可用（打印 errorCode，401 即余额不足/欠费）。
 */
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { credentials, sha256, signatureInput, VOICES } from './lib/youdao-tts.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function main() {
  let auth
  try {
    auth = credentials(ROOT)
  } catch (e) {
    console.error(`✗ 读不到凭据：${e.message}`)
    process.exitCode = 1
    return
  }
  const text = `probe ${Date.now()}`
  const voice = VOICES.us
  const salt = randomUUID()
  const curtime = String(Math.floor(Date.now() / 1000))
  const sign = sha256(auth.appKey + signatureInput(text) + salt + curtime + auth.secret)
  const res = await fetch('https://openapi.youdao.com/ttsapi', {
    method: 'POST',
    signal: AbortSignal.timeout(45000),
    body: new URLSearchParams({
      q: text, appKey: auth.appKey, salt, curtime, sign,
      signType: 'v3', format: 'mp3', speed: '1', volume: '1.00', voiceName: voice,
    }),
  }).catch((e) => ({ networkError: e }))

  if (res.networkError) {
    console.error(`✗ 请求未完成（网络问题，不代表欠费）：${res.networkError.message}`)
    process.exitCode = 1
    return
  }
  const bytes = Buffer.from(await res.arrayBuffer())
  const isAudio = res.ok && /^audio\//i.test(res.headers.get('content-type') || '')
  if (isAudio) {
    // 响应头里没有任何 quota/balance 字段，所以这里只能给「可用」，给不出「还剩多少」
    console.log(`✓ 有道 TTS 可用：HTTP ${res.status}，返回音频 ${(bytes.length / 1024).toFixed(1)} KB（音色 ${voice}）`)
    console.log('  注意：该接口不返回剩余额度，也没有查余额的 API；精确余额请看有道智云控制台 → 费用中心。')
    console.log(`  凭据来源 appKey：${auth.appKey.slice(0, 6)}…（.env.local 或环境变量）`)
    return
  }
  let code = 'unknown'
  try {
    const body = JSON.parse(bytes.toString('utf8'))
    if (/^\d+$/.test(String(body.errorCode))) code = String(body.errorCode)
  } catch { /* 非 JSON */ }
  console.error(`✗ 有道 TTS 不可用：HTTP ${res.status}，errorCode=${code}${code === '401' ? '（余额不足/欠费）' : ''}`)
  console.error('  欠费请到有道智云控制台充值；生成器在首个 401 时会立刻中止且不改任何文件。')
  process.exitCode = 1
}

main().catch((e) => {
  console.error('检查异常：', e.message)
  process.exitCode = 1
})

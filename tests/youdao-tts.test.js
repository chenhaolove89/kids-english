import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { signatureInput, synthesize, fingerprint, VOICES, chantText, inspectAudio } from '../tools/lib/youdao-tts.mjs'
import { collectJobs, main } from '../tools/gen-en-youdao.mjs'

test('有道 v3 签名：20 字符边界、长文本与 Unicode 码点', () => {
  assert.equal(signatureInput('ear'), 'ear')
  assert.equal(signatureInput('01234567890123456789'), '01234567890123456789')
  assert.equal(signatureInput('0123456789Xabcdefghij'), '012345678921abcdefghij')
  assert.equal(signatureInput('😀'.repeat(21)), '😀'.repeat(10) + '21' + '😀'.repeat(10))
})

test('请求使用应用 ID 和密钥签名，voiceName 严格对应两种指定音色', async () => {
  assert.deepEqual(VOICES, { us: 'youyating', gb: 'youxiaoying' })
  // 使用既有有效音频作 HTTP mock，不调用付费接口。
  const bytes = fs.readFileSync(new URL('../src/static/audio/ear.mp3', import.meta.url))
  for (const voice of Object.values(VOICES)) {
    const { metrics } = await synthesize('0123456789Xabcdefghij', voice, { appKey: 'test-id', secret: 'test-secret' }, async (url, request) => {
      assert.equal(url, 'https://openapi.youdao.com/ttsapi')
      assert.equal(request.method, 'POST')
      const p = request.body
      assert.equal(p.get('appKey'), 'test-id')
      assert.equal(p.get('voiceName'), voice)
      assert.equal(p.get('speed'), '1')
      assert.equal(p.get('volume'), '1.00')
      assert.equal(p.get('signType'), 'v3')
      assert.equal(p.get('sign'), createHash('sha256').update('test-id012345678921abcdefghij' + p.get('salt') + p.get('curtime') + 'test-secret').digest('hex'))
      assert.ok(![...p.values()].includes('test-secret'))
      return new Response(bytes, { headers: { 'Content-Type': 'audio/mpeg' } })
    })
    assert.ok(metrics.duration > 0)
  }
})

test('HTTP 200 的欠费 JSON 不能误当成功，错误不回显敏感正文', async () => {
  await assert.rejects(synthesize('ear', VOICES.us, { appKey: 'id', secret: 'secret' }, async () =>
    new Response(JSON.stringify({ errorCode: '401', echo: 'sensitive-secret' }), { headers: { 'Content-Type': 'application/json' } })), (e) => {
    assert.match(e.message, /401.*余额不足/)
    assert.doesNotMatch(e.message, /sensitive-secret/)
    return true
  })
  await assert.rejects(inspectAudio(Buffer.from('not an mp3')), /解码失败/)
})

test('本地拒绝超长文本，不产生付费请求', async () => {
  let called = false
  await assert.rejects(synthesize('中'.repeat(683), VOICES.us, {}, async () => { called = true }), /2048/)
  assert.equal(called, false)
})

test('缓存区分大小写、口音和文本，保护字母 A 与冠词 a', () => {
  assert.notEqual(fingerprint('A', VOICES.us), fingerprint('a', VOICES.us))
  assert.notEqual(fingerprint('ear', VOICES.us), fingerprint('ear', VOICES.gb))
  assert.equal(fingerprint('ear', VOICES.us), fingerprint('ear', VOICES.us))
})

test('全量任务包含两套词音、反馈和在用韵律，排除中文数学且输出路径唯一', () => {
  const jobs = collectJobs()
  assert.ok(jobs.length > 3900)
  assert.equal(new Set(jobs.map(j => j.dest)).size, jobs.length)
  assert.equal(jobs.filter(j => j.accent === 'us').length, jobs.filter(j => j.accent === 'gb').length)
  assert.ok(jobs.some(j => j.text === 'Great job!' && j.accent === 'gb'))
  assert.ok(jobs.some(j => j.dest === 'src/static/audio-chant-gb/conversation.mp3'))
  assert.ok(jobs.some(j => j.id === 'a' && j.text === 'A'))
  assert.ok(jobs.every(j => !/\/(zh-|n\d)/.test(j.dest)))
})

test('错误选择参数应中止，不能意外扩大为全量付费生成', async () => {
  await assert.rejects(main(['--accent', 'az']), /只能是/)
  await assert.rejects(main(['--only']), /缺少/)
  await assert.rejects(main(['--only', 'does-not-exist', '--dry-run']), /没有匹配/)
  await assert.rejects(main(['--force']), /不支持参数/)
})

test('韵律文本保留字母缩写和会话问句', () => {
  assert.equal(chantText([{ en: 'A' }, { en: 'PE' }], 'alphabet'), 'A, A, A! PE, PE, PE! Hooray!')
  assert.equal(chantText([{ en: 'How are you' }], 'conversation'), 'How are you, how are you, how are you? Hooray!')
})

test('生成器：失败不替换正式音频；续跑复用成功项；重复发布不再调用 API', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kx-youdao-test-'))
  const bytes = fs.readFileSync(new URL('../src/static/audio/ear.mp3', import.meta.url))
  const data = { categories: [{ id: 'body', words: [
    { id: 'ear', en: 'ear', audio: '/static/audio/ear.mp3' },
    { id: 'another-ear', en: 'ear', audio: '/static/audio/another-ear.mp3' },
  ] }] }
  let calls = 0, fail = true
  const fetcher = async () => {
    calls++
    if (fail && calls === 2) return new Response('{"errorCode":"401"}', { headers: { 'Content-Type': 'application/json' } })
    return new Response(bytes, { headers: { 'Content-Type': 'audio/mpeg' } })
  }
  try {
    fs.mkdirSync(path.join(root, 'tools'))
    fs.mkdirSync(path.join(root, 'src/static/audio'), { recursive: true })
    fs.writeFileSync(path.join(root, '.env.local'), 'YOUDAO_APP_KEY=test-id\nYOUDAO_APP_SECRET=test-secret\n')
    const dest = path.join(root, 'src/static/audio/ear.mp3')
    fs.writeFileSync(dest, 'original-file')
    await assert.rejects(main(['--apply'], { root, data, fetcher }), /401/)
    assert.equal(fs.readFileSync(dest, 'utf8'), 'original-file')
    assert.equal(fs.existsSync(path.join(root, 'tools/youdao-audio-manifest.json')), false)
    const progressFile = path.join(root, 'tmp/youdao-en/progress.json')
    assert.equal(Object.keys(JSON.parse(fs.readFileSync(progressFile)).completed).length, 1)
    fail = false
    await main(['--apply'], { root, data, fetcher })
    assert.equal(calls, 5) // 首轮 1 成功 + 1 失败；续跑只补 3 个去重请求
    assert.deepEqual(fs.readFileSync(dest), bytes)
    const before = JSON.parse(fs.readFileSync(progressFile)).lastRequestAt
    fs.writeFileSync(dest, 'damaged-published-file')
    fs.unlinkSync(path.join(root, '.env.local'))
    await main(['--apply'], { root, data, fetcher })
    assert.equal(calls, 5)
    assert.equal(JSON.parse(fs.readFileSync(progressFile)).lastRequestAt, before)
    assert.deepEqual(fs.readFileSync(dest), bytes)
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'tools/youdao-audio-manifest.json')))
    assert.equal(Object.keys(manifest.files).length, 6)
    // 清掉临时音频和进度，仍应凭正式文件与来源清单恢复，不重新收费。
    const cacheDir = path.join(root, 'tmp/youdao-en')
    for (const name of fs.readdirSync(cacheDir)) {
      if (/^[a-f0-9]{64}\.mp3$/.test(name) || name === 'progress.json') fs.unlinkSync(path.join(cacheDir, name))
    }
    // 同文本的另一份正式文件丢失时，仍可从存活的副本复用。
    fs.unlinkSync(path.join(root, 'src/static/audio/another-ear.mp3'))
    await main(['--apply'], { root, data, fetcher })
    assert.equal(calls, 5)
    assert.equal(Object.keys(JSON.parse(fs.readFileSync(progressFile)).completed).length, 4)
  } finally {
    const resolved = path.resolve(root)
    assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith('kx-youdao-test-'))
    fs.rmSync(resolved, { recursive: true, force: true })
  }
})

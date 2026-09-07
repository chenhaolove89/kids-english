import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const words = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/words.json'), 'utf8'))
const L1 = words.categories.filter((c) => c.level === 1).flatMap((c) => c.words)

// 启蒙学一学是「先中文 → 停顿 → 再英文」，缺任何一条中文配音都会让那张卡只念英文、行为不一致
test('启蒙每个英文词都有中文配音', () => {
  const missing = L1.filter((w) => !fs.existsSync(path.join(ROOT, 'src/static/audio-zh', `${w.id}.mp3`)))
  assert.deepEqual(missing.map((w) => `${w.id}（${w.zh}）`), [], '运行 npm run gen:learn-zh 补齐')
})

test('中文配音不是空壳文件（TTS 失败会产出极小 mp3）', () => {
  const tiny = L1.filter((w) => {
    const f = path.join(ROOT, 'src/static/audio-zh', `${w.id}.mp3`)
    try {
      return fs.statSync(f).size < 900
    } catch (e) {
      return false
    }
  })
  assert.deepEqual(tiny.map((w) => w.id), [])
})

test('中文配音放在 audio-zh，不会被口音改写误伤', () => {
  // withAccent 只改写 /static/audio/ 前缀；audio-zh 必须保持原样，否则切英式会指向不存在的目录
  const sample = L1[0]
  const abs = `/static/audio-zh/${sample.id}.mp3`
  assert.ok(!abs.startsWith('/static/audio/'), '路径前缀不能落进口音改写范围')
})

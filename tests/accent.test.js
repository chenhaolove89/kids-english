import { test } from 'node:test'
import assert from 'node:assert/strict'
import { withAccent } from '../src/platform/assets.js'

test('英式口音：英文词/反馈音重写到 audio-gb 目录', () => {
  assert.equal(withAccent('/static/audio/red.mp3', 'gb'), '/static/audio-gb/red.mp3')
  assert.equal(withAccent('/static/audio/watermelon.mp3', 'gb'), '/static/audio-gb/watermelon.mp3')
  assert.equal(withAccent('/static/audio/great_job.mp3', 'gb'), '/static/audio-gb/great_job.mp3')
})

test('美式口音（默认）：路径一律原样', () => {
  assert.equal(withAccent('/static/audio/red.mp3', 'us'), '/static/audio/red.mp3')
  assert.equal(withAccent('/static/audio/red.mp3', undefined), '/static/audio/red.mp3')
})

test('语文/数学音频即使误传也绝不改写', () => {
  // 语文：zh- 前缀（字音/例词/指令语）
  assert.equal(withAccent('/static/audio/zh-4e91.mp3', 'gb'), '/static/audio/zh-4e91.mp3')
  assert.equal(withAccent('/static/audio/zh-great.mp3', 'gb'), '/static/audio/zh-great.mp3')
  // 数学：n数字（数读）
  assert.equal(withAccent('/static/audio/n9.mp3', 'gb'), '/static/audio/n9.mp3')
  assert.equal(withAccent('/static/audio/n100.mp3', 'gb'), '/static/audio/n100.mp3')
  // 语文码点命名（四位十六进制，数字开头）
  assert.equal(withAccent('/static/audio/4e91.mp3', 'gb'), '/static/audio/4e91.mp3')
})

test('非法输入原样返回：空值/外链不重写', () => {
  assert.equal(withAccent('', 'gb'), '')
  assert.equal(withAccent(null, 'gb'), null)
  assert.equal(withAccent(undefined, 'gb'), undefined)
  assert.equal(withAccent('https://cdn.example.com/red.mp3', 'gb'), 'https://cdn.example.com/red.mp3')
})

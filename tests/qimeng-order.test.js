import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getQimengAudioOrder, setQimengAudioOrder } from '../src/content/lowAge.js'

test('启蒙读音顺序：默认先中后英；写入后读取一致；非法值回退默认', () => {
  assert.equal(getQimengAudioOrder(), 'zh-first', '从未设置过 → 先中文后英文')
  setQimengAudioOrder('en-first')
  assert.equal(getQimengAudioOrder(), 'en-first')
  setQimengAudioOrder('nonsense')
  assert.equal(getQimengAudioOrder(), 'zh-first', '非法值回退先中后英')
  setQimengAudioOrder('zh-first')
  assert.equal(getQimengAudioOrder(), 'zh-first')
})

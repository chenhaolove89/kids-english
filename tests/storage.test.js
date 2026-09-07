import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createStorage, memoryBackend, SCHEMA_VERSION } from '../src/platform/storage.js'

test('set/get/remove 基本读写', () => {
  const st = createStorage({ backend: memoryBackend() })
  st.set('foo', { a: 1, b: ['x'] })
  assert.deepEqual(st.get('foo', null), { a: 1, b: ['x'] })
  st.remove('foo')
  assert.equal(st.get('foo', null), null)
})

test('键不存在返回 fallback', () => {
  const st = createStorage({ backend: memoryBackend() })
  assert.equal(st.get('nope', 'dft'), 'dft')
  assert.equal(st.get('nope'), null)
})

test('损坏数据（非法 JSON）容错返回 fallback，不抛错', () => {
  const be = memoryBackend()
  be.set('kx:bad', '{not-json!!!')
  const st = createStorage({ backend: be })
  assert.equal(st.get('bad', 'fallback'), 'fallback')
})

test('结构异常（缺版本号/非对象包装）返回 fallback', () => {
  const be = memoryBackend()
  be.set('kx:n1', JSON.stringify({ noVersion: true }))
  be.set('kx:n2', JSON.stringify('bare string'))
  be.set('kx:n3', JSON.stringify({ v: 'x', d: 1 }))
  const st = createStorage({ backend: be })
  assert.equal(st.get('n1', 'fb'), 'fb')
  assert.equal(st.get('n2', 'fb'), 'fb')
  assert.equal(st.get('n3', 'fb'), 'fb')
})

test('迁移链：v0 旧负载升级到当前版本', () => {
  const be = memoryBackend()
  be.set('kx:legacy', JSON.stringify({ v: 0, d: { old: 'data' } }))
  const st = createStorage({ backend: be })
  assert.deepEqual(st.get('legacy', null), { old: 'data' })
})

test('未来版本数据不认识，安全放弃返回 fallback', () => {
  const be = memoryBackend()
  be.set('kx:future', JSON.stringify({ v: SCHEMA_VERSION + 5, d: { x: 1 } }))
  const st = createStorage({ backend: be })
  assert.equal(st.get('future', 'fb'), 'fb')
})

test('写入失败（后端抛错）返回 false 不炸调用方', () => {
  const be = memoryBackend()
  be.set = () => {
    throw new Error('quota exceeded')
  }
  const st = createStorage({ backend: be })
  assert.equal(st.set('k', { v: 1 }), false)
})

test('读取失败（后端 get 抛错）容错返回 fallback', () => {
  const be = memoryBackend()
  be.get = () => {
    throw new Error('boom')
  }
  const st = createStorage({ backend: be })
  assert.equal(st.get('anything', 'fb'), 'fb')
})

test('prefix 隔离命名空间', () => {
  const be = memoryBackend()
  const a = createStorage({ backend: be, prefix: 'app1' })
  const b = createStorage({ backend: be, prefix: 'app2' })
  a.set('k', 'from-a')
  assert.equal(b.get('k', 'none'), 'none')
  assert.equal(a.get('k', 'none'), 'from-a')
})

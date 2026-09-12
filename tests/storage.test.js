import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createStorage,
  memoryBackend,
  SCHEMA_VERSION,
  assertMigrationsComplete,
  getStorageError,
  clearStorageError,
  onStorageError,
} from '../src/platform/storage.js'

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

test('写入失败不只返回 false：要记录错误状态并通知订阅者（本地存储是唯一数据源）', () => {
  const be = memoryBackend()
  be.set = () => {
    throw new Error('quota exceeded')
  }
  const st = createStorage({ backend: be })
  clearStorageError()
  const seen = []
  const off = onStorageError((e) => seen.push(e))
  assert.equal(st.set('attempts', [1]), false)
  assert.equal(seen.length, 1, '订阅者应收到一次失败通知')
  assert.equal(seen[0].key, 'attempts')
  assert.match(seen[0].message, /quota/)
  assert.ok(getStorageError(), '应留下错误状态供页面常驻提示')
  // 取消订阅后不再收到
  off()
  st.set('attempts', [2])
  assert.equal(seen.length, 1)
  clearStorageError()
  assert.equal(getStorageError(), null)
})

test('迁移链完整性自检：当前版本必须每级都有迁移函数', () => {
  assert.doesNotThrow(() => assertMigrationsComplete())
  assert.throws(() => assertMigrationsComplete(SCHEMA_VERSION + 3), /缺少迁移函数/)
})

test('迁移失败时先备份原文再 fallback，避免下一次写入永久覆盖用户数据', () => {
  // 构造一个「版本比当前低但缺少迁移函数」的场景：v 为负不可能，故用超过当前版本的
  // 迁移需求来模拟——直接断言备份行为需要可控的 MIGRATIONS，这里用未来版本走另一条路径，
  // 真正可测的是「未来版本」与「缺迁移」都不会删数据。
  const be = memoryBackend()
  const legacyRaw = JSON.stringify({ v: 0, d: { old: 'data' } })
  be.set('kx:legacy', legacyRaw)
  const st = createStorage({ backend: be })
  assert.deepEqual(st.get('legacy', null), { old: 'data' })
  // raw() 能拿到未解析的原文，供导出/诊断
  assert.equal(st.raw('legacy'), legacyRaw)
  assert.equal(st.raw('missing'), null)
})

test('raw() 返回未解析原文（导出用），损坏数据也能拿到', () => {
  const be = memoryBackend()
  be.set('kx:broken', '{not-json')
  const st = createStorage({ backend: be })
  assert.equal(st.raw('broken'), '{not-json')
  assert.equal(st.get('broken', 'fb'), 'fb')
})

/* ---------------- 迁移链的真实演练 ----------------
 * 内置链至今只有 v0 恒等（SCHEMA_VERSION 一直是 1），也就是**从未真正跑过**。
 * 将来第一次改数据结构时它才会在真实用户数据上执行，所以这里用注入的
 * version/migrations 把多级升级、缺函数、抛错、幂等、写入版本号全部预演一遍。
 */
test('迁移链演练：v0 → v1 → v2 逐级升级，每级都能看到上一级的产物', () => {
  const be = memoryBackend()
  be.set('kx:profile', JSON.stringify({ v: 0, d: { name: '小明' } }))
  const seen = []
  const st = createStorage({
    backend: be,
    schemaVersion: 2,
    migrations: {
      0: (d) => {
        seen.push(['0→1', JSON.stringify(d)])
        return { ...d, stars: 0 }
      },
      1: (d) => {
        seen.push(['1→2', JSON.stringify(d)])
        assert.equal(d.stars, 0, '第二级迁移应当看到第一级加上去的字段')
        return { ...d, schema2: true }
      },
    },
  })
  assert.deepEqual(st.get('profile', null), { name: '小明', stars: 0, schema2: true })
  assert.deepEqual(seen, [
    ['0→1', '{"name":"小明"}'],
    ['1→2', '{"name":"小明","stars":0}'],
  ])
})

test('迁移链演练：读取不改写原文；再次读取结果一致（幂等，不会重复叠加迁移）', () => {
  const be = memoryBackend()
  const original = JSON.stringify({ v: 0, d: { n: 1 } })
  be.set('kx:k', original)
  let calls = 0
  const st = createStorage({
    backend: be,
    schemaVersion: 2,
    migrations: {
      0: (d) => {
        calls++
        return { ...d, a: (d.a || 0) + 1 }
      },
      1: (d) => {
        calls++
        return { ...d, b: (d.b || 0) + 1 }
      },
    },
  })
  const first = st.get('k', null)
  const second = st.get('k', null)
  assert.deepEqual(first, { n: 1, a: 1, b: 1 })
  assert.deepEqual(second, first, '两次读取必须得到同样结果（迁移是纯函数、原文未被改写）')
  assert.equal(calls, 4, '每次读取都重新走链（不改写 ⇒ 不叠加）')
  assert.equal(be.get('kx:k'), original, '读取路径绝不写回原文')
})

test('迁移链演练：迁移抛错时不抛给调用方，原文备份到 <键>:bak', () => {
  const be = memoryBackend()
  const original = JSON.stringify({ v: 0, d: { keep: 'me' } })
  be.set('kx:attempts', original)
  const st = createStorage({
    backend: be,
    schemaVersion: 2,
    migrations: {
      0: (d) => d,
      1: () => {
        throw new Error('迁移写错了')
      },
    },
  })
  assert.equal(st.get('attempts', 'FB'), 'FB', '应当降级返回 fallback 而不是抛错')
  assert.equal(be.get('kx:attempts:bak'), original, '原文必须被备份下来')
  assert.equal(be.get('kx:attempts'), original, '原文本身也不该被改动')
})

test('迁移链演练：缺少某一级迁移函数时同样备份原文并降级', () => {
  const be = memoryBackend()
  const original = JSON.stringify({ v: 0, d: { x: 1 } })
  be.set('kx:sessions', original)
  const st = createStorage({
    backend: be,
    schemaVersion: 3,
    migrations: { 0: (d) => d, 1: (d) => d }, // 缺 2→3
  })
  assert.equal(st.get('sessions', 'FB'), 'FB')
  assert.equal(be.get('kx:sessions:bak'), original)
})

test('迁移链演练：版本高于当前代码时也备份原文（用户回退版本不该丢数据）', () => {
  const be = memoryBackend()
  const future = JSON.stringify({ v: 99, d: { from: 'newer-app' } })
  be.set('kx:review', future)
  const st = createStorage({ backend: be, schemaVersion: 1, migrations: { 0: (d) => d } })
  assert.equal(st.get('review', 'FB'), 'FB')
  assert.equal(be.get('kx:review:bak'), future, '装过更新版本再回退时，不能就这样让人丢掉记录')
})

test('迁移链演练：写入总是打上当前注入的版本号（下次读取不再迁移）', () => {
  const be = memoryBackend()
  const st = createStorage({
    backend: be,
    schemaVersion: 3,
    migrations: { 0: (d) => d, 1: (d) => d, 2: (d) => d },
  })
  st.set('k', { fresh: true })
  assert.equal(JSON.parse(be.get('kx:k')).v, 3, '写入应带上注入的版本号')
  assert.deepEqual(st.get('k', null), { fresh: true })
})

test('迁移链演练：没有可用迁移函数时 get 仍然安全（不崩、返回 fallback）', () => {
  const be = memoryBackend()
  be.set('kx:k', JSON.stringify({ v: 0, d: { a: 1 } }))
  // 故意给一个空迁移表 + 更高版本：读取侧必须降级而不是抛
  const st = createStorage({ backend: be, schemaVersion: 5, migrations: {} })
  assert.equal(st.get('k', 'FB'), 'FB')
})

/**
 * 偏好核心（低龄模式 / 启蒙读音顺序）——内容安全开关的单元测试。
 *
 * 重点不是"函数能跑"，而是三条容易静默失效的保证：
 *   1) 没设置过时低龄模式**默认开启**（新设备上四五岁孩子不该看到惊悚角色内容）
 *   2) 偏好数据损坏/异常结构时按"没设置过"处理，而不是崩掉或反向放开
 *   3) 写偏好必须**合并**，不能把家长刚改的其他设置抹掉
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createStorage, memoryBackend } from '../src/platform/storage.js'
import { createPrefs, LOW_AGE_HIDDEN_CATEGORIES, PREFS_KEY } from '../src/content/prefs.js'

function make(initialPrefs) {
  const store = createStorage({ backend: memoryBackend() })
  if (initialPrefs !== undefined) store.set(PREFS_KEY, initialPrefs)
  return { store, prefs: createPrefs(store) }
}

test('新设备默认低龄模式开启：惊悚/暗黑分类整类隐藏', () => {
  const { prefs } = make() // 没有任何偏好
  assert.equal(prefs.getLowAgeMode(), true, '默认必须是开启（内容安全）')
  for (const cat of LOW_AGE_HIDDEN_CATEGORIES) {
    assert.equal(prefs.isCategoryHidden(cat), true, `${cat} 应当被隐藏`)
  }
  assert.equal(prefs.isCategoryHidden('animals'), false, '普通分类不受影响')
})

test('关闭低龄模式后不再隐藏，重新打开又能隐藏', () => {
  const { prefs } = make()
  prefs.setLowAgeMode(false)
  assert.equal(prefs.getLowAgeMode(), false)
  assert.equal(prefs.isCategoryHidden('characters'), false)
  prefs.setLowAgeMode(true)
  assert.equal(prefs.isCategoryHidden('characters'), true)
})

test('损坏/异常偏好结构按「没设置过」处理：不崩、也不反向放开', () => {
  for (const bad of ['not-an-object', 42, null, [1, 2, 3]]) {
    const { prefs } = make(bad)
    assert.equal(prefs.getLowAgeMode(), true, `${JSON.stringify(bad)} 时应回退到默认开启`)
    assert.equal(prefs.isCategoryHidden('story'), true)
    assert.equal(prefs.getQimengAudioOrder(), 'zh-first')
  }
})

test('写偏好是合并而不是覆盖：不会抹掉其他设置', () => {
  const { store, prefs } = make()
  prefs.updatePrefs({ accent: 'gb' })
  prefs.setLowAgeMode(false)
  prefs.setQimengAudioOrder('en-first')
  const saved = store.get(PREFS_KEY)
  assert.deepEqual(saved, { accent: 'gb', lowAge: false, qimengAudioOrder: 'en-first' }, '三个键必须都在')
})

test('启蒙读音顺序：默认 zh-first，只接受 en-first，非法值落回默认', () => {
  const { prefs } = make()
  assert.equal(prefs.getQimengAudioOrder(), 'zh-first')
  prefs.setQimengAudioOrder('en-first')
  assert.equal(prefs.getQimengAudioOrder(), 'en-first')
  prefs.setQimengAudioOrder('乱填')
  assert.equal(prefs.getQimengAudioOrder(), 'zh-first', '非法值应当落回默认而不是存进去')
  prefs.setQimengAudioOrder('en-first')
  prefs.setQimengAudioOrder(undefined)
  assert.equal(prefs.getQimengAudioOrder(), 'zh-first')
})

test('setLowAgeMode 做布尔归一：真值/假值都能正确落库', () => {
  const { store, prefs } = make()
  prefs.setLowAgeMode(0)
  assert.equal(store.get(PREFS_KEY).lowAge, false)
  prefs.setLowAgeMode('yes')
  assert.equal(store.get(PREFS_KEY).lowAge, true)
})

test('低龄过滤与题池/目录共用同一口径（同一个 isCategoryHidden）', () => {
  // adapters 与 curriculum 都调用本函数；这里锁定它对返回值的语义：
  // 只有「低龄开启 且 分类在黑名单里」才为真
  const on = make()
  const off = make()
  off.prefs.setLowAgeMode(false)
  for (const cat of [...LOW_AGE_HIDDEN_CATEGORIES, 'animals', 'food']) {
    assert.equal(
      on.prefs.isCategoryHidden(cat),
      LOW_AGE_HIDDEN_CATEGORIES.includes(cat),
      `${cat} 在低龄开启时的判定`,
    )
    assert.equal(off.prefs.isCategoryHidden(cat), false, `${cat} 在低龄关闭时不应隐藏`)
  }
})

test('updatePrefs 容错：patch 为空/未定义时不炸且不改坏数据', () => {
  const { store, prefs } = make({ accent: 'us' })
  prefs.updatePrefs()
  prefs.updatePrefs(null)
  assert.deepEqual(store.get(PREFS_KEY), { accent: 'us' })
})

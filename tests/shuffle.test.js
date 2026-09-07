import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shuffle, pickOne, pickOneExcept } from '../src/domain/shuffle.js'

// 确定性 rng：依次吐出给定序列，用于固定随机结果
function seqRng(values) {
  let i = 0
  return () => values[i++ % values.length]
}

test('shuffle 返回同元素新数组，不改动原数组', () => {
  const src = [1, 2, 3, 4, 5]
  const out = shuffle(src, seqRng([0]))
  assert.deepEqual([...src].sort(), [...out].sort())
  assert.notEqual(src, out)
})

test('pickOne 按注入序列取值，空数组返回 undefined', () => {
  assert.equal(pickOne(['a', 'b', 'c'], seqRng([0.99])), 'c')
  assert.equal(pickOne(['a', 'b', 'c'], seqRng([0.0])), 'a')
  assert.equal(pickOne([], Math.random), undefined)
})

test('pickOneExcept 避开上一把结果，不重样', () => {
  const pool = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  // rng=0 恒取过滤后池的第一个：排除 'a' 后必取 'b'
  assert.equal(pickOneExcept(pool, 'a', (x) => x.id, seqRng([0])).id, 'b')
})

test('pickOneExcept 只剩一个可取时退回全量池，永不落空', () => {
  const pool = [{ id: 'only' }]
  assert.equal(pickOneExcept(pool, 'only', (x) => x.id, Math.random).id, 'only')
  const two = [{ id: 'a' }, { id: 'b' }]
  // 常规排除：rng=0 取过滤后池的第一个
  assert.equal(pickOneExcept(two, 'a', (x) => x.id, seqRng([0])).id, 'b')
  // 过滤后为空（keyOf 恒等于排除键）→ 退回全量池，不落空
  assert.ok(pickOneExcept(two, 'a', () => 'a', Math.random) !== undefined)
})

test('pickOneExcept 空池返回 undefined，exclude 为空时不过滤', () => {
  assert.equal(pickOneExcept([], null, (x) => x, Math.random), undefined)
  assert.equal(pickOneExcept(['x'], null, (x) => x, seqRng([0])), 'x')
})

test('shuffle/pickOne/pickOneExcept 大批量统计：输出都在池内且排除生效', () => {
  const pool = Array.from({ length: 50 }, (_, i) => ({ id: `l${i}` }))
  for (let i = 0; i < 2000; i++) {
    const got = pickOneExcept(pool, 'l7', (x) => x.id)
    assert.ok(pool.includes(got))
    assert.notEqual(got.id, 'l7')
  }
})

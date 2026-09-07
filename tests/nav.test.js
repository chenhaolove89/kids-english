import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createThrottle } from '../src/platform/nav.js'

test('createThrottle：窗口内第二次不放行，窗口过后放行', () => {
  let t = 1000
  const gate = createThrottle(450, () => t)
  assert.equal(gate(), true, '第一次放行')
  t = 1200
  assert.equal(gate(), false, '449ms 内拦截')
  t = 1450
  assert.equal(gate(), true, '450ms 后放行')
})

test('createThrottle：连续连点只认第一次', () => {
  let t = 0
  const gate = createThrottle(400, () => t)
  const results = [0, 50, 100, 150, 200, 250].map((dt) => {
    t = dt
    return gate()
  })
  assert.deepEqual(results, [true, false, false, false, false, false])
})

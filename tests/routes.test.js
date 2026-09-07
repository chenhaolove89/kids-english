import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveHashRoute, KNOWN_ROUTES, HOME_ROUTE } from '../src/platform/routes.js'

test('路由表覆盖 pages.json 全部页面且首页在列', () => {
  // 与 src/pages.json 同步维护；这里校验关键页面不缺
  for (const p of [
    '/pages/home/home',
    '/pages/map/map',
    '/pages/parent/parent',
    '/pages/learn/learn',
    '/pages/quiz/quiz',
    '/pages/math/practice',
  ]) {
    assert.ok(KNOWN_ROUTES.includes(p), `缺少路由 ${p}`)
  }
  assert.equal(HOME_ROUTE, '/pages/home/home')
})

test('根 hash 与空值视为首页', () => {
  assert.deepEqual(resolveHashRoute('#/'), { path: HOME_ROUTE, valid: true })
  assert.deepEqual(resolveHashRoute(''), { path: HOME_ROUTE, valid: true })
  assert.deepEqual(resolveHashRoute('#'), { path: HOME_ROUTE, valid: true })
})

test('合法页面路径（含查询串）通过校验', () => {
  assert.equal(resolveHashRoute('#/pages/learn/learn?subject=en&cat=colors&lessonId=en-learn-colors').valid, true)
  assert.equal(resolveHashRoute('#/pages/math/practice?level=2&lessonId=math-practice-l2').valid, true)
  assert.equal(resolveHashRoute('#/pages/map/map').valid, true)
})

test('未知/拼错路径一律判无效 → 守卫导回主页', () => {
  assert.equal(resolveHashRoute('#/pages/xxx/yyy').valid, false)
  assert.equal(resolveHashRoute('#/pages/learn/Learn').valid, false, '大小写敏感')
  assert.equal(resolveHashRoute('#/pages/learn/learn/extra').valid, false, '尾随内容不放行')
  assert.equal(resolveHashRoute('#/somewhere').valid, false)
  assert.equal(resolveHashRoute('#random').valid, false)
})

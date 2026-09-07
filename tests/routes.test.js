import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveHashRoute, KNOWN_ROUTES, HOME_ROUTE } from '../src/platform/routes.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('路由表与 pages.json 一一对应', () => {
  const pages = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'pages.json'), 'utf8'))
  const declared = pages.pages.map((p) => '/' + p.path)
  assert.deepEqual([...KNOWN_ROUTES].sort(), [...declared].sort())
})

test('路由表覆盖关键页面且旧首页已移除', () => {
  for (const p of [
    '/pages/map/map',
    '/pages/collection/collection',
    '/pages/parent/parent',
    '/pages/learn/learn',
    '/pages/quiz/quiz',
    '/pages/math/practice',
  ]) {
    assert.ok(KNOWN_ROUTES.includes(p), `缺少路由 ${p}`)
  }
  assert.ok(!KNOWN_ROUTES.includes('/pages/home/home'), '旧首页路由必须移除')
  assert.equal(HOME_ROUTE, '/pages/map/map')
})

test('tabBar 三项：课程/收集/家长，且第一项是入口页', () => {
  const pages = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'pages.json'), 'utf8'))
  const tabs = pages.tabBar.list.map((t) => '/' + t.pagePath)
  assert.deepEqual(tabs, ['/pages/map/map', '/pages/collection/collection', '/pages/parent/parent'])
  // uni-app 以 pages[0] 为启动页：必须与第一个 Tab 一致
  assert.equal('/' + pages.pages[0].path, tabs[0])
  // 所有 Tab 页都必须在路由表里
  for (const t of tabs) assert.ok(KNOWN_ROUTES.includes(t), `Tab 路由未登记 ${t}`)
})

test('根 hash 与空值视为首页', () => {
  assert.deepEqual(resolveHashRoute('#/'), { path: HOME_ROUTE, valid: true })
  assert.deepEqual(resolveHashRoute(''), { path: HOME_ROUTE, valid: true })
  assert.deepEqual(resolveHashRoute('#'), { path: HOME_ROUTE, valid: true })
})

test('合法页面路径（含查询串）通过校验', () => {
  assert.equal(resolveHashRoute('#/pages/learn/learn?subject=en&cat=colors&lessonId=en-learn-colors').valid, true)
  assert.equal(resolveHashRoute('#/pages/math/practice?level=2&lessonId=math-practice-l2').valid, true)
  assert.equal(resolveHashRoute('#/pages/collection/collection').valid, true)
})

test('未知/拼错路径一律判无效 → 守卫导回主页', () => {
  assert.equal(resolveHashRoute('#/pages/xxx/yyy').valid, false)
  assert.equal(resolveHashRoute('#/pages/learn/Learn').valid, false, '大小写敏感')
  assert.equal(resolveHashRoute('#/pages/learn/learn/extra').valid, false, '尾随内容不放行')
  assert.equal(resolveHashRoute('#/somewhere').valid, false)
  assert.equal(resolveHashRoute('#random').valid, false)
  assert.equal(resolveHashRoute('#/pages/home/home').valid, false, '旧首页路径应判无效')
})

/**
 * 路由表与守卫校验（纯函数，Node 可测）。
 * 新增页面时同步维护 KNOWN_ROUTES；守卫在 App.vue（H5）启动与 hashchange 时调用。
 */

// 与 src/pages.json 的 pages 列表一一对应（不含查询参数）
export const KNOWN_ROUTES = [
  '/pages/map/map',
  '/pages/collection/collection',
  '/pages/parent/parent',
  '/pages/index/index',
  '/pages/chinese/chinese',
  '/pages/math/math',
  '/pages/math/practice',
  '/pages/learn/learn',
  '/pages/quiz/quiz',
]

// 首页即课程地图（v1.4 起移除独立首页，入口收敛到课程 Tab）
export const HOME_ROUTE = '/pages/map/map'

/**
 * 解析 H5 hash 路由：'#/' 或 '' 是首页根；返回 { path, valid }。
 * 路径必须精确命中路由表（大小写敏感、不忽略尾随内容），查询串不参与校验。
 */
export function resolveHashRoute(hash) {
  const raw = (hash || '').replace(/^#/, '')
  if (raw === '' || raw === '/') return { path: HOME_ROUTE, valid: true }
  const path = raw.split('?')[0]
  return { path, valid: KNOWN_ROUTES.includes(path) }
}

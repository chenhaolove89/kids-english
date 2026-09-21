import App from './App'
import { createSSRApp } from 'vue'
import { startAssetSource } from './platform/asset-source.js'
import { applyAssetBase } from './content/adapters.js'
import { applyCatalogAssetBase } from './content/catalog.js'

// 资源源在任何页面渲染前定下来：收口是懒取值，但仍要先把 base 设好，
// 否则首屏读到的是空 base。startAssetSource 先给本地，探测通过后在后台切到服务器
// （见 platform/asset-source.js 里为什么不能反过来乐观用服务器）。
// 没配资源源的产物（正式站 / 电脑版 / 本地开发）这里是空操作，不产生任何请求。
startAssetSource()
applyAssetBase()
applyCatalogAssetBase()

export function createApp() {
  const app = createSSRApp(App)
  return { app }
}

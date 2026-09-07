import { defineConfig } from 'vite'
// 根 package.json 为 "type":"module"（Node 测试需要），ESM 加载本配置时
// CJS 插件的默认导出可能被包一层，这里兼容两种形状
import uniPkg from '@dcloudio/vite-plugin-uni'

const uni = typeof uniPkg === 'function' ? uniPkg : uniPkg.default

export default defineConfig({
  plugins: [uni()],
})

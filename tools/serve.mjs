/**
 * 本地静态服务器：服务 uni build 产物（dist/build/h5），用于部署前自测。
 * 用法：node tools/serve.mjs [端口]   （默认 4173）
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/build/h5')
const PORT = Number(process.argv[2] || 4173)
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.mp3': 'audio/mpeg',
  '.ico': 'image/x-icon',
}

http
  .createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split('?')[0].split('#')[0])
    let file = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath)
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end() }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      console.log('404', urlPath)
      res.writeHead(404)
      return res.end('not found')
    }
    // HTML 不缓存（hash 路由时代码块靠 index.html 引用，旧缓存会让浏览器混跑新旧代码）；
    // 带 hash 的静态资源可放心长缓存
    const isHtml = file.endsWith('.html')
    const headers = { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' }
    headers['Cache-Control'] = isHtml ? 'no-cache' : 'public, max-age=86400, immutable'
    res.writeHead(200, headers)
    fs.createReadStream(file).pipe(res)
  })
  .listen(PORT, () => console.log(`serving ${ROOT} at http://127.0.0.1:${PORT}`))

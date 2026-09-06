/**
 * 本地静态服务器：服务 dist/build/web，用于部署前自测。
 * 用法：node tools/serve.mjs [端口]   （默认 4173）
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/build/web')
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
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' })
    fs.createReadStream(file).pipe(res)
  })
  .listen(PORT, () => console.log(`serving ${ROOT} at http://127.0.0.1:${PORT}`))

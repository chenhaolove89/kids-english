/**
 * 快乐学园 PWA service worker（由 publish-github-pages.mjs 写入产物根目录，
 * kx-d371c8b4dd-1553d9f3 替换为 kx-<contentVersion>-<静态资源树指纹>）。GitHub Pages 子路径部署 + 国内访问慢，
 * 二次访问不再重拉音频/图片；更新策略：
 *  - /assets/：Vite 哈希块，内容不可变 → 缓存优先；
 *  - /static/：音频/图片/笔顺数据，文件名稳定但字节会随内容批次变 → **缓存优先**，
 *    代次由「内容版本 + 静态资源树指纹」共同决定（见 publish 脚本），
 *    所以只有真的换了字节才会换代重下。原实现用 staleWhileRevalidate 会**无条件发请求**，
 *    省下的其实是浏览器 HTTP 缓存而不是 SW——离线和流量都没真正省。
 *  - 页面导航：网络优先，离线回退上次缓存的 index.html（纯前端应用可离线打开）。
 *  - contentVersion / 静态树变化 → 新缓存代次 + activate 清旧代，避免旧图残留。
 *
 * 关键：所有 cache.put 都必须挂到 event.waitUntil。否则 SW 可能在 respondWith 结束后
 * 立刻被浏览器回收，写入被丢弃——实测「第一次访问后断网打开」会拿到网络错误页，
 * 要第二次在线访问才真的能离线。
 */
const VERSION = 'kx-d371c8b4dd-1553d9f3'
const ASSET_CACHE = 'kx-assets-' + VERSION
const STATIC_CACHE = 'kx-static-' + VERSION
const PAGE_CACHE = 'kx-pages-' + VERSION
const STATIC_MAX = 3000 // 防无界增长：超出时按键序先删先入的（静态资源共 11000+ 个）

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches
      .open(PAGE_CACHE)
      // 预缓存应用外壳：让「装好之后第一次断网」也能打开，而不是要求先在线访问第二次。
      // 失败不阻断安装（离线安装、配额不足等），运行时再回退网络优先。
      .then(function (cache) {
        return Promise.allSettled([cache.add('./'), cache.add('./index.html')])
      })
      .then(function () {
        return self.skipWaiting()
      }),
  )
})

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(
        names
          .filter(function (n) {
            return n.startsWith('kx-') && !n.endsWith(VERSION)
          })
          .map(function (n) {
            return caches.delete(n)
          }),
      )
    }).then(function () {
      return self.clients.claim()
    }),
  )
})

function isAsset(url) {
  return url.pathname.includes('/assets/')
}
function isStatic(url) {
  return url.pathname.includes('/static/')
}

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  if (keys.length <= max) return
  for (const key of keys.slice(0, keys.length - max)) await cache.delete(key)
}

/** 缓存优先 + 写入挂 waitUntil（保证写入不被 SW 回收丢弃） */
function cacheFirst(event, cacheName, max) {
  const request = event.request
  return caches.open(cacheName).then(function (cache) {
    return cache.match(request).then(function (cached) {
      if (cached) return cached
      return fetch(request).then(function (res) {
        // 只缓存完整响应：带 Range 的请求会拿到 206 半截内容，
        // 存进去就等于把"半个文件"当成完整文件，之后离线播放会中途断掉。
        if (res && res.status === 200) {
          const copy = res.clone()
          event.waitUntil(
            cache.put(request, copy).then(function () {
              return trim(cacheName, max)
            }),
          )
        }
        return res
      })
    })
  })
}

/**
 * 带 Range 的请求：**从缓存的完整响应里切**出 206。
 *
 * 为什么必须处理：sw.js 原来对带 range 的请求直接放行（不拦截）。媒体元素
 * （`<audio>` / Howler 的 html5 模式）加载时浏览器会发 Range 请求，于是断网时
 * 这些请求绕过 SW 打到网络 → 拿不到数据、**离线放不出声**（实测：Audio.play() 报
 * "no supported source was found"，readyState 0）。
 * 应用当前用 Howler 的 Web Audio 路径（XHR 整文件，不带 Range）所以没受影响，
 * 但这是"碰巧能用"：任何一处改成 html5 模式，或浏览器换成按 Range 取媒体，离线就哑了。
 */
async function rangeFromCache(event, cacheName) {
  const request = event.request
  const cache = await caches.open(cacheName)
  // 按 URL 查（忽略 Range 头）：缓存里存的是完整响应
  const cached = await cache.match(request.url)
  if (!cached) {
    // 没缓存：在线时按原样透传（206 不会被缓存，见 cacheFirst 的 200 判断）
    return fetch(request)
  }
  const rangeHeader = request.headers.get('range') || ''
  const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim())
  if (!m) return cached
  const buf = await cached.arrayBuffer()
  const size = buf.byteLength
  let start
  let end
  if (m[1] === '' && m[2] !== '') {
    // bytes=-N：最后 N 字节
    const n = Number(m[2])
    start = Math.max(0, size - n)
    end = size - 1
  } else {
    start = Number(m[1] || 0)
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1)
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) {
    return new Response(null, { status: 416, headers: { 'content-range': 'bytes */' + size } })
  }
  const headers = new Headers(cached.headers)
  headers.set('content-range', 'bytes ' + start + '-' + end + '/' + size)
  headers.set('content-length', String(end - start + 1))
  headers.set('accept-ranges', 'bytes')
  return new Response(buf.slice(start, end + 1), { status: 206, statusText: 'Partial Content', headers: headers })
}

function networkFirst(event, cacheName) {
  const request = event.request
  return caches.open(cacheName).then(function (cache) {
    return fetch(request)
      .then(function (res) {
        if (res && res.ok) {
          const copy = res.clone()
          event.waitUntil(cache.put(request, copy))
        }
        return res
      })
      .catch(function (err) {
        return cache.match(request).then(function (cached) {
          if (cached) return cached
          return cache.match('./').then(function (shell) {
            if (shell) return shell
            throw err
          })
        })
      })
  })
}

self.addEventListener('fetch', function (event) {
  const request = event.request
  if (request.method !== 'GET') return
  let url
  try {
    url = new URL(request.url)
  } catch (err) {
    return
  }
  if (url.origin !== self.location.origin) return

  const hasRange = request.headers.has('range')
  if (isAsset(url)) {
    event.respondWith(hasRange ? rangeFromCache(event, ASSET_CACHE) : cacheFirst(event, ASSET_CACHE, 300))
  } else if (isStatic(url)) {
    event.respondWith(hasRange ? rangeFromCache(event, STATIC_CACHE) : cacheFirst(event, STATIC_CACHE, STATIC_MAX))
  } else if (request.mode === 'navigate') {
    event.respondWith(networkFirst(event, PAGE_CACHE))
  }
})

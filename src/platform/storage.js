/**
 * 平台存储统一入口。所有本地持久化必须走这里，禁止页面直接调 uni.setStorageSync。
 *
 * - 每个键的值包一层 { v: schemaVersion, d: 数据 }，迁移按版本链逐级升级；
 * - 读取容错：键不存在 / JSON 损坏 / 版本高于当前代码 → 返回 fallback，绝不抛出；
 * - 写入容错：配额超限等异常吞掉并返回 false，调用方无需 try/catch；
 * - backend 可注入（Node 测试用内存实现），默认运行在 uni 存储（H5=localStorage）。
 */

export const SCHEMA_VERSION = 1

// 迁移链：MIGRATIONS[v] 把 v 版负载升级到 v+1。当前仅有 v0（无包装的旧数据）直通。
const MIGRATIONS = {
  0: (d) => d,
}

export function memoryBackend() {
  const mem = new Map()
  return {
    get: (k) => (mem.has(k) ? mem.get(k) : ''),
    set: (k, v) => {
      mem.set(k, v)
    },
    remove: (k) => {
      mem.delete(k)
    },
  }
}

function uniBackend() {
  return {
    get: (k) => {
      try {
        return uni.getStorageSync(k)
      } catch (e) {
        return ''
      }
    },
    set: (k, v) => {
      uni.setStorageSync(k, v)
    },
    remove: (k) => {
      try {
        uni.removeStorageSync(k)
      } catch (e) {
        /* 忽略 */
      }
    },
  }
}

function resolveBackend(backend) {
  if (backend) return backend
  if (typeof uni !== 'undefined' && typeof uni.getStorageSync === 'function') return uniBackend()
  return memoryBackend()
}

export function createStorage({ prefix = 'kx', backend } = {}) {
  const be = resolveBackend(backend)

  function get(key, fallback = null) {
    let parsed
    try {
      const raw = be.get(`${prefix}:${key}`)
      if (raw === '' || raw === undefined || raw === null) return fallback
      parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    } catch (e) {
      return fallback
    }
    if (!parsed || typeof parsed !== 'object' || typeof parsed.v !== 'number') return fallback
    let v = parsed.v
    let data = parsed.d
    if (v > SCHEMA_VERSION) return fallback
    try {
      while (v < SCHEMA_VERSION) {
        const migrate = MIGRATIONS[v]
        if (!migrate) return fallback
        data = migrate(data)
        v++
      }
    } catch (e) {
      return fallback
    }
    return data
  }

  function set(key, value) {
    try {
      be.set(`${prefix}:${key}`, JSON.stringify({ v: SCHEMA_VERSION, d: value }))
      return true
    } catch (e) {
      console.error('[storage] 写入失败:', key, e)
      return false
    }
  }

  function remove(key) {
    try {
      be.remove(`${prefix}:${key}`)
    } catch (e) {
      /* 忽略 */
    }
  }

  return { get, set, remove }
}

// 应用内单例：懒初始化，避免模块加载期就触碰 uni 全局
let _instance = null
export function getStorage() {
  if (!_instance) _instance = createStorage()
  return _instance
}

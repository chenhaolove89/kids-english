/**
 * 平台存储统一入口。所有本地持久化必须走这里，禁止页面直接调 uni.setStorageSync。
 *
 * - 每个键的值包一层 { v: schemaVersion, d: 数据 }，迁移按版本链逐级升级；
 * - 读取容错：键不存在 / JSON 损坏 / 版本高于当前代码 → 返回 fallback，绝不抛出；
 * - 写入容错：配额超限等异常吞掉并返回 false，调用方无需 try/catch；
 * - **写入失败必须可见**：除了返回 false，还会记录错误状态并通知订阅者
 *   （见 getStorageError / onStorageError）——本地存储是唯一数据源，
 *   静默失败等于孩子的星星、完成记录、错题本、图鉴在图鉴页看着正常、实际全丢。
 * - **迁移不能静默清空**：缺迁移函数或迁移抛错时，先把原始负载备份到 `<键>:bak`，
 *   再返回 fallback，给用户留一条人工抢救的路（原来直接 fallback，下一次写入就永久覆盖）。
 */

export const SCHEMA_VERSION = 1

// 迁移链：MIGRATIONS[v] 把 v 版负载升级到 v+1。当前仅有 v0（无包装的旧数据）直通。
// 注意：这条链至今从未真正跑过（版本一直是 1）。将来第一次改数据结构时它才会在
// 真实用户数据上首次执行，所以 tests/storage.test.js 用注入的 version/migrations
// 把「多级升级 / 缺函数 / 迁移抛错 / 幂等」全部预演了一遍。
const MIGRATIONS = {
  0: (d) => d,
}

/**
 * 迁移链完整性自检：从 0 到目标版本每一级都必须有迁移函数。
 * 升 SCHEMA_VERSION 却忘了补 MIGRATIONS[n]，读取侧会静默 fallback 清空全部进度，
 * 所以这里主动报错，让问题在开发/测试期就暴露。
 */
export function assertMigrationsComplete(version = SCHEMA_VERSION, migrations = MIGRATIONS) {
  const missing = []
  for (let v = 0; v < version; v++) {
    if (typeof migrations[v] !== 'function') missing.push(`${v}→${v + 1}`)
  }
  if (missing.length) {
    throw new Error(`[storage] 缺少迁移函数：${missing.join('、')}（目标版本=${version}）`)
  }
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

// ---- 写入失败状态：页面据此提示「这台设备的存储写不进去了」 ----
let lastWriteError = null
const errorListeners = new Set()

/** 最近一次写入失败（无失败为 null） */
export function getStorageError() {
  return lastWriteError
}

/** 订阅写入失败；返回取消订阅函数 */
export function onStorageError(fn) {
  errorListeners.add(fn)
  return () => errorListeners.delete(fn)
}

/** 清掉错误状态（家长处理完存储问题后可手动复位） */
export function clearStorageError() {
  lastWriteError = null
}

function reportWriteError(key, error) {
  lastWriteError = {
    key,
    message: (error && error.message) || String(error || 'unknown'),
    at: Date.now(),
  }
  console.error('[storage] 写入失败:', key, error)
  for (const fn of errorListeners) {
    try {
      fn(lastWriteError)
    } catch (e) {
      /* 订阅者自身异常不影响其他订阅者 */
    }
  }
}

/**
 * @param {{prefix?: string, backend?: object, schemaVersion?: number, migrations?: object}} opts
 *   schemaVersion / migrations 可注入：这是让「迁移链」本身能被测试的唯一方式
 *   （应用侧用默认值，即 SCHEMA_VERSION + 内置 MIGRATIONS）。
 */
export function createStorage({ prefix = 'kx', backend, schemaVersion = SCHEMA_VERSION, migrations = MIGRATIONS } = {}) {
  try {
    assertMigrationsComplete(schemaVersion, migrations)
  } catch (e) {
    // 不阻断启动（否则一次疏忽就让整个应用打不开），但必须吵闹：
    // 旧版本数据会被退回默认值，用户表现为「进度清零」
    console.error('[storage] 迁移链不完整，旧版本数据将退回默认值:', e.message)
  }
  const be = resolveBackend(backend)

  /** 迁移失败时把原始负载另存一份，避免下一次写入永久覆盖用户数据 */
  function backupRaw(key, raw, reason) {
    try {
      be.set(`${prefix}:${key}:bak`, typeof raw === 'string' ? raw : JSON.stringify(raw))
      console.warn(`[storage] ${key} 迁移失败（${reason}），原文已备份到 ${key}:bak`)
    } catch (e) {
      /* 备份也写不进去（如配额满）：只能放弃备份，但至少不抛 */
    }
  }

  function get(key, fallback = null) {
    let parsed
    let raw
    try {
      raw = be.get(`${prefix}:${key}`)
      if (raw === '' || raw === undefined || raw === null) return fallback
      parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    } catch (e) {
      return fallback
    }
    if (!parsed || typeof parsed !== 'object' || typeof parsed.v !== 'number') return fallback
    let v = parsed.v
    let data = parsed.d
    if (v > schemaVersion) {
      // 版本比代码新（用户装过更新的版本后回退）：读不了，但也**不能就这样丢**
      // ——下一次写入就会把这份数据永久覆盖。同样先备份一份原文。
      backupRaw(key, raw, `版本 ${v} 高于当前 ${schemaVersion}`)
      return fallback
    }
    try {
      while (v < schemaVersion) {
        const migrate = migrations[v]
        if (!migrate) {
          backupRaw(key, raw, `缺少 ${v}→${v + 1} 迁移`)
          return fallback
        }
        data = migrate(data)
        v++
      }
    } catch (e) {
      // 迁移抛错：可能已改了一半。原文仍在 raw 里（读取不写回），先备份再降级
      backupRaw(key, raw, `迁移抛错 ${e && e.message}`)
      return fallback
    }
    return data
  }

  function set(key, value) {
    try {
      be.set(`${prefix}:${key}`, JSON.stringify({ v: schemaVersion, d: value }))
      return true
    } catch (e) {
      reportWriteError(key, e)
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

  /** 该键的原始字符串（导出/诊断用，不做版本解析） */
  function raw(key) {
    try {
      const v = be.get(`${prefix}:${key}`)
      return v === '' || v === undefined ? null : v
    } catch (e) {
      return null
    }
  }

  return { get, set, remove, raw, prefix }
}

// 应用内单例：懒初始化，避免模块加载期就触碰 uni 全局
let _instance = null
export function getStorage() {
  if (!_instance) _instance = createStorage()
  return _instance
}

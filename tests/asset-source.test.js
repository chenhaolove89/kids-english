/**
 * 资源源决策契约。
 *
 * 这一层的失败模式是"静默降级"：探测失败本来就要回退本地，所以真正要钉住的是
 * 两类反过来的错——该探测时没探测（远程模式形同虚设），以及不该探测时乱发请求
 * （正式站/电脑版/同源打开时凭空多一个跨域请求，还会拖慢首屏）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  probeUrl,
  decideAssetBase,
  configuredRemoteBase,
  verifyAssetSource,
} from '../src/platform/asset-source.js'
import { getAssetBase, setAssetBase } from '../src/platform/assets.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const REMOTE = 'https://cinaka.com/kids-english'

test('configuredRemoteBase：只有 http(s) 开头才算真配了资源源', () => {
  assert.equal(configuredRemoteBase(REMOTE), REMOTE)
  assert.equal(configuredRemoteBase('http://127.0.0.1:4176'), 'http://127.0.0.1:4176')
  // 未替换的占位符、空值、垃圾值一律按"没配"处理，绝不拿去发请求
  assert.equal(configuredRemoteBase('__KX_ASSET_REMOTE_BASE__'), '')
  assert.equal(configuredRemoteBase(''), '')
  assert.equal(configuredRemoteBase(null), '')
  assert.equal(configuredRemoteBase(undefined), '')
  assert.equal(configuredRemoteBase('//cdn.example.com'), '')
})

test('probeUrl：没配资源源就不探测（正式站/电脑版/本地开发都走这条）', () => {
  assert.equal(probeUrl('', 'https://example.com/app/'), null)
  assert.equal(probeUrl(null, 'https://example.com/app/'), null)
  assert.equal(probeUrl(undefined, 'https://example.com/app/'), null)
})

test('probeUrl：应用本身就是从这台服务器打开的，同源直接用本地，不探测', () => {
  assert.equal(probeUrl(REMOTE, 'https://cinaka.com/kids-english/'), null)
  assert.equal(probeUrl(REMOTE, 'https://cinaka.com/kids-english/#/pages/map/map'), null)
  // 只在同一路径前缀下才算同源；主站根（/）不是这个应用，仍要探测
  assert.equal(probeUrl(REMOTE, 'https://cinaka.com/'), `${REMOTE}/asset-source.json`)
})

test('probeUrl：应用在别处（如 GitHub Pages）时探测服务器', () => {
  assert.equal(
    probeUrl(REMOTE, 'https://chenhaolove89.github.io/kids-english/'),
    `${REMOTE}/asset-source.json`,
  )
  // base 末尾多写斜杠不会拼出双斜杠
  assert.equal(probeUrl(`${REMOTE}/`, 'https://example.com/'), `${REMOTE}/asset-source.json`)
})

test('decideAssetBase：探测通过就用服务器', async () => {
  const base = await decideAssetBase(REMOTE, 'https://example.com/', async () => ({ ok: true }))
  assert.equal(base, REMOTE)
})

test('decideAssetBase：服务器返回非 2xx 视为不可用，回退本地', async () => {
  const base = await decideAssetBase(REMOTE, 'https://example.com/', async () => ({ ok: false, status: 502 }))
  assert.equal(base, '')
})

test('decideAssetBase：断网/跨域失败等异常一律回退本地，不抛给调用方', async () => {
  const base = await decideAssetBase(REMOTE, 'https://example.com/', async () => {
    throw new Error('network down')
  })
  assert.equal(base, '')
})

test('decideAssetBase：服务器卡住时按超时回退本地（不拖着首屏）', async () => {
  const hanging = (url, opts) =>
    new Promise((_, reject) => {
      opts.signal.addEventListener('abort', () => reject(new Error('aborted')))
    })
  const t0 = Date.now()
  const base = await decideAssetBase(REMOTE, 'https://example.com/', hanging, 30)
  assert.equal(base, '')
  assert.ok(Date.now() - t0 < 1000, '超时应及时收手')
})

test('decideAssetBase：没配资源源或同源时，一次请求都不发', async () => {
  let calls = 0
  const spy = async () => {
    calls++
    return { ok: true }
  }
  assert.equal(await decideAssetBase('', 'https://example.com/', spy), '')
  assert.equal(await decideAssetBase(REMOTE, 'https://cinaka.com/kids-english/', spy), '')
  assert.equal(calls, 0, '不该探测的场景必须零请求')
})

test('decideAssetBase：探测请求必须绕过 HTTP 缓存（否则服务器挂了仍命中旧响应）', async () => {
  let seen = null
  await decideAssetBase(REMOTE, 'https://example.com/', async (url, opts) => {
    seen = { url, opts }
    return { ok: true }
  })
  assert.equal(seen.url, `${REMOTE}/asset-source.json`)
  assert.equal(seen.opts.cache, 'no-store')
  assert.ok(seen.opts.signal, '必须带可中止的 signal，否则超时形同虚设')
})

test('是否探测：应用在别处才探测，同源与未配置都不探测', () => {
  const GP = 'https://chenhaolove89.github.io/kids-english/'
  assert.equal(probeUrl(configuredRemoteBase(REMOTE), GP), `${REMOTE}/asset-source.json`)
  assert.equal(probeUrl(configuredRemoteBase(REMOTE), 'https://cinaka.com/kids-english/'), null, '同源不必绕绝对地址')
  assert.equal(probeUrl(configuredRemoteBase(''), GP), null, '没配资源源就是本地')
  assert.equal(probeUrl(configuredRemoteBase('__KX_ASSET_REMOTE_BASE__'), GP), null, '占位符没替换也要按本地处理')
})

test('verifyAssetSource：探测失败保持本地（服务器不可达就用包内资源）', async () => {
  setAssetBase(REMOTE)
  try {
    const ok = await verifyAssetSource(REMOTE, 'https://example.com/', async () => {
      throw new Error('network down')
    })
    assert.equal(ok, '')
    assert.equal(getAssetBase(), '', '服务器不可达时 base 必须是本地')
  } finally {
    setAssetBase('')
  }
})

test('verifyAssetSource：探测通过才切到服务器（首屏先本地，这一步是切换点）', async () => {
  setAssetBase('')
  try {
    const ok = await verifyAssetSource(REMOTE, 'https://example.com/', async () => ({ ok: true }))
    assert.equal(ok, REMOTE)
    assert.equal(getAssetBase(), REMOTE)
  } finally {
    setAssetBase('')
  }
})

test('verifyAssetSource：同源打开时不探测、也不动 base', async () => {
  setAssetBase('')
  let calls = 0
  const spy = async () => {
    calls++
    return { ok: true }
  }
  const ok = await verifyAssetSource(REMOTE, 'https://cinaka.com/kids-english/', spy)
  assert.equal(ok, '')
  assert.equal(calls, 0)
  assert.equal(getAssetBase(), '')
})

test('防回归：asset-source.js 不得出现以 /static/ 开头的字符串字面量', () => {
  // 发布脚本会把 JS 里的 '/static/ 改写成 './static/（子路径部署的相对化）。
  // 探测路径若写成 '/static/...' 会被一起改掉，拼出 .../kids-english./static/...
  // 这种坏地址：探测必然 404 → 永远回退本地 → 服务器等于白挂，而且全程不报错。
  const src = fs.readFileSync(path.join(ROOT, 'src/platform/asset-source.js'), 'utf8')
  // 注释里会拿这个坏写法当例子讲，扫描前先剥掉注释
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  const offenders = (code.match(/['"`]\/static\//g) || []).length
  assert.equal(offenders, 0, `asset-source.js 里有 ${offenders} 处会被发布脚本改写的 /static/ 字面量`)
})

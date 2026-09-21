/**
 * 资源源（本地包 / 远程服务器）相关契约。
 *
 * 这一层最容易出的两类错都是"静默"的：前缀拼出坏地址（多一个点）与口音改写
 * 不再命中（不报错，只是切口音没反应）。所以这里把三态前缀和幂等性钉死。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  assetUrl,
  setAssetBase,
  getAssetBase,
  withAccent,
  collectAssetFieldsInPlace,
  toLocalAsset,
} from '../src/platform/assets.js'

const REMOTE = 'https://cinaka.com/kids-english'

/** 每个用例显式设一次 base 再复位，避免模块级状态串味 */
function withBase(b, fn) {
  setAssetBase(b)
  try {
    fn()
  } finally {
    setAssetBase('')
  }
}

test('base 为空时 assetUrl 是恒等变换（本地/子路径部署行为与改造前逐字一致）', () => {
  withBase('', () => {
    assert.equal(assetUrl('/static/img/red.png'), '/static/img/red.png')
    // 发布脚本改写后的形态必须原样保留：多一个斜杠或少一个点都会让子路径部署 404
    assert.equal(assetUrl('./static/img/red.png'), './static/img/red.png')
    assert.equal(assetUrl('static/img/red.png'), 'static/img/red.png')
    assert.equal(getAssetBase(), '')
  })
})

test('远程 base：/static 与 ./static 两种输入都要拼成同一个正确地址', () => {
  withBase(REMOTE, () => {
    // 发布脚本会把 /static/ 改写成 ./static/，直接 base + p 会拼出
    // https://cinaka.com/kids-english./static/... 这种带点的坏地址
    assert.equal(assetUrl('/static/img/red.png'), `${REMOTE}/static/img/red.png`)
    assert.equal(assetUrl('./static/img/red.png'), `${REMOTE}/static/img/red.png`)
    assert.equal(assetUrl('static/img/red.png'), `${REMOTE}/static/img/red.png`)
  })
})

test('远程 base 末尾多写斜杠不会拼出双斜杠', () => {
  withBase(`${REMOTE}/`, () => {
    assert.equal(assetUrl('/static/img/red.png'), `${REMOTE}/static/img/red.png`)
  })
})

test('assetUrl 幂等：重复调用结果不变（收口会被多处调用，不幂等就会层层加前缀）', () => {
  for (const base of ['', REMOTE]) {
    withBase(base, () => {
      const once = assetUrl('./static/img/red.png')
      assert.equal(assetUrl(once), once)
      assert.equal(assetUrl(assetUrl(once)), once)
    })
  }
})

test('外链与内联资源一律原样返回，不加 base', () => {
  withBase(REMOTE, () => {
    assert.equal(assetUrl('https://cdn.example.com/a.png'), 'https://cdn.example.com/a.png')
    assert.equal(assetUrl('data:image/png;base64,AAA'), 'data:image/png;base64,AAA')
    assert.equal(assetUrl('blob:http://x/y'), 'blob:http://x/y')
    assert.equal(assetUrl(''), '')
    assert.equal(assetUrl(null), null)
  })
})

test('远程 base 下口音改写仍要命中（少认一种前缀就会静默回美音）', () => {
  assert.equal(
    withAccent(`${REMOTE}/static/audio/red.mp3`, 'gb'),
    `${REMOTE}/static/audio-gb/red.mp3`,
  )
  assert.equal(
    withAccent(`${REMOTE}/static/audio/Monday.mp3`, 'gb'),
    `${REMOTE}/static/audio-gb/Monday.mp3`,
  )
})

test('远程 base 下语文/数学音频依然绝不改写', () => {
  for (const name of ['zh-4e91.mp3', 'zh-great.mp3', 'n9.mp3', '4e91.mp3']) {
    const src = `${REMOTE}/static/audio/${name}`
    assert.equal(withAccent(src, 'gb'), src)
  }
  // audio-zh 目录本来就不该被口音改写碰到
  const zh = `${REMOTE}/static/audio-zh/red.mp3`
  assert.equal(withAccent(zh, 'gb'), zh)
})

test('外链音频不重写（withAccent 只认自己这套路径）', () => {
  assert.equal(withAccent('https://cdn.example.com/red.mp3', 'gb'), 'https://cdn.example.com/red.mp3')
})

test('collectAssetFieldsInPlace：base 为空时是空操作，一个字段都不动', () => {
  withBase('', () => {
    const items = [{ icon: '/static/img/a.png', title: '不变' }]
    collectAssetFieldsInPlace(items, ['icon'])
    assert.equal(items[0].icon, '/static/img/a.png')
  })
})

test('collectAssetFieldsInPlace：只改列出的字段，其余字段与对象引用都不动', () => {
  withBase(REMOTE, () => {
    const items = [{ icon: '/static/img/a.png', title: '标题' }]
    const before = items[0]
    collectAssetFieldsInPlace(items, ['icon'])
    assert.equal(items[0], before, '必须就地改，不能换对象（页面持有的是同一个引用）')
    assert.equal(items[0].icon, `${REMOTE}/static/img/a.png`)
    assert.equal(items[0].title, '标题')
  })
})

test('collectAssetFieldsInPlace 幂等：重复收口不会叠前缀', () => {
  withBase(REMOTE, () => {
    const items = [{ icon: './static/img/a.png' }]
    collectAssetFieldsInPlace(items, ['icon'])
    const once = items[0].icon
    collectAssetFieldsInPlace(items, ['icon'])
    assert.equal(items[0].icon, once)
  })
})

test('懒取值：资源源翻转后，同一份数据立刻改用新源（这是"服务器不可达收回本地"能生效的前提）', () => {
  const items = [{ icon: './static/img/a.png' }]
  // 乐观先用服务器
  setAssetBase(REMOTE)
  try {
    collectAssetFieldsInPlace(items, ['icon'])
    assert.equal(items[0].icon, `${REMOTE}/static/img/a.png`)
    // 探测失败 → 收回本地：已收口的条目必须跟着回去，而不是冻在远程地址上
    setAssetBase('')
    assert.equal(items[0].icon, './static/img/a.png')
    // 再翻回远程也要跟着走
    setAssetBase(REMOTE)
    assert.equal(items[0].icon, `${REMOTE}/static/img/a.png`)
  } finally {
    setAssetBase('')
  }
})

test('collectAssetFieldsInPlace：空值与未列出的字段安全跳过', () => {
  withBase(REMOTE, () => {
    const items = [{ icon: '', image: null }, null]
    collectAssetFieldsInPlace(items, ['icon', 'image'])
    assert.equal(items[0].icon, '')
    assert.equal(items[0].image, null)
    // 传 null 数组不抛错
    collectAssetFieldsInPlace(null, ['icon'])
  })
})

test('toLocalAsset：把服务器地址换回包内同名文件', () => {
  setAssetBase(REMOTE)
  try {
    assert.equal(toLocalAsset(`${REMOTE}/static/audio/dog.mp3`), './static/audio/dog.mp3')
    assert.equal(toLocalAsset(`${REMOTE}/static/img/cat-colors.png`), './static/img/cat-colors.png')
    // 不是远程资源源下的地址没有可回退的本地副本
    assert.equal(toLocalAsset('https://cdn.example.com/x.mp3'), '')
    assert.equal(toLocalAsset('./static/audio/dog.mp3'), '')
    assert.equal(toLocalAsset(''), '')
  } finally {
    setAssetBase('')
  }
})

test('toLocalAsset：base 已被收回本地后仍能换算（兜底回调跑在探测失败之后）', () => {
  // 探测失败 → setAssetBase('') 先发生；随后音频 loaderror 回调里 base 已经是空的，
  // 若换算依赖"当前 base"，这条兜底就永远不生效——孩子静默没声音。
  setAssetBase(REMOTE)
  const remoteSrc = `${REMOTE}/static/audio/dog.mp3`
  setAssetBase('')
  assert.equal(toLocalAsset(remoteSrc), './static/audio/dog.mp3')
})

// 注：「从未用过远程资源源」这一分支没法在同一个模块实例里测——remoteRoot 是刻意粘住的
// （探测失败把 base 收回本地后仍要能换算），一旦本文件前面的用例设过远程源就再也回不去。
// 外链不被误伤已由上面第一条用例的 cdn.example.com 覆盖。

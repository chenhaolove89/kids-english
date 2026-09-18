/**
 * 图片压缩收敛（tools/lib/image-converge.mjs + tools/optimize-img.mjs）。
 *
 * 背景：旧实现「压一次就覆盖、且只在更小时覆盖」自称天然幂等，实测不成立——
 * palette 量化不是不动点，已压过的图再压仍会略小，于是每次重跑都改写几百张文件；
 * 而文件字节一变，发布脚本的静态图内容哈希就变、SW 缓存代次跟着换，老用户要重下这些图。
 * 这里把「收敛到不动点」钉成契约，最后一条用真实 sharp 证明收敛后再跑是空转。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { convergeEncode, firstPassGainRatio, matchesGlob } from '../tools/lib/image-converge.mjs'

/** 假编码器：按给定序列依次产出（模拟"每轮还会小一点，然后不动"） */
function seqEncoder(sizes) {
  let i = 0
  return async () => {
    const n = sizes[Math.min(i, sizes.length - 1)]
    i++
    return Buffer.alloc(n)
  }
}

test('收敛：反复编码直到不再更小，并报告轮次与总收益', async () => {
  const input = Buffer.alloc(100000)
  const r = await convergeEncode(input, seqEncoder([50000, 30000, 29000, 29000]))
  assert.equal(r.buffer.length, 29000, '取到最小结果')
  assert.equal(r.saved, 71000)
  // 50000→接受、30000→接受、29000→接受、29000→不更小即停（4 轮）
  assert.equal(r.passes, 4)
})

test('绝不返回比输入更大的结果（palette 会反复，必须和"当前最小"比）', async () => {
  const input = Buffer.alloc(10000)
  // 第三轮反而变大：必须保留 5000，不能把 9000 当结果
  const r = await convergeEncode(input, seqEncoder([5000, 9000, 4000, 4000]))
  assert.equal(r.buffer.length, 5000, '变大的一轮必须被拒')
  assert.ok(r.buffer.length < input.length, '结果绝不能比输入大')
})

test('首轮就变大或收益不足 128B：直接判定不值得改写（saved=0）', async () => {
  const input = Buffer.alloc(10000)
  assert.equal((await convergeEncode(input, seqEncoder([10050]))).saved, 0, '变大 → 不写')
  assert.equal((await convergeEncode(input, seqEncoder([9900]))).saved, 0, '只省 100B（<128）→ 不写')
  assert.equal((await convergeEncode(input, seqEncoder([9800]))).saved, 200, '省 200B → 写')
})

test('轮次上限兜底：编码器一直变小也不会无限循环，且如实报告"没收敛"', async () => {
  let n = 100000
  const always = async () => Buffer.alloc((n -= 5000))
  const r = await convergeEncode(Buffer.alloc(100000), always, { maxPasses: 3 })
  assert.equal(r.passes, 3)
  assert.equal(r.buffer.length, 85000)
  // 撞上限就必须报 capped：这种结果落盘等于保证下次运行还会改写它
  assert.equal(r.capped, true, '还有收益却因上限停下 → capped')
  const natural = await convergeEncode(Buffer.alloc(100000), seqEncoder([50000, 30000, 29000, 29000]))
  assert.equal(natural.capped, false, '自然收敛不算 capped')
})

test('firstPassGainRatio：区分"从没压过"与"只剩余量"', () => {
  assert.equal(firstPassGainRatio(Buffer.alloc(10000), Buffer.alloc(3000)), 0.7, '掉 70%')
  assert.equal(firstPassGainRatio(Buffer.alloc(10000), Buffer.alloc(10000)), 0, '没掉')
  assert.equal(firstPassGainRatio(Buffer.alloc(10000), Buffer.alloc(9900)), 0, '只省 100B 视为无收益')
})

test('matchesGlob：--only 支持文件名通配与路径片段', () => {
  assert.ok(matchesGlob('cat-apple.png', 'cat-*.png'))
  assert.ok(matchesGlob('level-10.png', 'level-1?.png'))
  assert.ok(matchesGlob('sub/cat-a.png', '**/cat-a.png'))
  assert.ok(!matchesGlob('dog-a.png', 'cat-*.png'))
  assert.ok(!matchesGlob('cat-a.jpg', 'cat-*.png'))
})

test('真实 sharp：收敛后重复跑是空转（这条就是修这个工具的初衷）', async () => {
  const sharp = (await import('sharp')).default
  // 用平滑渐变：这类图**多轮收益都超过 128B**（实测各轮 227120 / 1140 / 1160 / 741 / 749 …），
  // 正是旧「只压一轮」写法的受害场景——旧写法压完第一轮就收工，重跑还能再省 1KB 以上、于是又改写一次。
  // 纯色或高噪声图第一轮后就只剩几十字节，反而测不出这个问题（噪声图实测每轮约 -60B）。
  const size = 256
  const raw = Buffer.alloc(size * size * 3)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 3
      raw[i] = (x * 255 / size) | 0
      raw[i + 1] = (y * 255 / size) | 0
      raw[i + 2] = ((x + y) * 127 / size) | 0
    }
  }
  const src = await sharp(raw, { raw: { width: size, height: size, channels: 3 } }).png().toBuffer()
  const encode = (buf) => sharp(buf).png({ palette: true, quality: 88, effort: 9 }).toBuffer()

  const first = await convergeEncode(src, encode)
  assert.ok(first.saved > 0, `第一遍应当有收益（${src.length} → ${first.buffer.length}）`)
  assert.equal(first.capped, false, `应当自然收敛而不是撞上限（用了 ${first.passes} 轮）`)
  assert.ok(first.passes > 1, '这类图一轮压不到底，否则本测试失去意义')

  // 收敛后重跑必须空转 → 工具不会改写文件、不会白换 SW 缓存代次
  const again = await convergeEncode(first.buffer, encode)
  assert.equal(again.saved, 0, `收敛后重跑不应再有收益，但仍省了 ${again.saved}B（说明没收敛）`)
  assert.equal(again.buffer.length, first.buffer.length)
  assert.equal(again.capped, false, '已收敛的输入重跑必须是"自然停下"')

  // 说清"幂等"到底靠什么：编码器其实永远还能再挤一点（实测每轮还有几十到上千字节），
  // 真正拦住 churn 的判定是「单轮收益不足 128B 就不算收益、不写盘」。
  const probe = await encode(first.buffer)
  assert.ok(probe.length <= first.buffer.length, '编码器不会吐出更大的结果')
  assert.equal(firstPassGainRatio(first.buffer, probe), 0, '门槛判定为无收益 → 不写盘')
})

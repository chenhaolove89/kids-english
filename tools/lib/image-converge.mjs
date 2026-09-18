/**
 * 有损编码的收敛封装：反复编码直到「再编也不更小」，并始终保留见过的最小结果。
 *
 * 为什么需要它：PNG palette 量化**不是不动点**。把已经量化过的图再量化仍会略小
 * （实测每轮衰减约 0.55 倍：同一批已提交图片连跑 5 轮，分别改写 34/27/17/9/4 张），
 * 所以「压一次就当完事」的写法会让每次重跑都改写几百张文件——文件字节一变，
 * 发布脚本的静态树内容哈希就变、SW 缓存代次跟着换、老用户得重新下载这些图。
 * 收敛到不动点后，重复跑就是空转。
 *
 * 另一个必须保住的性质：**绝不返回比输入更大的结果**。palette 量化会反复
 * （实测某张图 5341 → 5638 → 5629 → 5611），所以每轮都要和「当前最小」比，
 * 而不是和「上一轮」比。
 *
 * 编码器由调用方注入（真实场景是 sharp），因此这里不依赖图片库、可纯函数单测。
 */

/** 省不足这么多字节视为没有收益：避免为了几百字节改写文件、白白换掉缓存代次 */
export const DEFAULT_MIN_GAIN = 128
/**
 * 轮次上限：确定性编码下收益必然衰减到门槛以下，上限只是兜底。
 * 取值依据（2026-09-17 实测本仓 1396 张 PNG「跌到 128B 需要几轮」的分布）：
 * 1 轮 205 张、2 轮 145、3 轮 177、4 轮 171、5 轮 122、6 轮 63、7 轮 32、8 轮 14、
 * 9 轮 3、10 轮 3，**最坏 10 轮**（crystalball.png）；平滑渐变这类尾巴更长的合成图约 19 轮。
 * 所以取 24，留足一倍余量。
 */
export const DEFAULT_MAX_PASSES = 24

/**
 * @param {Buffer} input 原始字节
 * @param {(buf: Buffer) => Promise<Buffer>} encode 编码器（同输入必出同输出，否则不保证收敛）
 * @returns {Promise<{buffer: Buffer, passes: number, saved: number, capped: boolean}>}
 *          buffer 是见过的最小结果；saved 为 0 表示不值得改写；
 *          **capped 为真表示是撞上限停下的、收益还没跌破门槛** —— 这种结果绝不能落盘：
 *          写下去等于保证下一次运行还会再改写它（churn），调用方应当报告并跳过。
 */
export async function convergeEncode(input, encode, options = {}) {
  const minGain = options.minGain ?? DEFAULT_MIN_GAIN
  const maxPasses = options.maxPasses ?? DEFAULT_MAX_PASSES
  let best = input
  let passes = 0
  let lastGain = 0
  for (let i = 0; i < maxPasses; i++) {
    const out = await encode(best)
    passes++
    lastGain = best.length - out.length
    if (lastGain > minGain) best = out
    else break
  }
  // 撞上限与自然收敛的区别就看最后一轮的收益：还在涨说明没到底
  const capped = passes >= maxPasses && lastGain > minGain
  return { buffer: best, passes, saved: input.length - best.length, capped }
}

/**
 * 单轮压缩比：给调用方做「这张图像是从没压过，还是只剩余量」的判断。
 * 返回 0 表示这一轮没收益。
 */
export function firstPassGainRatio(input, out, minGain = DEFAULT_MIN_GAIN) {
  if (out.length >= input.length - minGain) return 0
  return 1 - out.length / input.length
}

/** 极简 glob（支持 * / ** / ?）：相对路径匹配，够用于 --only 指定图片 */
export function matchesGlob(relPath, pattern) {
  const rx = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/\u0000/g, '.*')
  return new RegExp(`^${rx}$`).test(relPath) || relPath.includes(pattern)
}

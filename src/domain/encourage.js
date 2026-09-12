/**
 * 鼓励语轮换纯函数：随机但不连续重复（池 >1 时），
 * 让「答对啦真棒 / 完全正确 / 你真聪明…」轮着出现，孩子不腻。
 */

/**
 * @param {string[]} pool 可用表扬语 key 清单（来自 src/data/encourage.json，缺文件的不进池）
 * @param {string|null} lastKey 上一把播的 key（避免连续重样）
 * @param {()=>number} rng
 * @returns {string|null} key；池为空返回 null（调用方回退 zh-great）
 */
export function pickPraise(pool, lastKey, rng = Math.random) {
  if (!Array.isArray(pool) || pool.length === 0) return null
  if (pool.length === 1) return pool[0]
  const cands = pool.filter((k) => k !== lastKey)
  return cands[Math.floor(rng() * cands.length)] || null
}

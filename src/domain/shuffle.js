/**
 * 随机工具：rng 可注入（测试用确定性序列），默认 Math.random。
 * 所有依赖随机性的 domain 函数都应通过参数接收 rng，保持纯函数可测。
 */
export function shuffle(arr, rng = Math.random) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function pickOne(arr, rng = Math.random) {
  return arr[Math.floor(rng() * arr.length)]
}

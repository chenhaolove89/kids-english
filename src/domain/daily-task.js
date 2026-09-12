/**
 * 今日小任务纯函数：软推荐（不是打卡）——首页给一个「今天玩这个」的默认答案。
 *
 * 优先级（与首页其他卡片的分工）：
 * - 有到期错题 → 返回 null：错题重练卡已经承担了「今天先做这个」；
 * - 否则从未拿满 3 星的挑战里挑一关（星少的优先；同级里按日期轮换，
 *   同一天 recommendation 稳定，不同天有新鲜感）。
 *
 * 纯函数：候选与到期数由调用方（map 页）从目录与进度算好传入，Node 可测。
 */

/**
 * @param {{dueTotal:number, candidates:Array<{lessonId:string,title:string,stars:number,order:number}>, dayKey:string}} input
 * @returns {{lessonId:string, title:string}|null}
 */
export function pickDailyTask({ dueTotal, candidates, dayKey = '' } = {}) {
  if (dueTotal > 0) return null
  const pool = (candidates || []).filter((c) => c && c.lessonId && (c.stars || 0) < 3)
  if (!pool.length) return null
  const min = Math.min(...pool.map((c) => c.stars || 0))
  const weakest = pool.filter((c) => (c.stars || 0) === min).sort((a, b) => a.order - b.order)
  if (weakest.length === 1) return { lessonId: weakest[0].lessonId, title: weakest[0].title }
  // 同星多关：按 dayKey 哈希轮换（稳定的伪随机，同一天不跳变）
  let h = 0
  for (const ch of String(dayKey)) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const pick = weakest[h % weakest.length]
  return { lessonId: pick.lessonId, title: pick.title }
}

/** 今天的 dayKey（本地时区，YYYY-MM-DD） */
export function todayKey(now = Date.now()) {
  const d = new Date(now)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

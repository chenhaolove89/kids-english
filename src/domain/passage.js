/**
 * 语文阅读理解短文的纯逻辑：题目稳定 id 的约定 + 「读懂一篇」的判定。
 *
 * 为什么单独一个模块：题目的稳定 id 被两处消费，两边必须用同一份约定——
 *   1) 作答事件（services/session.js 的 attempt.itemId）——图鉴与将来的错题回流都按它定位；
 *   2) 图鉴分桶 zhPassages 的写入口径与历史回填（services/collection.js、
 *      domain/collection.js 的 deriveFromHistory）。
 * 约定散成两份就是图鉴「孩子答了但不亮」这类静默失效的来源。
 *
 * 本文件不 import 任何数据 JSON 与平台代码，Node 可测。
 */

/**
 * 一道题的稳定 id：`ps-g12-1-q0`（篇 id + 题号，题号从 0 起，与内容源里的题序一一对应）。
 *
 * 为什么带题号而不是只用篇 id：错题回流要能定位到「这一篇的第几题」；
 * 图鉴则按篇聚合（见 passageLightsFromAttempts），两者从同一个 id 派生，不会打架。
 */
export function questionId(passageId, index) {
  return `${passageId}-q${index}`
}

/** 反向解析：题目 id → 所属篇 id。不是本约定的 id 返回空串（调用方据此跳过）。 */
export function passageIdOf(itemId) {
  const m = /^(.*)-q\d+$/.exec(String(itemId || ''))
  return m ? m[1] : ''
}

/**
 * 从一个挑战会话的作答事件里派生「哪些篇点亮了」。
 *
 * 口径（产品决定，与 domain/collection.js 的桶注释一致）：
 *   - 一篇短文 = 图鉴里的一格（不是一题一格）；
 *   - seen（认识）：该篇有作答记录，也就是这一篇的挑战做过了；
 *   - mastered（读懂）：该篇**每一条作答都是首答答对**。
 *
 * 为什么「全部首答答对」就等于「全对」：一篇文章一次挑战，页面只在最后一题作答后
 * 才 completeSession（中途退出走 pause），所以能走到这里的一篇必然三题都答过。
 * 这样就不需要在这里写死题数——内容门禁保证每篇恰好 3 题，但本函数不依赖它。
 *
 * @returns {{seen: string[], mastered: string[]}} 篇 id 数组（mastered ⊆ seen）
 */
export function passageLightsFromAttempts(attempts, sessionId) {
  const byPassage = new Map()
  for (const a of attempts || []) {
    if (!a || a.sessionId !== sessionId) continue
    const pid = passageIdOf(a.itemId)
    if (!pid) continue
    const cur = byPassage.get(pid) || { allFirstTryCorrect: true }
    // 首答答错（含「答错后重试答对」）就不再是「读懂」
    if (!(a.firstTry && a.correct)) cur.allFirstTryCorrect = false
    byPassage.set(pid, cur)
  }
  const seen = [...byPassage.keys()]
  const mastered = seen.filter((pid) => byPassage.get(pid).allFirstTryCorrect)
  return { seen, mastered }
}

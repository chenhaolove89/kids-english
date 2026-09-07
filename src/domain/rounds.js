/**
 * 听音选图/选字挑战的出轮逻辑：从 pages/quiz/quiz.vue 原样抽出。
 * 每轮：1 个答案 + (optionsPerRound-1) 个不重复干扰项。
 */
import { shuffle } from './shuffle.js'

/**
 * @param {Array<{id}>} pool 候选条目（单词或汉字），必须非空
 * @returns {Array<{answer, options}>} answer/options 是 pool 里的原对象引用
 * @throws {Error} 'empty-pool' 当池为空（调用方需兜底提示，不得静默出 0 轮）
 */
export function buildListenPickRounds(pool, { count = 10, optionsPerRound = 4, rng = Math.random } = {}) {
  if (!Array.isArray(pool) || pool.length === 0) throw new Error('empty-pool')
  const n = Math.max(2, Math.min(optionsPerRound, pool.length))
  const answers = shuffle(pool, rng).slice(0, Math.min(count, pool.length))
  return answers.map((w) => ({
    answer: w,
    options: shuffle([w, ...shuffle(pool.filter((x) => x.id !== w.id), rng).slice(0, n - 1)], rng),
  }))
}

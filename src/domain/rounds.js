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

/** 语文汉字题型，与 quiz.vue 的渲染分支一一对应 */
export const ZH_CHAR_KINDS = ['listen-pick', 'char-to-pinyin', 'pinyin-to-char', 'char-to-word']

/**
 * 语文汉字多题型出轮：listen-pick 沿用听音选字（选项为池对象引用）；
 * 其余三种为文本题、不播题干音频，选项统一为 { id, label }：
 * - char-to-pinyin 看字选拼音（label=拼音）
 * - pinyin-to-char 看拼音选字（label=汉字，prompt=拼音）
 * - char-to-word   看字选组词（label=组词）
 * 拼音类题的干扰项必须与答案拼音不同，否则会出现两个可判对的选项。
 * @param {Array<{id,char,pinyin,word,audio}>} pool mapZhOption 输出
 * @returns {Array<{kind,answer,options,prompt?}>}
 * @throws {Error} 'empty-pool' 当池为空
 */
export function buildZhCharRounds(pool, { count = 10, optionsPerRound = 4, rng = Math.random } = {}) {
  if (!Array.isArray(pool) || pool.length === 0) throw new Error('empty-pool')
  const n = Math.max(2, Math.min(optionsPerRound, pool.length))
  return shuffle(pool, rng)
    .slice(0, Math.min(count, pool.length))
    .map((w, i) => {
      const kind = ZH_CHAR_KINDS[i % ZH_CHAR_KINDS.length]
      if (kind === 'listen-pick') {
        return {
          kind,
          answer: w,
          options: shuffle([w, ...shuffle(pool.filter((x) => x.id !== w.id), rng).slice(0, n - 1)], rng),
        }
      }
      const byWord = kind === 'char-to-word'
      const labelOf = (x) => (byWord ? x.word : kind === 'char-to-pinyin' ? x.pinyin : x.char)
      // 冲突键：pinyin-to-char 里同音字互相冲突，其余题型按选项 label 冲突——
      // 同键条目只能出现一个，否则一轮里有多个可判对/无法分辨的选项
      const keyOf = kind === 'pinyin-to-char' ? (x) => x.pinyin : labelOf
      const answerKey = keyOf(w)
      const seen = new Set([answerKey])
      const distractorPool = []
      for (const x of pool) {
        if (x.id === w.id) continue
        const key = keyOf(x)
        if (seen.has(key)) continue
        seen.add(key)
        distractorPool.push(x)
      }
      const distractors = shuffle(distractorPool, rng).slice(0, n - 1)
      return {
        kind,
        answer: w,
        prompt: kind === 'pinyin-to-char' ? w.pinyin : w.char,
        options: shuffle([w, ...distractors], rng).map((x) => ({ id: x.id, label: labelOf(x), color: x.color })),
      }
    })
}

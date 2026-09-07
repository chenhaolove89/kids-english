/**
 * 判题：所有题型统一「选中的 id 是否等于题答案」。
 * 数学题 answer 统一存字符串（选项 id / compare 的组序号也转字符串），此处只做规整比较。
 */
export function isPickCorrect(question, pickedId) {
  if (!question) return false
  return String(pickedId) === String(question.answer)
}

/**
 * 听音选图轮次判题：round.answer 是内容条目对象（含 id），与选项对象同源。
 */
export function isRoundPickCorrect(round, pickedId) {
  if (!round || !round.answer) return false
  return String(pickedId) === String(round.answer.id)
}

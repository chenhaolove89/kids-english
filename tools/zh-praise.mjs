/**
 * 表扬语正典清单（单一真源）：
 * - tools/gen-zh-azure.mjs --misc（Azure Xiaoyi，正典音色）从这里取文案；
 * - tools/gen-encourage.mjs（Edge Xiaoyi 兜底，无 Azure key 的机器用）也从这里取，
 *   生成同一批文件；有 key 的机器跑 `npm run gen:zh-azure -- --misc --force` 会用
 *   Azure 覆盖重生成，音色回到正典。
 * 文案约束：末字避开阴平（Edge/Azure 都有过「末字一声读成降调」的事故，见
 * bf56fdf9）；孩子能听懂的短句。
 */
export const ZH_PRAISE = [
  ['zh-great', '答对啦，真棒！'],
  ['zh-awesome', '太厉害了！'],
  ['zh-perfect', '完全正确！'],
  ['zh-well', '做得真好！'],
  ['zh-smart', '你真聪明！'],
  ['zh-amazing', '你太棒啦！'],
  ['zh-wonderful', '真是好办法！'],
  ['zh-clever', '反应真快！'],
]

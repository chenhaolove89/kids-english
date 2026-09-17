/**
 * 极简 CSV 行解析：支持双引号包裹的字段。
 *
 * 为什么需要：英语句子层（tools/en-sentences.csv）里有一批句子本身含逗号
 * （「When I grow up, I want to be a doctor.」「... , but I am better at English.」），
 * 用 line.split(',') 读会把句子截断在逗号处——TTS 会念半句、配图/中文列也会错位。
 *
 * 规则：字段用双引号包裹时可含逗号；字段内的字面双引号写成两个双引号（""）。
 * 不处理换行包字段（我们的 CSV 一条记录就是一行，句子不允许跨行）。
 */
export function parseCsvLine(line) {
  const out = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ } else inQuotes = false
      } else cur += ch
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out.map((x) => x.trim())
}

/** 读一个 CSV 文件的所有数据行（跳过表头与空行），逐行返回字段数组 */
export function readCsvRows(text) {
  const rows = []
  const lines = text.split(String.fromCharCode(13)).join('').split(String.fromCharCode(10))
  for (const line of lines) {
    const t = line.trim()
    if (!t) continue
    rows.push(parseCsvLine(t))
  }
  return rows
}

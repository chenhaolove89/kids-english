/**
 * 原子写文件：先写同目录临时文件，再 rename 覆盖目标。
 *
 * 为什么需要：生成脚本原来直接 writeFileSync 到最终路径，一次 Ctrl-C、磁盘满或
 * 进程被杀就会留下**半截 JSON**。半截 JSON 会被下游读取时解析失败 →
 * storage/validate 侧只能 fallback 到空值，用户侧表现为"进度清零"。
 * rename 在同一文件系统上是原子操作，因此目标文件要么是旧的完整内容，要么是新的完整内容。
 *
 * 失败时清理临时文件，避免留下 .tmp 垃圾被审计当成资源。
 */
import fs from 'node:fs'

export function writeFileAtomic(file, data) {
  const tmp = `${file}.tmp-${process.pid}`
  try {
    fs.writeFileSync(tmp, data)
    fs.renameSync(tmp, file)
  } catch (e) {
    try {
      fs.unlinkSync(tmp)
    } catch (cleanupErr) {
      /* 临时文件可能没建出来，忽略 */
    }
    throw e
  }
}

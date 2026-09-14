#!/usr/bin/env node
// 历史入口保留明确提示，避免旧命令重新生成已弃用的课堂语音。
console.error('课堂音已移除。请使用 npm run gen:en-youdao（美式有雅婷 / 英式有小英）。')
process.exitCode = 1

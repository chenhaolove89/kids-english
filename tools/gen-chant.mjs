#!/usr/bin/env node
// 只更新已启用的韵律清单，两种口音都由有道生成；不覆盖清单、不恢复旧音色。
import { main } from './gen-en-youdao.mjs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

try {
  await main(['--chants-only', '--apply', ...process.argv.slice(2)])
  execFileSync(process.execPath, [fileURLToPath(new URL('./gen-audio-volumes.mjs', import.meta.url)), '--english-only'], { stdio: 'inherit' })
} catch (e) {
  console.error(e.message)
  process.exitCode = 1
}

/**
 * 打包"电脑版分享包"：dist/build/web + 零依赖 PowerShell 服务器 + 一键启动
 * 用法：npm run build:h5 之后 → node tools/make-share.mjs
 * 产物：快乐学单词-电脑版.zip（发给朋友，解压后双击"启动.bat"即可）
 */
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'dist/build/web')
const TEMPLATE = path.join(ROOT, 'tools/share-templates')
const OUT_DIR = path.join(ROOT, 'tmp/share/HappyWords-PC')
const OUT_ZIP = path.join(ROOT, '快乐学单词-电脑版.zip')

if (!fs.existsSync(path.join(SRC, 'index.html'))) {
  console.error('未找到 dist/build/web/index.html，请先 npm run build:h5')
  process.exit(1)
}

fs.rmSync(path.join(ROOT, 'tmp/share'), { recursive: true, force: true })
fs.mkdirSync(OUT_DIR, { recursive: true })
fs.cpSync(SRC, OUT_DIR, { recursive: true })
fs.copyFileSync(path.join(TEMPLATE, 'server.ps1'), path.join(OUT_DIR, 'server.ps1'))

fs.writeFileSync(
  path.join(OUT_DIR, 'start.bat'),
  '@echo off\r\ncd /d "%~dp0"\r\npowershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"\r\n'
)

fs.writeFileSync(
  path.join(OUT_DIR, 'readme.txt'),
  [
    '【快乐学单词 电脑版 - 使用说明】',
    '',
    '1. 先把整个文件夹解压出来（不要在压缩软件里直接双击运行）',
    '2. 双击 start.bat',
    '   - 如果 Windows 弹出蓝色提示"Windows 已保护你的电脑"：',
    '     点「更多信息」→ 再点「仍要运行」',
    '   - 杀毒软件如提示，选择"允许运行"',
    '3. 浏览器会自动打开 http://127.0.0.1:8137/',
    '4. 点分类卡片学单词；点大卡片听发音；底部箭头或拖动翻页；点底部「听音选图挑战」玩游戏',
    '5. 用完后直接关掉那个黑色服务窗口即可',
    '',
    '常见问题：',
    '- 没有声音：浏览器要求先点击页面任意位置才有声音，点一下就有；再检查系统音量',
    '- 双击后窗口一闪而过：请确认是先解压再运行',
    '- 推荐使用 Chrome 或 Edge 浏览器',
    '',
  ].join('\r\n')
)

fs.rmSync(OUT_ZIP, { force: true })
execSync(
  `powershell -NoProfile -Command "Compress-Archive -Path '${OUT_DIR.replace(/'/g, "''")}' -DestinationPath '${OUT_ZIP.replace(/'/g, "''")}' -Force"`,
  { stdio: 'inherit' }
)

const size = (fs.statSync(OUT_ZIP).size / 1048576).toFixed(1)
console.log(`\n完成: ${OUT_ZIP} (${size}MB)`)
console.log('发给朋友 → 朋友解压 → 双击 start.bat')

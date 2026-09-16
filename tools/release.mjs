#!/usr/bin/env node
/**
 * 一键发版编排（P3a）：把「版本号三处同步 → 内容校验 → 测试 → 分层/资源/音频审计
 * → 构建 → 分享包 →（可选）部署预览」收成一条命令，消灭手工发版最常漏的步骤。
 *
 * 用法：
 *   npm run release                  # 校验+测试+分层/资源/音频门禁+构建+分享包
 *   npm run release -- --deploy     # 上面全部 + 推送源码仓 gh-pages 预览（抢先版）
 *   npm run release -- --skip-build  # 只做校验/测试/审计（不重新构建）
 *   npm run release -- --skip-tests  # 跳过测试（不推荐；仅排版微调时用）
 *
 * 版本号三处（缺一即 fail）：
 *   package.json "version" ↔ package-lock.json ↔ src/manifest.json versionName/versionCode
 *   versionCode 约定 = major*100 + minor*10 + patch（1.4.0 → 140）
 * 正式发布仓（--target release）不在本脚本范围：仅在用户明确要求同步正式仓时手工执行
 * tools/publish-github-pages.mjs --target release（README 约定）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const SKIP_BUILD = argv.includes('--skip-build')
const SKIP_TESTS = argv.includes('--skip-tests')
const DEPLOY = argv.includes('--deploy')

const step = async (name, fn) => {
  process.stdout.write(`\n== ${name} ==\n`)
  return await fn()
}

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')
const run = (cmd) => execSync(cmd, { cwd: ROOT, stdio: 'inherit' })

function checkVersions() {
  const pkg = JSON.parse(read('package.json'))
  const lock = JSON.parse(read('package-lock.json'))
  const manifest = read('src/manifest.json')
  const version = pkg.version
  // package-lock：packages[""].version 与根 version 都要一致
  const lockRoot = lock.version
  const lockPkg = lock.packages && lock.packages[''] && lock.packages[''].version
  const mName = manifest.match(/"versionName"\s*:\s*"([^"]+)"/)
  const mCode = manifest.match(/"versionCode"\s*:\s*"([^"]+)"/)
  const errors = []
  if (lockRoot !== version) errors.push(`package-lock.json version=${lockRoot} ≠ ${version}`)
  if (lockPkg !== version) errors.push(`package-lock.json packages[""].version=${lockPkg} ≠ ${version}`)
  if (!mName || mName[1] !== version) errors.push(`manifest.json versionName=${mName && mName[1]} ≠ ${version}`)
  const [maj, min, pat] = version.split('.').map(Number)
  // versionCode 公式只在 minor/patch 为个位数时无歧义（1.5.10 会与 1.6.0 撞号）
  if (!(maj >= 0 && maj <= 9) || !(min >= 0 && min <= 9) || !(pat >= 0 && pat <= 9)) {
    console.error(`✗ 版本号 ${version} 超出 versionCode 公式（maj*100+min*10+pat）的无歧义范围，请改用 X.Y.Z（各位 0-9）或改公式`)
    process.exit(1)
  }
  const wantCode = String(maj * 100 + min * 10 + pat)
  if (!mCode || mCode[1] !== wantCode) errors.push(`manifest.json versionCode=${mCode && mCode[1]} ≠ ${wantCode}（约定 maj*100+min*10+pat）`)
  if (errors.length) {
    console.error('✗ 版本号三处不同步：')
    errors.forEach((e) => console.error('  - ' + e))
    console.error('发版前先把 package.json / package-lock.json / src/manifest.json 改成同一个版本。')
    process.exit(1)
  }
  console.log(`✓ 版本号三处同步：${version}（versionCode ${wantCode}）`)
  return version
}

async function main() {
  console.log(`发版编排开始${SKIP_BUILD ? '（跳过构建）' : ''}${SKIP_TESTS ? '（跳过测试）' : ''}${DEPLOY ? '（含部署预览）' : ''}`)
  const version = await step('1/6 版本号三处同步', async () => checkVersions())

  await step('2/6 内容目录校验（catalog 与源一致）', async () => {
    run('npm run validate:content')
  })

  if (!SKIP_TESTS) {
    await step('3/6 全量测试', async () => {
      run('npm test')
    })
    await step('4/6 分层门禁', async () => {
      run('npm run check:layering')
    })
    await step('5/6 资源审计（图片/音频引用）', async () => {
      run('npm run audit:assets')
    })
    await step('6/6 音频质量审计（解码/静音/削波）', async () => {
      run('npm run audit:audio')
    })
  } else {
    console.log('\n（--skip-tests：跳过测试、分层门禁与资源/音频审计）')
  }

  if (!SKIP_BUILD) {
    await step('构建 H5 + 分享包', async () => {
      run('npm run build:h5')
      run('node tools/make-share.mjs')
    })
  }

  if (DEPLOY) {
    await step('部署：gh-pages 抢先版（产物准备 + 真实 git 推送）', async () => {
      run('node tools/publish-github-pages.mjs')
      // publish 脚本只准备产物目录；真正上线靠这段 git 推送（README 手工流程）。
      // remote 若是 SSH 地址（本机无可用公钥会挂死）自动换成 HTTPS+凭据助手
      const preview = path.join(ROOT, 'tmp', 'gh-preview')
      const git = (args) => execSync('git ' + args, { cwd: preview, stdio: 'pipe' }).toString().trim()
      if (!fs.existsSync(path.join(preview, '.git'))) {
        git('init -b gh-pages')
      }
      const remoteUrl = (() => {
        try {
          return git('remote get-url origin')
        } catch {
          return ''
        }
      })()
      if (!remoteUrl) git('remote add origin https://github.com/chenhaolove89/kids-english.git')
      else if (remoteUrl.startsWith('git@github.com:')) git('remote set-url origin https://github.com/chenhaolove89/kids-english.git')
      git('add -A')
      const committed = (() => {
        try {
          git('commit -q -m "发布：v' + version + '（release --deploy 自动推送）"')
          return true
        } catch {
          return false // 无变更时 commit 非零，属正常
        }
      })()
      const before = (() => {
        try {
          return git('ls-remote origin refs/heads/gh-pages').split(/	/)[0]
        } catch {
          return ''
        }
      })()
      git('push -f origin gh-pages:gh-pages')
      const after = (() => {
        try {
          return git('ls-remote origin refs/heads/gh-pages').split(/	/)[0]
        } catch {
          return ''
        }
      })()
      if (after && after === before && committed) {
        console.error('✗ gh-pages 推送后远端无变化——推送可能未生效，请手工检查 tmp/gh-preview')
        process.exit(1)
      }
      console.log('✓ gh-pages 已更新：' + (after || '(远端查询失败，请自行确认)') + (committed ? '' + '（新提交）' : '（内容无变化）'))
    })
  }

  console.log(`\n✅ 发版编排完成：v${version}${DEPLOY ? '，预览已部署' : ''}`)
  console.log('   电脑版分享包见仓库根 zip；正式发布仓（kids-english-web）按约定手工执行：')
  console.log('   node tools/publish-github-pages.mjs --target release')
}

main().catch((e) => {
  console.error('发版编排失败：', e)
  process.exit(1)
})

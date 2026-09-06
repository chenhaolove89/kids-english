# 快乐学单词

给小朋友的看图学单词 H5：图片 + 单词，点一下发音。**300 词 / 18 个分类**（动物、水果、蔬菜、食物、交通工具、颜色、数字、自然、身体、衣服、物品、场所、运动、乐器、玩具、人物、动作、表情）。iPad Safari 打开网址即用，"添加到主屏幕"后和 App 一样全屏运行。

**技术栈**：uni-app (Vue3 + Vite) / Howler.js（WebAudio 播放，规避 iPad 静音开关） / 微软 Edge TTS 预生成音频 / Noto Emoji 配图（Apache-2.0 可商用）。纯静态、零服务器、完全离线可跑。

## 目录结构

```
tools/words.csv          ★ 词表（改内容只动这个文件）
tools/gen-assets.mjs     资源生成脚本（TTS + 图片 + 数据）
src/pages/index/         首页：分类宫格
src/pages/learn/         学词页：滑动翻卡，点卡片发音
src/pages/quiz/          听音选图小游戏（10 题，答对撒花）
src/utils/player.js      音频播放封装（Howler）
src/static/audio/        生成的单词 MP3（勿手工改）
src/static/img/          生成的配图（勿手工改）
src/data/words.json      生成的页面数据（勿手工改）
src/data/audio-volumes.json  每词播放增益表（勿手工改）
```

## 常用命令

```bash
npm install            # 首次
npm run gen:assets     # 改词表后重新生成音频/图片/数据（加 --force 全量重生成）
node tools/gen-audio-volumes.mjs   # 音频变动后重算每词增益（响度对齐 + 防削波）
npm run dev:h5         # 本地开发 http://localhost:5173
npm run build:h5       # 构建 → dist/build/h5/
node tools/serve.mjs   # 预览生产构建 → http://127.0.0.1:4173（或双击"本地预览.bat"）
```

> 注意：构建产物**不能双击 index.html 打开**（浏览器禁止 file:// 页面加载 ES module 脚本，会白屏），本地预览请走上面的本地服务。

## 怎么加单词

1. 编辑 `tools/words.csv`，一行一个词：
   `id,en,zh,phonetic,category,emoji,draw`
   - `emoji` 填 Unicode 码点（如苹果 `1f34e`，可在 https://emojipedia.org 查 "codepoints"）
   - 图片想自绘就留空 `emoji` 填 `draw`（数字卡片就是这么生成的）
   - 新分类需在 `tools/gen-assets.mjs` 的 `CATEGORIES` 里补一条（名称/颜色/图标）
2. `npm run gen:assets` → 自动下载配图 + 生成发音 + 更新数据（已有资源自动复用，只补新的）
3. `npm run build:h5` → 重新部署

## 上线（uniCloud 前端网页托管）

**方式 A：网页控制台拖拽上传（最快）**
1. 打开 https://unicloud.dcloud.org.cn → 进入服务空间 → 前端网页托管
2. 把 `dist/build/h5/` 里的全部内容打成 zip（或直接上传文件）上传
3. 用分配的 `*.bspapp.com` 默认域名访问，iPad Safari 打开 → 分享 → 添加到主屏幕

**方式 B：HBuilderX 一键发行**
1. HBuilderX 打开本项目 → 登录 DCloud 账号 → 项目右键创建 uniCloud 云开发环境（阿里云版免费）
2. 菜单 发行 → 网站-PC Web 或手机 H5 → 勾选"部署到 uniCloud 前端网页托管" → 选择空间 → 发行

> 免费额度对个人使用绰绰有余，超额只会限流不会自动扣费。

## iPad 使用

Safari 打开网址 → 分享 → 添加到主屏幕 → 桌面图标点开全屏运行。发音用 WebAudio 播放，不受静音键影响；点击发音本身是用户手势，无自动播放限制。

## 后续可扩展

- 慢速/拼读版音频（gen 脚本里加 `rate` 参数再生成一份）
- "已学会"标记与进度（uniCloud 云数据库同步）
- 更多分类与词表；AI 生成统一风格插画替换 emoji 图
- 打包安卓 APK（HBuilderX 云打包，代码不用改）

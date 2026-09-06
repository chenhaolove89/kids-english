# 快乐学园（原快乐学单词）

给小朋友的多科目学习 H5：**英语 / 语文 / 数学** 三个科目，每个科目按难度分 4 个等级。iPad/手机/电脑浏览器打开即用，"添加到主屏幕"后和 App 一样全屏运行。纯静态、零服务器、完全离线可跑。

- **学英语**：约 2000 单词 / 50+ 分类（动物、食物、国家国旗、太空、职业、常用词、词族拼读……），看图学词 + 听音选图挑战
- **学语文**：约 300 个常用汉字分级识字（字 + 拼音 + 例词 + 真人发音），听音识字挑战
- **学数学**：4 关动态出题（点数/听音认数 → 十以内加减 → 二十以内/比大小 → 乘法口诀/平均分），全程中文语音读题

**技术栈**：uni-app (Vue3 + Vite) / Howler.js（WebAudio 播放，规避 iPad 静音开关） / 微软 Edge TTS 预生成音频（英文儿声 + 中文晓晓） / Noto Emoji 配图（Apache-2.0 可商用）。

## 目录结构

```
tools/words-base.csv      ★ 原始 300 词（只读，保留底稿）
tools/words-extra/*.csv   ★ 新增词表（按等级拆文件）
tools/merge-words.mjs     词表合并 + 校验（id 唯一/同级 en 不重复）→ words.csv
tools/words.csv           合并后的完整词表（gen-assets 的输入，勿手改）
tools/hanzi.csv           ★ 语文识字表（char,pinyin,word,level）
tools/gen-assets.mjs      资源生成：中英 TTS + emoji 图 + 自绘词卡 + 数据 JSON
tools/gen-audio-volumes.mjs  音频响度对齐（生成每词增益表）
tools/make-contact-sheet.ps1 全量图片拼图核对工具
tools/make-share.mjs      电脑版零依赖分享包打包
tools/publish-github-pages.mjs  GitHub Pages 发布（子路径相对化）
src/pages/home/           主页：科目选择（英/语/数）
src/pages/index/          英语：等级 → 分类宫格
src/pages/chinese/        语文：等级 → 学一学/挑战
src/pages/math/           数学：关卡选择 + 练习页（动态出题）
src/pages/learn/          学词页：单词翻卡 / 汉字翻卡
src/pages/quiz/           挑战页：听音选图 / 听音选字
src/utils/player.js       音频播放封装（Howler，支持语音序列连播）
src/data/words.json       英语数据（含 level，勿手工改）
src/data/hanzi.json       语文数据（勿手工改）
src/data/audio-volumes.json  每词播放增益表（勿手工改）
```

## 常用命令

```bash
npm install                  # 首次
node tools/merge-words.mjs   # 改词表后：合并校验 → tools/words.csv
npm run gen:assets           # 生成音频/图片/数据（增量；--force 全量）
node tools/gen-audio-volumes.mjs   # 音频变动后重算增益
npm run dev:h5               # 本地开发 http://localhost:5173
npm run build:h5             # 构建 → dist/build/h5/（及 web/）
node tools/serve.mjs         # 预览生产构建 → http://127.0.0.1:4173
```

> 构建产物**不能双击 index.html 打开**（file:// 禁止加载 ES module，会白屏），本地预览请走本地服务或"本地预览.bat"。

## 怎么加单词 / 加汉字

**英语**：在 `tools/words-extra/` 对应等级文件里加一行（或改 `words-base.csv`）：
`id,en,zh,phonetic,category,emoji,draw`
- `emoji` 填 Unicode 码点（多码点用 `_` 连接，如 👨‍👩‍👧 `1f468_200d_1f469_200d_1f466`；见 emojipedia "codepoints"）
- 没有 emoji 的词（高频词/动词/形容词等）留空 emoji，在 `draw` 填要显示的文本 → 自动生成彩色词卡
- 新分类需在 `tools/gen-assets.mjs` 的 `CATEGORIES` 和 `tools/merge-words.mjs` 的 `LEVEL_OF` 里补一条

**语文**：在 `tools/hanzi.csv` 加一行 `char,pinyin,word,level`（带声调拼音，word 为含该字的例词）。

然后依次：`merge-words → gen:assets → gen-audio-volumes → build:h5`。

## 上线

**GitHub Pages（发布脚本）**：`npm run build:h5` 后执行 `node tools/publish-github-pages.mjs`，
产物复制到 `tmp/gh-publish/`（含 .nojekyll + 静态路径相对化 + webmanifest 修正），推送到公开仓 `kids-english-web`。

**uniCloud 前端网页托管（HBuilderX）**：HBuilderX 打开项目 → 发行 → 网站-PC Web 或手机 H5 → 勾选部署到 uniCloud 前端网页托管。

**电脑版分享包**：`node tools/make-share.mjs` 生成零依赖静态服务器分享包，解压双击 `start.bat` 即用（端口 8137）。

## 数据规模

- 英语：L1 启蒙起步 / L2 日常生活 / L3 快乐探索 / L4 挑战进阶，共 50+ 分类
- 语文：L1-L4 约 300 字（基础字 → 生活字 → 探索字 → 进阶字）
- 数学：4 关卡，题目动态生成，数字 0-100 中文发音全覆盖

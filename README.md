# 快乐学园（原快乐学单词）

给小朋友的多科目学习 H5：**英语 / 语文 / 数学** 三个科目，每个科目按难度分 4 个等级。iPad/手机/电脑浏览器打开即用，"添加到主屏幕"后和 App 一样全屏运行。纯静态、零服务器、完全离线可跑。

- **学英语**：约 2000 单词 / 50+ 分类（动物、食物、国家国旗、太空、职业、常用词、词族拼读……），看图学词 + 听音选图挑战
- **学语文**：约 300 个常用汉字分级识字（字 + 拼音 + 例词 + 真人发音），听音识字挑战
- **学数学**：4 关动态出题（点数/听音认数 → 十以内加减 → 二十以内/比大小 → 乘法口诀/平均分），全程中文语音读题

**技术栈**：uni-app (Vue3 + Vite) / Howler.js（WebAudio 播放，规避 iPad 静音开关） / 微软 Edge TTS 预生成音频（英文儿声 + 中文晓晓） / Noto Emoji 配图（Apache-2.0 可商用）。

## 架构分层（2026-09 起）

v1.3 引入课程目录与学习闭环，代码按依赖方向分层（只许上层引下层）：

```
src/domain/      ★ 纯函数：判题、星级口径、数学出题、出轮、复习调度、收集点亮合并（Node 可测，禁碰 uni/DOM/Howler）
src/platform/    平台封装：storage(schemaVersion+迁移+容错)、audio(Howler 收口)、assets(资源 URL 收口)
src/content/     课程目录运行时（catalog.json 由工具生成，勿手改）+ 数据适配器
src/services/    应用服务：session(课时会话与作答事件流)、progress(进度聚合)、curriculum(目录查询/继续学习)、collection(图鉴点亮持久化+历史回填)
src/pages/       页面壳（布局、导航），业务逻辑逐步下沉
```

设计文档：`docs/learning-platform-plan.md`（总纲）、`docs/architecture.md`（实施细化）。学习记录采用**追加事件流**（Attempt/Session 本地存储，schemaVersion 化），星级 = 首次作答正确率（≥90% 3星 / ≥60% 2星 / 完成即 1星）；中断会话存题目快照，恢复不重新出题。课程页即首页（Tab 三栏：课程/收集/家长），提供四阶段课程地图（启蒙/一二/三四/五六年级，难度 L1-L4 与年级解耦）、"继续学习"与"错题重练"入口；收集页（我的百宝箱）把星星变成可收集的图鉴：学一学点亮「认识」、挑战首答答对升级「掌握」。

> **质量门禁**：凡改动词表/识字表/出题逻辑/题目页面/静态资产，必须走 `.cursor/rules/content-audit-loop.mdc` 的多子代理审计循环（并行分科全量审计 → 修复 → 二轮复核抓漏网 → test/validate/build/浏览器实测），零容错。

## 目录结构

```
content-packages/curriculum.json  ★ 课程源（阶段/科目/级别映射，人工维护）
tools/validate-content.mjs        课程校验 + 目录打包（npm run build:content / validate:content）
tests/                            Node 内置测试（npm run test：出题/判题/会话/存储/收集/路由/目录回归）
src/domain/                       纯函数层（见上）
src/platform/                     平台层（storage/audio/assets）
src/services/                     应用服务层
src/content/                      课程目录 + 适配器（catalog.json 勿手改）
tools/words-base.csv      ★ 原始 300 词（只读，保留底稿）
tools/words-extra/*.csv   ★ 新增词表（按等级拆文件）
tools/merge-words.mjs     词表合并 + 校验（id 唯一/同级 en 不重复）→ words.csv
tools/words.csv           合并后的完整词表（gen-assets 的输入，勿手改）
tools/hanzi.csv           ★ 语文识字表（char,pinyin,word,level）
tools/gen-assets.mjs      资源生成：中英 TTS + emoji 图 + 自绘词卡 + 数据 JSON
tools/gen-tab-icons.mjs   底部 Tab 图标（Noto Emoji：📚/⭐/👪，npm run gen:tab-icons）
tools/gen-audio-volumes.mjs  音频响度对齐（生成每词增益表）
tools/make-contact-sheet.ps1 全量图片拼图核对工具
tools/make-share.mjs      电脑版零依赖分享包打包
tools/publish-github-pages.mjs  GitHub Pages 发布（子路径相对化）
src/pages/map/            课程 Tab（即首页）：继续学习 + 错题重练 + 阶段课程地图 + 🎲随机来一课 + 自由探索（旧入口）
src/pages/collection/     收集 Tab：我的百宝箱（英语/汉字图鉴两级点亮 + 数学徽章 + 庆祝条）
src/pages/parent/         家长 Tab：本机摘要 / 分科进度 / 最近记录 / 数据管理
src/pages/index/          英语：等级 → 分类宫格（旧入口保留）
src/pages/chinese/        语文：等级 → 学一学/挑战（旧入口保留）
src/pages/math/           数学：关卡选择 + 练习页（动态出题 + 快照恢复）
src/pages/learn/          学词页：单词翻卡 / 汉字翻卡（带进度快照）
src/pages/quiz/           挑战页：听音选图 / 听音选字（首答星级）
src/platform/audio.js     音频播放封装（Howler，支持语音序列连播；失败不阻塞作答）
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
npm run build:content        # 课程源变更后：校验 + 重新生成 src/content/catalog.json
npm run test                 # Node 测试（38 个：出题/判题/星级/会话/存储/目录）
npm run validate:content     # 只校验（CI 用；目录与源不一致则失败）
npm run dev:h5               # 本地开发 http://localhost:5173
npm run build:h5             # 构建 → dist/build/h5/
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

## 路线图

- ✅ Phase 0/1（当前）：架构分层 + 课程目录（68 课）+ 课时会话与事件流 + 首答星级 + 继续学习 + 本机学习摘要
- Phase 2：启蒙/低年级内容铺量、错题本与复习、家长周报
- Phase 3：微信小程序验证（资源 CDN 化是前置条件：静态资源 49MB 远超小程序主包 2MB 限制；音频 Howler 需条件编译换 uni.createInnerAudioContext）
- Phase 4：多孩子档案 + 云同步（上传作答事件流重放聚合）+ App 云打包

## 许可协议

本项目源码公开可读，但**不是** OSI 定义的开源软件，采用"双协议"模式：

- **代码**（`src/`、`tools/`、`tests/` 等全部源码与脚本）：[PolyForm Noncommercial 1.0.0](./LICENSE)
  - 个人学习、研究、家庭使用、爱好项目等**非商业用途免费**
  - **任何商业用途**（销售、收费服务、商业机构内部使用等）需获得作者书面授权
- **内容资源**（词表文案、识字数据、自绘插图、课程目录）：[CC BY-NC 4.0](./LICENSE-CONTENT.md)
  - 非商业使用须署名；商业使用需授权
- 第三方素材遵循其各自原有许可（如 Noto Emoji 配图：Apache-2.0，可商用）

商业授权与合作咨询：**452218405@qq.com**


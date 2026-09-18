# 快乐学园（原快乐学单词）

给小朋友的多科目学习 H5：**英语 / 语文 / 数学** 三个科目，每个科目按难度分 4 个等级。iPad/手机/电脑浏览器打开即用，"添加到主屏幕"后和 App 一样全屏运行。纯静态、零服务器（数据全部在本机，不上传）。

- **学英语**：1998 单词 / 54 分类（动物、野生动物、家人、食物、国家国旗、太空、职业、常用词、词族拼读……）+ **英语句子阶梯**（启蒙「日常用语」20 条 → 一二年级「小短句」→ 三四年级「稍长句」→ 五六年级「长句」，各 20 句，看图 + 听整句 + 点中文听释义），看图学词 + 听音选图挑战
- **学语文**：297 个常用汉字分级识字（字 + 拼音 + 例词 + 真人有声）+ 每字一句小短句 + 1420 词语卡 + 必背古诗点读 + 笔顺描红，听音识字挑战
- **学数学**：**16 个关卡**动态出题（点数/听音认数 → 十以内加减 → 二十以内/比大小 → 乘除进阶 → 万以内加减 → 小数与分数 → 图形规律/应用题/四则混合 → 认识形状 → 认识时间 → 长度与测量 → 周长与面积 → 分数初步 → 百分数与比例 → 统计与数据），中文语音读题

> **离线与隐私的确切范围**
>
> - App 本身不依赖任何服务器，学习记录全部在本机（浏览器存储），不上传。
> - "离线打开"由 service worker 提供，而 SW 只注入到 `tools/publish-github-pages.mjs` 的发布产物
>   （`npm run build:h5` 的原始产物没有 SW）。SW 在 install 阶段预缓存应用外壳，
>   之后访问过的音频/图片走缓存优先，**首次访问必须联网**。
>   带 `Range` 的请求（媒体元素取音频就是这么发的）会从缓存的完整响应里切出 206；
>   反向也守住：在线拿到的 206 半截内容**不会**被当成完整文件写进缓存。
>   这条路径用 `npm run verify:offline` 验证（含"断网时媒体元素真能播放"）。
> - 另有两类**只在线上才会出问题**的防线，同样由 `npm run verify:offline` 覆盖：
>   `/static/…` → `./static/…` 的**相对化改写完整性**（静态扫全部文本产物 + 真跑 9 个页面确认零 404；
>   构建目录里看不出问题），以及 **PWA manifest** 的 `start_url`/`scope`/图标必须解析到应用根
>   （manifest 位于 `/static/` 下、其内 URL 按 manifest 自身解析，写绝对路径会被改写坏）。
> - uni统计已关闭（`src/manifest.json` 的 `uniStatistics.enable = false`，构建产物里不再有 tongji 上报代码）。
>   uni-h5 运行时里仍带有 DCloud 广告模块的代码（`hac1/has1.dcloud.net.cn`），
>   本项目从不配置 adpid，因此不会发起请求；如需彻底剔除需改动 node_modules，不做。

**技术栈**：uni-app (Vue3 + Vite) / Howler.js（WebAudio 播放，规避 iPad 静音开关） / 有道英语 TTS（美式有雅婷 / 英式有小英）+ Azure / 微软 Edge 中文 TTS，预生成 MP3 / Noto Emoji 配图（Apache-2.0 可商用）。

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
tests/                            Node 内置测试（npm run test：出题/判题/会话/存储/收集/错题本/路由/目录/分层门禁/源码契约）
src/domain/                       纯函数层（见上）
src/platform/                     平台层（storage/audio/assets/nav/routes）
src/services/                     应用服务层
src/content/                      课程目录 + 适配器（catalog.json 勿手改）
tools/words-base.csv      ★ 原始 300 词（只读，保留底稿）
tools/words-extra/*.csv   ★ 新增词表（按等级拆文件）
tools/merge-words.mjs     词表合并 + 校验（id 唯一/同级 en 不重复）→ words.csv
tools/words.csv           合并后的完整词表（gen-assets 的输入，勿手改）
tools/hanzi.csv           ★ 语文识字表（char,pinyin,word,level）
tools/hanzi-sentences.csv ★ 每字一句小短句
tools/gen-assets.mjs      资源生成：中英 TTS + emoji 图 + 自绘词卡 + 数据 JSON
tools/gen-zh-azure.mjs    中文音轨（Azure；--labels 生成按钮指令朗读，--poems 古诗，--only 单条重生成）
tools/gen-en-youdao.mjs   英语两口音（有道：美式有雅婷 / 英式有小英；缓存、断点续跑、全批校验后替换）
tools/gen-tab-icons.mjs   底部 Tab 图标（Noto Emoji：📚/⭐/👪，npm run gen:tab-icons）
tools/gen-audio-volumes.mjs  音频响度对齐（生成每词增益表）
tools/audit-assets.mjs    资源审计：引用断链/空文件/截断/音轨缺口/重复图（npm run audit:assets）
tools/measure-audio.mjs   音频体检：解码全部 mp3 找静音/过轻/削波（npm run audit:audio）
tools/smoke-h5.mjs        真实 Chrome + CDP 冒烟测试（零依赖）：172 项断言，页面渲染/交互/作答/会话恢复/存储/零报错（npm run smoke:h5）
tools/shots.mjs           截图回归：12 页 × 2 视口，capture / compare（含噪声底线说明与容差开关；npm run shots）
tools/verify-offline.mjs  发布产物验证（22 项）：SW 接管 / 外壳预缓存 / 断网刷新可开 / 离线可听音 / 换代清旧缓存 /
                          PWA manifest 完整性（名字·start_url·scope·图标·页签图标）/ 发布产物运行期零 404 /
                          绝对路径改写完整性静态自检（npm run verify:offline）
tools/lib/cdp.mjs         冒烟与截图共用的 CDP 客户端（同一份实现，避免"修一处另一处没修"）
tools/lib/                校验与写入的共用小模块（资源可用性判定 / 原子写文件 / CSV 解析 / 图片压缩收敛）
tools/check-layering.mjs  分层门禁：domain 纯净、无反向依赖、存储收口（npm run check:layering）
tools/optimize-img.mjs    图片量化压缩（npm run opt:img；压到收敛，可 --dry-run/--only/--min-gain）
tools/validate-content.mjs 课程校验 + 目录打包（build:content / validate:content）
tools/make-contact-sheet.ps1 全量图片拼图核对工具
tools/make-share.mjs      电脑版零依赖分享包打包
tools/publish-github-pages.mjs  GitHub Pages 发布（子路径相对化 + sw.js 注入）
src/pages/map/            课程 Tab（即首页）：继续学习 + 错题重练 + 阶段课程地图 + 🎲随机来一课 + 自由探索（旧入口）
src/pages/collection/     收集 Tab：我的百宝箱（英语/汉字图鉴两级点亮 + 数学徽章 + 庆祝条）
src/pages/parent/         家长 Tab：本机摘要 / 分科进度 / 最近记录 / **导出·导入·清空** 本地学习记录
src/pages/index/          英语：等级 → 分类宫格（旧入口保留）
src/pages/chinese/        语文：等级 → 学一学/挑战（旧入口保留）
src/pages/math/           数学：关卡选择 + 练习页（动态出题 + 快照恢复）
src/pages/learn/          学词页：单词翻卡 / 汉字翻卡 / 词语卡 / 小短句（带进度快照）
src/pages/quiz/           挑战页：听音选图 / 听音选字 / 四题型汉字挑战 / 古诗填字（首答星级）
src/pages/poem/           古诗点读：书单 / 逐行点读 / 读整首 → 填字挑战
src/pages/write/          笔顺描红（hanzi-writer 本地数据，不联网）
src/components/tab-bar.vue 自定义悬浮底栏（曲线剪影 + 中间收集圆钮）
src/platform/audio.js     音频播放封装（Howler，支持语音序列连播；失败不阻塞作答）
src/data/words.json       英语数据（含 level，勿手工改）
src/data/hanzi.json       语文数据（勿手工改）
src/data/poems.json       古诗数据
src/data/audio-volumes.json  每词播放增益表（勿手工改）
```

## 常用命令

```bash
npm install                  # 首次
node tools/merge-words.mjs   # 改词表后：合并校验 → tools/words.csv
npm run gen:assets           # 生成音频/图片/数据（英语走有道缓存，--force 仅图片/中文）
npm run gen:en-youdao        # 增量生成并替换两套英语音频，自动更新音量表
node tools/gen-audio-volumes.mjs   # 音频变动后重算增益
npm run build:content        # 课程源变更后：校验 + 重新生成 src/content/catalog.json
npm run test                 # Node 测试（276 个：出题/判题/星级/会话/存储迁移/目录/错题本/图鉴/偏好核心/分层门禁/源码契约）
npm run smoke:h5             # 真实 Chrome 冒烟测试 172 项（约 8~10 分钟；需先 build:h5 并另开终端跑 node tools/serve.mjs）
npm run check:layering       # 分层门禁：domain 纯净、无反向依赖、存储已收口
npm run validate:content     # 只校验（CI 用；目录与源不一致则失败）
npm run audit:assets         # 资源审计：引用断链/空文件/截断/英式与中文音轨缺口/重复图/真孤儿
npm run audit:audio          # 音频体检：解码全部 mp3，找静音/过轻/削波（可选输出 csv 路径）
npm run shots                # 截图回归：capture <目录> / compare <目录A> <目录B>
npm run verify:offline       # 离线验证（跑发布产物）：断网仍能打开/离线可听音/换代清旧缓存
npm run opt:img              # 图片量化压缩（sharp，palette 88 色；压到收敛，重跑不再改写文件）
                             # 可选：--dry-run 先看会改哪些、--min-gain 30 只压"从没压过"的图、--only 指定文件
npm run dev:h5               # 本地开发 http://localhost:5173
npm run build:h5             # 构建 → dist/build/h5/
node tools/serve.mjs         # 预览生产构建 → http://127.0.0.1:4173
node tools/publish-github-pages.mjs   # 发布产物（子路径相对化 + sw.js）；离线验证的前置
npm run release              # 一键发版编排：版本号三处校验 + 内容校验 + 测试 + 分层/资源/音频门禁 + 构建 + 分享包（--deploy 加推预览）
npm run gen:encourage        # 表扬语音频生成（Edge Xiaoyi 兜底；有 Azure key 用 gen:zh-azure -- --misc --force 覆盖回正典）
```

> `npm run build:h5` 的产物**不能双击 index.html 打开**（file:// 禁止加载 ES module，会白屏），本地预览请走本地服务或"本地预览.bat"。
> 需要离线/PWA 能力时走发布脚本（`node tools/publish-github-pages.mjs`），只有它会把 `sw.js` 写进产物并注册。
> **service worker 只存在于发布产物**：`smoke:h5` 跑的是构建目录，测不到离线；离线一律用 `verify:offline`。
> 改页面结构/样式后的验收顺序：`build:h5` → `shots capture 基线` → 改 → `shots capture 对照` → `shots compare`（工具有已文档化的绘制噪声底线，别把噪声当回归）。

## 怎么加单词 / 加汉字

**英语**：在 `tools/words-extra/` 对应等级文件里加一行（或改 `words-base.csv`）：
`id,en,zh,phonetic,category,emoji,draw`
- `emoji` 填 Unicode 码点（多码点用 `_` 连接，如 👨‍👩‍👧 `1f468_200d_1f469_200d_1f466`；见 emojipedia "codepoints"）
- 没有 emoji 的词（高频词/动词/形容词等）留空 emoji，在 `draw` 填要显示的文本 → 自动生成彩色词卡
- 新分类需在 `tools/gen-assets.mjs` 的 `CATEGORIES` 和 `tools/merge-words.mjs` 的 `LEVEL_OF` 里补一条

**语文**：在 `tools/hanzi.csv` 加一行 `char,pinyin,word,level`（带声调拼音，word 为含该字的例词）。

然后依次：`merge-words → gen:assets → gen-audio-volumes → build:h5`。

## 上线

**一键发版**：`npm run release`（版本号三处同步校验 → validate:content → npm test → check:layering → audit:assets → audit:audio → build:h5 → make-share），加 `-- --deploy` 再自动推送 gh-pages 抢先版。手工等价命令见下。

**GitHub Pages 双轨（2026-09-08 起）**：`npm run build:h5` 后执行 `node tools/publish-github-pages.mjs`（子路径相对化 + .nojekyll + webmanifest 修正，两种产物都自动携带 LICENSE / LICENSE-CONTENT.md）。

- **抢先版（默认）**：产物在 `tmp/gh-preview/`，以孤儿分支 `gh-pages` 推到本源码仓：
  `cd tmp/gh-preview && git init -b gh-pages && git remote add origin git@github.com:chenhaolove89/kids-english.git && git add -A && git commit -m "preview" && git push -f origin gh-pages:gh-pages`
  仓内已初始化过 .git，之后只需 add/commit/push。访问地址：`https://chenhaolove89.github.io/kids-english/`（首次需在 GitHub 仓设置 Pages：Deploy from a branch → gh-pages / root）。
- **正式发布仓 `kids-english-web`**：`--target release` 产物在 `tmp/gh-publish/`（远端已配好）。**仅在明确要求同步正式站时才推送**，日常一律发抢先版。

**uniCloud 前端网页托管（HBuilderX）**：HBuilderX 打开项目 → 发行 → 网站-PC Web 或手机 H5 → 勾选部署到 uniCloud 前端网页托管。
注意：这条渠道**不会带 service worker**（SW 只由上面的发布脚本注入），因此没有离线缓存能力；子路径部署的路径相对化也需自行处理。

**电脑版分享包**：`npm run build:h5` 之后 `node tools/make-share.mjs` 生成零依赖静态服务器分享包，解压双击 `start.bat` 即用（端口 8137）。

## 数据规模

- 英语：1998 词 / 53 分类，L1 启蒙起步（含家人、野生动物）/ L2 日常生活（含词族/拼读）/ L3 快乐探索 / L4 挑战进阶
- 语文：297 字（L1 48 / L2 80 / L3 99 / L4 70）+ 297 句小短句 + 1420 词语卡 + 30 首古诗（启蒙 12 首，其余三学段各 6 首）
- 数学：**16 个关卡 / 37 个题型**（分派链实现与关卡池一一对应，无死题型、无未实现题型），题目动态生成，数字 0-100 中文发音全覆盖
- 静态资源：`src/static` 约 **109.1 MB / 9807 个文件**（音频 96.1 MB、图片 12.3 MB，其余为笔顺数据与 Tab 图标）

> 内容覆盖的实话：启蒙与一二年级较实，三四年级尚可；**五六年级英语是词表（81% 为无图文字卡）而非阅读写作**。
> 古诗已覆盖全部四学段（启蒙 12 首、其余三学段各 6 首）。数学 2026-09-17 从 9 关补铺到 **16 关**（新增形状识别、
> 认识时间、长度与测量、周长与面积、分数初步、百分数与比例、统计与数据），四学段分别是 3/4/5/4 关，
> 新关卡复用现成提示音、**零新增音频**。**189 门课程全部 `available`**——2026-09-17 的 draft 复核把最后三门课转正：
> `math-practice-l6`（小数与分数）、`math-practice-l9`（四则混合）、`en-quiz-l4`（进阶词汇挑战）。
> 发布状态机制（`lessonStatus` 支持 `draft`，draft 不进地图/旧入口/继续学习/家长统计）保留可用，只是当前没有 draft 课。

## 路线图

- ✅ Phase 0/1：架构分层 + 课程目录（现 **189 课**）+ 课时会话与事件流 + 首答星级 + 继续学习 + 本机学习摘要
- ✅ Phase 2（部分）：错题本与 Leitner 复习（含毕业出本）、家长周报、收集图鉴、古诗点读、笔顺描红
- ✅ **数学补铺到 16 关**（2026-09）：按学段补上有内容但此前完全没做的知识点——形状识别（启蒙）、
  认识时间与长度测量（一二年级）、周长面积与分数初步（三四年级）、百分数比例与统计（五六年级）；
  题型从 23 增到 37。全部零新增音频（算式与长句题统一走「请选一选」提示音），
  收尾时 `tools/optimize-img.mjs` 把 7 张新关卡图标压到 2-7 KB。
- ✅ **答错后的讲解环**（2026-09）：揭晓不再只说"答案是哪个"，而是按题型讲一句为什么
  （算式把 `?` 填成答案、应用题把数拎出来给算式、比大小说清两边各几个与问的是多/少、
  听音选图说出听到的词与中文释义、古诗填字把整句说出来）。实现见 `src/domain/explain.js`
  （纯函数 + `tests/explain.test.js`），拿不准时返回空串并退回原来的兜底文案——宁可不讲，不讲错。
- 🚧 Phase 2 进行中：**英语句子阶梯**已铺完四层（启蒙日常用语 / 一二小短句 / 三四稍长句 / 五六长句，各 20 句，`tools/en-sentences.csv` 为唯一数据源）；仍缺真正的阅读与写作材料（长句不等于篇章阅读）
- ⬜ Phase 3：微信小程序验证（资源 CDN 化是前置条件：静态资源 90+MB 远超小程序主包 2MB 限制；音频 Howler 需条件编译换 uni.createInnerAudioContext）
- ⬜ Phase 4：多孩子档案（当前 6 个扁平存储键无 profileId）+ 云同步（上传作答事件流重放聚合）+ App 云打包

### 学习记录口径（2026-09 起）

- `learn`（学一学）/ `challenge`（挑战）**计入课时完成**；挑战另按首答正确率给星。
- `practice`（**笔顺描红、古诗点读**）会进作答流、家长页「最近记录／周报／练习时长」，但**不计课时完成、不给星**——
  写完一个字或读完一首诗不等于学完一门课（识字课一堂 48 字、古诗课启蒙 12 首、其余学段 6 首）。
- 描红**按单字点亮**图鉴「认识」（`recordCharPracticed`），不写整课、不进掌握；点读只留痕不点亮图鉴。
- `Session` / `Attempt` 会记录 `contentVersion`；旧本地记录缺少该字段时按 `null` 兼容读取，不阻断恢复与统计。


## 许可协议

本项目源码公开可读，但**不是** OSI 定义的开源软件，采用"双协议"模式：

- **代码**（`src/`、`tools/`、`tests/` 等全部源码与脚本）：[PolyForm Noncommercial 1.0.0](./LICENSE)
  - 个人学习、研究、家庭使用、爱好项目等**非商业用途免费**
  - **任何商业用途**（销售、收费服务、商业机构内部使用等）需获得作者书面授权
- **内容资源**（词表文案、识字数据、自绘插图、课程目录）：[CC BY-NC 4.0](./LICENSE-CONTENT.md)
  - 非商业使用须署名；商业使用需授权
- 第三方素材遵循其各自原有许可（如 Noto Emoji 配图：Apache-2.0，可商用）

商业授权与合作咨询：**452218405@qq.com**


## 英语语音生成

家长中心仅保留 **美式 / 英式**。美式 `youyating`（有雅婷），英式 `youxiaoying`（有小英）；旧 `az` 课堂偏好兼容为英式。单词、英文反馈和已启用的韵律均随口音切换。中文和数学音频保持各自管线。

将 `.env.example` 的 `YOUDAO_APP_KEY`（应用 ID）与 `YOUDAO_APP_SECRET`（应用密钥）填入本地 `.env.local`，无需额外的 KEY；凭据只供 Node 生成工具读取，不会进入网页。

```bash
node tools/gen-en-youdao.mjs --dry-run        # 只查看范围，不调用接口
npm run gen:en-youdao                         # 两套全量增量生成、校验、替换、更新音量
npm run gen:en-youdao -- --only ear           # 单词补轨，同样会自动更新音量表
node tools/audit-youdao.mjs                  # 全量核对文本、音色、文件哈希、解码和增益
```

生成结果保存在 `tmp/youdao-en/`，成功结果按文本、音色及请求参数去重，限速低于每小时 3,000 次。中断、欠费或接口错误后重新执行原命令即可续跑；不支持 `--force`，避免误触发重复付费。整批完成并通过 MP3 解码校验后才替换 `src/static/audio/` 与 `audio-gb/` 的英文文件。

`tools/youdao-audio-manifest.json` 记录每个正式文件的来源参数、哈希和测量结果；保留它与音频，即使临时缓存被清理，仍能复用正式文件。保存本地音频后，日常播放不会调用有道生成 API，也不会产生重复合成费用；更改文本或音色才需要新的合成请求。生成时使用标准语速和音量，不裁剪尾部，播放增益另行实测并限制峰值。

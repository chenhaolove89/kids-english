# 语文扩充实施计划：词语课 + 题型增强 + 笔顺描红

## 现状与依据（已探明）
- 语文现仅 297 单字 + 2 种课型（翻卡/听音识字）；英语 2000 词的 `words.json` **每词自带 `zh` 中文字段和现成配图**（`src/data/words.json`），中文 TTS 管线现成（`tools/gen-assets.mjs` 用 msedge-tts，zh-CN-XiaoxiaoNeural 音色，`audio-zh/` 目录已有 204 个先例）。
- 多题型参照 `src/domain/mathgen.js`（kind 分支渲染）；课程目录由 `tools/validate-content.mjs` 从 `content-packages/curriculum.json` + 数据 JSON 生成，**禁止手改**。
- 笔顺数据用 npm 包 `hanzi-writer`（MIT，运行时 ~30KB）+ `hanzi-writer-data`（per-char JSON），项目第三方一律走 npm，无 vendor 先例。

---

## 批次一：语文挑战题型增强（纯逻辑，见效最快）

**目标**：语文挑战从单一「听音识字」扩为 4 种题型混出。

1. `src/domain/rounds.js`：新增 `buildZhCharRounds(pool, { count, kinds })`，kind 四种（池条目已含 char/pinyin/word/audio 全部字段，零数据成本）：
   - `listen-pick` 听音识字（现有）
   - `char-to-pinyin` 看字选拼音（题干显示字，选项为 4 个拼音文本）
   - `pinyin-to-char` 看拼音选字（题干显示拼音，选项为 4 个字）
   - `char-to-word` 看字选组词（题干显示字，选项为 4 个组词）
   - 轮次结构沿用 `{ answer, options, kind }`；判题统一走现有 `isRoundPickCorrect`（比 id），选项对象 `{ id, label }` 与数学 `mathgen` 同构。
2. `src/pages/quiz/quiz.vue`：zh 分支按 `round.kind` 渲染题干与选项（大字/拼音/组词三种文本选项样式）；`recordAttempt` 的 `activityId` 记 kind；错题本 `recordResult` 文案按 kind 取 char/word。
3. 错题重练链路自动受益（`review-pools` zh resolver 已回传全字段）。
4. 新增 `tests/zh-rounds.test.js`：各 kind 出题、干扰项不重复、判题、池不足 4 条时降级。

## 批次二：语文词语课（内容量翻倍的主菜）

**目标**：英语 2000 词的图片直接复用，做「看图识中文词」，新增 ~30 门语文词语课（learn + challenge 成对，排除 alphabet 字母类）。

1. **音频管线** `tools/gen-assets.mjs`：主流程新增「全量词中文读音」任务——为每个非字母类词的 `w.zh` 生成 `static/audio-zh/{id}.mp3`（目录/命名沿用现有 audio-zh 先例，不被口音改写逻辑波及），增量跳过、失败保护（<800B 重试）与现有任务一致。约 1800 词 ≈ 17MB。
2. **课程目录** `tools/validate-content.mjs`：语文展开段新增 `zh-words-{category}` 课（subject: zh，kind: learn/challenge 成对，`ref: { kind: 'en-category', id }` 复用现有 ref 类型，stage 挂词表分类对应学段）。`content-packages/curriculum.json` 若需开关字段则同步加。
3. **学词页** `src/pages/learn/learn.vue`：新增 zh 词语模式——卡片渲染 image + 中文词大字 + 英文小字，主音频播中文 `audio-zh/{id}.mp3`，小喇叭切英文（沿用 playSeq/playEn）。
4. **挑战页** `quiz.vue`：zh 词语课走「听中文音选图」（复用 buildListenPickRounds，音频源切 audio-zh）。
5. **低龄过滤修正** `services/curriculum.js` `isVisible`：en-category ref 的隐藏分类（characters/story）按 ref 过滤（现在只按 lesson.subject 判断，zh-words 课会漏过滤）。
6. **收集页** `src/domain/collection.js` + `collection.vue`：`lessonItemIds` 支持 zh-words 课返回词 id；新增「词语图鉴」段（按分类分组，litState/progressOf 通用逻辑复用）；统计行加「中文词语 x/y」；汉字统计（0/297）口径不变。
7. **校验与测试**：`validate-content` 资产存在性校验覆盖新音频；`tests/content.test.js` 扩展（zh-words 课、ref 可解析、音频文件存在且 ≥900B）；生成后按零容错规则抽审中文 TTS 读音（多音字重点），问题词进修正表。

## 批次三：笔顺描红（hanzi-writer）

1. `npm i hanzi-writer`（运行时）+ `npm i -D hanzi-writer-data`（数据源）；新增 `tools/copy-hanzi-data.mjs`：从 node_modules 拷 297 字 JSON → `src/static/hanzi-data/{码点}.json`（码点命名避免中文文件名 URL 风险），缺失字打印清单（页面对缺失字隐藏入口，白名单记录）。
2. 新页面 `src/pages/write/write.vue` + `pages.json` 注册：田字格渲染、笔顺动画演示、描红模式（quiz 模式：写错提示、笔画进度点）；完成给中文语音正反馈（复用 zh-great）。
3. 入口：`learn.vue` zh 汉字模式卡片加「✍️ 写一写」按钮跳转（带 char/id）。描红 MVP **不计入**图鉴/星星（纯练习，不动会话）。
4. `tests/write-data.test.js`：297 字数据齐全（缺失白名单外 fail）、JSON 可解析、笔画数 >0。

---

## 验证与收尾
- 每批次完成跑：`npm run gen:assets`（批次二）→ `node tools/copy-hanzi-data.mjs`（批次三）→ `npm run build:content` → `npm test`（现有 84 个 + 新增约 20 个全绿）。
- 浏览器全链路冒烟：语文挑战 4 题型 → 词语课学习/挑战 → 收集页词语图鉴 → 描红页（沿用 el.click() 冒烟手法）。
- 全部完成后：build:h5 + publish-github-pages 更新线上（推之前和你确认）。

## 顺序与理由
批次一最小（1 个 domain 文件 + quiz 渲染）先行验证链路；批次二是内容主体（管线 + 多文件联动）；批次三独立性强、依赖 npm 安装放最后。三批可独立发布，任一批出问题不阻塞前批。
# 架构改版：课程地图升格首页 + 新增「收集」Tab 页

两项决策已确认：新页面放底部 Tab 第三栏；点亮规则用两级（认识→掌握）。

## 一、Tab 结构变更（3 Tab：课程 / 收集 / 家长）

**`src/pages.json`**
- 删除 `pages/home/home` 条目；`pages/map/map` 成为 pages[0]（App 入口）
- tabBar：第一项改为 map（文案「课程」，沿用 map.png 图标）；新增第三项 `pages/collection/collection`（文案「收集」，图标直接复用现成的 `static/img/star.png`，不新增美术资源）；删除 home 项
- 删除 `src/pages/home/home.vue` 与 `src/static/tab/home.png`

**`src/platform/routes.js`** + **`tests/routes.test.js`**
- KNOWN_ROUTES：移除 home、加入 `/pages/collection/collection`；`HOME_ROUTE` 改为 `/pages/map/map`（App.vue 守卫自动生效）

**导航目标改写**（3 处 reLaunch）
- `learn.vue:86`、`quiz.vue:100/124`：完成后回 `/pages/map/map`

## 二、课程页升格为首页（吸收旧首页的高价值入口）

**`src/pages/map/map.vue`**
- 头部换成品牌头：logo + 「快乐学园」+ 副标题（从旧首页迁移），右侧新增 ⭐ 星数胶囊（读 `getProgressService().summary()`，点击 switchTab 到收集页）
- 阶段芯片上方插入两张卡（从旧首页整体迁移逻辑）：「继续学习」resume 卡（`continueTarget()`）+「错题重练」卡（`getReviewService().dueCount`）
- 每个科目块头（⚡挑战旁）加 🎲 按钮：`randomLesson(stage, subjectId, lastRandom[subjectId])` + `updatePrefs({lastRandom})`（旧首页 goRandom 逻辑迁移）
- 旧首页的学习摘要三项数字不保留（星数进胶囊，其余进收集页头部）；「全部课程」链接、footer 删除

## 三、新页面「我的百宝箱」（收集/图鉴/吉祥物/庆祝 合一）

**数据层（不动现有事件流口径）**
- `src/domain/collection.js`（纯函数，Node 可测）：lit 集合的 merge/派生（seen ∪ mastered、类别完成判定、里程碑计算）
- `src/services/collection.js`：持久化键 `collection = { en:{seen,mastered}, zh:{seen,mastered}, math:[lessonId] }`
  - `recordLearnDone(lessonId)`：学一学完成 → 该课全部词/字进 seen（认识）。词表经 `content/adapters.js` 的 `resolveEnCategory/resolveZhLevel` 展开，低龄隐藏分类不计入
  - `recordChallengeDone(sessionId)`：挑战完成 → 该会话 attempts 中 `firstTry && correct && itemId` 进 mastered（掌握）。挂钩 `quiz.vue:231`、`practice.vue` 的 completeSession 之后；learn.vue:128 后调 recordLearnDone
  - 首次访问时一次性迁移：键不存在则从已存 sessions+attempts 回填（老用户进度不丢）；attempts 有 3000 条裁剪上限，故点亮集合必须持久化、只增不减
  - 复习重练无会话不记 attempt，与现有星数口径一致：不点亮（文档注明）

**页面 `src/pages/collection/collection.vue`**
- 头部：吉祥物（star.png 圆形象）+ 鼓励语气泡（静态文案随机）+ 统计行（⭐总数 / 掌握词 x/2000 / 掌握字 x/297）
- 三段切换：英语图鉴 / 汉字图鉴 / 数学徽章
  - 英语：52 张分类卡（图标 + 掌握进度，集齐挂 🏆）→ 点开为页内浮层词格：掌握=彩图+词+⭐（点击发音，复用 audio 平台层）、认识=彩图无星、未解锁=灰色「?」剪影
  - 汉字：4 级别卡 → 字格（字+拼音+emoji 图，同样三态）
  - 数学：4 枚徽章印章（完成点亮 + 最佳星级）
- 庆祝条：本次新点亮 N 张（`prefs.lastCollectionVisit` 对比）+ 集齐横幅；空态引导「先去学一课，点亮第一张卡片」→ switchTab 课程
- 全部数据只读派生 + 上述持久化集合，不新增统计口径

## 四、测试与验证

- 新增 `tests/collection.test.js`（memoryBackend + 夹具：迁移回填、seen/mastered 合并、集齐判定、低龄过滤）
- 更新 `tests/routes.test.js` 路由期望
- 跑 `npm test`、`npm run validate:content`、`npm run build`（H5），浏览器冒烟：入口页=课程地图、Tab 三栏、学一课→图鉴点亮、挑战首答→升星、老数据迁移
- README 页面结构表与 docs/architecture.md 对应更新（「贴纸墙」建议标记为已落地）；不动版本号（发布时再同步）

## 不做的事

- 不加每日打卡/streak、不加新 TTS 语音（鼓励语变体、fanfare 留作后续项）
- 不引入关卡硬锁（课程保持自由切换）
- 不动 dist/build 产物与发布脚本
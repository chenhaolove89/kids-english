# 快乐学园 架构细化（实施层）

日期：2026-09-07。
关系：`docs/learning-platform-plan.md` 是产品与分层**总纲**（战略层），本文给出可直接开工的目录结构、内容 schema、模块接口与迁移步骤（战术层）。两文冲突时以总纲的边界判断为准，以本文的落地细节为准。

## 0. 对现状的量化摸底

| 事实 | 数值 | 对架构的含义 |
|---|---|---|
| 静态资源 | 49MB（图 19MB + 音频 31MB），4776 个文件 | 微信小程序主包上限 2MB、整包约 30MB，**资源不可能原样进小程序**，必须远程化或分包 |
| words.json | 2000 词全在 52 个 category 内，顶层 `levels` 数组是空的（L1-L4 各 0 词），词的级别挂在 category.level 上 | 适配器要按 category 聚合，不要依赖顶层 levels |
| 页面代码 | 7 个页面共约 1960 行，判题/出题/计分逻辑都在 .vue 里 | 逻辑抽出 domain/ 后页面壳会大幅变薄 |
| 构建目标 | 仅 H5 | 小程序/App 是"预留结构"，不是"现状" |

## 1. 目标目录结构

```
src/
  pages/                 # 页面壳：布局、导航、反馈。逻辑逐步抽空
    home/  learn/  quiz/  math/ ...
  components/            # 通用 UI：WordCard, QuestionBox, StarBar, StagePicker, AudioButton
  domain/                # ★纯函数层。禁止 import uni / vue / howler / DOM
    judge.js             #   判题（各 activity 类型的对错判定）
    progress.js          #   首次正确率、星级(1-3)、聚合
    review.js            #   错题本 + 间隔复习调度
    mathgen.js           #   数学题生成（从 practice.vue 原样抽出，行为不变）
  services/
    curriculum.js        #   目录查询、可用性过滤(draft 不可开始)
    session.js           #   课时会话：开始/作答/中断恢复/完成，落事件
    review.js
  platform/
    storage.js           #   唯一存储入口，schemaVersion + 迁移函数链
    audio.js             #   统一音频入口。H5=Howler；将来 MP-WEIXIN 条件编译
    assets.js            #   资源 URL 解析。为 CDN/分包预留，页面不得裸写 /static
  content/
    catalog.js           #   读取课程包目录
    words-adapter.js     #   现有 words.json → Activity 流
    hanzi-adapter.js
    math-adapter.js      #   生成器型课程
content-packages/        # 人写的课程源（YAML/CSV/MD）
tools/
  build-curriculum.mjs   # 新增：校验 + 打包课程包到 src/content/
  gen-assets.mjs 等      # 现有生成链路保留，不动
```

分层铁律：`pages → services → domain`，`pages/services → platform`，依赖只许向下。domain 一行平台代码都没有，这是将来任何端（小程序/App/Node 脚本）都能复用判题与调度的前提。

## 2. 内容 schema（最小核心）

一切引用走稳定 ID。课程包示例：

```jsonc
{
  "id": "en-starter-animals",
  "stage": "qimeng",            // qimeng | g1..g6（年级维度）
  "subject": "en",              // en | zh | math
  "difficulty": 1,              // 原 L1-L4，保留原义，与年级解耦
  "skills": ["en-word-animals"],
  "lessons": [
    {
      "id": "en-animals-01",
      "title": "动物单词·认一认",
      "status": "available",    // available | draft（draft 课程禁开始按钮）
      "activities": [
        { "type": "flashcard",   "ref": "words:animals", "words": ["cat","dog","bird"] },
        { "type": "listen-pick", "words": ["cat","dog","bird"] },
        { "type": "math-gen",    "gen": { "op": "add", "max": 10, "count": 5 } }
      ]
    }
  ]
}
```

要点：

- **活动类型枚举先只做三种**（flashcard / listen-pick / math-gen），与现有页面一一对应，零新内容成本；后续再加填空、拖拽、阅读材料。
- **math-gen 是生成器型活动**：课程只存参数（运算、数值域、题量），运行时出题。这是覆盖到六年级的关键——数学内容是参数空间，不是题库。
- `build-curriculum.mjs` 强校验：ID 全局唯一、引用存在（skill/word/char）、音频图片路径存在、status=available 时资源齐全、stage/难度标签合法。校验不过不许打包。

## 3. 学习记录：事件流，不是覆盖式状态

进度按**追加事件**记录，本地聚合出视图。这是 Codex 总纲的思路，落到数据形状：

```
Attempt       { attemptId, sessionId, lessonId, activityId, skillIds,
                answer, correct, order, ts, contentVersion }
SessionEvent  { sessionId, lessonId, event: start|pause|complete|abort, ts }
```

- 星级 = **首次作答**正确率 → 1~3 星。只看首答，从机制上消灭"答错重试到满分"的统计模糊（Codex 总纲指出的问题，这里给出解法）。
- 按 attemptId / sessionId 去重，重复点击不重复计数。
- 中断（pause/abort）与完成分开；math-gen 恢复时保存**题目快照**，重进不是重新生成，否则记录和题目错配。
- 将来上云：直接把事件流 push 到服务端重放聚合，天然同步协议，永不丢记录。

`platform/storage.js`：单入口，键形如 `kx:profile:<profileId>:events`，文件头带 `schemaVersion`，迁移函数数组逐级升级；容错空值/损坏值/写入失败。第一阶段 `profileId="default"`，将来多孩子只加一层，不改数据形状。

## 4. 多端策略（小程序/App 的真实约束）

1. **资源远程化是小程序的前置条件**，不是优化项。4776 个文件远超小程序能承载的本地文件规模。路线：所有页面经 `platform/assets.js` 取 URL（现在 `/static/...` 散落各页面）→ H5 阶段照常本地 → 小程序阶段把该文件切到远程 CDN，页面零改动。音频可选方案：对象存储直存，或云端 TTS 按需合成（msedge-tts 生成链路已有，可迁到云端跑）。
2. **Howler 不能进小程序**（依赖 document/AudioContext）。`platform/audio.js` 用 uni 条件编译：`#ifdef H5` 用 Howler，`#ifdef MP-WEIXIN` 用 `uni.createInnerAudioContext`。新增业务一律只 import platform/audio，旧页面逐步替换。
3. **App 端**：uni-app 本来就是跨端框架，HBuilderX 云打包原生壳即可，不需要 React Native/Flutter 之类的新技术栈。
4. 节奏：H5 做扎实 → 小程序技术验证（分包 + 远程音频 + 真机音频/缓存测试，见 Codex 总纲的核查清单）→ 有真实需求再 App。不承诺一键打包。

## 5. 路线图（在 Codex 四阶段基础上的重切）

- **Phase 0（1~2 天）**：抽 domain（judge / progress / mathgen）+ platform/storage（schemaVersion + 迁移）+ 首页"继续学习" + 数学题目快照恢复。不改任何视觉，纯结构加固，为后面铺路。
- **Phase 1（约 1 周）**：课程目录 + `build-curriculum.mjs` + learn/quiz/practice 接入 sessionId/lessonId + 星级 + 本机学习摘要。三科各一条真实可玩路径，其余如实标"筹备中"。
- **Phase 2**：启蒙 + 一二年级内容铺量；错题本与复习；家长周报（本机生成，无隐私负担）。
- **Phase 3**：小程序验证（assets.js 切 CDN、音频条件编译、分包、真机测试）。
- **Phase 4**：多档案（profileId）+ 云同步（事件上传）+ App 云打包。

每阶段验收标准沿用 `docs/harness-phase-1.md` 的风格：可运行的测试 + 构建退出码 + 明确的"未验证项"，禁止拿承诺当交付。

## 6. 产品层增量（Codex 总纲之外的建议）

1. **指令朗读是启蒙段的硬约束**：启蒙段孩子基本不识字，所有页面指令、按钮语义必须能自动朗读。TTS 生成链路已有，把"指令音频存在"纳入 build-curriculum 校验项。
2. **激励系统与统计同源**：星级（首答正确率）既是家长报告的指标，也是孩子的星星/贴纸墙与关卡解锁条件。一套数据，两处消费，避免"孩子看的分数"和"家长看的正确率"打架。
3. **家长报告先行于账号系统**：本机周报（时长、各科星级、错题 TOP3、建议）零隐私成本、留存价值高；账号/排名/支付都推迟到真有需求时。
4. **内容生产沿用 CSV 工具链心智**：教研同事产出 CSV/YAML → 工具校验生成 → 人工听音审读 → 版本化课程包。禁止手改生成 JSON 的规则从 words/hanzi 扩展到课程包。

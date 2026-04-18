# OPT-3 Step A 实施 Spec：事件索引集成

**作者**: 雪琪 ❄️
**日期**: 2026-04-18
**关联**: `research/opt3-step-a-dod-2026-04-18.md`
**面向**: 🌸 碧瑶（实施者）

---

## 关键发现：LoCoMo 数据集已自带三个候选字段

跑了一下 `benchmarks/locomo/data/locomo.json` 探索，发现**完全不需要 LLM 抽取**——数据集本身已经标注好了三个粒度的事件。这把 Step A 的工程量从 "2-3 天" 缩到 "0.5-1 天"，但相应也意味着这是**论文上限测试**：如果用论文金标准的 event 数据都救不了 temporal=0%，那"事件粒度索引"这个假设就证伪了，直接转 Step B 没争议。

### 三个候选字段

| 字段 | 粒度 | 时间锚 | 样例 |
|---|---|---|---|
| `event_summary` | 每 session × 每 speaker 的事件列表 | 仅 session 内的 `date` | `["Caroline attends an LGBTQ support group for the first time."]` |
| `observation` | 每 session × speaker 的 (观察, dialog_id) | 通过 dia_id 回溯 | `["Caroline attended an LGBTQ support group recently...", "D1:3"]` |
| `session_summary` | 每 session 一段自然语言总结 | **直接含日期时间** | `"Caroline and Melanie had a conversation on 8 May 2023 at 1:56 pm. Caroline mentioned..."` |

### 字段选择：**三个都用，按优先级混合索引**

理由：单一字段都有缺点，组合最稳：

- ✅ **`session_summary`**（**主推**，最适合 temporal）：含完整时间戳的自然语言段落，时间问题直接受益
- ✅ **`event_summary`**（次推，最适合 multi_hop）：原子事件列表，便于跨 session 召回
- ⚠️ **`observation`** 暂不用：和 dia_id 强绑定、需要回溯 raw turns，复杂度高，留 v2 再考虑

---

## Spec：实施步骤（建议 PR 顺序）

### Step 1：数据预处理脚本（0.5 - 2h）

新建 `benchmarks/locomo/build-event-index.js`（或 .ts，看仓库风格）：

```js
// 对每个 sample（10 个 sample × ~19 sessions）：
//   for session in conversation:
//     date = conversation[`session_${N}_date_time`]
//     summary = session_summary[`session_${N}_summary`]   // 已含日期
//     events  = event_summary[`events_session_${N}`]      // dict by speaker
//
// 输出 records:
//   { sample_id, session_id, kind: "summary", text: <session_summary>, date, source: "session_summary" }
//   { sample_id, session_id, kind: "event",   text: `[${date}] ${event_text}`, speaker, date, source: "event_summary" }
//
// 注意：event_summary 原文不含日期，**前缀拼接 date** 让 embedding 自带时间锚
```

**Done 标准**：
- 输出 `benchmarks/locomo/data/event-index.jsonl`
- 每条 record 包含 `text`（用于 embed）、`date`、`session_id`、`sample_id`
- 总条数预估：10 sample × 19 session × (1 summary + ~6 event/speaker × 2 speaker) = ~2500 条

### Step 2：建独立向量索引（1 - 2h）

- 复用现有 vector backend（看现有 chunks 怎么入的，同 backend 同 embedding 模型）
- collection 名建议：`locomo_events`（独立，不污染 chunks 索引）
- 字段：text 入 embed，date / session_id / sample_id 作 metadata

### Step 3：检索路径修改（2 - 3h）

修改现有 retrieval 函数，加并行召回：

```js
// 当前（OPT-2 LLM 层）：
//   chunks = vectorSearch(query, top_k=10)
//   answer = llm.generate(prompt(query, chunks))
//
// Step A 新增：
//   const [chunks, events] = await Promise.all([
//     vectorSearch(query, "chunks", top_k=10),
//     vectorSearch(query, "locomo_events", top_k=5),
//   ])
//   const context = mergeContext(chunks, events)  // 见下
//   answer = llm.generate(prompt(query, context))
```

**`mergeContext` 设计**（关键，影响 open_domain 是否退步）：

- **不替换 chunks，并存**（保护 open_domain 现有能力）
- 在 prompt 里**分两段呈现**：
  ```
  Conversation excerpts:
  <chunks ...>

  Relevant events (with dates):
  <events ...>
  ```
- 保持原 generation prompt 不变，只是 context 多了 events 段

**API 不需要改**（对外接口透明）。

### Step 4：评估跑批（30min - 1h）

- 用 v3 judge（gpt-5 + CoT）跑 199 题 sample=1
- 同时输出 LLM judge 视角 + F1 视角两套数字
- 脚本同 OPT-2 收尾那次，复用即可

---

## Acceptance Criteria（同 DoD，重申）

| 维度 | 当前 | 目标 |
|---|---|---|
| **temporal** | 0% (n=13) | **≥ 15%（≥2 题对）** |
| multi_hop | 18.9% (n=37) | ≥ 25% |
| **open_domain** | 55.7% (n=70) | **≥ 53%（硬约束 -5pp 立刻回滚）** |
| 总体 (n=152, 去 adversarial) | 32.9% | ≥ 36% |

完整分支决策树见 DoD 文档。

---

## ETA 修订

因为不需要 LLM 抽取，时间盒收紧：

| 步骤 | 原 ETA | 修订 ETA |
|---|---|---|
| 数据预处理 | 0.5 天 | **2h** |
| 索引集成 | 1 天 | **3h** |
| 评估跑批 + 复核 | 0.5 天 | **1.5h** |
| **总计硬上限** | **3 天** | **1 天**（若 temporal 卡 5-15% 调 prompt 仍按 4h 上限） |

---

## 工程纪律（小白姐定的硬规则）

碧瑶执行时遵守：
1. ✅ **先在 thread 列实施步骤 + ETA 再动代码**
2. ✅ **每个跑批命令后挂 cron/timer 30min 自检 + push 进度**，不让 session 自己停
3. ✅ **每完成一个 Step 在 thread 发一条 commit hash + 1 句话总结**

---

## 待瑶儿确认 / 问的

1. 现有 vector backend 是 PG/pgvector 还是 Qdrant/其他？collection 命名规范？
2. embedding 模型现在用的什么？要不要新 collection 也用同款？
3. `mergeContext` 里 events 段放 chunks 之前还是之后？（建议之后，让模型先读对话再看事件，但你看代码后定）

有疑问 thread 直接问，我跟。

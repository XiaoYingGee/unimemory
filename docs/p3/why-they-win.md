# Why They Win — mem0 / Zep 差距归因

**版本**: v0.1（commit 待定）
**状态**: PM 分析稿，未经 QA 验收
**来源**: mem0 paper arXiv:2504.19413 §2 + mem0 blog (2026-04-16) + Graphiti README + UniMemory src 代码

---

## 一句话结论

> mem0 赢在**抽取层质量**（ADD-only + 单程 + agent facts）+ **多信号检索融合**；Zep 赢在**时序结构**（bi-temporal graph，旧事实不删保留历史）。UniMemory 两层都缺，这就是 ~47pp 和 temporal ~60pp 的根因。

---

## 1. mem0：为什么 91.6%（LoCoMo overall）

### 1.1 抽取层（核心差距 #1）

| 维度 | mem0 新算法（2026-04） | UniMemory 现状 |
|------|----------------------|---------------|
| 抽取策略 | **单程 ADD-only**：一次 LLM call，只产生新 fact，不 diff 旧 memory | `service.ts` 直接写 content，无专项抽取；用户/agent 直接 push 原文 |
| 状态变更处理 | 新旧 fact **并存**，保留完整演化历史；query time 再裁 | 原文覆盖（UPSERT），历史信息丢失 |
| agent facts | **一等公民**：agent 的确认/推荐 ("I've booked your flight") 同等存储 | 不存 agent 侧 |
| 延迟 | 单程 LLM call，约减旧算法 50% 延迟 | 无专项抽取，写入快但 fact 质量低 |

**paper §2.1 原文**：
> "The new algorithm collapses extraction into a single LLM call that only adds. Every extracted fact becomes an independent record. When information changes, the new fact lives alongside the old one, and both survive."

**根因**：我们把"用户说的一整句话"直接存进去，mem0 把"从这句话里提炼的结构化 fact"存进去。同一句"我从纽约搬到旧金山了"——我们存原文，mem0 存两条独立 fact（`lives_in: San Francisco as of 2026-04` + `previously_lived_in: New York`）。

---

### 1.2 索引层

| 维度 | mem0 | UniMemory |
|------|------|-----------|
| 存储单元 | 结构化 fact（独立记录，带 entity tags + 时间戳） | 原始 content text + embedding |
| entity linking | 每条 memory 做 entity 提取（proper nouns / compound noun phrases），建 entity lookup layer | 无 entity 层 |
| 历史状态 | ADD-only → 旧 fact 永远不删，有完整历史 | UPSERT 可能覆盖旧值 |

---

### 1.3 检索层（核心差距 #2）

| 维度 | mem0 新算法 | UniMemory 现状 |
|------|------------|---------------|
| 信号数 | **三路并行**：semantic（向量）+ keyword（BM25+动词归一化）+ entity（专名匹配） | 单路向量（pgvector cosine）`service.ts:194` |
| 融合 | rank-level fusion（三路 score 加权）| 无 |
| keyword 归一化 | 动词变形归一化（"attending a meeting" ↔ "what meetings did I attend"）| 无 |
| entity boost | query 中实体命中的 memory 获得 rank boost | 无 |

**表现**：mem0 paper blog：`"A question like 'what does Alice think about remote work?' leans on entity matching. 'What meetings did I have last week?' depends on temporal understanding."`

---

### 1.4 答案层

| 维度 | mem0 | UniMemory |
|------|------|-----------|
| context 传入 | top-k 结构化 facts（经过 dedup + entity linking）| top-k 原文 chunks（`searchMemories` topK=5-10）|
| 平均 token/query | **6,956 tokens**（LoCoMo）；旧算法 25,000+ | 未测，估计 10k+ |
| LLM prompt | 结构化 memory list → LLM 整合 | OPT-2 加了 LLM 回答层（已上线）|

---

### 1.5 关键差距（最多 3 点）

1. **🔴 抽取层缺失**：我们没有专项 fact 抽取，存的是原文，不是结构化 fact。mem0 单程 ADD-only 才是信息密度高的核心。
2. **🔴 检索单路 vs 三路**：单向量检索在 keyword 精确匹配 + entity 专名查询上天然劣势，temporal/multi_hop 题型这个差距最大。
3. **🟡 历史状态丢失**：UPSERT 覆盖旧 fact = temporal 题目（"你以前住哪"）永远答不对；ADD-only 保留历史是 temporal 得分的结构性前提。

---

### 1.6 可借鉴 → OPT-6 候选

| OPT 编号 | 借鉴点 | 优先级 |
|----------|--------|--------|
| **OPT-6** | ADD-only 抽取层：写入前一次 LLM call 提炼结构化 fact，保留历史 | P0（下一个） |
| **OPT-7** | Entity linking：对 fact 做 entity 提取，建 entity lookup layer | P1 |
| **OPT-8** | 多信号检索 fusion（BM25 + entity + vector）| P1 |
| **OPT-9** | Agent facts 一等公民：存 agent 确认/推荐类 fact | P2 |

---

## 2. Zep / Graphiti：为什么 temporal SOTA

### 2.1 bi-temporal graph 架构

Zep paper (arXiv:2501.13956) 用两个时间轴：

| 时间轴 | 含义 | 用途 |
|--------|------|------|
| **valid_time**（事件时间）| 这个 fact 在现实中成立的时间段（何时生效→何时失效）| 回答"2023年你住哪" vs "你现在住哪" |
| **ingest_time**（入库时间）| 这个 fact 何时被系统知道 | 回答"你上次告诉我…是什么时候" |

**实现**：每个 fact（图的 edge）携带 `(valid_from, valid_until)` + `(tx_time)`。当用户说"我搬家了"，旧 fact 的 `valid_until` 被打上时间戳（而非删除），新 fact 新增。图里两条 edge 都在，查"现在"走最新 valid_until=NULL 的 edge，查"过去某时间"走对应 valid_time 区间。

**为什么 temporal 题强**：temporal 类题目（"你去年几月开始用 iPhone"）需要精确时间窗口查询。pgvector 只有语义相似度，没有时间窗口索引，答这类题靠运气。Graphiti 原生支持 `graph.search(query, at_time=T)` → 直接命中正确时间段的 fact。

---

### 2.2 图召回 + vector fusion

Graphiti README 描述三路检索：

```
Query
  ├── semantic embedding（向量相似度）
  ├── keyword / BM25（全文搜索）
  └── graph traversal（从命中 entity 沿关系边延伸）
        → fusion → 排序 → top-k facts
```

**graph traversal 的额外信息**：向量检索命中"Alice 喜欢 Adidas"这条 fact，graph traversal 会顺着 Alice 这个 entity node 再拉出"Alice 每周五订 Thai 餐"——这两条 fact 语义上不相似，但通过 entity 节点连通。这是 multi_hop 题的核心能力（"Alice 上周五吃了什么"）。

**与 mem0 的关系**：mem0 加 graph（Mem0^g）比纯 mem0 再高 ~2pp；Zep 用 Graphiti 完整实现此图层，是 Step B 的实现来源。

---

### 2.3 对 UniMemory 的影响

| 我们缺的能力 | 后果 | Zep 如何补 |
|-------------|------|-----------|
| 时间窗口索引 | temporal 题 13.2%（vs 强系统 SOTA）| valid_time edge + 时间窗口查询 |
| entity 关系图 | multi_hop 题卡在 26.3% | entity node + graph traversal |
| fact 失效标记 | 信息过期不删导致答错 | valid_until 打标，不删历史 |

---

## 3. UniMemory 当前架构对照摘要

```
写入路径（src/memory/service.ts）:
  用户输入 → 安全过滤 → embedding → pgvector INSERT
  ↑ 缺：LLM 抽取 fact / entity linking / temporal tag

检索路径（service.ts:177 searchMemories）:
  query embedding → pgvector cosine → topK=5-10 → OPT-2 LLM 回答层
  ↑ 缺：BM25 / entity matching / graph traversal
```

---

## 4. 路线图影响

```
当前 44.4% overall
  └─ OPT-6: ADD-only 抽取层（抄 mem0）→ 预期 overall +10~20pp, single/multi_hop 受益
       └─ OPT-7/8: entity linking + 多信号检索 → +5~10pp
            └─ Step B: Graphiti bi-temporal graph 叠加层
                  → temporal +12~20pp 真信号（类比 mem0+graph +2pp on top of mem0）
```

> ⚠️ 以上增益估计来自量级类比，不可直接做 pp 减法（judge/题集不同），以 benchmark 三规则验证为准。

---

**paper_ref**: arXiv:2504.19413 §2.1 (mem0), arXiv:2501.13956 (Zep), github.com/getzep/graphiti README
**benchmark_target**: OPT-6 后 overall ≥ 55%；Step B 后 temporal ≥ 25%（TBD-主人拍）

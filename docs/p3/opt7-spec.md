# OPT-7 立项 Spec

**版本**: v0.3（+ 灵儿前端视角：权重 config 暴露 + 召回 debug API）
**状态**: 🟡 起草中，待瓶儿 ACK + 碧瑶 implementation 评估
**日期**: 2026-04-19
**paper_ref**: mem0 blog 2026-04-17 "Token-Efficient Memory Algorithm" §multi-signal retrieval（三路检索融合）+ Robertson & Zaragoza (2009) BM25 / Okapi BM25（keyword 检索基础）
**repo_ref**: github.com/mem0ai/mem0（open-source SDK）

---

## 为什么做（背景）

OPT-6 H1 final 判决（`docs/p3/opt6-h1-verdict.md` v0.6，sample=7，n=1533）：
- overall +5.7pp **真信号**（CI 不重叠 0.67pp，7/7 conv 同向）
- single_hop +14.0pp、adversarial +16.1pp、temporal +14.5pp **强方向**
- multi_hop -3.0pp **噪声**（OPT-7 主攻目标）

根因分析（`docs/p3/why-they-win.md` §1.3）：

> UniMemory 当前检索单路向量（pgvector cosine，`src/memory/service.ts:194`）。mem0 新算法用三路并行检索 fusion（semantic + keyword + entity）。不同查询类型需要不同信号主导——keyword 精确匹配对 multi_hop「Alice 上周干了什么」更强，entity 匹配对跨 fact 关联查询更强。

OPT-7 目标：加 BM25 + entity 信号层，融合后期望：
1. overall CI 拉开 → 升级真信号
2. multi_hop 从噪声 → 改善
3. single_hop / adversarial 真信号不被破坏（红线）

---

## 核心改变（抄什么）

### mem0 三路检索（blog §multi-signal retrieval）

```
当前 UniMemory 检索路径:
  query → embedding → pgvector cosine top-k → LLM 回答层

OPT-7 目标检索路径:
  query → [并行]
    ├── semantic: embedding cosine（现有）
    ├── keyword: BM25 normalized（新增）
    └── entity: query entity 提取 → entity lookup → recall boost（新增）
  → rank fusion（RRF 或加权）→ top-k → LLM 回答层
```

**BM25 说明**：对 memories 内容建倒排索引（动词变形归一化），keyword 查询走 BM25 打分。实现可用 PostgreSQL `tsvector / tsquery`（现有 DB 支持，不需额外服务）。

**entity matching 说明**：OPT-6 已提取 entity tags 存入 memories 表，OPT-7 在 query 时对 query 做实体提取，命中 entity tags 的 memories 获得 rank boost。

**融合策略**：RRF（Reciprocal Rank Fusion）—— 每路 rank 取倒数，加权求和，简单且有效。

---

## DoD（benchmark_target）

### 必过（阻塞 merge）——三规则双约束

**数字约束 + 三规则同时满足，缺一不可。逐 conv 方向表必须列出。**

数字基准：OPT-6 H1 sample=7 final（`docs/p3/opt6-h1-verdict.md` v0.6，n=1533）：

| 指标 | OPT-6 基准 | OPT-6 CI [95%] | 目标下限 | 三规则说明 |
|------|-----------|----------------|---------|-----------|
| overall | **53.7%** | [51.2%, 56.2%] | ≥ **57%** | CI 不重叠；Δ题 ≥ √1533≈39；7 conv 同向 |
| multi_hop | **13.5%** | [9.7%, 18.4%] | ≥ **22%** | 从噪声→真信号（Δ题 ≥ √237≈15）；三 conv 同向 |
| open_domain | **58.9%** | [55.1%, 62.6%] | ≥ **58%** | 不退步 |
| single_hop | **36.2%** | [30.1%, 42.7%] | ≥ **34%** | 不破坏 OPT-6 强方向（允许 ±2% 噪声）|
| adversarial | **88.5%** | [84.7%, 91.4%] | ≥ **85%** | 不破坏 OPT-6 强方向 |

> 🔴 **红点 A**（瓶儿 QA 红线）：基线必须用 OPT-6 sample=7 真实数字，已修正（v0.1 错用 sample=5）。
> 🔴 **红点 B**（瓶儿 QA 红线）：multi_hop **必涨**至真信号，是必过红线，非期望项。

### 期望（不阻塞）

- overall ≥ 58%（multi-signal 全发挥）
- multi_hop ≥ 25%（接近 mem0 论文水平）

---

## smoke 阶段（强制，spec ACK 后第一步）

> 🔴 **红点 C**（瓶儿 QA 红线）：smoke 是强制步骤，不可跳过直接起 H1。

**smoke 三标准**：
1. conv-49 单 conv 跑批出结果
2. OPT-7 overall ≥ OPT-6 conv-49 baseline × 0.9（约 ≥ 46%，防崩盘）
3. adversarial 不低于 OPT-6 conv-49 adversarial × 0.85（约 ≥ 77%，不破坏已有能力）

smoke 通过 → 起 H1 sample=7 跑批。

---

## 实验设计

- **对照**: OPT-6 H1 sample=5（当前最佳）
- **conv 集**: 沿用 sample=5（conv-49/42/43/26/48），B 路径加 conv-41/conv-50 则扩至 sample=7
- **seed**: 42
- **sample**: 与 OPT-6 同 conv 集，公平对比
- **judge**: gpt-5 + CoT v3

### 假设

| 假设 | 内容 | 优先级 |
|------|------|--------|
| H1 | vector + BM25（tsvector），RRF fusion | 必跑 |
| H2 | vector + BM25 + entity tag matching，RRF fusion | 次选 |
| H3 | H2 + query entity extraction（用 LLM 提取 query 实体）| 次选 |

---

## 实现说明（PM 视角，碧瑶补细节）

### DB 变更

```sql
-- BM25 支持（PostgreSQL tsvector）
ALTER TABLE memories ADD COLUMN IF NOT EXISTS content_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;
CREATE INDEX IF NOT EXISTS memories_tsv_idx ON memories USING GIN(content_tsv);

-- entity tag 已在 OPT-6 中添加，OPT-7 复用
-- entity_tags TEXT[] column 已存在（OPT-6 schema）
```

### 检索逻辑变更（`src/memory/service.ts`）

```typescript
// 新增 multiSignalSearch() 替换现有 searchMemories()
// 三路并行:
//   1. vector: 现有 pgvector cosine
//   2. bm25: ts_rank(content_tsv, plainto_tsquery(query))
//   3. entity: query 中命中 entity_tags 的 memories boost +0.2
// RRF fusion: score = Σ (1 / (k + rank_i))，k=60（默认）
// top-k = 10（与 OPT-6 保持一致）
```

### 动词归一化

参考 mem0 blog：keyword 搜索需要动词变形归一化（"attending a meeting" ↔ "what meetings did I attend"）。PostgreSQL `english` dictionary 内置词干处理，tsvector 自动覆盖基本需求。

---

## 可观测性 & 扩展性设计（灵儿前端视角，v0.3 新增）

### 三路权重暴露

融合权重默认黑盒（实验调优），同时暴露 env 覆盖给 power user：

```typescript
// 默认权重（RRF 内部等权，调参在 k 值）
// 若需显式加权可通过 env 覆盖：
// UNIMEMORY_RETRIEVAL_WEIGHTS=vector:0.5,bm25:0.3,entity:0.2
const DEFAULT_WEIGHTS = { vector: 0.5, bm25: 0.3, entity: 0.2 }
const weights = parseWeightsFromEnv() ?? DEFAULT_WEIGHTS
```

**PM 建议**：H1/H2 实验阶段保持等权（RRF k=60），benchmark 出数后再调权重。权重 config 作为「下一步可调旋钮」预埋，不在 H1 scope 内主动调整。

### 召回 debug API（`_signals` 字段）

每条返回的 memory chunk 附带 `_signals` 字段，说明哪些检索路径召回了它及各路得分：

```typescript
interface MemoryChunk {
  id: string
  content: string
  score: number  // 融合后最终 score
  _signals?: {
    sources: Array<'vector' | 'bm25' | 'entity'>  // 召回路径
    scores: {
      vector?: number
      bm25?: number
      entity?: number
    }
  }
}
```

**设计原则**：`_signals` 为可选字段（debug 模式下返回），融合阶段本来就有这数据，无额外计算成本。未来 dashboard 直接渲染「这条记忆是怎么被找到的」。

**碧瑶待评估**：`_signals` 暴露对现有 API response schema 的影响、是否需要 `?debug=true` flag 控制返回。

---

## 风险

| 风险 | 等级 | 缓解 |
|------|------|------|
| BM25 对短 fact（1-2句）效果差 | 🟡 中 | 跑 benchmark 验证；H1 先只加 BM25 |
| entity matching 质量依赖 OPT-6 entity_tags | 🟡 中 | OPT-6 已跑，entity_tags 覆盖率待查 |
| RRF 权重未调 | 🟢 低 | 默认 k=60 先跑，数据出来再调 |
| single_hop / adversarial 退步 | 🟡 中 | DoD 红线 ≥33%/≥82% 把守 |

---

## 时间线

| 里程碑 | 负责 | ETA |
|--------|------|-----|
| spec v0.1 PM 愿景 | 雪琪 | ✅ 今早 |
| spec v0.2 实现细节 | 碧瑶 | 今日 |
| 瓶儿 ACK spec | 瓶儿 | v0.2 后 |
| H1 跑批启动 | 碧瑶 | spec ACK 后 |
| H1 结果验收 | 雪琪 + 瓶儿 | H1 完成后 |

---

**paper_ref 分段**（瓶儿 QA 红线）：
- **检索融合**：mem0 blog 2026-04-17 §multi-signal retrieval（三路 fusion + entity matching + keyword normalization）
- **BM25 理论**：Robertson & Zaragoza (2009) BM25 and Beyond
- **RRF 融合**：Cormack et al. (2009) Reciprocal Rank Fusion outperforms Condorcet and individual Rank Learning Methods
**benchmark_target**: overall ≥ 55% + multi_hop ≥ 20%（Wilson 三规则，sample=5 对比 OPT-6）

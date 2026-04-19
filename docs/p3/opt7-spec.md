# OPT-7 立项 Spec

**版本**: v0.1（PM 愿景 + DoD，backend 实现细节待碧瑶补全）
**状态**: 🟡 起草中
**日期**: 2026-04-19
**paper_ref**: mem0 blog 2026-04-17 "Token-Efficient Memory Algorithm" §multi-signal retrieval（三路检索融合）+ Robertson & Zaragoza (2009) BM25 / Okapi BM25（keyword 检索基础）
**repo_ref**: github.com/mem0ai/mem0（open-source SDK）

---

## 为什么做（背景）

OPT-6 H1 final 判决（`docs/p3/opt6-h1-verdict.md` v0.4）：
- overall +5.7pp 强方向（CI 重叠 0.09pp，未完整过三规则）
- multi_hop -2.8pp 噪声（仍是弱点）
- single_hop 已 +18.4pp 真信号

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

数字基准：OPT-6 H1 sample=5 final（`docs/p3/opt6-h1-verdict.md` v0.4）

| 指标 | OPT-6 基准 | 目标下限 | 三规则说明 |
|------|-----------|---------|-----------|
| overall | 52.4% | ≥ **55%** | CI 不重叠；Δ题 ≥ √1136≈34；5 conv 同向 |
| multi_hop | 14.6% | ≥ **20%** | 从噪声→真信号（Δ题 ≥ √99≈10）|
| open_domain | 56.6% | ≥ **56%** | 不退步 |
| single_hop | 35.4% | ≥ **33%** | 不破坏 OPT-6 真信号（允许小幅噪声内回落）|
| adversarial | 87.3% | ≥ **82%** | 不破坏 OPT-6 真信号 |

### 期望（不阻塞）

- overall ≥ 58%（multi-signal 全发挥）
- multi_hop ≥ 25%（接近 mem0 论文水平）

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

**paper_ref**: mem0 blog 2026-04-17 "Token-Efficient Memory Algorithm" §multi-signal retrieval; Robertson & Zaragoza (2009) BM25
**benchmark_target**: overall ≥ 55% + multi_hop ≥ 20%（Wilson 三规则，sample=5 对比 OPT-6）

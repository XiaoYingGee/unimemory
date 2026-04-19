# OPT-6 Spec — mem0 ADD-only 抽取层

**作者**: 碧瑶 🌸 (实现) · 等雪琪 ❄️ (PM vision + DoD) · 等瓶儿 🍾 (QA 验收)
**日期**: 2026-04-19
**前置**: OPT-2.5 H1-H4 全证伪（prompt 调优路线失败），benchmark B(2.0) 44.4% 仍是最佳
**协议**: 严格按 `docs/p3/benchmark-protocol.md` v0.3

---

## 1. 为什么做 OPT-6

### 根因（来自 docs/p3/why-they-win.md）

mem0 overall 91.6% vs 我们 44.4% 的最大 gap 在**抽取层**：

| 层 | 我们现状 | mem0 做法 | 差距 |
|---|---|---|---|
| 抽取 | 存原始对话片段（chunking） | LLM 提炼 fact（ADD-only） | ⭐⭐⭐ 核心 gap |
| 索引 | pgvector cosine | vector + BM25 + entity | ⭐⭐ |
| 时序 | 无 | bi-temporal graph | ⭐⭐ |

**根本原因**：我们存的是原文切片，信息密度低；mem0 存的是 LLM 提炼的 fact，检索时精确匹配度高。

### 论文/代码引用（呆子心法强制字段）

- **paper_ref**: LoCoMo paper §4.1 (mem0 system description); mem0 repo `mem0/configs/prompts.py` `ADDITIVE_EXTRACTION_PROMPT`
- **repo_ref**: https://github.com/mem0ai/mem0/blob/main/mem0/memory/main.py (ADD operation logic)
- **核心 prompt**: mem0 使用 `ADDITIVE_EXTRACTION_PROMPT` 从对话中提炼 fact list，每条 fact 独立存储

---

## 2. 实现方案

### ADD-only 抽取流程

```
对话 turn → LLM 提炼 facts → 每条 fact embed → pgvector 存储
```

vs 现在：
```
对话 turn → 切片 → embed → pgvector 存储
```

### 核心改动

**Step 1**: 修改 `src/memory/service.ts` 的 `writeMemory` 流程：
- 在写入前调用 `extractFacts(content: string): Promise<string[]>`
- 对每条 fact 分别 embed + 存储（agent_id/scope 不变）
- `extractFacts` 使用如下 prompt（仿 mem0 ADDITIVE_EXTRACTION_PROMPT）：

```
From the following conversation excerpt, extract key facts as a list.
Each fact should be:
- A standalone, concise statement (one sentence)
- About a specific person, event, preference, or relationship
- Factual, not interpretive

Conversation:
{content}

Output a JSON array of fact strings. Example:
["Sarah works as a software engineer.", "Jake enjoys rock climbing on weekends."]
```

**Step 2**: ingest 流程加 `--extract-facts` flag（benchmark 专用，不影响生产）

**Step 3**: benchmark `ingest-events.js` 改用 fact 抽取替代原文存储

### 不破坏现有接口

- `writeMemory` 接口签名不变，加可选 `extractFacts?: boolean` 参数
- 默认 `false`（不影响生产），benchmark 跑批时传 `true`

---

## 3. benchmark_target（呆子心法强制字段）

| 类别 | A baseline | B(2.0) 现最佳 | OPT-6 目标 |
|---|---|---|---|
| overall | 29.8% | 44.4% | **≥ 52%** |
| single_hop | 31.0% | 31.0% | **≥ 45%** |
| multi_hop | 26.3% | 26.3% | **≥ 35%** |
| open_domain | 63.6% | 53.6% | **≥ 63%** (至少回到 baseline) |
| adversarial | 0% | 68.5% | **≥ 65%** (不退步) |
| temporal | 13.2% | 13.2% | **≥ 20%** |

---

## 4. 实现步骤

### Step A（~2h）：`extractFacts` 函数 + 单测
- 实现 `extractFacts(content, llmClient)` 
- 单测：给一段对话，验 facts 非空、每条 < 100 chars

### Step B（~1h）：ingest 流程接入
- `benchmarks/locomo/run.ts` 加 `--extract-facts` flag
- ingest 时先 extractFacts，再分别 writeMemory

### Step C（~1h）：smoke test + 跑批
- 先 `--sample=1 --conversation-id=conv-49` smoke test
- 无异常后跑 sample=3 (conv-49/42/43) A/B 对比

---

## 5. 待雪琪补充

- [ ] PM 愿景段落
- [ ] DoD 红线（OPT-6 pass 条件，瓶儿来划）
- [ ] 协议变更说明（如有）

---

_实现优先选「论文/SOTA repo 已验证」的方案。Benchmark 说了算。_

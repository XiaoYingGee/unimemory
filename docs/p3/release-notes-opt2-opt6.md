# UniMemory P3 Release Notes

**日期**: 2026-04-19
**分支**: bots/biyao/p3-opt3-step-a
**版本**: OPT-2 + OPT-6 合并前发布

---

## 本次发布内容

### OPT-2：LLM 回答层（default ON）

**commit**: `0e32f3e`（参见 PR #21）

**改动**：在检索 top-k memories 后，引入 LLM（gpt-4o-mini）二次回答层，包含：
- 结构化 memory 拼接 prompt
- adversarial 题目拒答逻辑（"None" 返回）
- 基于 memory 质量的置信度过滤

**benchmark 结论**（Wave 1，n=698，3 conv，seed=42）：

| 类别 | A baseline | OPT-2 | Δ | 信号 |
|------|-----------|-------|---|------|
| overall | 29.8% | 44.4% | +14.6pp | ✅ 真信号 |
| adversarial | 0% | 68.5% | +68.5pp | ✅ 真信号 |
| open_domain | 63.6% | 53.6% | -10.0pp | 🟡 弱反向（已记 followup）|

**paper_ref**: OPT-2 基于 LLM-as-judge + memory-augmented generation 范式，参见 `docs/p3/benchmark-protocol.md`

---

### OPT-6：ADD-only 抽取层（default OFF，opt-in `--extract-facts`）

**commit**: `d7cf760`（碧瑶实现）

**改动**：写入记忆前增加一次 LLM call，将原始对话提炼为结构化 fact 列表，ADD-only 策略（不覆盖历史）：
- `extractFacts()` 单程 LLM 提炼（gpt-4o-mini）
- 每条 fact 独立存储，旧 fact 不删不覆盖
- `valid_from` 时间戳字段（bi-temporal 铺垫）
- agent facts 一等公民存储

**benchmark 结论**（H1 sample=7，n=1533，7 conv，seed=42）：

| 类别 | OPT-6 base | vs B(2.0) Δ | 信号 |
|------|-----------|-------------|------|
| overall | 53.7% | +5.7pp | ✅ 真信号（CI 不重叠 0.67pp，7/7 同向）|
| single_hop | 36.2% | +14.0pp | 🟡 强方向（6+/1-/1=）|
| adversarial | 88.5% | +16.1pp | 🟡 强方向（6+/1-）|
| temporal | 26.3% | +14.5pp | 🟡 强方向（7/7 但 n=76 太小）|
| multi_hop | 13.5% | -3.0pp | ❌ 噪声（OPT-7 主攻）|
| open_domain | 58.9% | -0.6pp | ✅ 不退步 |

**paper_ref**: mem0 blog 2026-04-17 "Token-Efficient Memory Algorithm" §ADD-only extraction

**default OFF 原因**：OPT-2 引入的 open_domain -10pp 老账未还（非 OPT-6 引入），待 OPT-7/Step B 修复后升 default ON。

---

## 技术说明

### 依赖变更

- PostgreSQL 新增字段（OPT-6）：
  ```sql
  memories.valid_from TIMESTAMPTZ DEFAULT NOW()
  memories.valid_until TIMESTAMPTZ DEFAULT NULL
  memories.extracted_from TEXT
  memories.fact_source TEXT DEFAULT 'user'
  memories.entity_tags TEXT[]
  ```
- 无新外部服务依赖
- gpt-4o-mini API 调用增加（OPT-6 写入延迟 +~500ms）

### 使用方式

OPT-6 opt-in：
```bash
# 环境变量方式
UNIMEMORY_EXTRACT_FACTS=1 node dist/server.js

# 或 CLI flag
unimemory --extract-facts
```

---

## 已知问题 / Followup

| 问题 | 优先级 | 计划 |
|------|--------|------|
| open_domain -10pp（OPT-2 引入）| P1 | OPT-7 多信号检索 |
| multi_hop 13.5% 噪声级 | P1 | OPT-7 BM25+entity |
| temporal 26.3% 强方向（待图层）| P2 | Step B Graphiti |
| adversarial 6+/1- 不完全同向 | P2 | OPT-7 后观察 |

---

## 文档索引

| 文件 | 内容 |
|------|------|
| `docs/p3/benchmark-protocol.md` | 评测协议 v0.3.1 |
| `docs/p3/competitive-analysis.md` | mem0/Zep gap 分析 v0.3 |
| `docs/p3/why-they-win.md` | mem0/Zep 归因分析 |
| `docs/p3/opt6-h1-verdict.md` | OPT-6 H1 结论 v0.6（瓶儿盖章）|
| `docs/p3/opt7-spec.md` | OPT-7 立项 spec v0.2 |
| `docs/p3/step-b-zep-research.md` | Step B Zep 调研 v0.2 |

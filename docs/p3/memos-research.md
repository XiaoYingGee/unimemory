# MemOS 调研报告

**版本**: v0.1
**日期**: 2026-04-19
**调研人**: 雪琪
**来源**: github.com/MemTensor/MemOS + arXiv:2505.22101（short）+ arXiv:2507.03724（long）
**心法**: 论文/开源=方向指针；benchmark=判官；不抄近路

---

## 一句话定位

> MemOS 是 "Memory OS for LLM/Agent"，把记忆提升为一等公民操作资源，统一管理三类记忆（参数记忆 / 激活记忆 / 明文记忆），野心是 OS 级平台。UniMemory 是面向开发者的 SDK 级跨工具记忆层，专注 plug-in 落地。

---

## 1. 定位差异

| 维度 | MemOS | UniMemory |
|------|-------|-----------|
| 定位 | Memory OS（平台级）| Memory SDK（工具级）|
| 目标用户 | LLM 基础设施 / Agent 框架集成 | 应用开发者 plug-in |
| 记忆类型 | 三类统一：parametric + activation + plaintext | plaintext（向量+结构化 fact）|
| 核心抽象 | MemCube（标准化记忆单元，跨任务追踪/融合/迁移）| memories 表 + pgvector |
| 生命周期管理 | 强调 lifecycle（track / fuse / migrate）| ADD-only（OPT-6 引入）|
| 集成方式 | MCP / Coze / Dify / Agent 框架 | API SDK |
| benchmark | 未见公开 LOCOMO 等学术 benchmark 数字 | LOCOMO，n=1533，judge gpt-5 |

**结论**：重叠在 plaintext memory 层（RAG + 结构化存取），差异在 MemOS 还覆盖参数记忆（模型权重级 continual learning）+ 激活记忆（KV cache 管理）。UniMemory 不做这两层。

---

## 2. 核心算法 vs UniMemory 路线对比

### MemOS 核心机制

| 组件 | 描述 |
|------|------|
| **MemCube** | 标准化记忆单元：类型/来源/版本/时间戳统一封装，支持跨任务追踪 |
| **三类记忆** | parametric（权重）+ activation（KV cache）+ plaintext（RAG 层）|
| **lifecycle 管理** | store / retrieve / manage 三原语，支持 fusion（跨类型合并）和 migration（参数化蒸馏）|
| **MAG 范式** | Memory-Augmented Generation，vs RAG 区别是记忆有显式生命周期 |

### 与 UniMemory 路线对比

| OPT | UniMemory 方向 | MemOS 对应 | 是否借鉴 |
|-----|--------------|-----------|---------|
| OPT-2 | LLM 答案层（gpt-4o-mini 二次回答）| plaintext retrieve 层 | ✅ 已落地 |
| OPT-6 | ADD-only 结构化 fact 抽取 | MemCube plaintext store 语义对齐 | ✅ 已落地，方向一致 |
| OPT-7 | 多信号检索 BM25+entity+vector | MemOS retrieve 层，但 MemOS 未开源细节 | 🟡 方向一致，细节抄 mem0 |
| Step B | bi-temporal 图谱（Zep/Graphiti）| MemOS lifecycle migration 概念接近 | 🟡 方向指针 |
| OPT-N+ | — | **parametric memory（continual learning）** | ❌ 过重，不在路线图 |
| OPT-N+ | — | **activation memory（KV cache）** | ❌ 基础设施层，超出 SDK 范畴 |

---

## 3. 可借鉴点（OPT-7 之后方向指针）

### 3a. MemCube 思路 → 结构化 memory 元数据

MemOS 的 MemCube 封装了 `类型 / 来源 / 版本 / 时间戳`。UniMemory OPT-6 已有 `valid_from / fact_source / entity_tags`，方向一致。

**潜在借鉴**：OPT-7 之后考虑 memory 版本管理（fact 被更新时保留旧版，不仅 ADD-only），对 temporal 类型题更有帮助。

### 3b. MAG（Memory-Augmented Generation）范式

MemOS 提出 MAG 作为 RAG 的升级版，关键差异是：记忆有显式 lifecycle，不是静态文档库。UniMemory 的 OPT-6 ADD-only 已经是向 MAG 方向迈出的第一步。

**潜在借鉴**：显式 `memory lifecycle`（active / archived / deprecated）状态字段，检索时优先 active，过期 memory 降权。这对 temporal 类型题（"最新"信息）有直接帮助。

### 3c. MCP / Agent 框架集成模式

MemOS 已有 MCP 集成文档（Coze / Dify）。UniMemory 目前是纯 SDK，未来如果做 MCP server 暴露记忆能力，MemOS 的设计可以参考。

**评估**：这是 Step B 之后的事，暂列路线图后期（P3 Phase 3 或之后）。

---

## 4. 不适合 UniMemory 的部分

| MemOS 能力 | 原因 |
|-----------|------|
| Parametric memory（模型权重更新）| 需要 fine-tuning pipeline，超出 SDK 边界 |
| Activation memory（KV cache 管理）| 基础设施层，适合 LLM serving 框架，不适合应用层 SDK |
| 自研记忆专用模型（self-developed memory models）| 训练成本极高，UniMemory 用 gpt-4o-mini + embedding 够用 |
| 全 OS 级资源调度（MemCube migration / fusion 跨类型）| 工程复杂度远超 SDK 合理边界 |

**结论**：MemOS 是 infrastructure/platform 玩法，UniMemory 是 application layer 玩法。两者目标层不同，不存在直接竞争。

---

## 5. Benchmark 判断

**MemOS 公开 benchmark 情况**：
- arXiv:2505.22101 未见 LOCOMO benchmark 数字
- 主要强调「首次将记忆提升为一等公民」的定性贡献，benchmark 数字不是 paper 主要诉求
- 文档未列 LoCoMo / LongMemEval 等主流记忆 benchmark 结果

**PM 判断**：MemOS 论文属「架构范式提出型」，不是「benchmark 刷榜型」。按主人心法，无法用 benchmark 判官来直接比较。**我们不应把 MemOS 当追赶目标，而是「方向指针」**——它验证了 MAG + lifecycle 是正确方向，给我们 OPT-7+ 路线图提供视野，但不以 MemOS 性能数字作为 DoD 标准。

---

## 6. 综合结论

| 问题 | 答案 |
|------|------|
| MemOS 对 UniMemory 有参考意义吗？| ✅ 有，是方向指针，不是竞争对手 |
| 要抄 MemOS 架构吗？| ❌ 不全抄，OS 级野心超出 SDK 边界 |
| 有没有可以落地的借鉴？| ✅ memory lifecycle 状态字段（active/archived）+ MemCube 元数据思路 |
| Benchmark 能对齐吗？| ❌ MemOS 无 LOCOMO 数字，无法直接比较 |
| 是否影响 OPT-7 路线？| ✅ 验证 MAG 方向正确，OPT-7 多信号检索仍是正确下一步 |

---

## 7. 行动建议

| 优先级 | 建议 | OPT |
|--------|------|-----|
| 🟢 低成本可行 | OPT-7 实现后考虑 `memory_status` 字段（active/archived）| OPT-8？ |
| 🟡 中期 | MCP server 暴露记忆能力，参考 MemOS MCP 设计 | Phase 3 |
| 🔴 不做 | parametric memory / KV cache 管理 | 永久排除 |

---

**paper_ref**: arXiv:2505.22101（MemOS short）+ arXiv:2507.03724（MemOS long）+ Memory³（基础理论，doi:10.4208/jml.240708）
**benchmark_target**: MemOS 无公开 LOCOMO 数字，无法作为 benchmark DoD 目标

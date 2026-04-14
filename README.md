# UniMemory

**A unified memory layer for AI coding agents.**

> Cross-tool persistent memory for Claude Code, Codex, OpenClaw, and more — via the MCP protocol.

[中文文档](#中文说明) | [English](#english) | [Project Plan](docs/project-plan-v1.1.md)

---

## English

### The Problem

Every AI coding tool has its own memory silo:

- Claude Code → `/memories/*.md`
- Codex → `AGENTS.md`
- OpenClaw → `MEMORY.md`
- Cursor → `.cursor/rules/*.mdc`

When you switch tools — or use multiple tools at once — **your AI agents forget everything**. There's no shared memory, no continuity, no way for one agent to build on what another learned.

UniMemory fixes this.

### What UniMemory Does

UniMemory is a **MCP (Model Context Protocol) server** that gives all your AI tools access to the same persistent memory store. Write once, read from anywhere.

- **Claude Code** remembers that you prefer PostgreSQL
- **Codex** picks it up automatically
- **OpenClaw** already knew — it wrote it last week

### Architecture

```
┌─────────────────────────────────────────────┐
│              AI Tools Layer                  │
│  Claude Code │ Codex │ OpenClaw │ Others... │
└──────────────┬────────────────────────────────┘
               │  MCP Protocol
┌──────────────▼────────────────────────────────┐
│           UniMemory MCP Server                │
│  write · search · conflict-detect · scope    │
└──────────────┬────────────────────────────────┘
               │
┌──────────────▼────────────────────────────────┐
│     PostgreSQL + pgvector (HNSW index)        │
│  global scope │ project scope │ agent private │
└───────────────────────────────────────────────┘
```

### Key Features

| Feature | Status |
|---------|--------|
| Cross-tool memory sharing via MCP | 🚧 P0 |
| Multi-level scope (global / project / agent) | 🚧 P0 |
| Conflict detection at ingestion time | 🚧 P0 |
| Memory provenance & audit trail | 🚧 P0 |
| Management UI (Next.js) | 📋 P1 |
| Memory decay & hot/cold tiering | 📋 P1 |
| Conflict type classification (supersede/contradiction/refinement) | 📋 P1 |
| Codex support | 📋 P1 |

### Memory Schema

Every memory entry carries:

```sql
content          -- the memory text
embedding        -- vector(1536) for semantic search
scope            -- global / project / agent (private)
source_type      -- confirmed / inferred / uncertain
confidence       -- 0.0 to 1.0
importance_score -- decay-resistant flag
entity_tags      -- for conflict detection
status           -- active / conflict / disputed / archived / superseded
agent_id         -- who wrote it
source_context   -- provenance: what triggered this memory
```

### Benchmark Targets

We measure UniMemory against standard benchmarks used in the research community:

| Benchmark | What It Tests | Our Target |
|-----------|---------------|-----------|
| [LoCoMo](https://arxiv.org/abs/2402.09727) | Long-conversation memory retention | > 70% (P1) |
| [LongMemEval](https://arxiv.org/abs/2410.10813) | Recall, multi-session reasoning, temporal | > 80% (P2) |
| [MemoryAgentBench](https://arxiv.org/abs/2507.05257) | Conflict resolution (single/multi-hop) | > 15% multi-hop (P2) |
| MemoryStress | 1000-session longitudinal degradation | > 45% (P2) |

Current SOTA for reference: LoCoMo top 92.3% (EverMemOS), LongMemEval top 95.4% (OMEGA), MemoryAgentBench multi-hop top 12% (Mnemos).

### Roadmap

- **P0 (1.5 weeks)**: MCP server + pgvector + conflict detection + migration from `MEMORY.md`
- **P1 (2 weeks)**: Management UI + conflict type classification + hot/cold tiering + Codex support
- **P2 (ongoing)**: Benchmark-driven optimization, graph layer, auto scope inference

### Research Foundation

Built on solid research:

1. *Memory in the Age of AI Agents: A Survey* — [arXiv:2512.13564](https://arxiv.org/abs/2512.13564)
2. *Multi-Agent Memory from a Computer Architecture Perspective* — [arXiv:2603.10062](https://arxiv.org/abs/2603.10062)
3. *Collaborative Memory: Multi-User Memory Sharing* — [arXiv:2505.18279](https://arxiv.org/abs/2505.18279)
4. *Knowledge Conflicts for LLMs: A Survey* (EMNLP 2024) — [arXiv:2403.08319](https://arxiv.org/abs/2403.08319)
5. *MemoryAgentBench* (ICLR 2026) — [arXiv:2507.05257](https://arxiv.org/abs/2507.05257)
6. *Hindsight is 20/20* — [arXiv:2512.12818](https://arxiv.org/abs/2512.12818)
7. *AgentLeak: Privacy Leakage Benchmark* — [arXiv:2602.11510](https://arxiv.org/abs/2602.11510)

### License

Apache 2.0 — see [LICENSE](LICENSE).

---

## 中文说明

### 问题

每个 AI 编程工具都有自己的记忆孤岛：

- Claude Code → `/memories/*.md`
- Codex → `AGENTS.md`
- OpenClaw → `MEMORY.md`
- Cursor → `.cursor/rules/*.mdc`

当你切换工具——或者同时使用多个工具——**AI Agent 什么都不记得了**。没有共享记忆，没有连续性，一个 Agent 学到的东西另一个 Agent 完全不知道。

UniMemory 解决这个问题。

### UniMemory 做什么

UniMemory 是一个 **MCP（模型上下文协议）服务**，让你所有的 AI 工具共享同一个持久化记忆库。写一次，到处可读。

- **Claude Code** 记住了你偏好 PostgreSQL
- **Codex** 自动获取这个信息
- **OpenClaw** 早就知道了——是它上周写进去的

### 核心特性

- **跨工具记忆共享**：通过 MCP 协议统一接入，任何支持 MCP 的工具都能用
- **多级 Scope 隔离**：global（全局偏好）/ project（项目知识）/ agent（私有）
- **写入时冲突检测**：不等到读取时让 LLM 猜，写入就检测矛盾
- **完整溯源**：每条记忆记录谁写的、什么时候写的、基于什么上下文
- **记忆生命周期管理**：衰减降权 + 热冷分级存储 + 合并压缩

### 解决的边界问题

| 问题 | 论文支撑 | 解决方案 |
|------|---------|---------|
| 多 Agent 并发写入冲突 | [arXiv:2603.10062](https://arxiv.org/abs/2603.10062) | PG 事务 + append-only + 溯源字段 |
| 语义冲突无法检测 | MemoryAgentBench (ICLR 2026) | 写入时 embedding + entity_tag 双信号检测 |
| 记忆爆炸 | MemoryBank (AAAI 2024) | 衰减字段 + 热冷分级 + 合并压缩 |
| 记忆穿越/信息污染 | [arXiv:2602.11510](https://arxiv.org/abs/2602.11510) | 多级 scope，检索从窄到宽 |
| 幻觉写入 | [arXiv:2403.08319](https://arxiv.org/abs/2403.08319) | source_type 分级 + confidence 标记 |
| 隐私泄漏 | AgentLeak benchmark | 禁写清单 + 敏感信息过滤 |

### 分期计划

- **P0（1.5 周）**：MCP Server + pgvector + 冲突检测 + MEMORY.md 迁移脚本
- **P1（2 周）**：管理界面 + 冲突类型分类 + 热冷分级 + Codex 接入
- **P2（持续）**：Benchmark 驱动迭代优化

### Benchmark 目标

| Benchmark | 测试内容 | 目标 |
|-----------|---------|------|
| LoCoMo | 长对话记忆保留 | P1 完成后 > 70% |
| LongMemEval | 多维度记忆能力 | P2 阶段 > 80% |
| MemoryAgentBench | 冲突解决（多跳）| P2 阶段 > 15% |
| MemoryStress | 1000 轮长期退化 | P2 阶段 > 45% |

### 许可证

Apache 2.0 — 见 [LICENSE](LICENSE)。

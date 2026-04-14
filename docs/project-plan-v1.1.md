# UniMemory 项目计划书 v1.1
> 创建时间：2026-04-14
> Thread ID：1493574254720188556（记忆系统：调研 & 项目规划）

## 一、项目概述

**项目名称**：UniMemory — 跨 AI 工具统一记忆层
**核心定位**：为 Claude Code、Codex、OpenClaw 等多种 AI 编码工具提供统一的持久化记忆系统，填补"跨工具记忆断裂"这一业界空白
**部署模式**：本地优先，同时支持云端（Azure VM）
**技术架构**：方案 D（混合架构）— MCP Server + PostgreSQL/pgvector

---

## 二、核心痛点与理论支撑

| # | 痛点 | 论文支撑 | 落地方案 |
|---|------|---------|---------|
| 1 | 跨工具记忆断裂 | AI Coding Memory Systems Compared | MCP Server 统一接入层 |
| 2 | 多 Agent 并发冲突 | UCSD 2603.10062 + Collaborative Memory 2505.18279 | PG 事务 + append-only + 溯源字段 |
| 3 | 语义冲突无法检测 | Knowledge Conflicts Survey (EMNLP 2024) + MemoryAgentBench (ICLR 2026) + Mnemos | 写入时 embedding + entity_tag 双信号检测 |
| 4 | 记忆爆炸 | Agent Memory Survey 2512.13564 + MemoryBank (AAAI 2024) | 衰减字段 + 热冷分级 + 合并压缩 |
| 5 | 记忆穿越/信息污染 | MAMA Memory Leakage + AgentLeak 2602.11510 + RCR-Router | 多级 scope 树，检索从窄到宽 |
| 6 | 幻觉写入 | Knowledge Conflicts Survey | source_type 分级 + confidence + P0 手动触发 |
| 7 | 隐私泄漏 | AgentLeak 2602.11510 | 禁写清单 + 敏感信息过滤 |

---

## 三、技术架构

### 记忆条目 Schema（P0）

```sql
CREATE TABLE memories (
  id UUID PRIMARY KEY,
  content TEXT NOT NULL,
  embedding vector(1536),
  -- Scope
  scope VARCHAR(20) NOT NULL,         -- global / project / agent
  project_id VARCHAR(100),
  agent_id VARCHAR(50) NOT NULL,
  -- Quality
  source_type VARCHAR(20) NOT NULL,   -- confirmed / inferred / uncertain
  confidence FLOAT DEFAULT 0.5,
  importance_score FLOAT DEFAULT 0.5,
  entity_tags TEXT[],
  -- Lifecycle
  status VARCHAR(20) DEFAULT 'active',-- active/conflict/disputed/archived/superseded
  access_count INT DEFAULT 0,
  last_accessed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  -- Provenance
  source_context TEXT,
  conflict_group_id UUID
);
```

### 接入层
- MCP Server（TypeScript/Node）
- pgvector HNSW 索引
- 部署：Azure VM（现有基础设施）

---

## 四、分期计划

### P0（1.5 周）— 核心链路

| 任务 | 负责人 | 工期 |
|------|--------|------|
| MCP Server 骨架 + CRUD API | 碧瑶 | 3 天 |
| PostgreSQL + pgvector 部署（Azure VM） | 碧瑶 | 1 天 |
| 写入时冲突检测（embedding + entity_tag） | 碧瑶 | 2 天 |
| 迁移格式定义 + 调用规范文档 | 雪琪 | 1 天 |
| MEMORY.md → 结构化记忆迁移脚本 | 雪琪 | 1 天 |
| 接入测试（Claude Code + OpenClaw） | 金瓶儿 | 2 天 |

**P0 不做**：UI 界面、task scope、自动写入、LLM 辅助合并

### P1（2 周）— 增强能力

| 任务 | 负责人 | 工期 |
|------|--------|------|
| 管理界面（Next.js + shadcn/ui） | 田灵儿 | 6 天 |
| 冲突类型分类（supersede/contradiction/refinement） | 碧瑶 | 3 天 |
| 热冷分级存储 + 合并压缩 | 碧瑶 | 3 天 |
| task scope + 自动 scope 推断 | 碧瑶 | 2 天 |
| 敏感信息过滤 | 碧瑶 | 1 天 |
| Codex 接入 | 碧瑶 | 2 天 |

### P2（持续）— Benchmark 驱动迭代
持续用 benchmark 打分，发现薄弱项 → 针对性优化

---

## 五、Benchmark 测试体系

| Benchmark | 测什么 | 题量 | 我们的目标 |
|-----------|--------|------|----------|
| **LoCoMo** | 长对话记忆保留 | 81 组 QA | P1 完成后 > 70% |
| **LongMemEval** | 5维度：召回/偏好/多轮推理/知识更新/时序 | 500 题 | P2 阶段 > 80% |
| **MemoryAgentBench** | 冲突解决能力（单跳/多跳） | 800 题 | 多跳 > 15%（超越 Mnemos 12%） |
| **MemoryStress** | 1000 轮长期退化曲线 | 300 题 | P2 阶段 > 45% |
| **自定义冒烟测试** | 跨工具 CRUD + scope 隔离 | 自定义 | P0 验收：全通过 |

### 当前业界最高分参考
- LongMemEval：OMEGA 95.4%、Zep 71.2%
- LoCoMo：EverMemOS 92.3%、Hindsight 89.6%、Mem0 ~58%
- MemoryAgentBench 多跳：Mnemos 12%（最高）

---

## 六、风险与应对

| 风险 | 概率 | 应对 |
|------|------|------|
| MCP 在某些工具支持不完善 | 中 | P0 只接 Claude Code + OpenClaw |
| embedding 冲突检测误报 | 中 | 二层过滤 + 人工裁决兜底 |
| Agent 忘记调用 MCP | 高 | system prompt 硬性要求 + P1 做 hook |
| pgvector 性能瓶颈 | 低 | P0 量级 <1 万条，HNSW 足够 |
| 迁移数据丢失 | 低 | 保留原始文件，脚本可重跑 |

---

## 七、参考文献

### 核心论文
1. Memory in the Age of AI Agents: A Survey — https://arxiv.org/abs/2512.13564
2. Multi-Agent Memory from Computer Architecture Perspective — https://arxiv.org/abs/2603.10062
3. Collaborative Memory: Multi-User Sharing — https://arxiv.org/abs/2505.18279
4. Knowledge Conflicts for LLMs: A Survey (EMNLP 2024) — https://arxiv.org/abs/2403.08319
5. Hindsight is 20/20 — https://arxiv.org/abs/2512.12818
6. AgentLeak: Privacy Leakage Benchmark — https://arxiv.org/abs/2602.11510
7. RCR-Router: Role-Aware Context Routing — https://arxiv.org/abs/2508.04903
8. MemoryBank (AAAI 2024)

### Benchmark 论文
9. LoCoMo — https://arxiv.org/abs/2402.09727
10. LongMemEval (ICLR 2025) — https://arxiv.org/abs/2410.10813
11. MemoryAgentBench (ICLR 2026) — https://arxiv.org/abs/2507.05257
12. Mem0 论文 (ECAI 2025) — https://arxiv.org/abs/2504.19413

### 参考项目
- Mnemos（冲突检测）
- Hindsight（四层记忆网络）
- Mem0 OSS（社区最大）
- Letta/MemGPT（LLM 自编辑记忆）
- Beads（编码任务记忆）
- Zep-Graphiti（时序知识图谱）
- OMEGA（LongMemEval 95.4% SOTA）

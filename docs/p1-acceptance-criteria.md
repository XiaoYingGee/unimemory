# P1 Acceptance Criteria / P1 验收标准

**Version**: v1.0  
**Status**: Draft  
**Author**: 雪琪  
**Reference**: `docs/project-plan-v1.1.md`，Benchmark 目标见第五节

---

## 概述

本文档定义 P1 阶段每个功能模块的验收条件。所有条件均需通过金瓶儿的对应测试用例，方可合并到 main。

---

## B0 — Embedding Provider 模块化

**负责人**: 碧瑶 | **参考**: Strategy Pattern

| # | 验收条件 |
|---|---------|
| B0-1 | `EmbeddingProvider` interface 定义完整，包含 `generate(text: string): Promise<number[]>` 和 `dimensions: number` |
| B0-2 | 支持三种 provider：`openai`、`ollama`、`compatible` |
| B0-3 | 通过环境变量 `UNIMEMORY_EMBEDDING_PROVIDER` 切换，无需改代码 |
| B0-4 | 切换 provider 后，写入和检索使用相同的 embedding 空间（维度一致性检查） |
| B0-5 | 单元测试：每种 provider 独立可 mock，不依赖真实 API |
| B0-6 | `embedding_model` 字段正确记录实际使用的 provider + model 名称 |

---

## B1 — 冲突类型三分类

**负责人**: 碧瑶 | **参考**: Mnemos 论文，`docs/mcp-calling-convention.md`

| # | 验收条件 |
|---|---------|
| B1-1 | 写入时自动判断冲突类型：`supersede`（新取代旧）/ `contradiction`（真矛盾）/ `refinement`（补充细化） |
| B1-2 | `supersede`：自动将旧条目标记 `superseded`，无需人工裁决 |
| B1-3 | `contradiction`：双方均标记 `disputed`，必须触发人工裁决流程，不自动处理 |
| B1-4 | `refinement`：旧条目降权（`importance_score * 0.8`），新条目正常写入 |
| B1-5 | P0 的 `potential` 类型向后兼容，已有数据不受影响 |
| B1-6 | 金瓶儿 Q1 全部通过（冲突类型判断准确率 > 80%） |

---

## B2 — 热冷分级存储

**负责人**: 碧瑶

| # | 验收条件 |
|---|---------|
| B2-1 | `preference` 和 `decision` 类型记忆豁免冷归档（`importance_score >= 0.8` 时永不归档） |
| B2-2 | 超过阈值天数（默认 30 天）未访问的记忆自动设 `archived_at` |
| B2-3 | 归档记忆不参与 HNSW 实时检索（现有索引 `WHERE archived_at IS NULL` 已覆盖） |
| B2-4 | 归档阈值通过环境变量 `UNIMEMORY_ARCHIVE_DAYS` 配置，默认 30 |
| B2-5 | `memory_read` 支持 `include_archived=true` 显式查询归档记忆 |
| B2-6 | 热转冷过程中，正在进行的检索不受影响（事务隔离） |
| B2-7 | 金瓶儿 Q2 全部通过 |

---

## B3 — 合并压缩 Pipeline

**负责人**: 碧瑶

| # | 验收条件 |
|---|---------|
| B3-1 | 合并后生成摘要记忆，原始记忆标记 `archived`，不删除 |
| B3-2 | 摘要记忆带 `source_context` 注明"consolidated from N memories" |
| B3-3 | 合并操作**不自动执行**，需要明确触发（API 或管理界面） |
| B3-4 | 合并结果可回溯：通过 `conflict_group_id` 或新增字段能找到所有原始记录 |
| B3-5 | 金瓶儿 Q3 验证：合并后关键信息不丢失（人工抽查 + 自动检索验证） |

---

## B4 — Task Scope 支持

**负责人**: 碧瑶 | **参考**: `docs/mcp-calling-convention.md` X1 更新后版本

| # | 验收条件 |
|---|---------|
| B4-1 | Scope 层级：`global > project > task > agent`（从宽到窄） |
| B4-2 | 检索时，`task` scope 记忆仅在指定 `task_id` 时返回 |
| B4-3 | `task_id` 字段加入 Schema，`project_id` 为必填前提（task 必须属于某个 project） |
| B4-4 | 跨 task 调用需显式声明（防止记忆穿越） |
| B4-5 | 金瓶儿 Q4 全部通过 |

---

## B5 — 敏感信息过滤

**负责人**: 碧瑶 | **参考**: `docs/sensitive-info-policy.md`

| # | 验收条件 |
|---|---------|
| B5-1 | Block List 中所有类型（API Key、Token、密码、身份证等）触发拦截，返回 `SENSITIVE_CONTENT_BLOCKED` |
| B5-2 | Sanitize List 中的信息（IP、邮箱、URL token）自动脱敏后写入，响应中 `sanitized=true` |
| B5-3 | 检测在写入路径最前端执行，早于 embedding 生成 |
| B5-4 | 被拦截的原始内容**不记录**到任何日志 |
| B5-5 | 金瓶儿 Q5：误拦截率 < 1%，漏检率 < 0.1% |

---

## B7 — min_confidence 拦截

**负责人**: 碧瑶 | **P0 遗留**

| # | 验收条件 |
|---|---------|
| B7-1 | `source_type=inferred` 且 `confidence < 0.7` 的写入请求被拦截，返回明确错误 |
| B7-2 | 拦截阈值可配置（`UNIMEMORY_MIN_INFERRED_CONFIDENCE`，默认 0.7） |
| B7-3 | 金瓶儿 Q6 全部通过 |

---

## 整体 P1 验收门槛

P1 合并到 main 的最低条件：

| 条件 | 要求 |
|------|------|
| 单元测试 | 所有模块覆盖率 > 80% |
| 集成测试（Q7） | Claude Code + OpenClaw 跨工具读写链路全通 |
| 安全 review | B5 通过金瓶儿 Q5，无高危漏洞 |
| 文档 | 每个 B 系列任务有对应 API 文档更新 |
| Benchmark | LoCoMo 子集召回准确率 > 70%（X4 完成后测量） |

---

## P1 完成定义

以下全部满足，P1 正式完成：
- [ ] B0-B5, B7 所有验收条件通过
- [ ] L1-L4 管理界面可演示基本操作
- [ ] Q7 集成测试 100% 通过
- [ ] LoCoMo 基线分数已建立（X4）
- [ ] `docs/sensitive-info-policy.md` 已执行并通过测试

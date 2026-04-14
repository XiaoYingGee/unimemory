# Migration Format Specification / 迁移格式规范

**Version**: v1.0  
**Status**: Draft  
**Author**: 雪琪

---

## Overview / 概述

This document defines the standard format for migrating existing memory files (`MEMORY.md`, `memory/*.md`) into the UniMemory system.

本文档定义将现有记忆文件（`MEMORY.md`、`memory/*.md`）迁移至 UniMemory 系统的标准格式。

---

## Source Formats / 来源格式

### OpenClaw Memory Files

OpenClaw 使用两种格式存储记忆：

1. **`MEMORY.md`** — 索引文件，包含各记忆文件的摘要
2. **`memory/*.md`** — 具体记忆文件，带 YAML frontmatter

#### YAML Frontmatter Schema

```yaml
---
name: 显示名称
description: 一行描述
type: user | feedback | project | reference
created: YYYY-MM-DD
updated: YYYY-MM-DD
expires: YYYY-MM-DD  # 可选
---
```

---

## Target Format / 目标格式（UniMemory Record）

每条迁移后的记忆对应一条数据库记录：

```json
{
  "id": "uuid-v4",
  "content": "记忆内容正文",
  "embedding": null,              // 迁移时留空，写入后异步生成
  
  // Scope
  "scope": "global | project | agent",
  "project_id": null,             // scope=project 时必填
  "agent_id": "openclaw",         // 来源 agent，迁移时统一标为 openclaw
  
  // Quality
  "source_type": "confirmed | inferred | uncertain",
  "confidence": 0.8,              // 已确认的历史记忆默认 0.8
  "importance_score": 0.5,        // 根据 type 字段映射（见下方）
  "entity_tags": [],              // 迁移时留空，可后期补标
  
  // Lifecycle
  "status": "active",
  "memory_type": "preference | decision | fact | context | temp",
  "access_count": 0,
  "last_accessed_at": null,
  "created_at": "原文件 created 字段",
  
  // Provenance
  "source_context": "migrated from: memory/filename.md",
  "conflict_group_id": null,
  
  // Conflict (P1)
  "conflict_type": null           // supersede | contradiction | refinement
}
```

---

## Field Mapping Rules / 字段映射规则

### `scope` 映射

| 来源 type | 目标 scope |
|-----------|-----------|
| `user`    | `global`  |
| `feedback`| `global`  |
| `project` | `project` |
| `reference`| `global` |

### `importance_score` 映射

| 来源 type   | importance_score |
|------------|-----------------|
| `user`     | 0.9             |
| `feedback` | 0.85            |
| `project`  | 0.7             |
| `reference`| 0.5             |

### `memory_type` 映射

| 来源 type   | memory_type  |
|------------|-------------|
| `user`     | `preference` |
| `feedback` | `preference` |
| `project`  | `decision`   |
| `reference`| `fact`       |

### `source_type`

所有迁移记忆统一标记为 `confirmed`，因为这些都是已经人工确认过的历史知识。

---

## Migration Script Contract / 迁移脚本约定

迁移脚本（由雪琪维护）需满足以下约定：

1. **幂等性**：同一文件重复跑不产生重复记录（以 `source_context` 去重）
2. **不删除源文件**：迁移后原始 `.md` 文件保留，不自动删除
3. **Dry-run 模式**：支持 `--dry-run` 参数，只输出将要写入的记录，不实际写入
4. **错误处理**：单条记录解析失败时跳过并记录到 `migration-errors.log`，不中断整体迁移
5. **迁移日志**：每次运行输出 `migration-YYYYMMDD.log`，包含：迁移数量、跳过数量、错误数量

### 运行方式（预期）

```bash
# Dry run
python scripts/migrate.py --source ~/.openclaw/workspace/memory/ --dry-run

# 实际迁移
python scripts/migrate.py --source ~/.openclaw/workspace/memory/ --target-db postgresql://...

# 指定 project scope
python scripts/migrate.py --source ./memory/ --scope project --project-id memory-system
```

---

## Transition Period / 过渡期处理

新旧系统并存期间，读取层需聚合两个来源：

1. **UniMemory MCP**：新系统记忆（写入只进新系统）
2. **本地 `.md` 文件**：旧系统记忆（只读，不再写入）

聚合逻辑由各 Agent 的 MCP 调用方处理，不在数据库层实现。

---

## Validation Checklist / 迁移验收清单

- [ ] 所有 `memory/*.md` 文件解析无报错
- [ ] `scope` 字段全部有值（不为 null）
- [ ] `source_type` 全部为 `confirmed`
- [ ] `source_context` 包含原文件路径
- [ ] 无重复记录（`source_context` 唯一）
- [ ] Dry-run 输出与实际写入数量一致

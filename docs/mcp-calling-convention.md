# MCP Calling Convention / MCP 调用规范

**Version**: v1.0  
**Status**: Draft  
**Author**: 雪琪

---

## Overview / 概述

This document defines the calling conventions for the UniMemory MCP Server — how agents should invoke memory read/write operations.

本文档定义 UniMemory MCP Server 的调用规范，规定各 Agent 应如何调用记忆读写操作。

---

## Tools / 工具列表

UniMemory MCP Server 提供以下工具：

| Tool Name | 描述 |
|-----------|------|
| `memory_write` | 写入一条记忆 |
| `memory_read` | 检索相关记忆 |
| `memory_update` | 更新一条记忆 |
| `memory_delete` | 标记删除一条记忆 |
| `memory_resolve_conflict` | 人工裁决冲突记忆 |

---

## `memory_write`

### 调用时机

**P0 阶段：必须手动触发**，禁止 Agent 自动判断写入。

以下场景应写入记忆：
- 主人明确表达了偏好或决策（"我想用 PostgreSQL"）
- 重要的项目决策被确认（"方案 A 通过"）
- 需要跨任务保留的事实信息

以下场景**不应写入**：
- Agent 自己的推断或猜测（除非标注 `inferred`）
- 临时上下文（当前会话结束后无价值）
- 已经存在的重复信息（先查再写）

### Request Schema

```json
{
  "content": "string (必填) — 记忆内容，简洁清晰，一条记忆一个知识点",
  "scope": "global | project | agent (必填)",
  "project_id": "string (scope=project 时必填)",
  "source_type": "confirmed | inferred | uncertain (必填)",
  "confidence": "float 0-1 (可选，默认 0.5)",
  "importance_score": "float 0-1 (可选，默认 0.5)",
  "memory_type": "preference | decision | fact | context | temp (必填)",
  "entity_tags": ["string"] // 可选，建议填写，用于冲突检测
}
```

### Response Schema

```json
{
  "memory_id": "uuid",
  "status": "created",
  "conflicts_detected": [
    {
      "conflict_id": "uuid",
      "existing_memory_id": "uuid",
      "existing_content": "string",
      "similarity": 0.91,
      "conflict_type": "potential"
    }
  ]
}
```

### 调用示例

```json
// ✅ 正确：主人明确说的偏好
{
  "content": "主人偏好使用 PostgreSQL 作为主数据库",
  "scope": "global",
  "source_type": "confirmed",
  "confidence": 0.95,
  "importance_score": 0.9,
  "memory_type": "preference",
  "entity_tags": ["db-choice", "postgresql"]
}

// ✅ 正确：项目内的决策
{
  "content": "UniMemory 项目 P0 阶段不做管理 UI",
  "scope": "project",
  "project_id": "unimemory",
  "source_type": "confirmed",
  "confidence": 0.9,
  "importance_score": 0.8,
  "memory_type": "decision",
  "entity_tags": ["ui", "p0-scope"]
}

// ❌ 错误：不应该写入的推断
{
  "content": "主人可能喜欢深色主题",  // 推断，未确认
  "source_type": "confirmed"         // 错误标注
}
```

---

## `memory_read`

### 调用时机

在以下场景调用，获取相关历史记忆：
- 开始一个新任务前（获取相关偏好和决策）
- 回答涉及历史信息的问题时
- 做技术选型时（检查是否有已有决策）

### Request Schema

```json
{
  "query": "string (必填) — 查询描述，用自然语言描述你想找什么",
  "scope_filter": "global | project | agent | all (可选，默认 all)",
  "project_id": "string (scope_filter=project 时填写)",
  "top_k": "int (可选，默认 5，最大 20)",
  "min_confidence": "float (可选，默认 0.3)",
  "include_conflicts": "boolean (可选，默认 true)"
}
```

### Response Schema

```json
{
  "memories": [
    {
      "memory_id": "uuid",
      "content": "string",
      "scope": "global | project | agent",
      "source_type": "confirmed | inferred | uncertain",
      "confidence": 0.95,
      "importance_score": 0.9,
      "memory_type": "preference",
      "entity_tags": ["db-choice"],
      "status": "active | conflict",
      "similarity_score": 0.88,
      "created_at": "ISO8601"
    }
  ],
  "conflicts": [
    {
      "memory_a": { "memory_id": "...", "content": "..." },
      "memory_b": { "memory_id": "...", "content": "..." },
      "conflict_score": 0.91
    }
  ]
}
```

### 冲突记忆处理规范

当 response 中 `conflicts` 不为空时，Agent 必须：
1. 不能直接采信冲突记忆中的任一条
2. 应在回复中说明"检测到相关记忆存在冲突，建议主人确认"
3. 不得基于冲突记忆做出不可逆操作

---

## `memory_resolve_conflict`

**此工具仅供人工调用（或雪琪代主人执行），Agent 不得自动调用。**

### Request Schema

```json
{
  "conflict_group_id": "uuid (必填)",
  "winner_memory_id": "uuid (必填) — 保留的记忆 ID",
  "resolution_note": "string (可选) — 裁决说明"
}
```

### Response Schema

```json
{
  "resolved": true,
  "winner": { "memory_id": "uuid", "content": "string" },
  "archived": [{ "memory_id": "uuid", "content": "string" }]
}
```

---

## Scope Rules / Scope 使用规则

| Scope | 适用场景 | 检索时包含 |
|-------|---------|----------|
| `global` | 跨项目通用知识：用户偏好、技术风格、个人习惯 | 始终包含 |
| `project` | 项目内决策、项目特有约定 | 仅当指定对应 project_id |
| `agent` | Agent 私有记忆（不与他人共享） | 仅当指定对应 agent_id |

**检索逻辑**：每次检索 = `global` + `project:{当前项目}` 的合并结果。

---

## Error Codes / 错误码

| Code | 描述 |
|------|------|
| `MISSING_REQUIRED_FIELD` | 必填字段缺失 |
| `INVALID_SCOPE` | scope 值不合法 |
| `PROJECT_ID_REQUIRED` | scope=project 时未提供 project_id |
| `CONFLICT_DETECTED` | 写入时检测到潜在冲突（非报错，正常返回） |
| `MEMORY_NOT_FOUND` | 指定 memory_id 不存在 |
| `UNAUTHORIZED_RESOLVE` | Agent 尝试自动裁决冲突（禁止） |

---

## Prohibited Behaviors / 禁止行为

1. **禁止在无明确触发的情况下自动写入记忆**
2. **禁止将 `inferred` 类记忆标注为 `confirmed`**
3. **禁止 Agent 自动调用 `memory_resolve_conflict`**
4. **禁止将私密对话内容写入 `global` scope**
5. **禁止在未检查冲突响应的情况下继续操作**

---

## Quick Reference / 快速参考

```
写记忆前：先想——这是主人明确说的，还是我推断的？
写记忆后：检查 conflicts_detected，有冲突要告知主人
读记忆时：检查 conflicts，有冲突不要直接采信
裁决冲突：告知主人，由主人或雪琪代为处理
```

# Code Review Notes — Schema vs Spec Alignment

**Reviewer**: 雪琪  
**Date**: 2026-04-14  
**Reviewed files**: `src/memory/types.ts`, `src/db/migrations/001_init.sql`

## 结论

Schema 与规范文档整体一致，发现 3 处小差异，已在 `docs/mcp-calling-convention.md` 修正（commit `3168d63`）。

## 差异详情

### 1. `status` 字段：`conflict` → `disputed`

- **规范文档原写法**：`active | conflict | disputed | archived | superseded`
- **实现**：`active | disputed | archived | superseded`（无 `conflict`，用 `disputed` 统一表示冲突状态）
- **处理**：规范文档已改为统一使用 `disputed`

### 2. `scope_filter` 类型

- **规范文档原写法**：单值字符串 `global | project | agent | all`
- **实现**：数组 `MemoryScope[]`，更灵活
- **处理**：规范文档已改为数组类型

### 3. `min_confidence` vs `min_similarity`

- **规范文档原写法**：只有 `min_confidence`（记忆质量阈值）
- **实现**：使用 `min_similarity`（向量检索相似度阈值），两者语义不同
- **处理**：规范文档已补充两个参数，`min_similarity` 已实现，`min_confidence` 待实现（建议作为后续小任务）

## 待补充功能

`min_confidence` 过滤（过滤低置信度记忆）尚未在 `service.ts` 实现，建议作为独立任务补上。

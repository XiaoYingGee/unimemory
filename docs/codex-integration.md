# Codex / Claude Code 接入指南

## 概述

UniMemory 通过 MCP (Model Context Protocol) 协议接入 Codex 和 Claude Code。
接入后，AI 编程助手可以：
- 读取/写入跨会话记忆
- 检索历史决策和偏好
- 在 session 间保持上下文连续性

---

## 快速接入

### 1. 启动 MCP Server

```bash
cd ~/Workspace/unimemory
npm run mcp
```

Server 通过 stdio 通信，Codex/Claude Code 会自动检测。

### 2. Claude Code 配置

在项目根目录创建 `.claude/mcp.json`（或全局 `~/.claude/mcp.json`）：

```json
{
  "mcpServers": {
    "unimemory": {
      "command": "node",
      "args": ["dist/mcp/server.js"],
      "cwd": "/path/to/unimemory"
    }
  }
}
```

### 3. Codex 配置

在 `~/.codex/config.yaml` 中添加：

```yaml
mcp:
  servers:
    - name: unimemory
      command: node
      args: [dist/mcp/server.js]
      cwd: /path/to/unimemory
```

---

## MCP 工具列表

| 工具 | 描述 | 触发时机 |
|------|------|----------|
| `memory_write` | 写入记忆 | 用户确认后手动调用 |
| `memory_read` | 搜索记忆 | session 开始时或需要上下文时 |
| `memory_resolve_conflict` | 解决冲突 | 冲突被检测到，用户确认后 |
| `memory_merge` | 合并压缩记忆 | 用户主动触发 |
| `memory_merge_trace` | 回溯合并来源 | 审计/回滚时 |
| `memory_warm_up` | 唤醒冷记忆 | 需要访问归档记忆时 |
| `memory_cold_stats` | 查看冷热统计 | 监控/运维 |

---

## System Prompt 模板

将以下内容加入 Codex/Claude Code 的 system prompt：

```
## Memory System (UniMemory MCP)

You have access to a persistent memory system via MCP tools.

### Rules
1. **Do NOT auto-write memories.** Only write when the user explicitly asks or confirms.
2. **Read at session start.** Call `memory_read` with relevant keywords to load context.
3. **One fact per memory.** Never bundle multiple facts into one `memory_write`.
4. **Scope correctly:**
   - `global`: cross-project preferences, habits
   - `project`: project-specific decisions, constraints
   - `agent`: your own reasoning notes (rarely used)
5. **Handle conflicts.** If `conflicts_detected` is non-empty, surface them to the user before proceeding.
6. **Never auto-merge.** `memory_merge` requires explicit user instruction.

### On Session Start
Call `memory_read` with the current task description to load relevant memories.

### On Important Decision
Ask the user: "Should I remember this?" — write only on confirmation.

### On Conflict
Tell the user: "I found conflicting memories: [A] vs [B]. Which should I keep?"
Wait for response, then call `memory_resolve_conflict`.
```

---

## scope 选择指南

```
用户偏好 / 工作习惯            → scope: global
项目架构决策 / 技术选型          → scope: project  (需要 project_id)
当前 session 推理过程            → scope: agent    (agent_id = 你的模型名)
```

---

## 常见问题

**Q: 每次 session 都要调用 memory_read 吗？**
A: 推荐在 session 开始时调用一次，query 填当前任务描述。

**Q: 冲突太多怎么办？**
A: 提高写入时的 `confidence` 阈值，或用 `memory_merge` 定期合并相近记忆。

**Q: 冷记忆找不到了？**
A: 冷记忆不参与向量搜索。用 `memory_warm_up(memory_id)` 唤醒后再搜索。

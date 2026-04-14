# UniMemory

**面向 AI Agent 的统一记忆层 — 共享、隔离、持久化。**

UniMemory 解决了一个现有工具都没有解决的问题：当你同时使用多个 AI 编码工具（Claude Code、Codex、OpenClaw、Cursor、Windsurf）时，每个工具都活在自己的记忆孤岛里。一次会话学到的知识，下一次会话就消失了。UniMemory 打破这些孤岛。

---

## UniMemory 能做什么

UniMemory 提供一个统一的持久化记忆库，任何 AI Agent 都可以通过 **Model Context Protocol（MCP）** 读写它。你的 Agent 记住该记的，忘掉该忘的，彼此之间的记忆也不会互相污染。

**核心能力：**

| 能力 | 描述 |
|------|------|
| 🔗 **跨工具记忆共享** | Claude Code 写入偏好，OpenClaw 直接读取。零配置。 |
| 🔒 **Scope 隔离** | `global` 记忆全局共享，`project` 记忆项目内可见，`agent` 记忆完全私有。不会泄漏。 |
| ⚔️ **写入时冲突检测** | 两个 Agent 写入矛盾信息？UniMemory 在写入时就捕获，而不是让混乱自然发生。 |
| 📉 **记忆衰减** | 过时的记忆自动降权，重要的记忆永远保留。基于访问频率和重要性的可配置衰减算法。 |
| 🛡️ **敏感信息过滤** | API Key、Token、身份证号 — 在写入数据库之前就被拦截。 |
| 🔌 **可插拔 Embedding** | 支持 OpenAI、Ollama（本地，无需 API Key）或任何 OpenAI 兼容端点。你来选。 |

---

## 为什么选 UniMemory，而不是 Mem0 或 Zep？

| | UniMemory | Mem0 | Zep |
|--|-----------|------|-----|
| 跨工具（MCP） | ✅ | ❌ | ❌ |
| 多 Agent Scope 隔离 | ✅ | 部分 | ✅ |
| 写入时冲突检测 | ✅ | ❌ | ❌ |
| 本地 Embedding（无需 API Key） | ✅ | ❌ | ❌ |
| 自托管 | ✅ | ✅ | ✅ |
| 开源协议 | ✅ Apache 2.0 | ✅ | 部分 |

Mem0 每次 CRUD 都调用 LLM — 成本高、延迟大。Zep 以图谱为核心，运维复杂。UniMemory 的设计原则是：**简单部署、易于扩展、从第一天起就工具无关**。

---

## 快速开始

**前置条件**：Node.js 18+，PostgreSQL 16+（含 pgvector 扩展）

```bash
# 1. 克隆并安装依赖
git clone https://github.com/XiaoYingGee/unimemory
cd unimemory
npm install

# 2. 初始化数据库
createdb unimemory
psql unimemory < src/db/migrations/001_init.sql

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env：设置 DATABASE_URL 和 UNIMEMORY_EMBEDDING_PROVIDER

# 4. 启动 MCP Server
npm start
```

或者使用 Docker：

```bash
docker compose up -d
```

**接入 Claude Code**（`~/.claude/settings.json`）：

```json
{
  "mcpServers": {
    "unimemory": {
      "command": "node",
      "args": ["/path/to/unimemory/dist/index.js"]
    }
  }
}
```

配置完成后，你的 Agent 可以直接调用 `memory_write`、`memory_read`、`memory_resolve_conflict`。

---

## Embedding Provider

UniMemory 不需要 OpenAI 账号也能运行：

```bash
# 使用 OpenAI（默认）
UNIMEMORY_EMBEDDING_PROVIDER=openai
OPENAI_API_KEY=sk-...

# 使用 Ollama（本地，免费，无需 API Key）
UNIMEMORY_EMBEDDING_PROVIDER=ollama
UNIMEMORY_EMBEDDING_BASE_URL=http://localhost:11434

# 使用任意 OpenAI 兼容端点
UNIMEMORY_EMBEDDING_PROVIDER=compatible
UNIMEMORY_EMBEDDING_BASE_URL=https://your-endpoint.com/v1
UNIMEMORY_EMBEDDING_API_KEY=your-key
```

---

## 记忆模型

每条记忆都有一个 **Scope（作用域）**：

```
global          → 所有 Agent、所有项目可见
project:{id}    → 指定项目内可见
agent:{id}      → 仅写入方可见，完全私有
```

每条记忆都有一个 **Type（类型）**，类型决定衰减策略：

```
preference / decision   → 免疫衰减（永不自动归档）
fact / context          → 随访问减少逐渐降权
temp                    → 7 天后自动归档
```

---

## 部署方式

| 模式 | 适用场景 | 启动方式 |
|------|---------|---------|
| **stdio**（本地） | 单机、个人使用 | `node dist/index.js` |
| **HTTP**（远程） | 团队、多机协作 | `npm run start:http` |

---

## Roadmap

```
✅ v0.1  核心 MCP Server — 写入、读取、冲突检测、记忆衰减
🔄 v0.2  冲突类型三分类、热冷存储、敏感信息过滤
📋 v0.3  管理 UI、task 级 Scope、LoCoMo 基线评分
🔮 v1.0  混合架构 — 本地缓存 + 中心同步
🔮 v2.0  去中心化模式 — P2P，无需中心服务器
```

---

## 贡献

欢迎 PR。分支命名规范：Agent 贡献用 `bots/{name}/{feature}`，人类贡献用 `feat/{feature}`。

架构决策、API 规范和内部设计文档见 [`docs/`](./docs/)。

---

## 开源协议

Apache 2.0 — 随意使用、Fork、基于此构建。

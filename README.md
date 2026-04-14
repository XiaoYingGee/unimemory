# UniMemory

**The unified memory layer for AI agents — shared, isolated, persistent.**

UniMemory solves a problem no existing tool addresses: when you use multiple AI coding tools (Claude Code, Codex, OpenClaw, Cursor, Windsurf), each one lives in its own memory silo. Knowledge learned in one session never reaches the next. UniMemory breaks those silos.

---

## What UniMemory Does

UniMemory provides a single, persistent memory store that any AI agent can read from and write to — via the **Model Context Protocol (MCP)**. Your agents remember what matters, forget what doesn't, and never step on each other's memories.

**Core capabilities:**

| Capability | Description |
|-----------|-------------|
| 🔗 **Cross-tool memory** | Claude Code writes a preference. OpenClaw reads it. Zero configuration. |
| 🔒 **Scope isolation** | `global` memories are shared. `project` memories stay in-project. `agent` memories are private. No leakage. |
| ⚔️ **Conflict detection** | Two agents write contradictory facts? UniMemory catches it at write time, not at chaos time. |
| 📉 **Memory decay** | Stale memories fade. Important ones don't. Configurable decay based on access frequency and importance. |
| 🛡️ **Sensitive info filtering** | API keys, tokens, PII — blocked before they ever touch the database. |
| 🔌 **Pluggable embeddings** | OpenAI, Ollama (local, no API key), or any OpenAI-compatible endpoint. Your choice. |

---

## Why UniMemory, Not Mem0 or Zep?

| | UniMemory | Mem0 | Zep |
|--|-----------|------|-----|
| Cross-tool (MCP) | ✅ | ❌ | ❌ |
| Multi-agent scope isolation | ✅ | Partial | ✅ |
| Write-time conflict detection | ✅ | ❌ | ❌ |
| Local embedding (no API key) | ✅ | ❌ | ❌ |
| Self-hosted | ✅ | ✅ | ✅ |
| Open source | ✅ (Apache 2.0) | ✅ | Partial |

Mem0 calls LLM on every CRUD operation — expensive and slow. Zep is graph-first and complex to operate. UniMemory is designed to be **simple to run, easy to extend, and tool-agnostic from day one**.

---

## Quick Start

**Prerequisites**: Node.js 18+, PostgreSQL 16+ with pgvector

```bash
# 1. Clone and install
git clone https://github.com/XiaoYingGee/unimemory
cd unimemory
npm install

# 2. Set up database
createdb unimemory
psql unimemory < src/db/migrations/001_init.sql

# 3. Configure
cp .env.example .env
# Edit .env: set DATABASE_URL and UNIMEMORY_EMBEDDING_PROVIDER

# 4. Start the MCP server
npm start
```

Or use Docker:

```bash
docker compose up -d
```

**Connect to Claude Code** (`~/.claude/settings.json`):

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

Now your agents can call `memory_write`, `memory_read`, and `memory_resolve_conflict` directly.

---

## Embedding Providers

UniMemory works without an OpenAI account:

```bash
# Use OpenAI (default)
UNIMEMORY_EMBEDDING_PROVIDER=openai
OPENAI_API_KEY=sk-...

# Use Ollama (local, free, no API key)
UNIMEMORY_EMBEDDING_PROVIDER=ollama
UNIMEMORY_EMBEDDING_BASE_URL=http://localhost:11434

# Use any OpenAI-compatible endpoint
UNIMEMORY_EMBEDDING_PROVIDER=compatible
UNIMEMORY_EMBEDDING_BASE_URL=https://your-endpoint.com/v1
UNIMEMORY_EMBEDDING_API_KEY=your-key
```

---

## Memory Model

Every memory has a **scope**:

```
global          → visible to all agents, all projects
project:{id}    → visible within a specific project
agent:{id}      → private to one agent
```

Every memory has a **type** that controls decay:

```
preference / decision   → immune to decay (never auto-archived)
fact / context          → decays with inactivity
temp                    → auto-archived after 7 days
```

---

## Deployment

| Mode | Use case | How |
|------|----------|-----|
| **stdio** (local) | Single machine, personal use | `node dist/index.js` |
| **HTTP** (remote) | Team, multi-machine | `npm run start:http` |

---

## Roadmap

```
✅ v0.1  Core MCP server — write, read, conflict detection, decay
🔄 v0.2  Conflict type classification, hot/cold storage, sensitive info filtering
📋 v0.3  Management UI, task-level scope, LoCoMo benchmark baseline
🔮 v1.0  Hybrid architecture — local cache + central sync
🔮 v2.0  Decentralized mode — peer-to-peer, no central server required
```

---

## Contributing

PRs welcome. Branch naming: `bots/{name}/{feature}` for agent contributions, `feat/{feature}` for human contributors.

See [`docs/`](./docs/) for architecture decisions, API specs, and internal design documents.

---

## License

Apache 2.0 — use it, fork it, build on it.

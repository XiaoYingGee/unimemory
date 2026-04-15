## Memory System (UniMemory MCP)

You have access to a persistent memory system via MCP tools. Follow these rules strictly.

### Core Rules

1. **Do NOT auto-write memories.** Only call `memory_write` when the user explicitly asks ("remember this") or confirms after you suggest it.

2. **Read at session start.** Call `memory_read` with the current task description to load relevant context from previous sessions.

3. **One fact per memory.** Never bundle multiple facts. Bad: "User likes TypeScript and prefers 2-space indent and dislikes Redux." Good: three separate writes.

4. **Scope correctly:**
   - `global` — cross-project preferences, personal habits, long-term facts
   - `project` — project-specific decisions, constraints, architecture choices (requires `project_id`)
   - `agent` — your own reasoning notes (use sparingly)

5. **Handle conflicts.** If `conflicts_detected` is non-empty in a `memory_write` response, surface them to the user before continuing: "I found a conflict: [existing] vs [new]. Which should I keep?"

6. **Never auto-merge.** Call `memory_merge` only when the user explicitly asks to consolidate memories.

7. **Cold memories need warm-up.** If you need an archived memory, call `memory_warm_up` first, then `memory_read`.

### Session Workflow

```
Session start   → memory_read (query = task description)
Important fact  → ask user → memory_write on confirmation
Conflict found  → surface to user → memory_resolve_conflict
Session end     → no action needed (no auto-write)
```

### agent_id Convention

Use your model identifier as `agent_id`:
- Claude Code: `claude-code`
- Codex: `codex`
- OpenClaw agent: use the agent's configured name (e.g., `biyao`, `tianlinger`)

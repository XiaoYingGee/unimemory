# OPT-6 立项 Spec

**版本**: v0.1（PM 愿景 + DoD，backend 实现细节待碧瑶补全）
**状态**: 🟡 起草中，待碧瑶 + 瓶儿 ACK
**日期**: 2026-04-19
**paper_ref**: mem0 blog 2026-04-17 "Token-Efficient Memory Algorithm"（ADD-only 新算法，91.6分版本）+ arXiv:2504.19413 §2.1（论文版旧算法 71.4，基线对照）
**repo_ref**: github.com/mem0ai/mem0（开源 SDK，MIT）

---

## 为什么做（背景）

OPT-2.5 四个 prompt 假设全部证伪（见 `docs/p3/opt2.5-final.md`）。

根因诊断（`docs/p3/why-they-win.md` §1.5）：

> UniMemory 写入的是**原文 content**，不是**结构化 fact**。LLM prompt 再强，也无法从劣质 memory 读出正确时序信息。

mem0 在 LoCoMo 从 66.9%（旧）跳至 91.6%（新），最关键改动是**抽取层改成 ADD-only 单程 LLM 提炼 fact**。这是 OPT-6 要抄的目标。

---

## 核心改变（抄什么）

### mem0 ADD-only 抽取（paper §2.1）

```
当前 UniMemory 写入路径:
  用户输入原文 → 安全过滤 → embedding → pgvector INSERT

OPT-6 目标写入路径:
  用户输入原文 → 安全过滤 → [NEW] LLM 单程抽取 fact list → 
    对每条 fact: embedding → pgvector INSERT（ADD-only，不覆盖旧 fact）
```

**ADD-only 含义**：
- 旧有 fact 遇到新信息时**不删、不覆盖**，新 fact 作为独立记录新增
- "我从纽约搬到旧金山" → 存两条 fact：`lived_in: New York (until 2026-04)` + `lives_in: San Francisco (from 2026-04)`
- 旧 fact 的 `valid_until` 字段打上时间戳（为 Step B bi-temporal 做铺垫）

**agent facts 一等公民**（同步实现）：
- agent 的确认/推荐类输出（"我已为你预订了 3 月 3 日的航班"）同等存储
- 当前系统忽略 agent 侧输出

---

## DoD（benchmark_target）

### 必过（阻塞 merge）——三规则双约束

**数字约束 + 三规则同时满足，缺一不可。**

三规则（protocol §4 Wilson）：① Wilson 95% CI 不重叠 ② |Δ题数| ≥ √n ③ 三 conv delta 同向

n=698，√n=26.4 题（overall 级）；各子类以实际 n 计算。

数据基准来自 Wave 1 终稿（commit ，）：

| 指标 | B(2.0) 基准 | B(2.0) CI [95%] | 目标下限 | 三规则说明 |
|------|------------|-----------------|---------|-----------|
| overall | **44.4%** [40.8%,48.1%] | 698 题 | ≥ **50%** | CI 须不重叠；Δ题 ≥ 27；三 conv 同向 |
| single_hop | 18.1% [11.9%,26.5%] | 105 题 | ≥ **24%** | 不退步；Δ题 ≥ √105≈10；三 conv 同向 |
| temporal | 13.2% [5.8%,27.3%] | 38 题 | ≥ **15%** | 至少不退步；Δ题 ≥ √38≈6；三 conv 同向 |
| open_domain | 53.6% [47.9%,59.3%] | 291 题 | ≥ **53%** | 不退步（OPT-2 退步记 followup，OPT-6 不可再伤）|
| adversarial | 68.5% [61.0%,75.1%] | 165 题 | ≥ **65%** | LLM 拒答能力不被抽取层干扰；CI 参考线 |

> ⚠️ 红点 B 修复（瓶儿 review）：原 v0.1 DoD 数字无 CI 基准线，无 √n 下限——现已补全 Wave 1 CI + 各子类 √n 阈值。

### 期望（不阻塞，锦上添花）

- multi_hop ≥ 28%（实体关系更清晰后自然改善）
- 抽取层延迟 p95 ≤ 2s（单程 LLM call，可接受）

---

## 实验设计

- **对照**: B(2.0) OPT-2 baseline（commit `0e32f3e`）
- **conv 集**: conv-49 / conv-42 / conv-43（固定）
- **seed**: 42
- **sample**: 3
- **judge**: gpt-5 + CoT v3
- **generator**: gpt-4o-mini（抽取层 LLM 可另选，见实现说明）

### 实验分支

| 假设 | 内容 | 优先级 |
|------|------|--------|
| H1 | ADD-only 抽取（默认 LLM = gpt-4o-mini） | 必跑 |
| H2 | ADD-only + 旧 fact valid_until 打标（bi-temporal 铺垫）| 次选 |
| H3 | ADD-only + entity tags 提取（OPT-7 铺垫）| 次选 |

> 至少跑 H1 取得 baseline；H2/H3 看碧瑶时间

---

## 实现说明（PM 视角，碧瑶补细节）

### 需要的 LLM prompt（抽取层）

参考 mem0 blog §"Single-pass, ADD-only extraction"：

```
系统：你是一个记忆提炼模型。给定一段对话，提炼出关键事实列表。
规则：
1. 每条 fact 独立、完整、可验证（不依赖其他 fact 才能理解）
2. 包含时间信息（如果有）
3. 同时提炼 user 和 assistant 的事实（agent facts 一等公民）
4. 只输出新 fact（ADD-only），不判断是否跟已有 memory 冲突
输出：JSON array，每项 {content: string, entity_tags: string[], temporal_hint: string|null}
```

### DB schema 变更

> ⚠️ **OPT-6.5 延后处理**：以下 4 个字段的 migration script 将在 OPT-6.5 统一实现。当前 OPT-6 H1 跑批已通过运行时 `ALTER TABLE ADD IF NOT EXISTS` 在生产 DB 执行迁移，功能正常。代码层 migration 文件不在本 PR scope 内。

```sql
-- 现有 memories 表新增字段：
ALTER TABLE memories ADD COLUMN IF NOT EXISTS valid_from TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE memories ADD COLUMN IF NOT EXISTS valid_until TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS extracted_from TEXT; -- 原始 content hash
ALTER TABLE memories ADD COLUMN IF NOT EXISTS fact_source TEXT DEFAULT 'user'; -- 'user'|'agent'
```

### 写入流程变更（`src/memory/service.ts`）

```typescript
// 新增 extractFacts() 函数，在 writeMemory() 前调用
async function extractFacts(rawContent: string): Promise<FactItem[]>
// FactItem: {content, entity_tags, temporal_hint, fact_source}

// writeMemory 改为：对每条 fact 分别 embedding + INSERT（不 UPSERT）
```

### C: extractFacts() 实现细节（碧瑶）

```typescript
// src/memory/extract-facts.ts
const EXTRACT_FACTS_PROMPT = `
From the following conversation excerpt, extract key facts as a JSON array.
Each fact must be:
- A standalone, concise statement (one sentence, ≤ 80 chars)
- About a specific person, event, preference, or relationship
- Factual, not interpretive
- Written in third-person (e.g., "Sarah works as a software engineer.")

Conversation:
{content}

Output ONLY a JSON array of strings. Example:
["Sarah works as a software engineer.","Jake enjoys rock climbing on weekends."]

If no clear facts can be extracted, return: []
`;

export async function extractFacts(
  content: string,
  llm: OpenAI,
  model: string = 'gpt-4o-mini'  // D: LLM 锁死 gpt-4o-mini，与 B(2.0) 一致
): Promise<string[]> {
  const resp = await llm.chat.completions.create({
    model,
    messages: [{ role: 'user', content: EXTRACT_FACTS_PROMPT.replace('{content}', content) }],
    max_completion_tokens: 500,
    temperature: 0,
  });
  try {
    const raw = resp.choices[0].message.content?.trim() ?? '[]';
    const facts = JSON.parse(raw);
    return Array.isArray(facts) ? facts.filter((f: unknown) => typeof f === 'string' && f.length > 0) : [];
  } catch {
    return [];  // 抽取失败 → 降级存原文（不丢数据）
  }
}
```

**降级策略**：extractFacts 失败时，直接存原始 content（与现有行为相同），不报错。

### D: LLM 锁死
- 抽取层模型：`gpt-4o-mini`（与 B(2.0) LLM 答案层相同）
- 通过 `UNIMEMORY_EXTRACTION_MODEL` 环境变量覆盖（仅测试用，生产不变）
- judge 模型：`gpt-5.4`（不变）

### E: Smoke 阶段 + 回滚 Plan

**Smoke 阶段（必须通过才能全量跑批）**：
```bash
# 1. 清库
node -e "require('dotenv').config();..DELETE FROM memories WHERE agent_id='locomo-conv-49'"
# 2. smoke 单 conv
npx ts-node --transpile-only benchmarks/locomo/run.ts \
  --conversation-id=conv-49 --top-k=10 --concurrency=3 --llm --extract-facts
# 3. 验 facts 入库
node -e "SELECT COUNT(*), AVG(LENGTH(content)) FROM memories WHERE agent_id='locomo-conv-49'"
# 期望：records 数量 > 原始切片数量，avg content length < 200 chars（facts 比原文短）
```

**Smoke 通过标准**：
- facts 总数 > 0（抽取有效）
- avg fact 长度 < 150 chars（比原文切片短，说明真的在提炼）
- smoke conv-49 accuracy ≥ 40%（不低于 baseline 29.8%）

**回滚 Plan**（DB schema 迁移可逆）：
```sql
-- 回滚 schema（4 个新字段可安全 DROP）
ALTER TABLE memories DROP COLUMN IF EXISTS valid_from;
ALTER TABLE memories DROP COLUMN IF EXISTS valid_until;
ALTER TABLE memories DROP COLUMN IF EXISTS extracted_from;
ALTER TABLE memories DROP COLUMN IF EXISTS fact_source;
-- 回滚代码：git revert afeee7c..HEAD（恢复到 B(2.0) 逻辑）
```

**回滚触发条件**：smoke 失败 OR H1 跑批中 adversarial < 50%（早停）

---

## 风险

| 风险 | 等级 | 缓解 |
|------|------|------|
| 写入延迟增加（+LLM call）| 🟡 中 | gpt-4o-mini 单次 < 500ms；异步写入可降感知 |
| 抽取质量差（hallucination）| 🟡 中 | 跑 benchmark 验证；OPT-6 DoD 红线把守 |
| 存储量膨胀（ADD-only 不删）| 🟢 低 | pgvector 可承受；phase 后期可加 GC 策略 |
| adversarial 受影响 | 🟡 中 | DoD 红线 adversarial ≥ 65% 把守 |

---

## 时间线（草稿）

| 里程碑 | 负责 | ETA |
|--------|------|-----|
| spec v0.1 PM 愿景完成 | 雪琪 | ✅ 今晚 |
| spec v0.2 实现细节补全 | 碧瑶 | 今晚/明早 |
| 瓶儿 ACK spec | 瓶儿 | spec v0.2 后 |
| H1 跑批启动 | 碧瑶 | spec ACK 后 |
| H1 结果 + 雪琪验收 | 雪琪 | H1 完成后 |

---

**paper_ref**: mem0 blog 2026-04-17 "Token-Efficient Memory Algorithm"（ADD-only）+ arXiv:2504.19413 §2.1（论文版基线对照）
**benchmark_target**: overall ≥ 50%（Wilson 三规则，698 题）

# OPT-7 H1.3 R3 — Entity Hint 正则修复

**版本**: v0.1（瓶儿草稿，待雪琪姐 review + commit）
**日期**: 2026-04-20
**作者**: 金瓶儿（QA 草稿）→ 雪琪（PM final）
**前置**: smoke v2 (commit `f0cb048`) multi_hop 18.2% < 红线 22%

---

## 1. 问题诊断

`src/memory/service.ts:401-403` 当前 entity hint 提取过于粗暴：

```ts
const queryWords = req.query.toLowerCase().split(/\W+/).filter(w => w.length > 3);
const entityHints = queryWords.map(w => `speaker:${w}`).concat(queryWords.map(w => `session:${w}`));
```

**根因**：
- 「what did Alice say last week」→ entityHints = `speaker:what`, `speaker:alice`, `speaker:say`, `speaker:last`, `speaker:week`, `session:what`, ...
- 真实存进 DB 的 entity_tags 只有 `speaker:Alice`、`session:5` 这种**有限词集**
- 噪声 entity 把 entity_boost 变成「几乎人人匹配 1.0」→ 丧失区分度
- 多跳推理「Alice 上周聊了什么然后 Bob 怎么回复的」需要 **Alice + Bob 双 entity 命中**才有信号，当前实现是「散弹枪」

## 2. 修复目标

| # | 改动 | 预期收益 |
|---|------|----------|
| R3.1 | entity hint 必须命中**已存在的 speaker 集合** | 减噪声 entity 80%+ |
| R3.2 | entity hint 大小写匹配 DB 存储格式（首字母大写） | 命中率从 0 → 真实值 |
| R3.3 | session: hint 只对显式提到 session 编号的 query 生效 | 减无效 session boost |

## 3. 实现规范

### 3.1 引入 speaker 白名单
- ingest 阶段已知所有 speaker 集合（每个 conv 1-3 个 speaker，如 `Alice` / `Bob`）
- 检索阶段从 DB 现有 `entity_tags` 抽 distinct speaker 集合（一次启动缓存）
- entity hint 仅在白名单内匹配

### 3.2 entity hint 提取算法
```ts
// New (R3): 仅匹配白名单 + 大小写规范化
const knownSpeakers = await loadKnownSpeakers(projectId); // ["Alice", "Bob", "Charlie"]
const queryLower = req.query.toLowerCase();
const matched = knownSpeakers.filter(sp => {
  // 词边界匹配，避免 "Alice" 命中 "alicemia"
  const re = new RegExp(`\\b${sp.toLowerCase()}\\b`);
  return re.test(queryLower);
});
const entityHints = matched.map(sp => `speaker:${sp}`); // 保持原大小写

// session hint: 仅显式 "session N" / "the Nth session" 时启用
const sessionMatch = queryLower.match(/session\s+(\d+)|(\d+)(st|nd|rd|th)\s+session/);
if (sessionMatch) entityHints.push(`session:${sessionMatch[1] || sessionMatch[2]}`);
```

### 3.3 兜底：white list 为空时
- 不 fallback 到旧粗暴算法（避免污染）
- 退化为「entity_boost = 0」，依赖 vector + BM25 完成检索

## 4. 验收红线（瓶儿主审）

| 红线 | 阈值 | smoke v3 sample=1 conv-49 |
|------|------|--------------------------|
| **multi_hop**（主目标）| ≥ **22%** (7+ 题) | 必过，否则证伪 R3 路线 |
| single_hop | ≥ **45%** | 不能继续扩大 smoke v2 -2.7pp 跌幅 |
| adversarial | ≥ **90%** | 不能继续扩大 smoke v2 -2.5pp 跌幅 |
| temporal | ≥ **38%**（不退步） | 守住 smoke v2 +7.7pp |
| overall | ≥ **46%** | 防崩盘 |

## 5. 实现约束

- **只动 `src/memory/service.ts:401-403` 这两行 + 加 `loadKnownSpeakers` helper**
- **不动 BM25 query、vec_score 阈值、RRF 融合权重**（避免与 H1.1/H1.2 effect 串台）
- commit msg: `feat(opt7-h1.3): R3 entity hint whitelist + regex normalization`
- 引用：本 spec + 雪琪姐 04:08 multi_hop 诊断 commit

## 6. 回滚

代码层 feature flag：`UNIMEMORY_ENTITY_WHITELIST=0` 可禁用走旧粗暴算法（仅紧急回滚用）。

## 7. 时间预算

- impl: 30min（碧瑶）
- smoke v3: 10min（conv-49 sample=1）
- 通过 → sample=7（3h）

---

_瓶儿草稿 ✅ — 雪琪姐 review 后调措辞 + commit 即可。_

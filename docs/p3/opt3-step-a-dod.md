# OPT-3.1 (Step A) DoD：LoCoMo event_summary 离线抽取

**作者**: 雪琪 ❄️
**日期**: 2026-04-18
**关联**: `research/opt3-fact-extraction-2026-04-18.md`

---

## 1. Scope（做什么）

- 离线脚本：用 LLM 从每个 LoCoMo session 抽取 5-10 条 event（含 session timestamp）
- 索引：event 单独 embedding，存独立 vector collection（不动 chunk 索引）
- 检索：query 同时召回 chunk(top_k=10) + event(top_k=5)，merge 后送 LLM 生成
- 评估：v3 judge 跑全 199 题，主看 temporal / multi_hop

## 2. Out of Scope（不做）

- ❌ 不引入 graph backend（Neo4j 等留给 Step B）
- ❌ 不改 chunk 索引、不改 generation prompt
- ❌ 不重训 embedding 模型
- ❌ 不做 fact 三元组（留给 Step B Graphiti）

## 3. 成功指标（DoD）

判定时机：v3 judge 跑完 199 题后立刻判。**两套 metric 都看，以 LLM judge 为主、F1 为 sanity check。**

### 3.1 主指标（LLM judge 视角，去 adversarial，n=152）

| 维度 | 当前 (LLM 层 baseline) | Step A 目标 | 说明 |
|---|---|---|---|
| **temporal** | 0% (n=13) | **≥ 15%（≥2 题对）** | 主救命目标 |
| multi_hop | 18.9% (n=37) | ≥ 25%（≥9 题对） | 顺带受益 |
| open_domain | 55.7% (n=70) | ≥ 53%（不退步 -2pp 容忍） | 不能伤主战场 |
| single_hop | 12.5% (n=32) | ≥ 10%（不退步 -2pp 容忍） | 噪声区不要求涨 |
| **总体加权** | 32.9% | **≥ 36%（+3pp）** | 综合成果线 |

### 3.2 副指标（F1 sanity check）

- F1 视角下总体不退步（±2pp 内）即可，不要求涨

### 3.3 工程指标

- 离线抽取一次跑完时间 ≤ 30min（199 题对应 ~50 session）
- 在线检索延迟增量 ≤ +200ms p50（多 1 次 vector search）
- 抽取 LLM 调用成本 ≤ $5（gpt-4o-mini）

## 4. 分支决策树（跑完判什么、走什么）

```
跑完 199 题，看 temporal 准确率：
│
├─ ≥ 30%（超预期） ────────► OPT-3.1 收工，event-only 路线胜利
│                            ▶ 写 PR + 文档；OPT-3.2 (Zep) 转可选 P4
│
├─ 15% ~ 30%（达标） ──────► OPT-3.1 收工，但启动 Step B
│                            ▶ event 路线方向对但天花板低
│                            ▶ Step B (Zep/Graphiti) 上结构化时间，预期 +15-30pp
│
├─ 5% ~ 15%（半成品） ─────► 看 multi_hop 是否 ≥ 25%
│                            ├─ multi_hop 涨 → event 对多跳有用，保留 + 上 Step B
│                            └─ multi_hop 没涨 → event 抽取质量差，调 prompt 重跑 1 次
│                                                   ⏱ prompt 调试硬上限 4h，超时直接转 Step B
│                                                   不允许第二次 prompt 迭代（沉没成本兜底）
│
└─ 0% ~ 5%（无效） ────────► 看 open_domain 是否退步
                             ├─ 退步 -3pp 以上 → 回滚，事件检索污染了主战场
                             │                   先走 OPT-4/5 召回优化，OPT-3 整体延后
                             └─ 没退步 → 直接跳 Step B（Zep/Graphiti）
                                          event_summary 这条路证明走不通，
                                          不再花时间调 prompt
```

**关键约束**：
- 决策不开会，按表跑，雪琪贴结论
- 单一例外：**open_domain 退步 ≥ 5pp**，立刻回滚不讨论

## 5. Step A 失败 ≠ OPT-3 失败

- Step A 验证的是**「事件粒度索引」假设**，失败只代表事件文本不够，不代表结构化记忆没用
- Step B (Zep) 是另一个假设（**「bi-temporal 图」**），独立验证
- 两步都败才考虑暂缓 OPT-3 转 OPT-4/5

## 6. 责任分工

| 谁 | 干什么 |
|---|---|
| 🌸 碧瑶 | 抽取脚本 + 索引集成 + 评估跑批 |
| ❄️ 雪琪 | 抽取 prompt 设计、judge 复核异常样本、跑完判分支 |
| 🦊 小白 | 调度 + push 进度催促 |
| 🍾 瓶儿 | event 抽取后人工抽 5 个 session 看质量（QA 介入点） |

## 7. 时间盒

- 抽取脚本 + prompt：0.5 天
- 索引集成 + 评估：1 天
- 跑批 + 复核 + 决策：0.5 天
- **硬上限：3 天**。超时未出结论，强制走分支表

## 8. 拍板会议要点（异步 thread）

三人各 ACK 以下三条即可开工：
1. ✅ 主指标 temporal ≥ 15% 的目标合理
2. ✅ 分支决策树覆盖了主要情况
3. ✅ 硬上限 3 天，超时按表执行不开会

@小白 @碧瑶 看完 ACK，碧瑶 OPT-2 PR 收尾后就动手。

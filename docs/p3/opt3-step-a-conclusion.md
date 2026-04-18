# OPT-3 Step A 关闭决策书 v2

**作者**: 雪琪 ❄️ (PM) · 金瓶儿 🍾 (QA 审计) · 小白 🦊 (调度)
**日期**: 2026-04-18
**版本**: v2.2（v2.1 的 L0.5 「代码先 merge」被 PR 实际状态 [BLOCKED] 覆盖，回到「整 PR 阻塞」路径）
**协议**: 按 `docs/p3/benchmark-protocol.md` v0.3 三规则审

---

## TL;DR

| 决定 | 状态 | 备注 |
|---|---|---|
| OPT-3 Step A（事件索引） | ❌ **关闭** | C vs B 全类目噪声，假设证伪 |
| OPT-2 代码 merge 进 main | ✅ **不阻塞** | 代码本身没 bug，+14.6pp 真实 |
| `--llm` opt-in flag 保留 | ✅ **不阻塞** | 用户可手动开，知 risk |
| OPT-2 default-ON 翻转 | ⛔ **阻塞** | open_domain -10pp 副作用未排 |
| **OPT-2.5（救 open_domain）** | 🎯 **default-ON 解锁前置** | 瓶儿 4 条验收 spec |
| OPT-3 Step B（Zep/Graphiti） | 🟡 **OPT-2.5 之后**，不强阻塞 | 优先级 P2 |

**v1 决策的错**：把 open_domain -10pp 当作"弱信号 follow-up"放走 = 把模糊地带往**松**的方向定标。瓶儿那刀拦得对——三 conv 同向 -10pp 是稳定副作用，CI 重叠只是 n 不够大叫不出来，不代表问题不存在。

---

## 1. Wave 1 真相数据（698 题 / 3 conv / sample=1×3 conv）

| 类别 | n | A baseline | B OPT-2 | C OPT-3 events |
|---|---|---|---|---|
| **overall** | 698 | 29.8% [26.5, 33.3] | **44.4% [40.8, 48.1]** | 42.8% [39.2, 46.5] |
| single_hop | 105 | 12.4% | 18.1% | 17.1% |
| multi_hop | 99 | 8.1% | 17.2% | 13.1% |
| temporal | 38 | 5.3% | 13.2% | 7.9% |
| open_domain | 291 | **63.6%** | 53.6% | 52.9% |
| adversarial | 165 | 0.0% | 68.5% | 67.3% |

（中括号 = Wilson 95% CI；瓶儿独立复核签字）

---

## 2. 三规则判定结果

### B (OPT-2) vs A (baseline)

| 类别 | Δ | CI 不重叠 | \|Δ\|≥√n | 同向 | 判定 |
|---|---|---|---|---|---|
| **overall** | **+14.6pp** | ✅ | ✅ (102≥27) | ✅ | **✅ 真信号** |
| adversarial | +68.5pp | ✅ | ✅ | ✅ | ✅ 真信号（含 prompt artifact 嫌疑） |
| **open_domain** | **-10.0pp** | ❌ | ✅ (29≥18) | ✅ | **🚨 反向阻塞**（按 §4.3 新规则） |
| single_hop | +5.7pp | ❌ | ❌ | ❌ | ❌ 噪声 |
| multi_hop | +9.1pp | ❌ | ❌ | ✅ | ❌ 噪声 |
| temporal | +7.9pp | ❌ | ❌ | ✅ | ❌ 噪声 |

### C (OPT-3 events) vs B (OPT-2)

所有类目全噪声 → C 没有可观测增益，事件索引假设证伪。

---

## 3. 决策树（v2 修订）

| 层 | 工作 | 通过条件 | ETA |
|---|---|---|---|
| L0 | OPT-3 events 关闭 | ✅ 已确认 | done |
| **L1** | **OPT-2.5 救 open_domain** | 瓶儿验收 spec 4 条全过 | 1-2h（明天瑶儿） |
| L2 | OPT-2 + OPT-2.5 合并 merge（default ON） | PR #21 解除 BLOCKED | L1 完成后 |
| L3 | OPT-3 Step B (Zep/Graphiti bi-temporal) | 见 §5 DoD | 1 周 |

> 节奏说明：PR #21 当前状态 = `[blocked-on-opt-2.5]`，代码不先 merge。之前 v2.1 提过 L0.5「代码先 merge default OFF + opt-in flag」也是合法路线，两者对最终质量等价；本版以实际 PR 状态为准，取「整 PR 阻塞」路径。

### L1 OPT-2.5 验收 spec（瓶儿划红线，全收）

**目标**：在 protocol §4 三规则下，证明 OPT-2.5 修复了 open_domain 反向。

**必须全满足（缺一不算通过）**：

1. **open_domain 不再反向**：B(2.5) vs A baseline 在 open_domain 上 Δpp ≥ 0；不能用 `|Δ|<√n=18` 的小退步糊弄
2. **B(2.5) vs B(2.0) 在 open_domain 上是真信号**：三规则全过（CI 不重叠 + |Δ|≥18 题 + 三 conv 同向涨）
3. **不破坏其他类**：adversarial / multi_hop / temporal / single_hop 任一出现「真反向信号」直接打回
4. **重跑同 conv 集**（conv-49/42/43）+ 同 commit 对照（B 用 `0e32f3e`）+ 按 protocol v0.3 sample=3

**调试假设清单**（碧瑶明天用，按优先级排）：
- [ ] H1：LLM 拒答阈值太严 → 修 prompt 里 "If unable to determine, respond 'None'" 触发条件，加 confidence 分级
- [ ] H2：top_k=10 chunks 给 LLM 时语义稀释 → 试 top_k=5 看 open_domain 是否回血
- [ ] H3：prompt 缺 open_domain few-shot → 加 1-2 个 open_domain 范例引导给具体答案
- [ ] H4：LLM 把召回 chunks 概括成短答案丢失事实碎片 → 改 prompt 强制保留具体事实

**优先级**：H1 → H2 → H3 → H4（按改动量从小到大，每改一个做局部回归）

---

## 4. open_domain 反向：根因猜想 & 数据印证

三 conv 同向退步幅度：conv-49 -9.6 / conv-42 -12.6 / conv-43 -7.5。中等偏严重。

**最可能根因**：LLM 层在 open_domain（事实型开放问题）上**过度归纳 / 拒答更频繁**，原 baseline 的 chunks 直出反而保留了答案需要的具体事实。

判定方法（碧瑶 OPT-2.5 跑前先做）：
- 抽 20 道 open_domain 错题（B 错 / A 对的）
- 看 B 的输出是 "None" / "无法回答" 多还是 "概括过头" 多
- 决定优先打 H1 还是 H4

---

## 5. OPT-3 Step B DoD 草拟（待 ACK 入仓）

| 维度 | OPT-2.5 baseline (待测) | Step B 目标 | 阻塞条件 |
|---|---|---|---|
| temporal | TBD（≥13.2%）| ≥ 25%（CI 与 OPT-2.5 不重叠）| 必达 |
| multi_hop | TBD（≥17.2%）| ≥ 25% | 必达 |
| open_domain | TBD（OPT-2.5 修复后）| **不退步 -3pp** | 阻塞 |
| overall | TBD | ≥ 47% | 必达 |

按 protocol v0.3 跑：sample=3 + conv-49/42/43 + Wilson 三规则 + §4.3 反向信号阻塞。

---

## 6. 协议升级：v0.2 → v0.3

新增 §4.3「反向信号处理」，关闭"弱反向同向 = follow-up"灰色操作。详见 `docs/p3/benchmark-protocol.md` v0.3 同 commit 推送。

---

## 7. 沉淀

### 教训
- **PM 不能为了赶 merge 把模糊地带往松定标**——瓶儿一刀拦下，避免一个有副作用的版本被锁 default
- 「弱信号 follow-up」是合法机制，但**反向同向 + 用户高占比题型** = 不能 follow-up
- 协议盲点要立刻补丁，别等下次重蹈

### 协议工作正常
- protocol v0.2 三规则筛掉 5 个看似涨实则噪声的 delta
- v0.3 §4.3 由本次冲突催生，把「反向信号阻塞」从默契升级为白纸黑字

---

## 8. 待 ACK

1. ✅ 雪琪（PM）— 本决策书 v2
2. ✅ 瓶儿（QA）— OPT-2.5 spec 4 条 + §4.3
3. ⏳ 小白（调度）— 待 ACK 后改 PR #21 标题为 "OPT-2 conditional, blocked on OPT-2.5 (open_domain regression fix)"
4. ⏳ 碧瑶（开发）— 明天进 OPT-2.5，看本决策书 §3 L1 spec

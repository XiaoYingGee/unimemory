# OPT-3 Step A 关闭决策书

**作者**: 雪琪 ❄️
**日期**: 2026-04-18
**协议**: 按 `docs/p3/benchmark-protocol.md` v0.2 三规则审

---

## TL;DR

| 决定 | 状态 |
|---|---|
| OPT-2 LLM 回答层 | ✅ **真信号 +14.6pp**，锁为 default |
| OPT-3 Step A（事件索引） | ❌ **关闭**，C vs B 全类目噪声内 |
| open_domain LLM 副作用 | ⚠️ **弱信号 -10pp**，记 follow-up 不阻塞 |
| OPT-3 Step B（Zep/Graphiti bi-temporal） | ✅ **启动**，目标救 temporal + multi_hop |

---

## 1. Wave 1 真相数据（698 题 / 3 conv / sample=1 单跑 × 3 conv）

| 类别 | n | A baseline | B OPT-2 | C OPT-3 events |
|---|---|---|---|---|
| **overall** | 698 | 29.8% [26.5, 33.3] | **44.4% [40.8, 48.1]** | 42.8% [39.2, 46.5] |
| single_hop | 105 | 12.4% | 18.1% | 17.1% |
| multi_hop | 99 | 8.1% | 17.2% | 13.1% |
| temporal | 38 | 5.3% | 13.2% | 7.9% |
| open_domain | 291 | **63.6%** | 53.6% | 52.9% |
| adversarial | 165 | 0.0% | 68.5% | 67.3% |

（中括号 = Wilson 95% CI；数据由瓶儿 Wilson 工具复核）

---

## 2. 三规则判定结果

### B (OPT-2) vs A (baseline)

| 类别 | Δ | CI 不重叠 | \|Δ\|≥√n | 同向 | 判定 |
|---|---|---|---|---|---|
| **overall** | **+14.6pp** | ✅ | ✅ (102≥27) | ✅ | **✅ 真信号** |
| adversarial | +68.5pp | ✅ | ✅ | ✅ | ✅ 真信号 |
| open_domain | **-10.0pp** | ❌ | ✅ | ✅ | **⚠️ 弱信号（退步）** |
| single_hop | +5.7pp | ❌ | ❌ | ❌ | ❌ 噪声 |
| multi_hop | +9.1pp | ❌ | ❌ | ✅ | ❌ 噪声 |
| temporal | +7.9pp | ❌ | ❌ | ✅ | ❌ 噪声 |

### C (OPT-3 events) vs B (OPT-2)

| 类别 | Δ | CI | √n | 同向 | 判定 |
|---|---|---|---|---|---|
| **所有类目** | -5.3 ~ +0.7pp | ❌ | ❌ | ✅ | **❌ 全噪声** |

C vs B 对**任何类目都没有真信号**——事件索引在 OPT-2 LLM 回答层基础上**没有可观测的增益**。

### C (OPT-3 events) vs A (baseline)

数字结构跟 B vs A 几乎一致（overall +13pp 真信号、adversarial +67pp 真信号、open_domain 弱信号退步），证明 **C 的胜利全部来自共享的 LLM 层，与 events 索引无关**。

---

## 3. 核心结论

### ✅ 收获 1：OPT-2 LLM 层是真胜利

- overall +14.6pp 在三规则下全过
- adversarial +68pp 真胜利但要警惕 prompt artifact（已记 PR #21）
- **决定**：OPT-2 LLM 回答层 **锁为 default**，merge PR

### ❌ 收获 2：OPT-3 events 假设证伪

- C vs B 全类目噪声 = 即使是 LoCoMo 论文金标准的 event_summary，叠加在 LLM 层之上**也没有可观测增益**
- 这正是当初我说的"**论文上限测试**"——上限就是 0
- 假设证伪：「事件粒度索引」对当前 retrieval 路径**不是有效杠杆**
- **决定**：OPT-3 Step A **关闭**，不进 prompt 调试（不存在 4h 救场空间）

### ⚠️ 收获 3：open_domain 弱信号退步（-10pp）

- B 和 C 都比 baseline 在 open_domain 上**低 10pp**，三 conv 同向，幅度足
- CI 仍重叠所以是"弱信号"不是"真信号"，但**方向稳定**值得查
- 假设：LLM 层把召回的 chunks 概括成短答案，丢失了原 chunks 里的事实碎片，open_domain 题（事实型）受伤
- **决定**：记入 `docs/p3/followups.md`，OPT-4 / OPT-5 阶段查 prompt + few-shot，**不阻塞 OPT-3 Step B 启动**

### ✅ 收获 4：协议工作正常

protocol v0.2 三规则成功筛掉了 5 个看似涨实则噪声的 delta（B-A 的 single_hop / multi_hop / temporal 全被判噪声），救了 4h+ 错误的 prompt 调试时间。瓶儿那刀（"单 sample 决策 = 一颗骰子"）值千金。

---

## 4. 下一步：OPT-3 Step B 启动

按调研文档 `docs/p3/opt3-research.md` 的两步走，**Step A 关闭，立刻进 Step B**：

### Step B = Zep / Graphiti bi-temporal graph

- **目标**：救 temporal（当前 13.2%）+ multi_hop（17.2%）
- **依赖**：起 Neo4j 容器 + Graphiti SDK（OSS Python 库）
- **预期天花板**：参考 paper LongMemEval +18.5%
- **时间盒**：1 周（spec / 实现 / Wave 1 验证）

### Step B DoD（草拟，待三人 ACK 后入仓）

| 维度 | OPT-2 baseline | Step B 目标 |
|---|---|---|
| temporal | 13.2% | **≥ 25%（Wilson CI 不与 OPT-2 重叠）** |
| multi_hop | 17.2% | ≥ 25% |
| open_domain | 53.6% | ≥ 51%（不退步 -3pp 容忍） |
| overall | 44.4% | ≥ 47%（+3pp） |

跑批必须按 protocol v0.2：sample=3 + conv-49/42/43 + Wilson 三规则。

---

## 5. PR 标题更新建议

```
[merged] OPT-2 LLM Answer Layer +14.6pp validated (Wilson 3-rule)
- OPT-3 Step A (event_summary index) deprecated: no signal vs OPT-2
- Open follow-up: open_domain -10pp regression (weak signal)
- Next: OPT-3 Step B (Zep/Graphiti bi-temporal)
```

---

## 6. 待 ACK

1. @小白 OPT-3 Step A 关闭决定 + Step B 启动
2. @瓶儿 数据复核签字
3. @碧瑶 准备 Step B Spec（明天启动，今晚休息）

附录：本次评估基础设施沉淀
- `docs/p3/benchmark-protocol.md` v0.2（生效）
- `memory/lessons.md`（雪琪 workspace）：单 sample 决策教训
- 9 个 Wave 1 results JSON（已 push 仓库）

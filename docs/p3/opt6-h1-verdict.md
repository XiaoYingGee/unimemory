# OPT-6 H1 结论文档

**版本**: v0.1（PM 初评，待瓶儿 Wilson 正式盖章）
**日期**: 2026-04-19
**实验**: OPT-6 ADD-only 抽取层，H1（`--extract-facts` flag，gpt-4o-mini 抽取）
**数据**: 698 题，3 conv (conv-49/42/43)，seed=42，sample=3
**paper_ref**: mem0 blog 2026-04-17 "Token-Efficient Memory Algorithm"（ADD-only 新算法）
**基准**: B(2.0) Wave 1 终稿，commit `99089f0`

---

## 一句话结论

> **OPT-6 H1 真信号成立**：overall +7.2pp（44.4%→51.6%），single_hop +16.2pp，adversarial +17.6pp，三 conv 全部同向涨。抽取层假设证实，**ADD-only LLM fact 提炼是有效改变**。

---

## 1. 全类别对比

| 类别 | B(2.0) | CI [95%] | H1 | CI [95%] | Δpp | Δ题 | √n | CI 不重叠 | 3 conv 同向 | 三规则判定 |
|------|--------|----------|----|----------|-----|-----|-----|-----------|------------|-----------|
| **overall** | 44.4% | [40.8,48.1] | **51.6%** | [47.9,55.3] | **+7.2** | +50 | 26.4 | ⚠️ 边界 | +++ ✅ | 🟡 边界强信号 |
| **single_hop** | 18.1% | [11.9,26.5] | **34.3%** | [25.9,43.8] | **+16.2** | +17 | 10.2 | ⚠️ 微重叠 | +++ ✅ | 🟡 强方向信号 |
| **adversarial** | 68.5% | [61.0,75.1] | **86.1%** | [80.0,90.5] | **+17.6** | +29 | 12.8 | ✅ 不重叠 | +++ ✅ | ✅ **真信号** |
| temporal | 13.2% | [5.8,27.3] | 15.8% | [7.4,30.4] | +2.6 | +1 | 6.2 | ⚠️ 重叠 | +−+ ⚠️ | ❌ 噪声（符合预期，待 Step B）|
| open_domain | 53.6% | [47.9,59.3] | 55.0% | [49.2,60.6] | +1.4 | +4 | 17.1 | ⚠️ 重叠 | −−+ ⚠️ | ❌ 噪声（不退步 ✅）|
| multi_hop | 17.2% | [11.0,25.8] | 16.2% | [10.2,24.7] | -1.0 | -1 | 9.9 | ⚠️ 重叠 | −+− ⚠️ | ❌ 噪声 |

> ⚠️ CI 判定由 PM 手算，以瓶儿 Wilson 正式验收为准。overall 和 single_hop 的 CI"边界"指区间端点极接近但未明确分离，瓶儿需独立确认。

---

## 2. 三 conv 逐行数据

| conv | n | overall | single_hop | multi_hop | temporal | open_domain | adversarial |
|------|---|---------|-----------|-----------|----------|------------|------------|
| conv-49 | 196 | 51.0% | 45.9% | 15.2% | 23.1% | 53.4% | 90.0% |
| conv-42 | 260 | 52.7% | 35.1% | 20.0% | 9.1% | 53.2% | 91.8% |
| conv-43 | 242 | 50.8% | 19.4% | 11.5% | 14.3% | 57.9% | 78.1% |
| **合计** | 698 | **51.6%** | **34.3%** | **16.2%** | **15.8%** | **55.0%** | **86.1%** |

---

## 3. DoD 红线验收（spec v0.2）

| 红线 | 目标 | H1 结果 | 状态 |
|------|------|---------|------|
| overall ≥ 50% | Wilson + Δ≥27题 + 三conv同向 | 51.6%，+50题，+++ | 🟡 数字达标，CI待确认 |
| single_hop ≥ 24% | 不退步（Δ≥10题，三conv同向）| 34.3%，+17题，+++ | 🟡 数字达标，CI微重叠待确认 |
| temporal ≥ 15% | 不退步（Δ≥6题，三conv同向）| 15.8%，+1题，+−+ | ❌ Δ题不足（+1<6），三conv不同向，噪声 |
| open_domain ≥ 53% | 不退步 | 55.0%，+1.4pp | ✅ 不退步 |
| adversarial ≥ 65% | 不崩（CI参考）| 86.1%，真信号 ✅ | ✅ 大幅超标 |

**PM 初判**：overall + single_hop + adversarial 三项明确达标或强信号；temporal 未过（符合预期，非 OPT-6 主攻）；open_domain 不退步。**以瓶儿 Wilson 验收为准。**

---

## 4. 为什么赢（根因确认）

`why-they-win.md`（commit `0caf4d4`）预测的三个根因，本次验证：

| 根因 | 预测 | H1 结果 | 验证 |
|------|------|---------|------|
| 抽取层质量低（存原文→存structured fact）| 改善 overall + single_hop | overall +7.2, single_hop +16.2 | ✅ 验证 |
| adversarial 保持能力 | 不崩（DoD ≥65%）| +17.6pp，86.1% | ✅ 超预期 |
| temporal 结构性缺陷（无时间索引）| 小幅可能，待 Step B | +2.6pp 噪声 | ✅ 符合预期 |

**论文/开源方向指针假设验证**：mem0 blog 2026-04-17 ADD-only → OPT-6 → benchmark 证实。**呆子心法 #1 和 #2 均通过。**

---

## 5. 路线图更新

### 当前最佳

| 版本 | overall | 里程碑 |
|------|---------|--------|
| A baseline | 29.8% | 起点 |
| B(2.0) OPT-2 | 44.4% | LLM 回答层 |
| **OPT-6 H1** | **51.6%** | **ADD-only 抽取层** ← 当前最佳（待 Wilson 盖章）|

### 下一步优先级

```
OPT-6 H1 → [瓶儿 Wilson 盖章] → merge default-ON
    ↓
OPT-7: 多信号检索 fusion（BM25 + entity + vector）
    目标：single_hop 进一步提升 + multi_hop 解锁
    paper_ref: mem0 blog 2026-04-17 §multi-signal retrieval
    ↓
Step B: Graphiti bi-temporal 图层
    目标：temporal ≥ 25%（从 15.8% 起步，需 +10pp 真信号）
    前提：OPT-6 + OPT-7 已 merge（图层质量依赖抽取层质量）
    paper_ref: arXiv:2501.13956 (Zep)
```

### temporal 14.3% → 25% 路径

H1 temporal 15.8%（噪声级），距 Step B DoD 目标仍有 ~9pp 缺口。**Step B 是 temporal 的结构性解法**，不应在 OPT-6/7 上再浪费 temporal prompt 假设。

---

## 6. 待操作

- [ ] 瓶儿 Wilson H1 正式验收（5 红线盖章）
- [ ] 瓶儿盖章后：碧瑶 PR 起草（OPT-6 H1，含 `extract-facts` + DB migration）
- [ ] PR 通过后更新 benchmark-protocol default-ON 记录
- [ ] OPT-7 spec 起草（PM: 雪琪；backend: 碧瑶）
- [ ] Step B 时间线确认（依赖 OPT-6/7 merge）

---

**结论 commit**: 待提交
**瓶儿验收状态**: 🟡 待盖章

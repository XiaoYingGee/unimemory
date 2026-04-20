# OPT-6 H1 结论文档

**版本**: v0.6（sample=7 final，瓶儿 Wilson 盖章）
**日期**: 2026-04-19
**数据**: sample=7（conv-49/42/43/26/48/41/50），n=1533 题，seed=42
**paper_ref**: mem0 blog 2026-04-17 "Token-Efficient Memory Algorithm"（ADD-only 新算法）
**基准**: B(2.0) OPT-2 sample=7 同 conv（以瓶儿 Wilson 文件列表为准）

---

## 一句话结论（瓶儿 Wilson 盖章版）

> **OPT-6 H1 sample=7 一项真信号 + 三项强方向**：overall +5.7pp（7/7 同向，CI 不重叠 0.67pp）**真信号**；single_hop/adversarial 强方向（CI 不重叠但 6+/1- 不完全同向）；temporal 强方向（7/7 同向但 n=76 太小 CI 仍重叠）。**方向证实，纪律守严。**

---

## 1. sample=7 final 判决表（瓶儿 Wilson 盖章）

| 类别 | Δpp | 同向 | CI | 瓶儿判定 | 说明 |
|------|-----|------|----|---------|------|
| **overall** | **+5.7pp**（Δ=87题）| 7/7 ✅ | 不重叠 0.67pp ✅ | ✅ **真信号** | 三规则全过 |
| single_hop | +14.0pp | 5+/1-/1= ⚠️ | 不重叠 ✅ | 🟡 **强方向** | conv-43 持平，conv-50 反向 |
| adversarial | +16.1pp | 6+/1- ⚠️ | 不重叠 ✅ | 🟡 **强方向** | conv-26 反向（-2.1pp） |
| temporal | +14.5pp | 7/7 ✅ | 重叠 3.27pp ⚠️ | 🟡 **强方向** | n=76 太小，CI 无法拉开 |
| open_domain | -0.6pp | mixed | 重叠 ⚠️ | 🟡 弱反向（噪声内）| 不退步 ✅ |
| multi_hop | -3.0pp | mixed | 重叠 ⚠️ | ❌ 噪声 | OPT-7 主攻 |

---

## 2. 逐 conv 方向明细

### single_hop（5+/1-/1=）
| conv | B | OPT-6 | 方向 |
|------|---|-------|------|
| conv-49 | 18.9% | 45.9% | + |
| conv-42 | 10.8% | 35.1% | + |
| conv-43 | 19.4% | 19.4% | = ⚠️ |
| conv-26 | 12.5% | 37.5% | + |
| conv-48 | 28.6% | 38.1% | + |
| conv-41 | 25.8% | 41.9% | + |
| conv-50 | 37.5% | 34.4% | - ⚠️ |

### adversarial（6+/1-）
| conv | B | OPT-6 | 方向 |
|------|---|-------|------|
| conv-49 | 60.0% | 90.0% | + |
| conv-42 | 80.3% | 91.8% | + |
| conv-43 | 60.9% | 78.1% | + |
| conv-26 | **83.0%** | **80.9%** | **-** ⚠️ |
| conv-48 | 83.3% | 97.9% | + |
| conv-41 | 65.9% | 95.1% | + |
| conv-50 | 69.6% | 89.1% | + |

### temporal（7/7 但 n=76 太小）
| conv | B | OPT-6 | n | 方向 |
|------|---|-------|---|------|
| conv-49 | 7.7% | 23.1% | 13 | + |
| conv-42 | 0.0% | 9.1% | 11 | + |
| conv-43 | 7.1% | 14.3% | 14 | + |
| conv-26 | 0.0% | 46.2% | 13 | + |
| conv-48 | 10.0% | 30.0% | 10 | + |
| conv-41 | 0.0% | 12.5% | 8 | + |
| conv-50 | 42.9% | 57.1% | 7 | + |
| 合计 | ~7.9% | ~26.3% | **76** | 7/7 ✅，n 太小 |

---

## 3. DoD 红线验收

| 红线 | 目标 | sample=7 结果 | 状态 |
|------|------|--------------|------|
| overall ≥ 50% | Wilson 三规则 | 真信号 ✅，CI 不重叠 0.67pp | ✅ 达标 |
| single_hop ≥ 24% | CI 不重叠 | 强方向，CI 不重叠，5+/1-/1= | 🟡 部分达标（CI OK，同向 NG）|
| temporal ≥ 15% | 不退步 | 强方向，不退步 | ✅ 不退步 |
| open_domain ≥ 53% | 不退步 | ~59%，不退步 | ✅ 不退步 |
| adversarial ≥ 65% | 不崩 | 强方向，CI 不重叠，6+/1- | 🟡 部分达标（CI OK，同向 NG）|

**结论：overall 红线真信号达标；single_hop/adversarial 强方向（CI OK 但同向不完整）；其余不退步。**

---

## 4. 纪律教训（三轮对账沉淀）

| 轮次 | 雪琪版 | 实际（瓶儿）| 根因 |
|------|--------|-----------|------|
| sample=5 v0.3 | 4项真信号，CI 不重叠 | 2项真信号，CI 重叠 0.09pp | B(2.0) 文件选错（不同时间戳）|
| sample=7 v0.5 | 5项真信号，7/7全同向 | 1项真信号，sub-cat 6+/1- | PM 未做逐 conv 方向验证就外发 |

**沉淀**→ protocol v0.4：
1. verdict 数字必须先经瓶儿 Wilson final 盖章再外发（不得用 PM 手算版）
2. 逐 conv 方向验证是三规则必要项，需明确列表不可靠感觉

---

## 5. open_domain 双账（最终版）

| 对比 | Δ | 原因 |
|------|---|------|
| OPT-6 vs B(2.0) sample=7 | -0.6pp 噪声 | OPT-6 未引入退步 ✅ |
| B(2.0) vs A baseline | -10.0pp | OPT-2 历史退步，OPT-7/Step B 修复 |

---

## 6. 路线图

| 版本 | overall | 状态 |
|------|---------|------|
| A baseline | 29.8% | 起点 |
| B(2.0) OPT-2 | ~47.5% | 当前 default |
| **OPT-6 H1** | **~53.7%** | opt-in，1 真信号，default-ON 待讨论 |

**default-ON 讨论**：overall 真信号达标；但 single_hop/adversarial 同向不完整，瓶儿建议 default 处理需团队讨论（spec v0.2 规定 5 红线）。

```
OPT-7：多信号检索 BM25+entity+vector
    目标：overall ≥ 55%，multi_hop ≥ 20%
    spec: docs/p3/opt7-spec.md v0.1
    ↓
Step B：Graphiti bi-temporal
```

---

## 7. 待操作

- [ ] 讨论 OPT-6 default-ON 触发条件（overall 真信号 + 其余强方向是否够）
- [ ] protocol v0.4：verdict 先盖章再外发 + 逐 conv 方向表强制列出
- [ ] OPT-7 spec v0.2（碧瑶补实现细节）→ 瓶儿 ACK → H1 smoke
- [ ] Step B 时间线评估

---

**瓶儿盖章状态**: ✅ Wilson final（sample=7，1 真信号 + 3 强方向）

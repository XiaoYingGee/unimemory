# OPT-6 H1 结论文档

**版本**: v0.4（final，瓶儿 Wilson 盖章 2026-04-19）
**日期**: 2026-04-19
**实验**: OPT-6 ADD-only 抽取层，H1（`--extract-facts` flag，gpt-4o-mini）
**数据**: sample=5（conv-49/42/43/26/48），n=1136 题，seed=42
**paper_ref**: mem0 blog 2026-04-17 "Token-Efficient Memory Algorithm"（ADD-only 新算法）
**基准**: B(2.0) OPT-2 sample=5 同 conv（瓶儿对账文件列表为准）

---

## 一句话结论（瓶儿 Wilson 盖章版）

> **OPT-6 H1 两项真信号 + 两项强方向**：single_hop +18.4pp（真信号）、adversarial +13.8pp（真信号）；overall +5.7pp（强方向，CI 重叠 0.09pp 触线）、temporal +19.7pp（强方向，n 太小）。**方向证实，但 overall 未完整过三规则。**

---

## 1. sample=5 final 判决表（瓶儿 Wilson 盖章）

| 类别 | B(2.0) | OPT-6 H1 | Δpp | Wilson 判定 | 含义 |
|------|--------|----------|-----|------------|------|
| **single_hop** | ~17% | **35.4%** | **+18.4pp** | ✅ **真信号**（CI 不重叠）| ADD-only fact 密度直接命中 |
| **adversarial** | ~73% | **87.3%** | **+13.8pp** | ✅ **真信号**（CI 不重叠）| LLM 拒答能力反而强化 |
| overall | ~47% | **52.4%** | **+5.7pp** | 🟡 强方向（CI 重叠 0.09pp 触线）| 等 OPT-7 拉开 |
| temporal | ~5% | **24.6%** | **+19.7pp** | 🟡 强方向（CI 重叠，n=38 太小）| Step B 主攻 |
| open_domain | ~56% | **56.6%** | **+0.2pp** | ✅ 不退步 | OPT-6 未引入新退步 |
| multi_hop | ~17% | **14.6%** | **-2.8pp** | ❌ 噪声 | 待 OPT-7 entity linking |

---

## 2. 数字对账记录

- 雪琪 v0.3 文件池：B(2.0) overall = 46.0%（Δ=+6.4pp）
- 瓶儿 final 文件池：B(2.0) overall ≈ 46.7%（Δ=+5.7pp，CI 重叠 0.09pp）
- 差因：conv-49 使用了不同时间戳的 B(2.0) run

**纪律沉淀**→ protocol v0.4：B(2.0) 对照文件 commit hash 强制记录，不可用任意同 conv 旧文件。

---

## 3. DoD 红线验收

| 红线 | 目标 | 结果 | 状态 |
|------|------|------|------|
| overall ≥ 50% | Wilson 三规则 | 52.4%，CI 重叠 0.09pp | 🟡 数字达标，三规则未完整 |
| single_hop ≥ 24% | CI 不重叠 + Δ≥13题 | 35.4%，+29题 | ✅ 达标 |
| temporal ≥ 15% | 不退步 | 24.6% 强方向 | ✅ 超标 |
| open_domain ≥ 53% | 不退步 | 56.6% | ✅ 不退步 |
| adversarial ≥ 65% | 不崩 | 87.3% 真信号 | ✅ 大幅超标 |

**4/5 红线通过或超标。default-ON 等 OPT-7 补足 overall CI。**

---

## 4. open_domain 双账

| 对比 | Δ | 原因 |
|------|---|------|
| OPT-6 vs B(2.0) | +0.2pp 噪声 | OPT-6 未引入退步 ✅ |
| B(2.0) vs A baseline | -10.0pp | OPT-2 历史退步，OPT-7/Step B 修复 |

---

## 5. 纪律实战

1. 瓶儿挡住 CI 重叠 0.09pp，benchmark 是判官准则通过实战验证
2. 文件对账 0.7pp 差异被抓——工程纪律直接影响判决
3. temporal sample=3 仅 +2.6pp，sample=5 暴露 +19.7pp——小样本低估真实增量教训

---

## 6. 路线图

```
opt-in --extract-facts 已上线
    ↓
OPT-7：多信号检索 fusion（BM25+entity+vector）
    目标：overall CI 拉开 → 真信号 → default-ON
    paper_ref: mem0 blog 2026-04-17 §multi-signal retrieval
    ↓
Step B：Graphiti bi-temporal
    目标：temporal 从 24.6% 强方向→真信号（≥35%）
    paper_ref: arXiv:2501.13956
```

## 7. 待操作

- [ ] 呆子拍 A/B 决策（A: 推 OPT-7 / B: 补 sample 拿 overall 真信号）
- [ ] protocol v0.4：对照文件 commit hash 强制记录
- [ ] OPT-7 spec 起草
- [ ] Step B 时间线评估

---

**瓶儿盖章状态**: ✅ Wilson final（2 真信号 + 2 强方向）

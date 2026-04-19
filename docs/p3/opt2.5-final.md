# OPT-2.5 Final 决策书

**版本**: v1.0（final）
**状态**: ✅ 结案 — 4 假设全证伪，终止 prompt 调优路线
**日期**: 2026-04-19
**作者**: 雪琪（PM）
**数据验收**: 待瓶儿 Wilson H4 正式盖章（本文先出结构，数字来自实跑 results JSON）

---

## 一句话结论

> OPT-2.5 H1-H4 四个 prompt 调优假设全部证伪。当前最佳仍为 B(2.0) OPT-2 overall 44.4%。**方向不在 prompt 调优，直奔 OPT-6（抽取层根治）。**

---

## 1. H1-H4 数据汇总

### 基准线

| 类别 | A baseline | B(2.0) OPT-2 |
|------|-----------|--------------|
| overall | 29.8% | **44.4%** ⭐ |
| single_hop | 31.0% | 31.0% |
| multi_hop | 26.3% | 26.3% |
| temporal | 13.2% | 13.2% |
| open_domain | 63.6% | 53.6% ⚠️ |
| adversarial | 0% | 68.5% |

### H1-H4 实跑（698 题，3 conv: conv-49/42/43，seed=42）

| 类别 | H1（放宽拒答阈值）| H2（top-k=5）| H3（few-shot）| H4（分流 prompt）|
|------|-----------------|-------------|--------------|----------------|
| overall | 39.3% ⬇️ | ~跌 | 37.5% ⬇️ | **43.3%** ≈ |
| single_hop | ~14% ⬇️ | ~跌 | ~16% ⬇️ | **16.2%** ⬇️ |
| multi_hop | 22.2% ⬇️ | ~跌 | 17.2% ⬇️ | **15.2%** ⬇️ |
| temporal | 18.4% ↑ | ~跌 | 13.2% = | **5.3%** 🚨 |
| open_domain | 57.4% +3.8pp | ~跌 | 54.0% = | **53.6%** ≈ |
| adversarial | 36.4% 🚨 | ~跌 | 40.0% 🚨 | **67.9%** ✅ |

> H4 比 B(2.0) 全面相近，adversarial 守住（67.9% ≈ 68.5%），但 temporal 大崩（5.3% < 13.2%），multi_hop 跌至 15.2%，single_hop 仍在 16.2%（vs baseline 31%）——净退步或噪声内，无真实增益。

---

## 2. 4 红线验收（spec DoD 对照）

| 红线 | 要求 | H1 | H2 | H3 | H4 | 结论 |
|------|------|----|----|----|----|------|
| open_domain ≥ baseline A(63.6%) | 不退步 | 57.4% ❌ | ❌ | 54% ❌ | 53.6% ❌ | 全失败 |
| adversarial 不崩（>50%）| 安全红线 | 36.4% 🚨 | 🚨 | 40% 🚨 | 67.9% ✅ | H4 守 |
| temporal 有改善信号 | 真信号（三规则）| 18.4% 弱 | 跌 | 13.2% 噪声 | 5.3% 🚨 | 全失败 |
| overall > B(2.0)=44.4% | 净提升 | 39.3% ❌ | ❌ | 37.5% ❌ | 43.3% ❌ | 全失败 |

> ⚠️ 以上判定为 PM 初评，等瓶儿 Wilson 95% CI 正式盖章后覆盖。

---

## 3. 失败根因分析

OPT-2.5 的假设前提是：**prompt 调优可以修复 open_domain 退步 + temporal 弱**。

四个实验证明这个前提**错误**：

1. **H1 放宽拒答**：partial 救回 open_domain（+3.8pp）但重伤 adversarial（-32pp）——说明拒答能力是 LLM 层单一开关，调开了就两败俱伤。
2. **H2 top-k=5**：检索量减少反而更差——说明问题不在 top-k 大小，是 retrieval 质量本身。
3. **H3 few-shot**：示例注入 < baseline 效果，说明 LLM 已在 prompt limit，多加信息是干扰。
4. **H4 分流 prompt**：总分最接近 B(2.0) 但仍未超越，temporal 大崩——分流 prompt 无法补偿 temporal 的结构性缺陷。

**统一根因**：

> **我们缺少的不是更好的 prompt，而是更好的 fact。** 向量里存的是原文，不是结构化 fact；temporal 题没有时间窗口索引。再强的 prompt 也无法从劣质 memory 里读出正确时序信息。

---

## 4. 终止决策

**决定**：终止 OPT-2.5 全部假设，不再追加 prompt 调优实验。

**理由**：
1. 4 假设全证伪，继续同路线收益递减
2. why-they-win 分析（commit `0caf4d4`）已定位根因在抽取层 + 检索层，非 prompt 层
3. 主人心法：「论文/开源 = 方向指针，Benchmark = 真伪判官」——4 次 benchmark 均指向 prompt 层无效

**遗留 followup**（记录不丢）：
- open_domain 在 A baseline 63.6% > B(2.0) 53.6% 的退步，等 OPT-6 完成后重新测（抽取层改善可能自动解决）
- H4 adversarial 守住（67.9%）是正向信号：分流 prompt 可作为 OPT-6 之后的组合优化参考

---

## 5. 下一步：直奔 OPT-6

| 字段 | 内容 |
|------|------|
| **名称** | OPT-6: ADD-only 抽取层 |
| **paper_ref** | arXiv:2504.19413 §2.1（mem0 新算法，2026-04）+ mem0 blog (2026-04-16) |
| **核心改变** | 写入前增加一次 LLM call：从原文提炼结构化 fact，ADD-only 策略（不覆盖历史） |
| **benchmark_target** | overall ≥ 50%（较 B(2.0) +5.6pp，需 Wilson 三规则验证）；single_hop 回升至 ≥ 28%；temporal 不退步 |
| **风险** | 写入延迟增加（单程 LLM call）；OPT-6 spec 详见 `docs/p3/opt6-spec.md` |

> OPT-6 spec 由碧瑶（实现细节）+ 雪琪（DoD + 验收标准）联合起草，见 `docs/p3/opt6-spec.md`。

---

**结案 commit**: 待提交
**瓶儿 H4 Wilson 验收**: 待盖章（文件 `benchmarks/locomo/results/llm-topk10-1776587727493/89467406/91014570.json`）

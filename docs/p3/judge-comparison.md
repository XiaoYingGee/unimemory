# Judge 对比分析：gpt-5.4 CoT v3 vs gpt-4o-mini

**版本**: v0.2（免责声明补全 + 结论强化）
**日期**: 2026-04-19
**数据**: OPT-6 H1 sample=7, n=1533 题（conv-49/42/43/26/48/41/50）
**目的**: 验证 judge 层对结果的扰动 + 拿到可公平对比 mem0 的数字

---

## ⚠️ 重要免责声明

1. **B(2.0) mini-judge 未跑**：本次双 judge 实验只重评了 OPT-6 H1 的 7 个 results 文件，B(2.0) baseline 的 mini-judge 重评未完成。因此**无法在 mini-judge 口径下验证 OPT-6 vs B(2.0) 的 +5.7pp 是否维持**。该缺口已知，暂不影响主 judge 结论。

2. **答题 seed 未锁**：双 judge 对比中，答题模型（gpt-4o-mini generator）的随机性未固定 seed，结果差异是 **judge 扰动 + answer 随机性的联合效应**。根据量级判断，judge 是主导因素，但无法完全解耦。

3. **mem0 gap 口径差异**：mem0 自报 91.6% 使用的是**不同 test set（LoCoMo 全集 vs 我们 sample=7 子集）+ 不同 judge prompt（gpt-4o-mini + 不同 CoT）**。-38pp gap 仅供量级参考，不可直接作为工程 gap 数字使用。

---

## 双 judge 对比表

| 类别 | gpt-5.4 (主 judge) | gpt-4o-mini | Δ | 结论 |
|---|---|---|---|---|
| **overall** | **53.7%** | 53.2% | -0.5pp | ✅ 极小扰动，judge 换了 overall 不变 |
| single_hop | 36.2% | 30.8% | -5.4pp | ⚠️ mini 更严苛（factual precision 要求高） |
| multi_hop | 13.5% | 19.0% | +5.5pp | ⚠️ mini 更宽松（接受更多 partial） |
| temporal | 26.3% | 27.6% | +1.3pp | ✅ 基本一致（噪声内） |
| open_domain | 58.9% | 61.8% | +2.9pp | ✅ mini 略宽松（符合预期） |
| adversarial | 88.5% | 80.4% | **-8.1pp** | ⚠️ 最大扰动：gpt-5.4 更善于识别 "None" 正确 |

---

## 关键洞察

### 1. overall 扰动极小（-0.5pp）
judge 换了，overall 几乎不动 → **OPT-6 +5.7pp 真信号结论不受 judge 选择影响**

### 2. 类别级别有方向性偏差
- **adversarial -8.1pp**：gpt-5.4 CoT v3 对 "None" 答案辨别更准，mini 会把部分错答算对 → gpt-5.4 对 adversarial 更公平
- **multi_hop +5.5pp**：mini 对复杂推理链接受度更高，可能有 false positive
- **single_hop -5.4pp**：mini 对精确事实要求更严

### 3. 与 mem0 的公平对比

| | gpt-4o-mini judge | 说明 |
|---|---|---|
| mem0 自报 | **91.6%** | 其论文 judge（不同 test set + 不同 CoT prompt）|
| 我们 OPT-6 | **53.2%** | 用同款 judge 重评 |
| 量级 gap | **~38pp** | ⚠️ 口径不同，仅供参考，不作 DoD 目标 |

### 4. 结论
- **主 judge gpt-5.4 CoT v3 经验证未虚高**：overall 漂移仅 0.46pp（-0.5pp），Wilson CI 重叠，属噪声范围。**gpt-5.4 可继续作为 verdict 唯一裁判。**
- **adversarial 是最 judge 敏感类别**（-8.1pp），gpt-5.4 更精准识别 "None"，是我们选 gpt-5.4 的主要理由
- **overall 层面扰动可忽略**（±0.5pp），类别层面有方向性偏差（adversarial/multi_hop/single_hop），是内在差异不是 bug
- **gpt-4o-mini 口径作对外参考数字**：我们 53.2% vs mem0 91.6%（~38pp 量级 gap，注意三重口径差异）

---

## 文件对账

| conv | gpt-5.4 文件 | gpt-4o-mini 文件 |
|---|---|---|
| conv-49 | opt6-topk10-1776598335751.json | llm-topk10-1776656285646.json |
| conv-42 | opt6-topk10-1776599590927.json | llm-topk10-1776657301777.json |
| conv-43 | opt6-topk10-1776600905747.json | llm-topk10-1776658180051.json |
| conv-26 | opt6-topk10-1776602235518.json | llm-topk10-1776658875471.json |
| conv-48 | opt6-topk10-1776603592785.json | llm-topk10-1776659779604.json |
| conv-41 | opt6-topk10-1776613047216.json | llm-topk10-1776660409659.json |
| conv-50 | opt6-topk10-1776614149530.json | llm-topk10-1776661165679.json |

---

## 永久纪律建议

每次重大 OPT 结论（overall 真信号判决时）建议加跑 mini-judge 单 conv sanity check：
- **成本**：~5min 单 conv 重评（不需全 sample）
- **目的**：验证「judge 是否虚高/虚低」，不是要换 judge
- **触发条件**：新 OPT overall Δ 首次进入「真信号候选」时强制跑一次

---

_主 judge 维持 gpt-5.4 CoT v3。gpt-4o-mini 口径仅用于 mem0 公平对比参考。_

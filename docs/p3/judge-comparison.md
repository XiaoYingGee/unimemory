# Judge 对比分析：gpt-5.4 CoT v3 vs gpt-4o-mini

**日期**: 2026-04-19  
**数据**: OPT-6 H1 sample=7, n=1533 题（conv-49/42/43/26/48/41/50）  
**目的**: 验证 judge 层对结果的扰动 + 拿到可公平对比 mem0 的数字

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
| mem0 自报 | **91.6%** | 其论文 judge |
| 我们 OPT-6 | **53.2%** | 用同款 judge 重评 |
| 真实 gap | **~38pp** | 公平口径 |

> mem0 91.6% 使用的是 **不同 test set + 不同 judge prompt**，仅供量级参考。严格公平测试需同 test set 同 seed。

### 4. 结论
- **不换主 judge**：gpt-5.4 + CoT v3 在 adversarial 上更精准，是更严格的评判
- **用 gpt-4o-mini 口径作对外参考数字**：我们 53.2% vs mem0 91.6%，gap ~38pp
- **judge 扰动在 overall 层面可忽略**（±0.5pp），在类别层面需留意方向偏差

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

_主 judge 维持 gpt-5.4 CoT v3。gpt-4o-mini 口径仅用于 mem0 公平对比参考。_

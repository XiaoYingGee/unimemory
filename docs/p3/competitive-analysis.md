# UniMemory vs 主流实现 Gap 分析

**作者**: 雪琪 ❄️
**日期**: 2026-04-19
**状态**: v0.3（瓶儿 review #2：Zep 行软化为「量级差距」）
**目的**: 回答呆子「我们现在各层和主流实现还差多少」

---

## ⚠️ 公平性声明（必读）

本表数字来自**各家自报**（论文/官方 blog），**judge、题集、conv 集均不一致**：
- **mem0**：1540 题 LoCoMo（全量），LLM-as-Judge gpt-4o-mini
- **Zep**：500 题 LongMemEval（不是 LoCoMo），judge 未公开
- **MemGPT**：DMR benchmark（自家）+ LongMemEval 部分题
- **我们**：698 题 LoCoMo 子集（conv-49/42/43，sample=1×3），judge gpt-5+CoT v3

跨表数字**只能看量级，不可直接相减**。要硬对比必须把 mem0/Zep 拉来同 conv 同 judge 跑（Step B 工作）。

---

## 主对比表（LoCoMo 维度）

| 系统 | overall | single_hop | multi_hop | temporal | open_domain | 架构特色 | 我们差距 | 借鉴方向 |
|---|---|---|---|---|---|---|---|---|
| **mem0 新算法**（2026-04, blog/research）¹ | **91.6** | 92.3 | 93.3 | 70.2 | 76.0 | 单遍 ADD-only 抽取 + 多信号检索 + agent fact 一等公民 | overall -47pp | ⭐ ADD-only 抽取（避免 update 噪声）；agent fact 入库 |
| **mem0 旧算法**（同 blog 对照基线）¹ | 71.4 | — | — | — | — | 两遍抽取（ADD/UPDATE/DELETE） | — | — |
| **mem0 LoCoMo 论文**（2504.19413） | ~66.9 | — | — | — | — | LLM-as-Judge 是核心，judge 提升 +26% | — | judge 路线已对齐 ✅ |
| **Zep / Graphiti**（2501.13956）³ | LongMemEval 自报 SOTA（具体 % 未公开） | — | — | **强**（bi-temporal） | — | 时序知识图（valid_time + tx_time 双时间） | temporal 量级差距明显（不给具体 pp，待公平复测） | ⭐⭐ bi-temporal 图是 temporal 类硬解，Step B 主攻 |
| **MemGPT / Letta** | DMR 93.4（GPT-4-Turbo）| — | — | — | — | HMEM 分层（main/recall/archival）+ self-edit | 架构维度差距 | 分层冷热分离思路；不主攻 |
| **LangChain / LlamaIndex** | 基线 RAG（无统一公开数）| — | — | — | — | 朴素向量 + 简单 summary | 我们 baseline ≈ 这档 | 已超越，无借鉴价值 |
| **我们 A baseline** | 29.8 [26.5, 33.3] | 28.2 | 24.2 | 5.3 | **63.6** | 朴素向量检索 | — | — |
| **我们 B OPT-2 LLM** ✅ | 44.4 [40.8, 48.1] | 31.0 | 26.3 | 13.2 | 53.6 ⚠️ | + LLM Answer Layer (gpt-4o-mini) + adversarial 拒答 | overall -47pp vs mem0 | open_domain -10pp 副作用 → OPT-2.5 |
| **我们 C OPT-3 events** ❌ | 42.8 [39.2, 46.5] | — | — | 7.9 | 52.9 | + event_summary（论文金标准） | C ≈ B，假设证伪 | deprecated |

---

## 分层差距诊断

### 1. overall（mem0 91.6 vs 我们 44.4，名义 gap -47pp）
- mem0 的 91.6 是「新算法 + 全 1540 题 + 自家 gpt-4o-mini judge」，我们的 44.4 是「OPT-2 + 698 题 + gpt-5 CoT judge」
- judge 严苛度差异方向已知（gpt-5+CoT 比 gpt-4o-mini 更严），但**具体折扣无校准数据，不做估算**——v0.1 那个 "-15pp 估" 撤回
- **真实 gap 必须等公平复测**（P3 任务），在此之前只能说「量级差距明显」
- **可借鉴**：ADD-only 单遍抽取 + 多信号检索

### 2. temporal（mem0 76.0 / Zep 自报 SOTA vs 我们 13.2%，gap **最大**）
- mem0 新算法 LoCoMo temporal 76.0；Zep 在 LongMemEval temporal 类自报 SOTA（具体百分比 paper 未直接给汇总数，仅给「相对 +18.5% / 部分单项 +100%」）
- Zep 的 bi-temporal 图（事件 valid_time + 事实 tx_time）专治时间推理
- 我们目前**完全没有时间维度建模**，纯靠向量召回 → temporal 5-13% 是必然
- ⭐⭐ **Step B Zep 集成 = 杠杆最大的方向**（即便折扣后仍是最大 gap）

### 3. multi_hop（mem0 93.3 vs 我们 26.3，名义 gap -67pp）
- mem0 多信号检索（向量 + 关键词 + 实体匹配），多跳问题靠跨片段检索
- 我们目前单路向量 → multi_hop 必然差
- 借鉴：Step B Graphiti 图召回顺带解掉

### 4. open_domain（mem0 70.2 vs 我们 baseline 63.6 → B 53.6 ⚠️）
- 我们 baseline 63.6 名义上接近 mem0 的 70.2（仅 -7pp，不计 judge 差），**这是相对最强的一层**
- B OPT-2 退步到 53.6 = LLM 拒答阈值过严 / top_k 稀释 → OPT-2.5 H1-H4 修复
- 修复后 baseline 水位 ≥63%，跟 mem0 差距可控

### 5. single_hop（mem0 92.3 vs 我们 31）
- 简单事实召回我们都差 60pp = 召回层根本问题
- mem0 的"事实级别召回 + ADD-only"是关键
- 借鉴：可能是 OPT-2.5 之外的独立优化方向（OPT-6 候选）

---

## 优先级建议（PM 视角）

| 优先级 | 动作 | 杠杆 | 阻塞 |
|---|---|---|---|
| **P0** | OPT-2.5 修 open_domain（H1-H4）| 解锁 OPT-2 default ON，回收 +14.6pp 真胜利 | 当前阻塞 |
| **P1** | Step B Zep/Graphiti 集成 | temporal +60pp / multi_hop +50pp 潜力 | OPT-2.5 通过后 |
| **P2** | mem0 风格 ADD-only 单遍抽取 | single_hop / overall 召回基础 | Step B 后 |
| **P3** | 跨家公平复测（mem0/Zep 同 judge 同 conv） | 验证差距真实度 | 工程量大，不阻塞 |

---

## 数字来源标注

¹ **mem0 91.6 / 92.3 / 93.3 / 70.2 / 76.0** 来自 mem0/research 页面 + 2026-04-17 blog 「Token-Efficient Memory Algorithm」，**新算法**报告，1540 题全量 LoCoMo，gpt-4o-mini judge

² **mem0 66.9** 来自 mem0 LoCoMo 论文（arxiv 2504.19413），**论文版基线算法**报告，与 ¹ 不是同一系统

³ **Zep DMR 94.8 / MemGPT 35.3** 来自 Zep blog（GPT-4-Turbo），DMR ≠ LoCoMo，仅作架构能力旁证

⚠️ ¹ 和 ² 是**同公司不同算法版本**，v0.1 误把它们当成「同源高低估」对照——实际上新算法 blog 自己写的对照基线是 71.4（v0.2 已补上）

## 引用

- mem0 LoCoMo 论文: arxiv 2504.19413
- mem0 新算法 blog: https://mem0.ai/blog/mem0-the-token-efficient-memory-algorithm（2026-04-17）
- mem0 research page: https://mem0.ai/research
- Zep paper: arxiv 2501.13956
- Zep blog: https://blog.getzep.com/state-of-the-art-agent-memory/
- LongMemEval: arxiv 2410.10813
- LoCoMo 原论文: arxiv 2402.17753
- MemGPT: arxiv 2310.08560
- 我们 Wave 1 数据: `research/results/wave1-2026-04-18/`
- 决策书: `docs/p3/opt3-step-a-conclusion.md`

---

## 局限性

1. 跨家数字 judge/题集不一致，**只能看量级**
2. mem0/Zep 可能存在 cherry-pick selection bias
3. 我们 sample=1×3 在 95% CI 边缘，OPT-2.5 验收要 sample=3×3
4. **真公平对比 = Step B Zep 集成时一并做跨家复测**（写入 OPT-3 Step B DoD）

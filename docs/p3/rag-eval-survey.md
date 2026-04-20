# RAG / 长期记忆评估方案调研

**作者**: 雪琪 ❄️
**日期**: 2026-04-18
**目的**: 在 OPT-2 公平对比定方向之前，确认我们的 LLM judge 路线是否对齐业界主流，避免盲目自创。

---

## 1. mem0（直接对标对手，LoCoMo 原始实现）

**核心做法（mem0/evaluation 目录）**：
- 同时报告三个 metric：**BLEU、F1、LLM Score**
- BLEU/F1 = token 重叠类（和我们当前 baseline 一样）
- **LLM Score = 二分类 0/1，由 LLM judge 评估 generated 答案是否正确**
- 默认 judge 模型：**gpt-4o-mini**（成本低、跨系统统一）

**他们怎么处理 generated vs expected 不一致**：
- 不依赖 token 重叠，直接让 judge 判语义
- 多个对照系统（mem0 / OpenAI Memory / LangMem / MemGPT）都用同一个 judge，保证可比性

**我们能借**：
- ✅ judge 路线本身就是 mem0 论文（arxiv 2504.19413）的核心做法，他们 LLM-as-Judge 提升 26%
- ✅ 可以同时报告 BLEU/F1 + LLM Score 三套，避免单一 metric 偏差
- ✅ judge 模型用便宜的（4o-mini 级别）即可

**不适合借**：
- 他们没公开 judge prompt 的精确文本和校准数据，我们必须自己校准（已在做）

---

## 2. LoCoMo 原论文（Snap Research, arxiv 2402.17753）

**论文推荐 metric**：
- 多任务：QA、event summarization、multi-modal dialogue
- QA 任务用 **F1、ROUGE、MMRelevance**
- 但论文本身也指出：长上下文 + 多跳推理场景下，token 类 metric 偏差大

**我们当前的偏离**：
- 我们只用了 token-overlap 类（≈ F1 的简化版），**没有 LLM judge**
- mem0/Memory-R1 等后继工作都补了 LLM judge，证明这是必要补丁
- 我们方向对了，只是落后了一步

---

## 3. Ragas（业界 RAG 评估事实标准）

**Answer Correctness 设计**：
- 由两部分加权组成：**factual correctness（事实重叠 F1）+ semantic similarity（embedding 相似度）**
- 事实抽取本身用 LLM 做（TP/FP/FN 分类）
- 可选 threshold 转二分类
- 用 **schema-constrained LLM judging**（结构化输出 + 重试）保证稳定

**关键洞察**：
- Ragas 不是简单"让 LLM 判 yes/no"，而是把"事实"先抽出来，再算 F1
- 这样能精确定位是 hallucination（FP）还是 missing fact（FN）

**我们能借**：
- ⭐ **强烈建议**：把 judge 输出从 yes/no 升级为 **TP/FP/FN 三类计数**，这样能区分"答错 vs 答漏"
- ⭐ 用结构化输出（JSON schema）而不是自由文本，稳定性显著提升
- 加 chain-of-thought（让 judge 先解释再下结论）

**不适合借**：
- Ragas 的完整 answer_correctness 需要 embedding 模型 + LLM 双调用，成本翻倍。我们 sample=1 跑 199 条还行，sample=3+ 会贵
- 如果只要方向判断，简化版 LLM judge 足够

---

## 4. MemGPT / Letta

- Letta 自己用过 LongMemEval、LoCoMo 评估
- 普遍结论：**没有任何一个 metric 单独可靠**，必须组合
- 行业共识：token 类 metric 用于初筛，LLM judge 用于决策

不展开，他们的评估方法本质和 mem0 一致。

---

## 5. LLM-as-a-Judge 方法论（业界共识）

**最佳实践（2025-2026 已成熟）**：
1. **Chain-of-Thought**：让 judge 先输出 reasoning，再给结论 → 准确率显著提升
2. **结构化输出**（JSON schema）→ 解析稳定
3. **Few-shot 校准**：prompt 里给 3-5 个标注样本（含 edge case，比如 adversarial 拒答）
4. **人工抽样校准**（我们已经在做的事情）→ 业界推荐 agreement ≥ 80% 即可用，≥ 90% 优秀
5. **多 judge 投票**（majority vote）减少单 judge 偏差，但成本高

**我们的进度对照**：
- ✅ 已做：人工校准（v1 88% → v2 修 adversarial）
- ❌ 未做：CoT、结构化输出、few-shot、多 judge

---

## 判断

**结论：我们的 LLM judge 路线 = 业界主流，方向没错。**

但实现上还停留在 v1.0 水平（简单 yes/no），相比 mem0/Ragas 的成熟度有 3 个明显短板：

| 短板 | 业界做法 | 我们当前 | 升级成本 |
|---|---|---|---|
| 输出格式 | JSON schema + CoT | 自由文本 yes/no | 低（改 prompt）|
| 评估粒度 | TP/FP/FN 三类 | 二分类 | 中（要重写 judge）|
| metric 组合 | F1 + LLM judge 同时报 | 只有 token overlap | 低（同时算两套）|

**给小白姐的方向建议**：

**立刻执行（不阻塞 OPT-2）**：
- ✅ 当前 judge v2 流程继续，加 **CoT prompt**（让 judge 先 explain 再 verdict）—— 5 分钟改动
- ✅ 公平对比时同时报告 **F1 + LLM judge 两套数字**，避免单 metric 误判
- ✅ 用 **gpt-4o-mini 或同档便宜模型**做 judge，和 mem0 对齐

**OPT-2 后续考虑（如果还要深挖）**：
- 升级到 Ragas 风格的 **TP/FP/FN 抽取式 judge**，能定位 hallucination vs missing
- 但这是 OPT-3+ 的事，OPT-2 先用简化版

**不建议做**：
- ❌ 多 judge 投票（成本翻倍，收益边际）
- ❌ 自己搞一套全新 metric（已有成熟方案）

---

## 参考

- mem0 论文：https://arxiv.org/abs/2504.19413
- LoCoMo 原论文：https://arxiv.org/abs/2402.17753
- mem0 evaluation 实现：mem0/evaluation 目录
- Ragas Answer Correctness：https://docs.ragas.io/en/v0.1.21/concepts/metrics/answer_correctness.html
- LLM-as-Judge 综述：denyslazarenko.github.io/2024/04/05/llm_as_judge.html

# LoCoMo Benchmark — UniMemory Baseline

**目的**：在 LoCoMo 数据集上建立 UniMemory 的记忆召回基线分数，用于持续跟踪质量改进。

**数据集**：[snap-research/LoCoMo](https://github.com/snap-research/LoCoMo)（ACL 2024）
- 10 个长期对话，每个对话平均 300+ 轮、16K tokens
- 覆盖 32 个 session
- QA 标注：single-hop、multi-hop、temporal、open-domain 四类问题

**P1 目标**：召回准确率 > 70%

---

## 运行方式

```bash
# 1. 下载数据集
npm run benchmark:locomo:download

# 2. 运行完整 benchmark
npm run benchmark:locomo

# 3. 只跑前 N 个对话（快速验证）
npx ts-node benchmarks/locomo/run.ts --sample=3

# 4. 只跑指定对话
npx ts-node benchmarks/locomo/run.ts --conversation-id=conv_001
```

---

## 评估方法

**写入阶段**：将每轮对话内容写入 UniMemory，scope=`project`，memory_type=`context`

**召回阶段**：以 QA 的问题作为查询，top-K 召回，检查答案关键词是否出现在召回结果中

**正确判定**：答案中 > 50% 的有效词（长度 > 3 字符）出现在任一召回记忆中

---

## 基线结果

*第一次运行后填入*

| 指标 | 分数 | 目标 | 状态 |
|------|------|------|------|
| 整体准确率 | — | > 70% | 待测 |
| single-hop | — | — | 待测 |
| multi-hop | — | — | 待测 |
| temporal | — | — | 待测 |
| open-domain | — | — | 待测 |
| 平均检索延迟 | — | < 200ms | 待测 |

历史结果存档见 `benchmarks/locomo/results/`

---

## 已知局限

1. **评估方法简化**：目前用关键词匹配判断正确性，不做语义相似度比较。P2+ 可升级为 LLM-as-judge
2. **写入策略简单**：按轮次写入，未做 session 级摘要。P2+ 的合并压缩（B3）上线后应重测
3. **数据集规模**：LoCoMo 只有 10 个对话，统计置信度有限，结论仅供参考

---

## 与业界对比

| 系统 | LoCoMo 准确率 |
|------|-------------|
| EverMemOS | 92.3% |
| MemMachine | 91.7% |
| Hindsight | 89.6% |
| Zep | ~85% |
| Letta/MemGPT | ~83.2% |
| Mem0（自报） | ~66% |
| **UniMemory（本次基线）** | **待测** |
| Mem0（独立测试） | ~58% |

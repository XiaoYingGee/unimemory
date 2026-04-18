# OPT-3 调研：事实/事件提取 + 时间锚点

**作者**: 雪琪 ❄️
**日期**: 2026-04-18
**目的**: 给 OPT-2（+9.9pp 公平结果）后的 OPT-3 选型，回答核心问题——

> **事实提取走"显式三元组"还是"事件摘要 + 时间锚"？哪种对 temporal=0% 救命最快、工程量最小？**

---

## 0. 当前痛点回顾

OPT-2 公平对比结果（去 adversarial）：

| 类别 | n | baseline | LLM 层 | Δ | 病灶 |
|---|---|---|---|---|---|
| open_domain | 70 | 45.7% | 55.7% | +10pp | 召回还行 |
| multi_hop | 37 | 0% | 18.9% | +18.9pp | 召回不够，多跳推理勉强 |
| single_hop | 32 | 9.4% | 12.5% | +3.1pp | 噪声 |
| **temporal** | **13** | **0%** | **0%** | **0** | **结构性死穴** |

**OPT-3 的目标**：把 temporal 从 0 拉到 ≥30%，顺带帮 multi_hop 涨一档。
**为什么向量救不了**：时间问题需要**事件 + 时间戳的结构化存储**和**按时间窗推理**，向量相似度无法表达"X 发生在 Y 之前"。

---

## 1. 三个对标方案

### 1.1 mem0 graph memory（显式三元组）

**做法**：
- 每条记忆写入时，让 LLM 抽取 (subject, predicate, object) 三元组
- 同时存：vector DB（embedding）+ graph backend（关系）
- 检索：vector 召回候选 → graph 扩展相关节点 → LLM 生成
- 例：`(Alice)-[:ALLERGIC_TO]->(TreeNuts)`

**对 temporal 的支持**：
- ⚠️ **弱**。原版 mem0 graph 没有原生时间维度，时间戳是节点属性而不是关系一等公民
- 多跳查询有帮助（multi_hop 应能拉到 25-35%）
- 时间推理仍要靠 LLM 生成层硬扛

**工程量**：⭐⭐⭐ 中
- 需要 graph backend（Neo4j / FalkorDB / Memgraph 选一个）
- 抽取 prompt + 去重 / 合并节点逻辑（mem0 已开源可参考）
- 写入慢 2-3x（每次 LLM 抽一遍）

---

### 1.2 Memory-R1（两 agent + RL）

**做法**：
- Memory Manager agent：学 ADD / UPDATE / DELETE / NOOP 操作（RL 训练）
- Answer Agent：先 distill 相关记忆再回答（RL 训练）
- 相对 mem0 baseline **+48% F1 / +69% BLEU / +37% LLM judge**

**对 temporal 的支持**：
- ⭐⭐ 间接：RL 学到何时 UPDATE 旧事实，部分缓解时间冲突
- 但没显式时间模型

**工程量**：⭐⭐⭐⭐⭐ 高
- 需要 RL 训练流程 + 标注数据
- 不适合我们当前阶段（论文级，工程化未成熟）

**结论**：**不选**。论文成果亮眼但部署成本太高，留作长期 Plan B。

---

### 1.3 LoCoMo 论文自身（Reflect & Respond + event_summary）

**做法**：
- 数据集自带 `event_summary`：每个 session 抽取的关键事件列表（带时间）
- 论文推荐：先离线生成 session-level 事件摘要，检索时按事件而非原始 turn 召回
- 是事件粒度的"半结构化"表示

**对 temporal 的支持**：
- ⭐⭐⭐ 中：事件本身带 session 时间戳，能锚定相对时间（"上周五" → 锚到 session 时间）
- 但仍是文本摘要，不是结构化关系

**工程量**：⭐⭐ 低
- 一次性离线抽取，不影响在线检索路径
- 不需要新 backend，存为 JSONL 即可
- 抽取 prompt 简单

---

### 1.4 ⭐ 意外发现：Zep / Graphiti（时间感知图）

**做法**：
- **Bi-temporal model**：每个事实记录两个时间——**event time（事件发生时）+ ingest time（被记入时）**
- 这是专门为"时间推理 + 多跳"设计的图引擎
- 抽取：实体 + 关系 + 时间戳 + 失效机制（旧事实被新事实覆盖时打 invalid_at）

**Benchmark 战绩**：
- LongMemEval **+18.5% accuracy**，**latency -90%**（vs baseline）
- DMR benchmark 94.8% vs MemGPT 93.4%
- 复杂时间推理任务上是当前 SOTA

**对 temporal 的支持**：
- ⭐⭐⭐⭐⭐ **直接命中我们的死穴**。bi-temporal 就是为 "X 何时做 Y" "在 Z 之前" 这类问题设计的
- LoCoMo 数据集 session 自带时间戳，刚好能填到 event time

**工程量**：⭐⭐⭐ 中
- Graphiti 是 OSS Python 库，不需要从零写
- 依赖 Neo4j（社区版免费），加一个服务
- 抽取调用次数和 mem0 graph 持平

---

## 2. 横向对比表

| 维度 | mem0 graph | Memory-R1 | LoCoMo event_summary | **Zep/Graphiti** |
|---|---|---|---|---|
| temporal 救命度 | ⭐⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| multi_hop 增益 | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ |
| 工程量 | 中 | 高 | 低 | 中 |
| 上线时间估算 | 1-2 周 | 1-2 月 | **2-3 天** | 1-1.5 周 |
| 新依赖 | Neo4j/FalkorDB | RL 训练栈 | 无 | Neo4j |
| 业界验证 | mem0 自评 | 论文 | 论文原版 | LongMemEval SOTA |

---

## 3. 推荐方案：两步走

### Step A（先做，OPT-3.1）：LoCoMo event_summary 离线抽取

**理由**：
- 工程量最小（2-3 天），**不引入新 backend**
- 数据集本身就提供了事件抽取范式，作者推荐
- 能验证"按事件检索是否真的解决 temporal"这个假设
- 如果 +5pp 以上，证明方向对，再上 Zep
- 如果 0pp，说明事件粒度不够细，跳过 mem0 graph 直接上 Zep

**实施**：
1. 离线脚本：每 session 用 LLM 抽 5-10 条事件（含 session timestamp）
2. 索引：事件 embedding 入向量库（独立 collection）
3. 检索：query 同时召回 chunk + event，merge 到 prompt
4. 评估：跑 199 题，重点看 temporal + multi_hop

**预期**：temporal 0% → 10-20%，multi_hop +5pp，open_domain 微涨

### Step B（看 A 结果，OPT-3.2）：Zep/Graphiti 引入

**触发条件**：A 跑完 temporal 仍 < 25%
**理由**：bi-temporal model 是当前 SOTA，专治时间推理
**实施**：
- 起 Neo4j 容器
- 用 Graphiti SDK 重写 ingest pipeline
- 复用 A 的 event 抽取作为 input

**预期**：temporal 25-50%，multi_hop +10pp

### 不做（明确排除）

- ❌ mem0 graph 单独跑：被 Zep 在 temporal 维度全面碾压，没必要做中间态
- ❌ Memory-R1：工程量太大，留作 P4

---

## 4. 给小白姐的拍板建议

**OPT-3 入口锁定 LoCoMo event_summary**（Step A）：
- 周期：2-3 天
- 风险：低，可逆，不引入新依赖
- 决策点：跑完 199 题看 temporal 数字
  - ≥ 25% → 收工，OPT-3 完成
  - < 25% → 进 Step B（Zep/Graphiti）

**碧瑶分工**：
- 写 event 抽取脚本 + 索引集成
- 复用 v3 judge 评估

**雪琪分工**：
- 跟踪 Zep paper 是否有 LoCoMo 上的公开数据，省掉 Step B 自己 benchmark 的功夫
- 准备 Step B 的工程方案文档（提前 1 天）

---

## 5. 参考

- mem0 graph: https://docs.mem0.ai/open-source/features/graph-memory
- Memory-R1: https://arxiv.org/abs/2508.19828
- LoCoMo dataset: https://github.com/snap-research/LoCoMo
- **Zep / Graphiti paper**: https://arxiv.org/abs/2501.13956
- Graphiti repo: https://github.com/getzep/graphiti

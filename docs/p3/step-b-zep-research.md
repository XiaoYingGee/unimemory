# Step B: Zep / Graphiti 集成调研

**作者**: 雪琪 ❄️
**日期**: 2026-04-19
**状态**: v0.1 调研版（pre-spec，未经 PM/QA ACK）
**目的**: 给「OPT-3 Step B = Zep/Graphiti bi-temporal 集成」做实施前调研，输出实施方案候选 + DoD + 风险评估

---

## 1. Zep / Graphiti 是什么

- **Zep** = 商业 SaaS 记忆服务，核心是 bi-temporal 时序知识图
- **Graphiti** = Zep 的开源底层（Python，Apache 2.0），https://github.com/getzep/graphiti
- 我们集成应**只用 Graphiti**（自托管，无 SaaS 依赖）

**核心机制（Graphiti）**：
- 双时间维度：`valid_time`（事实在现实中何时为真）+ `tx_time`（事实何时录入系统）
- 输入：unstructured chat / structured records
- 输出：实体节点 + 关系边 + 时间元数据
- 查询融合：时序 + 全文 + 语义向量 + 图算法
- 后端：默认 Neo4j，也支持 FalkorDB

---

## 2. Why 它能解我们 temporal 5-13% / multi_hop 26%

| 我们现状 | Graphiti 解法 |
|---|---|
| 纯向量召回，无时间感 | 边带 valid_time，"2024 年的 X" 可精确过滤 |
| 单跳事实匹配 | 实体节点显式连边，多跳 = 图遍历 |
| 事实更新 = 覆盖 | 边 invalidate 而非删除，保留时序变迁 |
| 无 provenance | 边带 source message id |

Zep paper（2501.13956）在 LongMemEval temporal 类相对基线 +18.5% 聚合 / 单项 +100%——量级匹配我们 -60pp 的缺口。

---

## 3. 集成方案候选（三选一，待 PM 决策）

### 方案 A：替换 pgvector（激进）
- 现 pgvector 全删，记忆层换成 Graphiti + Neo4j
- ✅ 架构干净，未来全靠图
- ❌ 数据迁移工程量大，basic single_hop 可能反而退步（图开销 vs 简单向量）
- ❌ 引入 Neo4j 运维负担

### 方案 B：叠加（推荐）
- pgvector 保留作为「快路径」（single_hop / open_domain 简单召回）
- Graphiti 做「慢路径」（temporal / multi_hop）
- 路由层：query 类型 → 选路径（或两路融合）
- ✅ 风险隔离：Graphiti 退步不影响 baseline
- ✅ 增量上线，可灰度
- ❌ 双系统维护成本

### 方案 C：影子模式（最保守）
- Graphiti 跑在 shadow，只读不影响主流程
- 用同 conv 跑批，离线对比 graphiti vs pgvector 各类目分数
- 数据说话再决定 A 或 B
- ✅ 零风险
- ❌ 不出真胜利，只是又一轮调研

**雪琪推荐 B**，理由：保守路径已经在 OPT-2.5 上演练，Step B 应该开始"叠加优化栈"思路；但 B 起步前先做 1 周 C（shadow）做 sanity check，避免 A 那种推倒重来。

---

## 4. DoD 草稿（待瓶儿 review）

### 必过（阻塞 merge）
- temporal ≥ 25%（vs 当前 13.2%，+12pp 真信号 = √n + CI 不重叠 + 三 conv 同向）
- multi_hop ≥ 25%（vs 当前 26.3%，至少不退）
- open_domain ≥ 51%（不退步，对齐 OPT-2.5 红线）
- overall ≥ 47%（vs B 44.4%，+2.6pp 缓冲带）

### 期望（不阻塞）
- temporal ≥ 35%（杠杆兑现一半）
- adversarial 保持 ≥ 65%（OPT-2 LLM 拒答能力不被图层覆盖）

### 跨家公平复测（P3 任务，可独立做）
- 拉 mem0 / Zep SDK 在我们 conv-49/42/43 同 judge 跑一遍
- 验证 v0.2 gap 表数字真实度
- 写入 `research/cross-system-benchmark-{date}.md`

---

## 5. 风险评估

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| Neo4j 运维新负担 | 高 | 中 | 用 FalkorDB（轻量替代），或 docker-compose 仅 dev |
| 图构建慢 / 写入慢 | 高 | 中 | 异步入图 + 批量；在线只读图 |
| 事实抽取质量决定上限 | 高 | 高 | OPT-6 ADD-only 抽取先做（顺序：OPT-2.5 → OPT-6 → Step B），抽取层薄 = 图烂 |
| Graphiti API 不稳定 | 中 | 低 | pin 版本 + 抽象包装层 |
| LLM 调用爆增（图构建吃 token） | 高 | 高 | 只对 open_domain/temporal 题对应的 conv 入图；估算 budget |

**最大风险 = 抽取质量**——图再好，事实抽错全白搭。建议**Step B 前先把 OPT-6 mem0 风格 ADD-only 抽取做掉**（即使不上图也能涨 single_hop）。

---

## 6. 实施顺序建议

```
现在 → OPT-2.5 H1-H4（碧瑶今天）
   ↓ open_domain 修回
OPT-6 mem0 ADD-only 抽取（碧瑶 2-3 天）
   ↓ 抽取层不掉链子
Step B Phase 1: shadow mode（1 周）
   ↓ 数据验证 Graphiti 真实增益
Step B Phase 2: 叠加上线（1-2 周）
```

跳过 OPT-6 直冲 Step B 风险高（抽取质量是图的输入瓶颈）。

---

## 7. 工作量估算

| 阶段 | 时间 | 资源 |
|---|---|---|
| Graphiti POC（docker + 1 conv 入图）| 1 天 | 碧瑶 |
| Shadow mode 跑批（含 judge）| 3 天 | 碧瑶 + 瓶儿 |
| 路由层设计 + 实现 | 3 天 | 碧瑶 |
| 全量评估 + tuning | 5 天 | 全员 |
| **Total** | **~2 周** | |

---

## 8. 待 PM/QA 决策点

1. **方案 A/B/C 三选一**（雪琪推 B + 1 周 C 前置）
2. **OPT-6 是否前置**（雪琪强烈建议是）
3. **DoD 数字 ACK**（temporal ≥25% 是否过激进？）
4. **后端选型**：Neo4j vs FalkorDB
5. **Budget**：图构建 LLM token 预算上限

---

## 9. 引用

- Zep paper: arxiv 2501.13956
- Graphiti repo: https://github.com/getzep/graphiti
- Graphiti deepwiki: https://deepwiki.com/getzep/graphiti
- Zep Graph docs: https://help.getzep.com/graph-overview
- LongMemEval: arxiv 2410.10813
- 我们 gap 表: `docs/p3/competitive-analysis.md`

---

**下一步**：等瓶儿 review（重点 DoD 数字 + 风险表完整性）+ 呆子拍方案 A/B/C，然后我升 v0.2 作为正式 spec 提交 PR。

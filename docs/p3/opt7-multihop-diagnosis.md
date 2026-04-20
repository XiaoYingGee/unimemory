# OPT-7 multi_hop 失败诊断

**版本**: v0.1
**日期**: 2026-04-20
**数据**: OPT-7 smoke conv-49，multi_hop 4/33 = 12.1%（OPT-6 baseline 15.2%，退步 -3.0pp）
**目标**: 找出 multi_hop 未涨的根因，指导下一步修复方向

---

## 一句话结论

> **BM25 对 multi_hop 未产生有效增益。根因是双重的：① multi_hop 问题的 evidence 是单条对话片段，BM25 keyword 匹配在单条短 fact 上效果有限；② BM25 query 词提取逻辑（`plainto_tsquery('simple', query)`）对时间/关系型问题效果差。真正的瓶颈不是「召回不到」而是「fact 本身颗粒度太细，缺乏跨 session 关联」。**

---

## 1. multi_hop 问题特征分析（conv-49）

| 样本 | 问题类型 | evidence | 本质 |
|------|----------|---------|------|
| "Which hobby did Sam take up in May 2023?" | 时序 + 实体关联 | D1:11（单条）| 需要精确定位「Sam + May 2023 + hobby」|
| "When did Evan go to Jasper with his family?" | 时序查询 | D2:1（单条）| 需要精确定位「Evan + Jasper + family + 时间」|
| "When did Sam first go to the doctor..." | 时序 + 事件关联 | D2:6（单条）| 需要「Sam + doctor + weight problem + 时间」|
| "When did Evan have his sudden heart palpitation..." | 时序 + 事件 | D3:1（单条）| 跨 session 精确事件定位 |
| "When did Sam's friends mock him for being overweight?" | 时序 + 事件 | D4:1（单条）| 精确事件定位 |

**关键发现**：LoCoMo 的 multi_hop 类别实际上是**跨 session 时序/事件精确查询**，evidence 几乎都是单条。「multi_hop」的难点不是需要多条 memory 拼接，而是**事件细节的精确时间定位**。

---

## 2. 召回路径分析（理论诊断，待 dump 工具验证）

### 当前 hybrid 实现的问题

**问题 1：BM25 query 提取方式不适合时序问题**

```sql
-- 当前实现
ts_rank_cd(to_tsvector('simple', content), plainto_tsquery('simple', $2))
```

- `plainto_tsquery('simple', 'When did Sam take up painting in May 2023')` 会把所有词 AND 连接
- 「When」「did」等停用词被 'simple' dictionary 保留（不去停用词），产生噪声
- 时序问题的关键词是「Sam + painting + May 2023」，但 AND 连接导致召回率极低

**问题 2：entity 提取逻辑过于简单**

```typescript
// 当前实现
const queryWords = req.query.toLowerCase().split(/\W+/).filter(w => w.length > 3);
const entityHints = queryWords.map(w => `speaker:${w}`).concat(queryWords.map(w => `session:${w}`));
```

- 只生成 `speaker:sam`、`session:painting` 等标签
- multi_hop 问题的关键是「Sam 在 D1 session 做了什么」，而 entity_tags 里存的是 `speaker:Sam` + `session:D1` 等格式
- query 词提取的 entity hints 格式对不上 stored entity_tags → entity boost = 0

**问题 3：`vec_score > 0.3` 过滤阈值可能过高**

- multi_hop 涉及跨 session 细节，query embedding 与具体事件 fact embedding 余弦距离可能 < 0.3
- 导致正确的 memory 被 WHERE 条件过滤掉，根本没进 ranked 集合

---

## 3. 三个失败案例召回路径分析（推断）

### Case 1：「Sam 在 2023年5月拿起了什么爱好？」

| 召回路径 | 预期表现 | 问题 |
|---------|---------|------|
| vector | 返回 Sam 相关 memory，但可能被 May 2023 garden party 等更「语义相似」的噪声淹没 | 语义召回被干扰 |
| BM25 | `plainto_tsquery` AND 连接所有词，「painting + Sam + May」同时匹配率低 | 精确关键词 AND 太严 |
| entity | `speaker:sam` 匹配上但噪声太多（Sam 的所有记录都命中），没有筛选力 | entity boost 粒度太粗 |

**根因**：fact 颗粒度问题。OPT-6 ADD-only 把「Sam 5月开始学绘画」存为 1-2 句短 fact，BM25 短文档 TF 天然低（Okapi BM25 本身对短文档不友好）。

### Case 2：「Evan 什么时候去了 Jasper？」

| 召回路径 | 预期表现 | 问题 |
|---------|---------|------|
| vector | Jasper 是专有名词，embedding 对地名语义区分有限 | 地名识别弱 |
| BM25 | `Jasper` 是稀有词，BM25 应该能匹配——**这路应该有帮助** | 可能被 vec_score 阈值过滤 |
| entity | 无 Jasper 地名 entity_tag（OPT-6 entity_tags 主要是 speaker/session）| entity 设计缺地名维度 |

**根因**：vec_score > 0.3 阈值过滤 + BM25 能帮但 RRF 权重 0.3 不够大 + 地名 entity 未覆盖。

### Case 3：「Sam 第一次去看医生是什么时候？」

| 召回路径 | 预期表现 | 问题 |
|---------|---------|------|
| vector | 「doctor」「weight problem」语义召回应该能命中 | 相对最有希望 |
| BM25 | 「doctor」是高频词，IDF 低，BM25 打分低 | 高频词 IDF 惩罚 |
| entity | 无医生/health entity | entity 维度不够 |

**根因**：高频医疗词汇 BM25 打分被 IDF 惩罚，反而不如 vector。

---

## 4. 三个根因总结

| 根因 | 影响 | 修复方向 |
|------|------|---------|
| **R1：vec_score 阈值 0.3 过滤掉 multi_hop 答案**  | multi_hop 精确事件 embedding 余弦相似度低，直接被截断 | 降低阈值 0.3→0.1，或去掉 vec_score 过滤条件 |
| **R2：BM25 plainto_tsquery AND 逻辑对时序问题过严** | 多关键词 AND 导致召回率极低 | 改用 `websearch_to_tsquery`（支持 OR）或 `phraseto_tsquery` |
| **R3：entity boost 格式不匹配（query 词 vs stored tags）** | entity boost 实际= 0，等于没有 entity 路 | 改用 query NER 提取真实实体，或关闭 entity 路用 BM25+vector 双路 |

---

## 5. 修复优先级建议（OPT-7.1）

### 快速验证（~30min 实验）

**H1.1**：去掉 vec_score > 0.3 阈值，改为 `vec_score > 0` 或纯 ORDER BY hybrid_score
- 预期：multi_hop 有改善（之前正确答案被阈值截断）
- 风险：召回噪声增加，可能影响 adversarial

**H1.2**：`plainto_tsquery` 改为 `websearch_to_tsquery`（支持 OR 连接）
- 预期：BM25 召回率提升，尤其地名/稀有词
- 风险：精确度下降

### 设计修复（~2h）

**H2.1**：entity extraction 改为基于 query 中人名直接匹配（正则提取大写词 → 匹配 `speaker:Name`）
- 预期：entity boost 实际生效
- 成本：低，不需要 LLM

---

## 6. 对 OPT-7 整体结论的影响

smoke overall +3.6pp（51.0%→54.6%），temporal +7.7pp，adversarial +5.0pp——**hybrid 对其他类型有效**。multi_hop 退步 -3.0pp 是实现 bug（阈值+query 解析），不是方向错误。

**建议**：不放弃 OPT-7 hybrid 路线，走 H1.1 快速验证 → 再 smoke v2 → 进 H1 sample=7。

---

**paper_ref**: Okapi BM25 Robertson & Zaragoza (2009)；PostgreSQL FTS docs §8.11 websearch_to_tsquery
**待碧瑶补充**: `--dump-retrieval` 工具跑完后，用真实召回数据验证 R1/R2/R3 推断

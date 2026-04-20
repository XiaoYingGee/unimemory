# OPT-7 H1 结论文档

**版本**: v0.1（模板，待 sample=7 数据 + 瓶儿 Wilson 盖章）
**日期**: 2026-04-20
**实验**: OPT-7 H1（hybrid BM25+entity+vector，H1.1+H1.2+H1.3 修复版）
**数据**: sample=7（conv-49/42/43/26/48/41/50），n=1533 题，seed=42（待跑）
**paper_ref**: mem0 blog 2026-04-17 §multi-signal retrieval；Robertson & Zaragoza (2009) BM25；Cormack et al. (2009) RRF
**基准**: OPT-6 H1 sample=7 final（`docs/p3/opt6-h1-verdict.md` v0.6，n=1533）

---

## smoke v3 通过记录（conv-49，H1.1+H1.2+H1.3）

| 指标 | OPT-6 baseline | smoke v3 | Δ vs OPT-6 | 红线 | 状态 |
|------|---------------|---------|-----------|------|------|
| overall | 51.0% | **60.7%** | +9.7pp | — | ✨ 大幅提升 |
| multi_hop | 15.2% | **24.2%** | +9.0pp | ≥22% | ✅ 通过 |
| single_hop | 45.9% | **48.6%** | +2.7pp | ≥45% | ✅ 通过 |
| adversarial | 90.0% | **90.0%** | 0pp | ≥90% | ✅ 险过 |
| temporal | 23.1% | **46.2%** | +23.1pp | — | ✨ 意外强信号 |
| open_domain | 53.4% | **69.9%** | +16.5pp | — | ✨ 意外大礼 |

**smoke 守门盖章**: 🟡 待瓶儿确认 → 进 sample=7

---

## R3 entity 修复意外效果

- open_domain +12pp vs smoke v2：entity hint 精准后，vector 召回质量联动提升
- temporal +7.7pp vs smoke v2：人名 entity 命中跨 session 时序记忆
- 教训：entity extraction 看似小修复，实际是检索质量的乘数效应

---

## sample=7 判决表（待填）

| 类别 | OPT-6 基准 | OPT-6 CI [95%] | OPT-7 H1 | OPT-7 CI | Δpp | Δ题 | √n | CI 不重叠 | 7conv同向 | 判定 |
|------|-----------|----------------|----------|----------|-----|-----|-----|-----------|----------|------|
| overall | 53.7% | [51.2,56.2] | TBD | TBD | TBD | TBD | 39.2 | TBD | TBD | 🟡 待数据 |
| multi_hop | 13.5% | [9.7,18.4] | TBD | TBD | TBD | TBD | 15.4 | TBD | TBD | 🟡 待数据 |
| single_hop | 36.2% | [30.1,42.7] | TBD | TBD | TBD | TBD | 14.9 | TBD | TBD | 🟡 待数据 |
| adversarial | 88.5% | [84.7,91.4] | TBD | TBD | TBD | TBD | 18.6 | TBD | TBD | 🟡 待数据 |
| temporal | 26.3% | [17.7,37.2] | TBD | TBD | TBD | TBD | 8.7 | TBD | TBD | 🟡 待数据 |
| open_domain | 58.9% | [55.1,62.6] | TBD | TBD | TBD | TBD | 25.5 | TBD | TBD | 🟡 待数据 |

---

## DoD 红线验收（spec v0.3，待填）

| 红线 | 目标 | 结果 | 状态 |
|------|------|------|------|
| overall ≥ 57% | Wilson 三规则 | TBD | 🟡 |
| multi_hop ≥ 22% | 必涨红线，三规则 | TBD | 🟡 |
| open_domain ≥ 58% | 不退步 | TBD | 🟡 |
| single_hop ≥ 34% | 不破坏 OPT-6 | TBD | 🟡 |
| adversarial ≥ 85% | 不破坏 OPT-6 | TBD | 🟡 |

---

## 修复历程（H1.1 → H1.3）

| 版本 | 修复 | smoke multi_hop | 状态 |
|------|------|-----------------|------|
| smoke v1（原始）| 基础 hybrid | 12.1% | ❌ |
| smoke v2（H1.1+H1.2）| 去 vec_score 阈值 + websearch_to_tsquery | 18.2% | ❌ |
| smoke v3（H1.3）| entity 正则提取大写人名 | **24.2%** | ✅ |

---

## 待操作

- [ ] 碧瑶起 sample=7 跑批（7 conv，~3h）
- [ ] 瓶儿 Wilson final 盖章
- [ ] 雪琪填表 → v0.2
- [ ] 讨论 default-ON 条件

---

**瓶儿盖章状态**: 🟡 smoke v3 待盖章 → sample=7 待跑

# OPT-7 H1.3 R3 Entity 修复 Spec

**版本**: v0.1
**日期**: 2026-04-20
**负责**: 碧瑶 impl，瓶儿 smoke v3 验收
**范围**: 只动 entity extraction 逻辑，不动 vector/BM25 路，避免归因混乱

---

## 背景

smoke v2（H1.1+H1.2）multi_hop 18.2%，仍低于 spec v0.3 红线 22%。

根因 R3（`docs/p3/opt7-multihop-diagnosis.md` §4）：
> entity boost 实际 = 0。query 词被 toLowerCase + split 后全部 map 成 `speaker:when`、`session:painting` 等格式，与 stored entity_tags（`speaker:Sam`、`session:D1`）无法匹配。

---

## 修改内容

**文件**: `src/memory/service.ts`，`hybridSearch()` 函数

**定位**: 找到以下两行（约 L398-L400）：

```typescript
// 旧代码（删除）
const queryWords = req.query.toLowerCase().split(/\W+/).filter(w => w.length > 3);
const entityHints = queryWords.map(w => `speaker:${w}`).concat(queryWords.map(w => `session:${w}`));
```

**替换为**：

```typescript
// 新代码（H1.3 R3 fix）
// 提取 query 中大写开头词（人名/地名），直接匹配 stored speaker:Name tags
const capitalWords = req.query.match(/\b[A-Z][a-z]+\b/g) ?? [];
const entityHints = capitalWords.length > 0
  ? capitalWords.map(w => `speaker:${w}`)
  : [];  // 无大写词时 entity hints 为空，避免噪声
```

**改动范围**: 仅 2 行，不改 SQL query，不改 weights，不改其他逻辑。

---

## 设计说明

| 场景 | 旧行为 | 新行为 |
|------|--------|--------|
| "When did Sam take up painting" | `speaker:when, speaker:take, speaker:pain...`（全噪声）| `speaker:Sam` ✅ |
| "When did Evan go to Jasper" | `speaker:when, speaker:evan, speaker:jasp...` | `speaker:Evan, speaker:Jasper` ✅ |
| "What did he do yesterday" | `speaker:what, speaker:yest...` | `[]`（无大写词，不产生噪声）✅ |

---

## smoke v3 验收标准（瓶儿拍，conv-49 sample=1）

| 指标 | 门槛 | 说明 |
|------|------|------|
| multi_hop | ≥ **22%** | 必过，H1.3 主目标 |
| single_hop | ≥ **45%** | 不破坏 smoke v2 水平 |
| adversarial | ≥ **90%** | 不破坏 smoke v2 水平 |

三条全过 → 进 sample=7 H1 跑批。

---

**commit 后 ping 碧瑶，碧瑶 impl 完 ping 瓶儿 smoke v3。**

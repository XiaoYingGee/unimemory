# OPT-2.5 Spec — open_domain 反向修复

**作者**: 雪琪 ❄️ (PM) · 金瓶儿 🍾 (QA 验收 spec) · 待碧瑶 🌸 (实现)
**日期**: 2026-04-18
**前置**: OPT-2 Wave 1 (commit `0e32f3e`) 在 open_domain 上对 baseline -10pp 三 conv 同向退步
**协议**: 严格按 `docs/p3/benchmark-protocol.md` v0.3
**状态**: 草稿，明天碧瑶启动前再 review

---

## 1. 目标

在不破坏 OPT-2 其他类目（特别是 overall +14.6pp 和 adversarial +68.5pp）的前提下，**修复 open_domain 反向**，让 OPT-2 整体可以 merge 锁 default。

---

## 2. 根因猜想优先级

| # | 假设 | 改动量 | 验证方法 |
|---|---|---|---|
| H1 | LLM 拒答阈值太严，open_domain 被错误归 "None" | 小 | 抽 20 错题看输出类型分布 |
| H2 | top_k=10 chunks 给 LLM 时语义稀释 | 中 | 试 top_k=5 跑 conv-49 |
| H3 | prompt 缺 open_domain few-shot | 中 | 加 1-2 个范例 |
| H4 | LLM 概括过头丢失原 chunks 事实碎片 | 大 | 改 prompt 强制保留事实 |

**先做诊断**（碧瑶跑前 30min）：
```bash
# 抽 20 道 B 错 / A 对的 open_domain 题
python3 scripts/diff_errors.py \
  --baseline benchmarks/locomo/results/parallel-topk10-*.json \
  --candidate benchmarks/locomo/results/llm-topk10-*.json \
  --category open_domain \
  --sample 20
```
看 B 输出里 "None" / "无法回答" 占比 vs "概括过头" 占比，决定优先打 H1 还是 H4。

---

## 3. 实现路径（按优先级递进，每步独立 commit）

### Step 1：H1 修拒答阈值

- 改 `benchmarks/locomo/llm-answer.ts` 里的 system prompt
- 把 `"If unable to determine, respond 'None'"` 改成两层：
  - 完全无信息 → "None"
  - 部分信息但不确定 → 给最可能答案 + `(low confidence)` 标注
- 跑一次 conv-49 验 open_domain 是否回血

### Step 2（如 Step 1 不够）：H3 加 few-shot

- prompt 顶部加 2 个 open_domain 示范：
  - 一个事实型问题给具体答案
  - 一个开放型问题给概括 + 关键事实

### Step 3（如还不够）：H2 试 top_k=5

- 仅 open_domain 类 query 走 top_k=5
- 其他类保持 top_k=10

### Step 4（兜底）：H4 改 prompt 强制事实保留

- "Answer concisely but ALWAYS preserve specific facts (names, dates, numbers) from retrieved chunks"

---

## 4. 验收 spec（瓶儿划红线，必须全过）

| # | 条件 | 测量 |
|---|---|---|
| 1 | open_domain 不再反向 | B(2.5) vs A 在 open_domain 上 Δpp ≥ 0；不能用 \|Δ\|<√n=18 糊弄 |
| 2 | open_domain 修复是真信号 | B(2.5) vs B(2.0) 三规则全过（CI 不重叠 + \|Δ\|≥18 题 + 三 conv 同向涨）|
| 3 | 不破坏其他类 | adversarial / multi_hop / temporal / single_hop 任一出现「真反向信号」直接打回 |
| 4 | 跑批合规 | 同 conv 集（conv-49/42/43）+ B 用 commit `0e32f3e` 对照 + sample=3 + seed=42 |

---

## 5. 跑批命令模板

```bash
# B(2.5) run，按 protocol v0.3 sample=3
for CONV in conv-49 conv-42 conv-43; do
  for SEED_RUN in 1 2 3; do  # sample=3
    npx ts-node benchmarks/locomo/run.ts \
      --conversation-id="$CONV" \
      --top-k=10 \
      --concurrency=3 \
      --llm \
      --tag="opt2.5-${CONV}-s${SEED_RUN}" \
      2>&1 | tee /tmp/bm-opt2.5-${CONV}-s${SEED_RUN}.log
  done
done

# B(2.0) 对照（如已有最新 sample=3 数据可复用，否则同上但 git checkout 0e32f3e）
```

---

## 6. ETA & 阻塞链

- 诊断 30min
- Step 1-4 按需走，单步 ~30min（含跑 conv-49）
- 全 sample=3 重测：~3h（9 runs × ~20min）
- **总 ETA：4-5h**，明天上午可完成

通过 → OPT-2 + 2.5 合并 merge PR #21 → 启动 Step B Zep
不通过 → 回到 §3 下一步，最差兜底是 OPT-2 在 open_domain 上加路由（事实型走 baseline，复杂型走 LLM）

---

## 7. 待 ACK

- ✅ 雪琪（PM）— 本 spec
- ✅ 瓶儿（QA）— §4 验收红线（已划）
- ⏳ 小白（调度）— 排期
- ⏳ 碧瑶（开发）— 明天启动

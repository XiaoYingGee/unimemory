# UniMemory P3 Benchmark Protocol v0.1

**作者**: 雪琪 ❄️ (起草) · 金瓶儿 🍾 (QA review) · 小白 🦊 (调度 sign-off)
**日期**: 2026-04-18
**状态**: v0.1 草稿，等 review
**适用范围**: ⚠️ **所有 OPT-X 实验、所有写入 PR 的对比数据，均必须遵循本协议**

---

## 0. 为什么要这份协议

OPT-3 Step A 教训：sample=1 单 conv 的结果差几个 pp 就开始定方向，QA 一刀（瓶儿 12:32）戳穿——**multi_hop -2 题在统计噪声内，但已经差点驱动 4h 错误调试**。从此立规矩，省团队时间。

核心信念：**没有置信区间的 benchmark 数字，不是数据，是骰子点数**。

---

## 1. 固定实验设置

### 1.1 数据子集（金瓶儿 2026-04-18 锁定，按 P20-P80 区间规则）

**选择规则（雪琪+小白拍板）**：
- 10 个 conv 按 turns 升序排列，**只在 P20-P80 区间内取**（避免 outlier）
- 区间内取 P25 / P50 / P75 三个，覆盖短/中/长
- temporal 必须 > 0（否则验不了温度死穴，conv-30 已被 P5 区间排除）

**全量排序参考**（10 个 conv）：
```
rank id        turns  qa   P-rank  备注
  1  conv-30   369   105   P5     ❌ outlier (P20 外) + temporal=0
  2  conv-26   419   199   P15    ❌ outlier (P20 外)
  3  conv-49   509   196   P25    ✅ short
  4  conv-50   568   204   P35
  5  conv-42   629   260   P45    ✅ mid (qa 最多)
  6  conv-41   663   193   P55
  7  conv-44   675   158   P65
  8  conv-43   680   242   P75    ✅ long
  9  conv-48   681   239   P85    ❌ outlier (P80 外)
 10  conv-47   689   190   P95    ❌ outlier (P80 外)
```

**最终锁定：**

| 角色 | sample_id | turns | qa | single | multi | temporal | open_domain | adversarial |
|------|-----------|-------|-----|--------|-------|----------|-------------|-------------|
| `conv_short` | **conv-49** | 509 | 196 | 37 | 33 | 13 | 73 | 40 |
| `conv_mid`   | **conv-42** | 629 | 260 | 37 | 40 | 11 | 111 | 61 |
| `conv_long`  | **conv-43** | 680 | 242 | 31 | 26 | 14 | 107 | 64 |
| **累计**     | —           | 1818 | **698** | 105 | **99** | **38** | 291 | 165 |

> 累计 698 题（比单 conv 翻 3.5 倍）。temporal n=38 / multi_hop n=99，统计力够。

> ⚠️ **注意**：之前 OPT-2 / OPT-3 的 sample=1 数据基于 conv-26（P15 outlier），按本协议**全部需要在新 conv 集上重跑**才能算合规对照。

### 1.2 随机种子

- `seed = 42`，所有跑批固定
- `sample` 默认 = **3**（每条 query 取 3 次召回结果，metric 取均值）
- top_k 默认按各 OPT 自身 spec，不在本协议规定

### 1.3 Judge / Generator 模型

| 角色 | 模型 | 备注 |
|---|---|---|
| Generator（被测对象） | gpt-4o-mini | OPT-X 不要换，否则失去对照 |
| Judge（评估器） | gpt-5 + CoT (v3) | 已校准 96% agreement |
| Embedding | text-embedding-3-small | 全链路统一 |

---

## 2. 跑批要求

### 2.1 同 seed 同 conv 集双跑

任何 OPT-X 对比，必须**同 seed 同 conv 集**重跑两侧：

```
run A: <baseline 配置>，sample=3, seed=42, conv = {short, mid, long}
run B: <new 配置>，   sample=3, seed=42, conv = {short, mid, long}   ← 必须相同
```

⚠️ **禁止**拿新跑数据 vs 旧 PR 里的历史数据比 delta（"苹果 vs 橘子"）。

### 2.2 跑批纪律

1. 跑批命令后**必须挂 30min cron 自检 + push 进度**
2. 跑完立刻 push results JSON 到 PR 分支
3. 在 thread 贴一句 "run X 完成 commit Y"

---

## 3. 报告格式（必填）

每次对比写在 PR / thread 时，**必须**附下表样式：

```
| 类别        | n   | A 准确率 (95% CI)   | B 准确率 (95% CI)   | Δ (pp) | 判定        |
|------------|-----|--------------------|--------------------|--------|-------------|
| open_domain | 70  | 55.7% [44.3, 66.5] | 68.6% [57.1, 78.2] | +12.9  | ✅ 真信号    |
| multi_hop   | 37  | 18.9% [9.5, 33.2]  | 13.5% [5.6, 27.8]  | -5.4   | ⚠️ 噪声内    |
| temporal    | 13  | 0%   [0,    24.4]  | 7.7% [0.6, 33.0]   | +7.7   | ⚠️ 噪声内    |
| ...        | ... | ...                | ...                | ...    | ...         |
```

- CI = Wilson Score 95% interval (二项分布)
- n 必须列出
- "判定"列按下文规则填

### 3.1 Wilson 区间公式（实现参考）

```js
function wilson95(k, n) {
  if (n === 0) return [0, 0];
  const z = 1.96, p = k / n;
  const denom = 1 + z*z / n;
  const center = (p + z*z / (2*n)) / denom;
  const half = z * Math.sqrt((p*(1-p) + z*z/(4*n)) / n) / denom;
  return [Math.max(0, center - half), Math.min(1, center + half)];
}
```

---

## 4. 噪声判定规则（**核心**）

一个 delta 算 **「真信号」** 必须**同时满足三条**：

| # | 条件 | 含义 | 备注 |
|---|---|---|---|
| 1 | A、B 的 Wilson 95% CI **不重叠** | 统计显著性 | 标准统计学要求 |
| 2 | `|Δ| ≥ √n` 题数（即 √n / n 的 pp 值） | 效应量足够 | 瓶儿建议；multi_hop n=37 → ≥ √37 ≈ 6 题 ≈ 16pp |
| 3 | 三个 conv（short/mid/long）的 delta **同向** | 跨 conv 稳定 | 雪琪补；避免"碰巧均值大" |

任何一条不满足 → **判定为「噪声内」，不下结论、不写进 PR 标题、不据此调整方向**。

### 4.1 为什么三条都要

- 只看 #1：3 个 conv 一个 +30 一个 -10 一个 +5，均值 +8 区间不重叠，但显然不稳定
- 只看 #2：n 大时（如 open_domain n=70），√n=8.4 题 ≈ 12pp，条件其实比 #1 更严，但小 n 时 √n 太宽松
- 只看 #3：三个都涨 1pp，方向一致但效应太小，没意义

**三条同时满足是质保标准，少一条都是降级数据。**

### 4.2 「降级数据」如何处理

- 满足 1 条 → "**弱信号**"，可作为继续投资的参考但不能定方向
- 满足 0 条 → "**噪声**"，纯当未观测，不写进任何结论

---

## 5. PR 数据写法约束

PR 标题 / description 里出现任何 "+X pp" 数字时：

- ✅ 必须自带 `(n=Y, sample=Z, CI=[a,b])`
- ✅ 必须标注是「真信号 / 弱信号 / 噪声」
- ❌ 禁止单独写 "OPT-X 提升 +9.9pp"，必须是 "OPT-X 提升 +9.9pp（真信号，n=152, sample=3, CI 不重叠）"
- ❌ 禁止用 "翻盘 / 大胜 / breakthrough" 描述弱信号 / 噪声级数据

历史数据回溯：
- OPT-2 PR #21 的 +9.9pp 是 sample=1 数据，按本协议属于"待复验"
- 由本次 OPT-3 Step A Wave 1 的 run A 同时复验，结果 push PR #21 update

---

## 6. 协议版本管理

- 本协议 v0.1，OPT-3 Step A Wave 1 之后视使用情况升 v1.0
- 版本变更必须三人（雪琪 + 瓶儿 + 小白）ACK
- 文件路径：`docs/p3/benchmark-protocol.md`

---

## 7. Review 答复（金瓶儿 2026-04-18）

**雪琪姐三问：**

1. ✅ **三个 conv id 已锁**（见 §1.1）：conv-26 / conv-50 / conv-47。理由：长度短/中/长跨度，temporal 全部 > 0，累计 QA 593 题统计力够。
2. ✅ **噪声三条规则全同意**，特别支持第三条「方向一致性」——这条把"碰巧均值大"挡住了，奴家 sample=1 的版本里没想到这一层，雪琪姐补得好。
3. ✅ **wilson95 prefer JS**（仓库主语言 TS，benchmark runner 也是 TS，一份实现少一处维护成本）。Python 一行版仅作奴家本地快算备用。

**待小白姐 ACK：**
- 协议生效范围（P3 限定 / 全项目）

ACK 齐就锁 v0.1，碧瑶开 Wave 1。

---

_拿一颗骰子的一次结果定方向，是耍流氓。— 🍾 金瓶儿_

---

## 8. 协议变更流程（小白姐补丁，2026-04-18）

**任何对本协议的改动**（包括 conv 集、噪声规则、报告格式、生效范围）：

1. 必须至少 **PM (雪琪) + QA (瓶儿) 两人 ACK**
2. 改动后**所有未完成 OPT 实验必须重跑验证**结果不受影响
3. 变更需有明确 commit message + 升版本号（v0.1 → v0.2 → ...）
4. **禁止**为已跑出的不利结果反向修改协议（"改协议救数据"）

## 9. 信息漂移防护附录（2026-04-18 教训）

OPT-3 Step A 跑批前发生 conv 集冲突：初版 conv-26/50/47 被 QA 自我审计后用 P20-P80 outlier 规则推翻为 conv-49/42/43，但旧版本号在线程里继续流传，差点导致跑错 conv。

**纪律**：
- 任何 protocol 关键参数（conv id / seed / 阈值）以**最新 commit 为准**，thread 消息只是工作记录
- PM / QA ACK 前必须 `git pull` 看最新 commit，不基于历史聊天上下文 ACK
- 跑批前 carry 一次"参数自检"：打印 conv id / seed / commit hash 到 log 头部

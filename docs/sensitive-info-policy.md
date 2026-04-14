# Sensitive Information Policy / 敏感信息禁写清单

**Version**: v1.0  
**Status**: Draft  
**Author**: 雪琪  
**Applies to**: UniMemory `memory_write` 工具，所有 scope（global / project / agent）

---

## 概述

本文档定义哪些信息**绝对禁止**写入 UniMemory，以及哪些信息需要**脱敏处理后才能写入**。

禁写规则在 `src/memory/service.ts` 写入路径强制执行，任何 Agent 无法绕过。

---

## 一、绝对禁止写入的信息（Block List）

以下类型的信息一经检测，写入请求直接拒绝，返回 `SENSITIVE_CONTENT_BLOCKED` 错误。

### 1.1 凭证与密钥类

| 类型 | 示例 | 检测方式 |
|------|------|---------|
| API Key（OpenAI / Anthropic / 其他） | `sk-...`、`sk-ant-...` | 正则 |
| Discord Bot Token | `MTQ...` （Base64 编码，长度 70+） | 正则 |
| GitHub Personal Access Token | `ghp_...`、`github_pat_...` | 正则 |
| AWS Access Key | `AKIA...` | 正则 |
| 数据库连接字符串（含密码） | `postgresql://user:password@host` | 正则 |
| JWT Token | `eyJ...`（三段式 Base64） | 正则 |
| SSH 私钥内容 | `-----BEGIN ... PRIVATE KEY-----` | 正则 |
| 任意形式的 password/secret 字段值 | `password=abc123` | 正则 |

### 1.2 个人隐私类

| 类型 | 示例 | 检测方式 |
|------|------|---------|
| 身份证号 | 18 位数字 | 正则 |
| 手机号（中国大陆） | `1[3-9]\d{9}` | 正则 |
| 信用卡号 | 16 位数字（Luhn 校验） | 正则 + Luhn |
| 护照号 | 字母+数字组合特定格式 | 正则 |

### 1.3 主人明确标记的私密内容

当 `memory_write` 请求的 `source_context` 中包含以下标记时，拒绝写入 `shared` 或 `global` scope（允许写入 `agent` scope）：

- `[PRIVATE]`
- `[机密]`
- `[DO NOT SHARE]`

---

## 二、需要脱敏才能写入的信息（Sanitize List）

以下信息不直接拒绝，而是在写入前自动脱敏替换，并在 `source_context` 中注明"已脱敏"。

| 类型 | 原始 | 脱敏后 |
|------|------|-------|
| IP 地址 | `192.168.1.100` | `192.168.x.x` |
| 邮箱地址 | `user@example.com` | `u***@example.com` |
| URL 中的 token 参数 | `?token=abc123` | `?token=***` |
| 文件路径中的用户名 | `/Users/wuyin/...` | `/Users/***/...` |

---

## 三、高风险场景：私有记忆推断泄漏

即使内容本身不含敏感字段，以下场景也有隐私泄漏风险，Agent 必须遵守：

**禁止行为**：
- 将 `agent` scope 的私有记忆摘要后写入 `global` scope
- 将两条 `agent` scope 记忆组合推断出的结论写入 `shared`
- 在 `source_context` 字段中引用私密对话的原文

**允许行为**：
- 将主人**明确说"可以共享"**的内容写入 `global`
- 将公开的项目决策写入 `project` scope

---

## 四、错误响应格式

当写入被拒绝时，MCP Server 返回：

```json
{
  "error": "SENSITIVE_CONTENT_BLOCKED",
  "reason": "Content contains credential pattern: API key detected",
  "blocked_patterns": ["sk-*"],
  "suggestion": "Remove sensitive content before writing to memory"
}
```

当内容被脱敏时，正常写入但响应附加：

```json
{
  "memory_id": "uuid",
  "status": "created",
  "sanitized": true,
  "sanitization_log": ["email address masked", "IP address masked"]
}
```

---

## 五、检测实现要求

碧瑶实现 B5（敏感信息过滤）时需满足：

1. **检测在写入路径最前端执行**，早于 embedding 生成
2. **正则规则独立配置文件**（`src/security/patterns.ts`），方便更新不动核心逻辑
3. **误拦截率 < 1%**（有效内容被错误拦截）——金瓶儿 Q5 验收标准
4. **漏检率 < 0.1%**（已知敏感模式被漏过）——金瓶儿 Q5 验收标准
5. **不记录被拦截的原始内容**到任何日志（避免日志泄漏）

---

## 六、更新流程

本文档由雪琪维护。新增禁写类型时：
1. 在本文档更新规则
2. 同步更新 `src/security/patterns.ts`
3. 同步更新金瓶儿的 Q5 测试用例
4. 提 PR，需碧瑶 + 金瓶儿各 review 一次

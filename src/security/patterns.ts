/**
 * Sensitive Information Detection Patterns
 * 规范来源: docs/sensitive-info-policy.md (雪琪 v1.0)
 *
 * 独立配置文件，核心逻辑不动，只改这里来更新规则。
 */

export interface BlockPattern {
  name: string;
  pattern: RegExp;
  description: string;
}

export interface SanitizePattern {
  name: string;
  pattern: RegExp;
  replacement: string;
  description: string;
}

// ── 一、绝对禁止写入（Block List） ───────────────────────────────────────────

export const BLOCK_PATTERNS: BlockPattern[] = [
  // 1.1 凭证与密钥类
  {
    name: 'openai-api-key',
    // sk- 开头，支持 sk-proj-xxx / sk-xxx 两种格式
    pattern: /\bsk-[A-Za-z0-9\-]{20,}\b/,
    description: 'OpenAI API Key (sk-... or sk-proj-...)',
  },
  {
    name: 'anthropic-api-key',
    pattern: /\bsk-ant-[A-Za-z0-9\-_]{20,}\b/,
    description: 'Anthropic API Key (sk-ant-...)',
  },
  {
    name: 'discord-bot-token',
    // Discord token: Base64.Base64.Base64，第一段是 user_id 的 Base64，长度通常 59-70+
    pattern: /\b[A-Za-z0-9_-]{24,28}\.[A-Za-z0-9_-]{6,8}\.[A-Za-z0-9_-]{27,}\b/,
    description: 'Discord Bot Token',
  },
  {
    name: 'github-pat',
    pattern: /\b(ghp_|github_pat_)[A-Za-z0-9_]{20,}\b/,
    description: 'GitHub Personal Access Token',
  },
  {
    name: 'aws-access-key',
    pattern: /\bAKIA[0-9A-Z]{16}\b/,
    description: 'AWS Access Key ID',
  },
  {
    name: 'database-url-with-password',
    // postgresql://user:password@host 或 mysql://user:password@host
    pattern: /\b(postgresql|mysql|postgres|mongodb):\/\/[^:@\s]+:[^@\s]+@[^\s]+/i,
    description: 'Database connection string with password',
  },
  {
    name: 'jwt-token',
    // JWT: eyXxx.eyXxx.signature (三段 Base64)
    pattern: /\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
    description: 'JWT Token (three-part Base64)',
  },
  {
    name: 'ssh-private-key',
    pattern: /-----BEGIN\s+(?:RSA\s+|EC\s+|DSA\s+|OPENSSH\s+)?PRIVATE KEY-----/,
    description: 'SSH/TLS Private Key',
  },
  {
    name: 'password-in-text',
    // password=xxx 或 "password": "xxx" 或 DB_PASSWORD=xxx 或 passwd=xxx
    pattern: /(?:^|[\s_])(?:password|passwd|secret|api_?key)\s*[=:]\s*["']?[^\s"',]{6,}["']?/i,
    description: 'Inline password or secret assignment',
  },

  // 1.2 个人隐私类
  {
    name: 'china-id-card',
    // 中国居民身份证：18 位，最后一位可以是 X
    pattern: /\b[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]\b/,
    description: 'China ID card number',
  },
  {
    name: 'china-phone-number',
    pattern: /\b1[3-9]\d{9}\b/,
    description: 'China mobile phone number',
  },
  {
    name: 'ssn',
    // 美国社保号 SSN: xxx-xx-xxxx 格式
    pattern: /\b(?!000|666|9\d{2})\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/,
    description: 'US Social Security Number (SSN)',
  },
  {
    name: 'credit-card',
    // 16 位数字（含空格/短横线分隔）
    pattern: /\b(?:\d{4}[\s\-]?){3}\d{4}\b/,
    description: 'Credit card number (16-digit)',
  },
];

// ── 二、脱敏处理（Sanitize List） ────────────────────────────────────────────

export const SANITIZE_PATTERNS: SanitizePattern[] = [
  {
    name: 'ip-address',
    pattern: /\b(?:\d{1,3}\.){2}(\d{1,3}\.\d{1,3})\b/g,
    replacement: (match: string) => match.replace(/\b(?:\d{1,3}\.){2}(\d{1,3})\.(\d{1,3})\b/, '$1.x.x') as unknown as string,
    description: 'IP address → 192.168.x.x',
  },
  {
    name: 'email-address',
    pattern: /\b([A-Za-z0-9._%+\-]{1,3})[A-Za-z0-9._%+\-]*@([A-Za-z0-9.\-]+\.[A-Za-z]{2,})\b/g,
    replacement: '$1***@$2',
    description: 'Email address → u***@example.com',
  },
  {
    name: 'url-token-param',
    pattern: /([?&](?:token|key|secret|api_key|access_token)=)[^\s&"']+/gi,
    replacement: '$1***',
    description: 'URL token parameter → ?token=***',
  },
  {
    name: 'file-path-username',
    // macOS/Linux: /Users/someuser/ 或 /home/someuser/
    pattern: /\/(Users|home)\/([^\/\s]+)\//g,
    replacement: '/$1/***/​',
    description: 'File path username → /Users/***/​',
  },
];

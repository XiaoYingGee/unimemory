/**
 * B5 敏感信息过滤 单元测试
 * 对照 docs/sensitive-info-policy.md (雪琪 v1.0) 验收标准
 */
import { describe, it, expect } from 'vitest';
import { detect, sanitize, checkContent } from '../../src/security/filter';

// ── TC-SEC-01: Block List 检测 ────────────────────────────────────────────
describe('TC-SEC-01: Block patterns detect credentials', () => {
  it('should detect OpenAI API key', () => {
    const result = detect('My key is sk-abcdefghijklmnopqrstuvwxyz1234567890');
    expect(result.matched).toBe(true);
    expect(result.patterns).toContain('openai-api-key');
  });

  it('should detect Anthropic API key', () => {
    const result = detect('Using sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxxxx');
    expect(result.matched).toBe(true);
    expect(result.patterns).toContain('anthropic-api-key');
  });

  it('should detect GitHub PAT', () => {
    const result = detect('token: ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
    expect(result.matched).toBe(true);
    expect(result.patterns).toContain('github-pat');
  });

  it('should detect AWS access key', () => {
    const result = detect('AWS key: AKIAIOSFODNN7EXAMPLE');
    expect(result.matched).toBe(true);
    expect(result.patterns).toContain('aws-access-key');
  });

  it('should detect database URL with password', () => {
    const result = detect('postgresql://user:s3cr3tpassword@localhost:5432/db');
    expect(result.matched).toBe(true);
    expect(result.patterns).toContain('database-url-with-password');
  });

  it('should detect JWT token', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const result = detect(jwt);
    expect(result.matched).toBe(true);
    expect(result.patterns).toContain('jwt-token');
  });

  it('should detect SSH private key header', () => {
    const result = detect('-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAK...');
    expect(result.matched).toBe(true);
    expect(result.patterns).toContain('ssh-private-key');
  });

  it('should detect inline password assignment', () => {
    const result = detect('DB_PASSWORD=supersecret123');
    expect(result.matched).toBe(true);
    expect(result.patterns).toContain('password-in-text');
  });

  it('should detect China ID card', () => {
    const result = detect('身份证：110101199003074512');
    expect(result.matched).toBe(true);
    expect(result.patterns).toContain('china-id-card');
  });

  it('should detect China phone number', () => {
    const result = detect('电话：13812345678');
    expect(result.matched).toBe(true);
    expect(result.patterns).toContain('china-phone-number');
  });
});

// ── TC-SEC-02: 正常内容不被误拦截 ────────────────────────────────────────
describe('TC-SEC-02: Normal content should not be blocked', () => {
  it('should not block normal preference text', () => {
    const result = detect('主人偏好使用 PostgreSQL 作为数据库');
    expect(result.matched).toBe(false);
  });

  it('should not block technical decision text', () => {
    const result = detect('我们决定在 P1 阶段引入 Graphiti 作为图谱层');
    expect(result.matched).toBe(false);
  });

  it('should not block code snippet without secrets', () => {
    const result = detect('const db = await getDb(); // 获取数据库连接');
    expect(result.matched).toBe(false);
  });

  it('should not block version numbers that look like tokens', () => {
    const result = detect('使用 Node.js v20.0.0 和 TypeScript 5.4');
    expect(result.matched).toBe(false);
  });
});

// ── TC-SEC-03: 脱敏处理 ──────────────────────────────────────────────────
describe('TC-SEC-03: Sanitize replaces sensitive-ish data', () => {
  it('should mask email address', () => {
    const { content, log } = sanitize('联系 user@example.com 获取帮助');
    expect(content).not.toContain('user@example.com');
    expect(content).toContain('***@example.com');
    expect(log.length).toBeGreaterThan(0);
  });

  it('should mask URL token parameter', () => {
    const { content, log } = sanitize('回调地址：https://api.example.com/callback?token=abc123def456');
    expect(content).not.toContain('abc123def456');
    expect(content).toContain('token=***');
    expect(log.length).toBeGreaterThan(0);
  });

  it('should not modify clean text', () => {
    const text = '主人偏好简洁的代码风格';
    const { content, log } = sanitize(text);
    expect(content).toBe(text);
    expect(log.length).toBe(0);
  });
});

// ── TC-SEC-04: [PRIVATE] 标记 scope 检查 ─────────────────────────────────
describe('TC-SEC-04: Private marker blocks global/project scope', () => {
  it('should block [PRIVATE] content in global scope', () => {
    const result = checkContent('[PRIVATE] 这是我的私密日记', {
      scope: 'global',
      source_context: undefined,
    });
    expect(result.blocked).toBe(true);
    expect((result as any).blocked_patterns).toContain('private-marker');
  });

  it('should allow [PRIVATE] content in agent scope', () => {
    const result = checkContent('[PRIVATE] 这是我的私密日记', {
      scope: 'agent',
      source_context: undefined,
    });
    expect(result.blocked).toBe(false);
  });

  it('should block [机密] content in project scope', () => {
    const result = checkContent('[机密] 内部决策不公开', {
      scope: 'project',
      source_context: undefined,
    });
    expect(result.blocked).toBe(true);
  });
});

// ── TC-SEC-05: checkContent 总入口 ───────────────────────────────────────
describe('TC-SEC-05: checkContent integration', () => {
  it('should return BlockResult for API key', () => {
    const result = checkContent('使用 sk-abcdefghijklmnopqrstuvwxyz1234 连接 OpenAI', {
      scope: 'global',
    });
    expect(result.blocked).toBe(true);
    expect((result as any).reason).toContain('openai-api-key');
  });

  it('should return PassResult with sanitized=true for email', () => {
    const result = checkContent('请联系 admin@company.com 处理', {
      scope: 'global',
    });
    expect(result.blocked).toBe(false);
    expect((result as any).sanitized).toBe(true);
    expect((result as any).content).not.toContain('admin@company.com');
  });

  it('should return PassResult with sanitized=false for clean text', () => {
    const result = checkContent('主人决定采用微服务架构', { scope: 'global' });
    expect(result.blocked).toBe(false);
    expect((result as any).sanitized).toBe(false);
    expect((result as any).sanitization_log).toHaveLength(0);
  });
});

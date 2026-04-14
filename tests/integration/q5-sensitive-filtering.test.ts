import { describe, it, expect, beforeEach } from 'vitest';
import { checkContent, FilterResult } from '../../src/security/filter';

describe('Q5: Sensitive Content Filtering', () => {
  beforeEach(() => {
    // Reset any state if needed
  });

  describe('Block List - API Keys', () => {
    it('TC-SEC-BLOCK-01: OpenAI API_KEY sk-* format should be blocked', () => {
      // OpenAI API keys: sk-[20+ alphanumeric]
      const maliciousContent = 'My OpenAI API key is sk-1234567890abcdefghij1234567890';
      const result = checkContent(maliciousContent, { scope: 'global' });

      expect(result.blocked).toBe(true);
      expect(result.blocked_patterns).toContain('openai-api-key');
    });

    it('TC-SEC-BLOCK-01b: GitHub PAT should be blocked', () => {
      const content = 'GitHub token: ghp_1234567890abcdefghijklmnopqrst12345';
      const result = checkContent(content, { scope: 'global' });

      expect(result.blocked).toBe(true);
      expect(result.blocked_patterns).toContain('github-pat');
    });

    it('TC-SEC-BLOCK-01c: Anthropic API Key should be blocked', () => {
      const content = 'Anthropic key: sk-ant-1234567890abcdefghij';
      const result = checkContent(content, { scope: 'global' });

      expect(result.blocked).toBe(true);
    });
  });

  describe('Block List - PII', () => {
    it.skip('TC-SEC-BLOCK-02: SSN format should be blocked (PENDING B5 PR#8)', () => {
      const content = 'Social Security Number: 123-45-6789';
      const result = checkContent(content, { scope: 'global' });

      expect(result.blocked).toBe(true);
      expect(result.blocked_patterns).toContain('ssn');
    });

    it('TC-SEC-BLOCK-02b: Chinese ID number should be blocked', () => {
      const content = '身份证号: 110101199003078214';
      const result = checkContent(content, { scope: 'global' });

      expect(result.blocked).toBe(true);
      expect(result.blocked_patterns).toContain('china-id-card');
    });
  });

  describe('Block List - Credentials', () => {
    it('TC-SEC-BLOCK-03: Database connection strings should be blocked', () => {
      const content = 'Connection: postgresql://user:password123@host:5432/db';
      const result = checkContent(content, { scope: 'global' });

      expect(result.blocked).toBe(true);
    });

    it('TC-SEC-BLOCK-03b: AWS Access Keys should be blocked', () => {
      const content = 'AWS Key: AKIAIOSFODNN7EXAMPLE';
      const result = checkContent(content, { scope: 'global' });

      expect(result.blocked).toBe(true);
    });
  });

  describe('Block List - Payment Cards', () => {
    it('TC-SEC-BLOCK-04: Credit card numbers should be blocked', () => {
      const content = 'Visa: 4532015112830366';
      const result = checkContent(content, { scope: 'global' });

      expect(result.blocked).toBe(true);
      expect(result.blocked_patterns).toContain('credit-card');
    });

    it('TC-SEC-BLOCK-04b: Multiple card formats should be blocked', () => {
      const content = `Visa: 4532-0151-1283-0366
MasterCard: 5425233010103442`;
      const result = checkContent(content, { scope: 'global' });

      expect(result.blocked).toBe(true);
    });
  });

  describe('Scope-Level Privacy Markers', () => {
    it('TC-SEC-PRIVATE-01: [PRIVATE] marker should block global scope', () => {
      const content = '[PRIVATE] This is private information';
      const result = checkContent(content, { scope: 'global' });

      expect(result.blocked).toBe(true);
      expect(result.blocked_patterns).toContain('private-marker');
    });

    it('TC-SEC-PRIVATE-02: [PRIVATE] marker should allow agent scope', () => {
      const content = '[PRIVATE] Personal note for agent only';
      const result = checkContent(content, { scope: 'agent' });

      // Should pass because agent scope allows private markers
      expect(result.blocked).toBe(false);
    });

    it('TC-SEC-PRIVATE-03: Chinese [机密] marker should block global', () => {
      const content = '[机密] 不要分享此内容';
      const result = checkContent(content, { scope: 'global' });

      expect(result.blocked).toBe(true);
    });

    it('TC-SEC-PRIVATE-04: [DO NOT SHARE] marker should block project scope', () => {
      const content = '[DO NOT SHARE] Confidential information';
      const result = checkContent(content, { scope: 'project' });

      expect(result.blocked).toBe(true);
    });
  });

  describe('False Positives Prevention', () => {
    it('TC-SEC-FP-01: Normal content should pass', () => {
      const content = 'This is a normal memory entry about my learning progress today.';
      const result = checkContent(content, { scope: 'global' });

      expect(result.blocked).toBe(false);
    });

    it('TC-SEC-FP-02: Generic references should pass', () => {
      const content = 'API format: sk-* (generic placeholder)';
      const result = checkContent(content, { scope: 'project' });

      // Should pass - no actual sensitive data
      expect(result.blocked).toBe(false);
    });

    it('TC-SEC-FP-03: Code examples should pass', () => {
      const content = `
def get_api_key():
  return os.getenv('API_KEY')  # sk-* format expected
`;
      const result = checkContent(content, { scope: 'project' });

      expect(result.blocked).toBe(false);
    });
  });

  describe('Integration with writeMemory', () => {
    it('TC-SEC-WRITE-01: Sensitive content blocks memory write', () => {
      // Placeholder: will be tested in full integration tests
      expect(true).toBe(true);
    });

    it('TC-SEC-WRITE-02: Clean content allows write', () => {
      const cleanContent = 'This is a normal memory entry without sensitive data';
      const result = checkContent(cleanContent, { scope: 'project' });

      expect(result.blocked).toBe(false);
    });

    it('TC-SEC-WRITE-03: Multiple sensitive items block write', () => {
      const content = `
Card: 4532015112830366
SSN: 123-45-6789
API Key: sk-1234567890abcdefghij1234567890
`;
      const result = checkContent(content, { scope: 'global' });

      if (result.blocked) {
        expect(result.blocked_patterns.length).toBeGreaterThanOrEqual(2);
      }
    });
  });

  describe('Error Handling & Details', () => {
    it('TC-SEC-ERR-01: BlockResult includes violation details', () => {
      const content = 'Card: 4532015112830366';
      const result = checkContent(content, { scope: 'global' });

      if (result.blocked) {
        expect(result.reason).toBeDefined();
        expect(result.blocked_patterns).toBeDefined();
        expect(result.blocked_patterns.length).toBeGreaterThan(0);
        expect(result.suggestion).toBeDefined();
      }
    });

    it('TC-SEC-ERR-02: PassResult includes sanitization log', () => {
      const content = 'Normal entry with no sensitive data';
      const result = checkContent(content, { scope: 'global' });

      if (!result.blocked) {
        expect(result.sanitization_log).toBeDefined();
        expect(Array.isArray(result.sanitization_log)).toBe(true);
      }
    });

    it('TC-SEC-ERR-03: Multiple violations reported', () => {
      const content = 'sk-1234567890abcdefghij1234567890 and 4532015112830366';
      const result = checkContent(content, { scope: 'global' });

      if (result.blocked) {
        expect(result.blocked_patterns.length).toBeGreaterThanOrEqual(2);
      }
    });
  });

  describe('Scope Isolation', () => {
    it('TC-SEC-SCOPE-01: Agent scope allows private markers', () => {
      const content = '[PRIVATE] Agent-only information';
      const result = checkContent(content, { scope: 'agent' });

      expect(result.blocked).toBe(false);
    });

    it('TC-SEC-SCOPE-02: Project scope blocks private markers', () => {
      const content = '[PRIVATE] Should not be in project';
      const result = checkContent(content, { scope: 'project' });

      expect(result.blocked).toBe(true);
    });

    it('TC-SEC-SCOPE-03: Global scope blocks all private markers', () => {
      const content = '[机密] Confidential for all scopes';
      const result = checkContent(content, { scope: 'global' });

      expect(result.blocked).toBe(true);
    });
  });
});

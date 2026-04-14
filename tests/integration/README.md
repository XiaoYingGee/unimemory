# UniMemory Q7: Integration Test Suite

## Overview

Comprehensive integration tests for UniMemory P1 features:
- Q1-Q9 test scenarios covering all P1 task deliverables
- Cross-tool memory operations (Claude Code ↔ OpenClaw)
- Sensitive information filtering validation
- Concurrent conflict resolution
- Permission boundary enforcement

## Test Categories

### Q5: Sensitive Content Filtering (TC-SEC-BLOCK/SANITIZE)

Tests for the security filtering system (B5).

**Block List Scenarios:**
- API Keys (sk-xxx format)
- PII (SSN, ID numbers)
- Credentials (passwords, tokens)
- Payment card numbers

**Sanitize Scenarios:**
- Email masking
- Phone number masking
- Custom patterns

## Test Structure

```
tests/integration/
├── q7-integration-suite.test.ts      # Main test suite
├── fixtures/
│   ├── sensitive-data.fixtures.ts    # Test data sets
│   └── agents.fixtures.ts             # Mock agent contexts
└── utils/
    ├── mcp-client.mock.ts             # MCP protocol mock
    └── assertions.ts                  # Custom matchers
```

## Running Tests

```bash
# All integration tests
npm run test:integration

# Specific test suite
npm run test:integration -- q7-integration-suite

# With coverage
npm run test:integration:coverage
```

## Implementation Roadmap

- [ ] Q1: Conflict type classification (B1 dependency)
- [ ] Q2: Hot/cold tiered storage (B2 dependency)
- [ ] Q3: Memory consolidation (B3 dependency)
- [ ] Q4: Task scope isolation (B4 dependency)
- [x] Q5: Sensitive content filtering (B5 ready)
- [ ] Q6: Confidence score validation (B7 dependency)
- [ ] Q7: Cross-tool read/write (complete flow)
- [ ] Q8: Performance benchmarks
- [ ] Q9: Concurrent write + conflict resolution

## Notes

- Tests use mock MCP client to avoid network dependencies
- Sensitive data fixtures use real-world patterns but fake values
- Each test is independently runnable (no shared state)

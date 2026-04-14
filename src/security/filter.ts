/**
 * Sensitive Information Filter (B5)
 * 规范来源: docs/sensitive-info-policy.md (雪琪 v1.0)
 *
 * 职责：
 *  1. detect()  — 检测是否含禁止内容，返回命中的规则列表
 *  2. sanitize() — 脱敏可以脱敏的内容，返回脱敏后文本 + 操作日志
 *  3. check()   — 写入路径调用的总入口：先 block，再 sanitize
 */

import { BLOCK_PATTERNS, SANITIZE_PATTERNS } from './patterns';
import { WriteMemoryRequest } from '../memory/types';

export interface BlockResult {
  blocked: true;
  reason: string;
  blocked_patterns: string[];
  suggestion: string;
}

export interface PassResult {
  blocked: false;
  content: string;
  sanitized: boolean;
  sanitization_log: string[];
}

export type FilterResult = BlockResult | PassResult;

/**
 * 检测文本中是否包含禁止写入的敏感内容
 * 不记录原始内容（避免日志泄漏）
 */
export function detect(text: string): { matched: boolean; patterns: string[] } {
  const matched: string[] = [];
  for (const bp of BLOCK_PATTERNS) {
    if (bp.pattern.test(text)) {
      matched.push(bp.name);
    }
  }
  return { matched: matched.length > 0, patterns: matched };
}

/**
 * 对文本进行脱敏处理
 * 返回脱敏后的文本和操作日志
 */
export function sanitize(text: string): { content: string; log: string[] } {
  let result = text;
  const log: string[] = [];

  for (const sp of SANITIZE_PATTERNS) {
    // 重置 lastIndex（防止 global 正则状态污染）
    sp.pattern.lastIndex = 0;
    const before = result;
    result = result.replace(sp.pattern, sp.replacement as string);
    if (result !== before) {
      log.push(sp.description);
    }
  }

  return { content: result, log };
}

/**
 * 写入路径总入口（在 embedding 生成之前调用）
 *
 * 顺序：
 *  1. 检查 scope 级别的私密标记（[PRIVATE]/[机密]/[DO NOT SHARE]）
 *  2. 检测 block list → 如果命中，返回 BlockResult
 *  3. 脱敏处理 → 返回 PassResult（可能含脱敏日志）
 */
export function checkContent(
  content: string,
  req: Pick<WriteMemoryRequest, 'scope' | 'source_context'>
): FilterResult {
  // 1. 私密标记检查（[PRIVATE] 等不允许写入 global/project）
  const privateMarkers = /\[(PRIVATE|机密|DO NOT SHARE)\]/i;
  if (privateMarkers.test(content) || privateMarkers.test(req.source_context ?? '')) {
    if (req.scope === 'global' || req.scope === 'project') {
      return {
        blocked: true,
        reason: 'Content is marked as private but scope is not "agent"',
        blocked_patterns: ['private-marker'],
        suggestion: 'Use scope="agent" for private content, or remove the [PRIVATE] marker.',
      };
    }
  }

  // 2. Block list 检测
  const detection = detect(content);
  if (detection.matched) {
    return {
      blocked: true,
      reason: `Content contains sensitive pattern: ${detection.patterns.join(', ')}`,
      blocked_patterns: detection.patterns,
      suggestion: 'Remove sensitive credentials or personal information before writing to memory.',
    };
  }

  // 3. 脱敏处理
  const { content: sanitized, log } = sanitize(content);
  return {
    blocked: false,
    content: sanitized,
    sanitized: log.length > 0,
    sanitization_log: log,
  };
}

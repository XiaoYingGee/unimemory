'use client';

import { useEffect, useState } from 'react';
import { api, ProviderConfig } from '@/lib/api';

const PROVIDERS = [
  { value: 'openai', label: 'OpenAI', models: ['text-embedding-3-small', 'text-embedding-3-large', 'text-embedding-ada-002'] },
  { value: 'ollama', label: 'Ollama (本地)', models: ['nomic-embed-text', 'mxbai-embed-large', 'all-minilm'] },
  { value: 'compatible', label: 'OpenAI Compatible', models: [] },
];

export default function ProviderPage() {
  const [config, setConfig] = useState<ProviderConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getProvider().then(setConfig).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-12 text-gray-400">加载中…</div>;
  if (!config) return <div className="text-center py-12 text-gray-400">无法加载配置</div>;

  const currentProvider = PROVIDERS.find(p => p.value === config.provider) ?? PROVIDERS[0];

  return (
    <div className="max-w-2xl space-y-6">
      {/* 当前配置 */}
      <div className="bg-white border rounded-lg p-5">
        <h2 className="text-base font-semibold text-gray-900 mb-4">🔌 Embedding Provider 配置</h2>

        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b">
            <span className="text-sm text-gray-600">Provider</span>
            <span className="text-sm font-medium px-2.5 py-1 bg-blue-100 text-blue-800 rounded">
              {currentProvider.label}
            </span>
          </div>
          <div className="flex items-center justify-between py-2 border-b">
            <span className="text-sm text-gray-600">模型</span>
            <span className="text-sm font-mono text-gray-800">{config.model}</span>
          </div>
          {config.baseUrl && (
            <div className="flex items-center justify-between py-2 border-b">
              <span className="text-sm text-gray-600">Base URL</span>
              <span className="text-sm font-mono text-gray-500 truncate max-w-xs">{config.baseUrl}</span>
            </div>
          )}
        </div>

        <p className="mt-4 text-xs text-gray-400">
          Provider 配置通过环境变量设置，在 <code className="px-1 py-0.5 bg-gray-100 rounded">.env</code> 文件中修改后重启服务生效。
        </p>
      </div>

      {/* 热冷存储配置 */}
      <div className="bg-white border rounded-lg p-5">
        <h2 className="text-base font-semibold text-gray-900 mb-4">🌡️ 热冷存储配置</h2>

        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b">
            <div>
              <span className="text-sm text-gray-700">冷却天数</span>
              <p className="text-xs text-gray-400 mt-0.5">超过此天数未访问的记忆会进入冷存储</p>
            </div>
            <span className="text-sm font-semibold text-gray-900">{config.coldAfterDays} 天</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b">
            <div>
              <span className="text-sm text-gray-700">重要度豁免阈值</span>
              <p className="text-xs text-gray-400 mt-0.5">高于此重要度的记忆不会被冷却</p>
            </div>
            <span className="text-sm font-semibold text-gray-900">{config.importanceThreshold}</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <div>
              <span className="text-sm text-gray-700">免疫类型</span>
              <p className="text-xs text-gray-400 mt-0.5">这些类型的记忆永不冷却</p>
            </div>
            <div className="flex gap-1">
              <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded">preference</span>
              <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded">decision</span>
            </div>
          </div>
        </div>

        <p className="mt-4 text-xs text-gray-400">
          通过环境变量 <code className="px-1 py-0.5 bg-gray-100 rounded">UNIMEMORY_COLD_AFTER_DAYS</code> 和{' '}
          <code className="px-1 py-0.5 bg-gray-100 rounded">UNIMEMORY_IMPORTANCE_THRESHOLD</code> 修改。
        </p>
      </div>

      {/* 接入指南 */}
      <div className="bg-white border rounded-lg p-5">
        <h2 className="text-base font-semibold text-gray-900 mb-4">📋 快速接入</h2>
        <div className="space-y-3 text-sm text-gray-600">
          <div>
            <p className="font-medium text-gray-800 mb-1">Claude Code</p>
            <code className="block bg-gray-50 rounded p-2 text-xs font-mono">
              {'# 参考 .claude/mcp.json 配置文件'}
            </code>
          </div>
          <div>
            <p className="font-medium text-gray-800 mb-1">OpenClaw</p>
            <code className="block bg-gray-50 rounded p-2 text-xs font-mono">
              {'# MCP plugin: unimemory (stdio transport)'}
            </code>
          </div>
          <div>
            <p className="font-medium text-gray-800 mb-1">Codex</p>
            <code className="block bg-gray-50 rounded p-2 text-xs font-mono">
              {'# 参考 docs/codex-integration.md'}
            </code>
          </div>
        </div>
      </div>
    </div>
  );
}

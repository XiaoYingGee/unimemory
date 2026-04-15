'use client';

import { useEffect, useState, useCallback } from 'react';
import { api, ColdMemory } from '@/lib/api';

function getActivityDays(archivedAt: string): number {
  return Math.floor((Date.now() - new Date(archivedAt).getTime()) / (1000 * 86400));
}

const typeConfig: Record<string, string> = {
  preference: '偏好',
  decision: '决策',
  fact: '事实',
  context: '上下文',
  temp: '临时',
};

export default function ArchivePage() {
  const [memories, setMemories] = useState<ColdMemory[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<{ archived: number } | null>(null);
  const [agentId, setAgentId] = useState('');
  const [warmingUp, setWarmingUp] = useState<string | null>(null);

  const LIMIT = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listArchive({
        agent_id: agentId || undefined,
        page,
        limit: LIMIT,
      });
      setMemories(res.memories);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  }, [agentId, page]);

  useEffect(() => { load(); }, [load]);

  async function handleWarmUp(id: string) {
    setWarmingUp(id);
    try {
      await api.warmUp(id);
      load();
    } finally {
      setWarmingUp(null);
    }
  }

  async function handleRunArchive() {
    setRunning(true);
    setRunResult(null);
    try {
      const res = await api.runArchive();
      setRunResult(res);
      load();
    } finally {
      setRunning(false);
    }
  }

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="space-y-4">
      {/* 操作栏 */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <input
            className="h-9 rounded-md border px-3 text-sm w-40"
            placeholder="Agent ID 筛选"
            value={agentId}
            onChange={e => { setAgentId(e.target.value); setPage(1); }}
          />
          <span className="text-sm text-gray-500">
            共 <strong>{total}</strong> 条归档记忆
          </span>
        </div>
        <div className="flex items-center gap-2">
          {runResult && (
            <span className="text-sm text-green-700">
              ✅ 本次冷却 {runResult.archived} 条
            </span>
          )}
          <button
            className="px-4 py-2 bg-gray-800 text-white text-sm rounded-md hover:bg-gray-700 disabled:opacity-50 transition-colors"
            disabled={running}
            onClick={handleRunArchive}
          >
            {running ? '冷却中…' : '立即执行冷却'}
          </button>
        </div>
      </div>

      {/* 说明 */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
        📦 <strong>归档记忆</strong>：超过 30 天未访问的记忆会自动归入冷存储，不参与实时向量检索。
        点击「升温」可将记忆恢复到热存储，重新参与检索。
        <span className="ml-2">preference/decision 类型免疫冷却。</span>
      </div>

      {/* 列表 */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">加载中…</div>
      ) : memories.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-3xl mb-2">📭</p>
          <p>暂无归档记忆</p>
        </div>
      ) : (
        <div className="space-y-2">
          {memories.map(m => {
            const daysArchived = getActivityDays(m.archived_at);
            return (
              <div key={m.id} className="bg-white border border-gray-200 rounded-lg p-4 flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 truncate">{m.content}</p>
                  <div className="flex flex-wrap gap-3 mt-1 text-xs text-gray-500">
                    <span>类型: {typeConfig[m.memory_type] ?? m.memory_type}</span>
                    <span>重要度: {Math.round(m.importance_score * 100)}%</span>
                    <span>访问 {m.access_count} 次</span>
                    <span className="text-orange-600">📦 归档于 {daysArchived} 天前</span>
                    {m.last_accessed_at && (
                      <span>最后访问: {new Date(m.last_accessed_at).toLocaleDateString('zh-CN')}</span>
                    )}
                  </div>
                </div>
                <button
                  className="shrink-0 px-3 py-1.5 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 disabled:opacity-50 transition-colors"
                  disabled={warmingUp === m.id}
                  onClick={() => handleWarmUp(m.id)}
                >
                  {warmingUp === m.id ? '升温中…' : '🔥 升温'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          <button
            className="px-3 py-1 border rounded text-sm disabled:opacity-40 hover:bg-gray-100"
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
          >
            上一页
          </button>
          <span className="px-3 py-1 text-sm text-gray-600">{page} / {totalPages}</span>
          <button
            className="px-3 py-1 border rounded text-sm disabled:opacity-40 hover:bg-gray-100"
            disabled={page >= totalPages}
            onClick={() => setPage(p => p + 1)}
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}

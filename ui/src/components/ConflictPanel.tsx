'use client';

import { useState } from 'react';
import { ConflictGroup, api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface ConflictPanelProps {
  conflicts: ConflictGroup[];
  onResolved: () => void;
}

const conflictTypeConfig: Record<string, { label: string; className: string }> = {
  supersede: { label: '新取代旧', className: 'bg-blue-100 text-blue-800' },
  contradiction: { label: '真实矛盾', className: 'bg-red-100 text-red-800' },
  refinement: { label: '补充细化', className: 'bg-green-100 text-green-800' },
  potential: { label: '待分类', className: 'bg-gray-100 text-gray-700' },
};

export function ConflictPanel({ conflicts, onResolved }: ConflictPanelProps) {
  const [selected, setSelected] = useState<ConflictGroup | null>(null);
  const [loading, setLoading] = useState(false);

  async function resolve(resolution: 'keep_new' | 'keep_old' | 'keep_both', winnerMemoryId?: string) {
    if (!selected) return;
    setLoading(true);
    try {
      await api.resolveConflict({
        conflict_group_id: selected.conflict_group_id,
        resolution,
        winner_memory_id: winnerMemoryId,
      });
      setSelected(null);
      onResolved();
    } finally {
      setLoading(false);
    }
  }

  if (conflicts.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <p className="text-4xl mb-2">✅</p>
        <p>暂无冲突记忆</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {conflicts.map(conflict => (
          <div
            key={conflict.conflict_group_id}
            className="border border-yellow-300 bg-yellow-50 rounded-lg p-4 cursor-pointer hover:bg-yellow-100 transition-colors"
            onClick={() => setSelected(conflict)}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-yellow-800">
                ⚠️ 冲突组 · {conflict.memory_count} 条记忆
              </span>
              <span className="text-xs text-gray-500">
                {new Date(conflict.latest_at).toLocaleString('zh-CN')}
              </span>
            </div>
            <div className="space-y-1">
              {conflict.memories.slice(0, 2).map(m => (
                <p key={m.id} className="text-xs text-gray-700 truncate">
                  <span className="font-medium">{m.agent_id}：</span>{m.content}
                </p>
              ))}
              {conflict.memory_count > 2 && (
                <p className="text-xs text-gray-400">+ {conflict.memory_count - 2} 条更多…</p>
              )}
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>⚠️ 冲突仲裁</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="space-y-3">
                {selected.memories.map((m, i) => (
                  <div key={m.id} className="border rounded-lg p-3 bg-white">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-gray-600">#{i + 1}</span>
                      <span className="text-xs text-gray-500">{m.agent_id}</span>
                      {m.conflict_type && (
                        <Badge className={(conflictTypeConfig[m.conflict_type] ?? conflictTypeConfig.potential).className}>
                          {(conflictTypeConfig[m.conflict_type] ?? conflictTypeConfig.potential).label}
                        </Badge>
                      )}
                      <span className="text-xs text-gray-400 ml-auto">
                        {new Date(m.created_at).toLocaleString('zh-CN')}
                      </span>
                    </div>
                    <p className="text-sm text-gray-900">{m.content}</p>
                    <div className="mt-2">
                      <button
                        className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
                        disabled={loading}
                        onClick={() => resolve('keep_new', m.id)}
                      >
                        保留这条
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 pt-2 border-t">
                <button
                  className="flex-1 text-sm px-4 py-2 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50 transition-colors"
                  disabled={loading}
                  onClick={() => resolve('keep_both')}
                >
                  全部保留（标记已解决）
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

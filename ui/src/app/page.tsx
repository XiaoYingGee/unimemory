'use client';

import { useEffect, useState, useCallback } from 'react';
import { api, Memory, ConflictGroup, Stats } from '@/lib/api';
import { MemoryCard } from '@/components/MemoryCard';
import { ConflictPanel } from '@/components/ConflictPanel';
import ArchivePage from '@/components/ArchivePage';
import ProviderPage from '@/components/ProviderPage';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function Home() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [conflicts, setConflicts] = useState<ConflictGroup[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);

  const [scope, setScope] = useState('');
  const [status, setStatus] = useState('');
  const [agentId, setAgentId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const LIMIT = 20;

  const loadMemories = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listMemories({
        scope: scope || undefined,
        status: status || undefined,
        agent_id: agentId || undefined,
        page,
        limit: LIMIT,
      });
      setMemories(res.memories);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  }, [scope, status, agentId, page]);

  const loadConflicts = useCallback(async () => {
    const res = await api.listConflicts();
    setConflicts(res.conflicts);
  }, []);

  const loadStats = useCallback(async () => {
    const s = await api.getStats();
    setStats(s);
  }, []);

  useEffect(() => { loadMemories(); }, [loadMemories]);
  useEffect(() => { loadConflicts(); loadStats(); }, [loadConflicts, loadStats]);

  async function handleStatusChange(id: string, newStatus: Memory['status']) {
    await api.updateMemory(id, { status: newStatus });
    loadMemories();
    loadStats();
  }

  async function handleSearch() {
    if (!searchQuery.trim()) { loadMemories(); return; }
    setLoading(true);
    try {
      const res = await api.searchMemories(searchQuery, 'ui-user', {
        scope_filter: scope || undefined,
        include_archived: true,
      });
      setMemories(res.memories as Memory[]);
      setTotal(res.memories.length);
    } finally {
      setLoading(false);
    }
  }

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">🧠 UniMemory</h1>
            <p className="text-xs text-gray-500">AI Agent 统一记忆管理</p>
          </div>
          {stats && (
            <div className="flex gap-4 text-sm">
              <span className="text-green-700">活跃 <strong>{stats.active}</strong></span>
              <span className="text-yellow-700">冲突 <strong>{stats.disputed}</strong></span>
              <span className="text-gray-500">
                📦 热 <strong>{stats.hotCount}</strong> / 冷 <strong>{stats.coldCount}</strong>
                {stats.coldRatio > 0 && (
                  <span className="ml-1 text-orange-600">({Math.round(stats.coldRatio * 100)}% 归档)</span>
                )}
              </span>
            </div>
          )}
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-6">
        <Tabs defaultValue="memories">
          <TabsList className="mb-4">
            <TabsTrigger value="memories">
              记忆列表
              {total > 0 && <span className="ml-1 text-xs text-gray-500">({total})</span>}
            </TabsTrigger>
            <TabsTrigger value="conflicts">
              冲突仲裁
              {conflicts.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 bg-yellow-200 text-yellow-800 rounded text-xs">
                  {conflicts.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="archive">
              归档管理
              {stats && stats.coldCount > 0 && (
                <span className="ml-1 px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded text-xs">
                  {stats.coldCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="provider">Provider 配置</TabsTrigger>
          </TabsList>

          {/* ── 记忆列表 ── */}
          <TabsContent value="memories">
            <div className="flex flex-wrap gap-3 mb-4">
              <div className="flex gap-2 flex-1 min-w-[240px]">
                <Input
                  placeholder="语义搜索记忆…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                />
                <button
                  className="px-4 py-2 bg-gray-900 text-white rounded-md text-sm hover:bg-gray-700 transition-colors"
                  onClick={handleSearch}
                >
                  搜索
                </button>
              </div>

              <Select value={scope} onValueChange={(v: string | null) => { setScope(v === 'all' || !v ? '' : v); setPage(1); }}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Scope" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部 Scope</SelectItem>
                  <SelectItem value="global">🌍 全局</SelectItem>
                  <SelectItem value="project">📁 项目</SelectItem>
                  <SelectItem value="agent">🔒 私有</SelectItem>
                </SelectContent>
              </Select>

              <Select value={status} onValueChange={(v: string | null) => { setStatus(v === 'all' || !v ? '' : v); setPage(1); }}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value="active">活跃</SelectItem>
                  <SelectItem value="disputed">⚠️ 冲突</SelectItem>
                  <SelectItem value="archived">📦 归档</SelectItem>
                  <SelectItem value="superseded">已覆盖</SelectItem>
                </SelectContent>
              </Select>

              <Input
                placeholder="Agent ID"
                value={agentId}
                onChange={e => { setAgentId(e.target.value); setPage(1); }}
                className="w-36"
              />

              {(scope || status || agentId || searchQuery) && (
                <button
                  className="text-sm text-gray-500 hover:text-gray-700"
                  onClick={() => { setScope(''); setStatus(''); setAgentId(''); setSearchQuery(''); setPage(1); }}
                >
                  清除筛选
                </button>
              )}
            </div>

            {loading ? (
              <div className="text-center py-12 text-gray-400">加载中…</div>
            ) : memories.length === 0 ? (
              <div className="text-center py-12 text-gray-400">暂无记忆</div>
            ) : (
              <div className="space-y-3">
                {memories.map(m => (
                  <MemoryCard key={m.id} memory={m} onStatusChange={handleStatusChange} />
                ))}
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex justify-center gap-2 mt-6">
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
          </TabsContent>

          {/* ── 冲突仲裁 ── */}
          <TabsContent value="conflicts">
            <ConflictPanel
              conflicts={conflicts}
              onResolved={() => { loadConflicts(); loadMemories(); loadStats(); }}
            />
          </TabsContent>

          {/* ── 归档管理 (L4) ── */}
          <TabsContent value="archive">
            <ArchivePage />
          </TabsContent>

          {/* ── Provider 配置 (L5) ── */}
          <TabsContent value="provider">
            <ProviderPage />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}

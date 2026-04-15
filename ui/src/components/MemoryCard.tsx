import { Memory } from '@/lib/api';
import { Badge } from '@/components/ui/badge';

const scopeConfig = {
  global: { label: '🌍 全局', className: 'bg-blue-100 text-blue-800' },
  project: { label: '📁 项目', className: 'bg-green-100 text-green-800' },
  agent: { label: '🔒 私有', className: 'bg-gray-100 text-gray-700' },
};

const statusConfig = {
  active: { label: '活跃', className: 'bg-green-100 text-green-800' },
  disputed: { label: '⚠️ 冲突', className: 'bg-yellow-100 text-yellow-800' },
  archived: { label: '📦 已归档', className: 'bg-gray-100 text-gray-600' },
  superseded: { label: '已覆盖', className: 'bg-red-100 text-red-700' },
};

const typeConfig: Record<string, string> = {
  preference: '偏好',
  decision: '决策',
  fact: '事实',
  context: '上下文',
  temp: '临时',
};

const sourceConfig = {
  confirmed: { label: '🟢 确认', className: 'text-green-700' },
  inferred: { label: '🟡 推断', className: 'text-yellow-700' },
  uncertain: { label: '🔴 不确定', className: 'text-red-700' },
};

function getActivityStatus(memory: Memory): { label: string; className: string } {
  if (memory.status === 'archived') return { label: '📦 已归档', className: 'text-gray-500' };
  if (!memory.last_accessed_at) return { label: '🟢 活跃', className: 'text-green-600' };
  const days = (Date.now() - new Date(memory.last_accessed_at).getTime()) / (1000 * 86400);
  if (days < 7) return { label: '🟢 活跃', className: 'text-green-600' };
  if (days < 30) return { label: '🟡 冷却中', className: 'text-yellow-600' };
  return { label: '🔴 即将归档', className: 'text-red-600' };
}

interface MemoryCardProps {
  memory: Memory;
  onStatusChange?: (id: string, status: Memory['status']) => void;
}

export function MemoryCard({ memory, onStatusChange }: MemoryCardProps) {
  const scope = scopeConfig[memory.scope];
  const status = statusConfig[memory.status];
  const activity = getActivityStatus(memory);

  return (
    <div className={`rounded-lg border p-4 space-y-2 ${memory.status === 'disputed' ? 'border-yellow-300 bg-yellow-50' : 'bg-white'}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-gray-900 flex-1">{memory.content}</p>
        <div className="flex gap-1 shrink-0">
          <Badge className={scope.className}>{scope.label}</Badge>
          <Badge className={status.className}>{status.label}</Badge>
        </div>
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-gray-500">
        <span>Agent: <span className="font-medium text-gray-700">{memory.agent_id}</span></span>
        <span>类型: {typeConfig[memory.memory_type] ?? memory.memory_type}</span>
        <span className={sourceConfig[memory.source_type].className}>
          {sourceConfig[memory.source_type].label}
        </span>
        <span>置信度: {Math.round(memory.confidence * 100)}%</span>
        <span className={activity.className}>{activity.label}</span>
      </div>
      {memory.entity_tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {memory.entity_tags.map(tag => (
            <span key={tag} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">#{tag}</span>
          ))}
        </div>
      )}
      {memory.project_id && (
        <p className="text-xs text-gray-400">项目: {memory.project_id}</p>
      )}
      <div className="flex items-center justify-between pt-1">
        <span className="text-xs text-gray-400">
          {new Date(memory.created_at).toLocaleString('zh-CN')}
        </span>
        {memory.status === 'active' && onStatusChange && (
          <button
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            onClick={() => onStatusChange(memory.id, 'archived')}
          >
            归档
          </button>
        )}
      </div>
    </div>
  );
}

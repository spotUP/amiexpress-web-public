import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { History, User, Calendar } from 'lucide-react';
import { apiClient } from '../api/client';
import type { ConfigAuditLog } from '../types';

export function AuditLogPage() {
  const [tableName, setTableName] = useState<string>('');
  const [limit, setLimit] = useState<number>(50);

  const { data, isLoading } = useQuery({
    queryKey: ['auditLog', tableName, limit],
    queryFn: () => apiClient.getAuditLog(tableName || undefined, undefined, limit),
  });

  if (isLoading) {
    return <div className="text-bbs-text">Loading audit log...</div>;
  }

  const logs = data?.data || [];

  return (
    <div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Filter by Table</label>
            <select
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
              className="input-field w-full"
            >
              <option value="">All Tables</option>
              <option value="system_config">System Config</option>
              <option value="node_config">Node Config</option>
              <option value="conference_config">Conference Config</option>
              <option value="doors">Doors</option>
              <option value="languages">Languages</option>
              <option value="protocols">Protocols</option>
            </select>
          </div>

          <div>
            <label className="label">Limit Results</label>
            <select
              value={limit}
              onChange={(e) => setLimit(parseInt(e.target.value))}
              className="input-field w-full"
            >
              <option value="25">25 entries</option>
              <option value="50">50 entries</option>
              <option value="100">100 entries</option>
              <option value="500">500 entries</option>
            </select>
          </div>
        </div>
      </div>

      {/* Log Entries */}
      <div className="space-y-4">
        {logs.map((log: ConfigAuditLog) => (
          <div key={log.id} className="card">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-start space-x-3">
                <div className="p-2 bg-bbs-primary rounded">
                  <History className="text-accent" size={20} />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-lg font-semibold text-bbs-text">
                      {log.table_name.replace('_', ' ').toUpperCase()}
                    </h3>
                    <span
                      className={`px-2 py-1 rounded text-xs ${
                        log.action === 'CREATE'
                          ? 'bg-status-ok/20 text-status-ok'
                          : log.action === 'UPDATE'
                          ? 'bg-accent/20 text-status-info'
                          : 'bg-status-danger/20 text-status-danger'
                      }`}
                    >
                      {log.action}
                    </span>
                  </div>
                  <div className="flex items-center space-x-4 mt-1 text-xs text-bbs-muted">
                    <div className="flex items-center space-x-1">
                      <User size={12} />
                      <span>{log.username}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Calendar size={12} />
                      <span>{new Date(log.timestamp).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="text-xs text-bbs-muted font-mono">
                Record #{log.record_id}
              </div>
            </div>

            {log.action === 'UPDATE' && log.old_values && log.new_values && (
              <div className="mt-4 p-4 bg-bbs-bg rounded">
                <h4 className="text-sm font-semibold text-bbs-text mb-2">Changes:</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div>
                    <div className="text-bbs-muted mb-1">Old Values:</div>
                    <pre className="text-bbs-text bg-bbs-surface p-2 rounded overflow-x-auto">
                      {JSON.stringify(log.old_values, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <div className="text-bbs-muted mb-1">New Values:</div>
                    <pre className="text-bbs-text bg-bbs-surface p-2 rounded overflow-x-auto">
                      {JSON.stringify(log.new_values, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-3 pt-3 border-t border-bbs-primary text-xs text-bbs-muted">
              <span>IP: {log.ip_address}</span>
              <span className="mx-2">|</span>
              <span>User Agent: {log.user_agent}</span>
            </div>
          </div>
        ))}
      </div>

      {logs.length === 0 && (
        <div className="card text-center text-bbs-muted">
          No audit log entries found. Configuration changes will appear here.
        </div>
      )}
    </div>
  );
}

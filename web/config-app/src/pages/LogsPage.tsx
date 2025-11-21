import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Search, Trash2, Download, Terminal, Filter, Info, ExternalLink } from 'lucide-react';
import { apiClient } from '../api/client';
import { useNotification } from '../contexts/NotificationContext';

type LogType = 'backend' | 'frontend' | 'error' | 'access';
type Environment = 'local' | 'render' | 'railway' | 'fly' | 'heroku' | 'vercel';

interface LogData {
  lines: string[];
  totalLines: number;
  displayedLines: number;
  logType: string;
  searchTerm?: string;
  message?: string;
  environment?: Environment;
}

export function LogsPage() {
  const queryClient = useQueryClient();
  const { showSuccess, showError, confirm } = useNotification();
  const [logType, setLogType] = useState<LogType>('backend');
  const [lineCount, setLineCount] = useState(500);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['logs', logType, lineCount, searchTerm],
    queryFn: () => apiClient.getLogs(logType, lineCount, searchTerm),
    refetchInterval: autoRefresh ? 3000 : false,
  });

  const clearMutation = useMutation({
    mutationFn: (type: string) => apiClient.clearLogs(type),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['logs'] });
      showSuccess(`${logType} log cleared successfully`);
    },
    onError: (error: Error) => {
      showError(`Failed to clear log: ${error.message}`);
    },
  });

  const logData = data?.data as LogData | undefined;

  const handleClearLog = async () => {
    const confirmed = await confirm({
      title: 'Clear Log File?',
      message: `Are you sure you want to clear the ${logType} log file? This action cannot be undone.`,
      confirmText: 'Clear Log',
      cancelText: 'Cancel',
      type: 'danger',
    });

    if (confirmed) {
      clearMutation.mutate(logType);
    }
  };

  const handleSearch = () => {
    setSearchTerm(searchInput);
  };

const handleDownload = () => {
    if (!logData?.lines) return;

    const content = logData.lines.reverse().join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${logType}-${new Date().toISOString().slice(0, 10)}.log`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showSuccess(`Downloaded ${logType} log file`);
  };

  const getLogLevelColor = (line: string): string => {
    const lower = line.toLowerCase();
    if (lower.includes('error') || lower.includes('[error]')) {
      return 'text-red-400';
    }
    if (lower.includes('warn') || lower.includes('[warn]')) {
      return 'text-yellow-400';
    }
    if (lower.includes('info') || lower.includes('[info]')) {
      return 'text-blue-400';
    }
    if (lower.includes('debug') || lower.includes('[debug]')) {
      return 'text-gray-400';
    }
    if (lower.includes('success') || lower.includes('[ok]')) {
      return 'text-green-400';
    }
    return 'text-bbs-text';
  };

  const highlightSearch = (line: string): JSX.Element => {
    if (!searchTerm) {
      return <span className={getLogLevelColor(line)}>{line}</span>;
    }

    const parts = line.split(new RegExp(`(${searchTerm})`, 'gi'));
    return (
      <span className={getLogLevelColor(line)}>
        {parts.map((part, i) =>
          part.toLowerCase() === searchTerm.toLowerCase() ? (
            <mark key={i} className="bg-yellow-500/30 text-yellow-200">
              {part}
            </mark>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </span>
    );
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-bbs-accent mb-2">System Logs</h1>
        <p className="text-bbs-muted">View and manage BBS system logs</p>
      </div>

      {/* Platform Info Banner */}
      {logData?.environment && logData.environment !== 'local' && (
        <div className="card mb-4 bg-blue-500/10 border-blue-500/30">
          <div className="flex items-start gap-3">
            <Info size={20} className="text-blue-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-blue-400 mb-2">
                Platform: {logData.environment.charAt(0).toUpperCase() + logData.environment.slice(1)}
              </h3>
              <p className="text-xs text-bbs-muted mb-3">
                File-based logs are not available on this platform. All application output is captured by the platform and available through their logging system.
              </p>
              <div className="flex gap-2">
                {logData.environment === 'render' && (
                  <a
                    href="https://dashboard.render.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 underline"
                  >
                    Open Render Dashboard <ExternalLink size={12} />
                  </a>
                )}
                {logData.environment === 'railway' && (
                  <a
                    href="https://railway.app"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 underline"
                  >
                    Open Railway Dashboard <ExternalLink size={12} />
                  </a>
                )}
                {logData.environment === 'fly' && (
                  <a
                    href="https://fly.io/dashboard"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 underline"
                  >
                    Open Fly.io Dashboard <ExternalLink size={12} />
                  </a>
                )}
                {logData.environment === 'heroku' && (
                  <a
                    href="https://dashboard.heroku.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 underline"
                  >
                    Open Heroku Dashboard <ExternalLink size={12} />
                  </a>
                )}
                {logData.environment === 'vercel' && (
                  <a
                    href="https://vercel.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 underline"
                  >
                    Open Vercel Dashboard <ExternalLink size={12} />
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="card mb-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          {/* Log Type */}
          <div>
            <label className="label">Log Type</label>
            <select
              value={logType}
              onChange={(e) => setLogType(e.target.value as LogType)}
              className="input-field w-full"
            >
              <option value="backend">Backend</option>
              <option value="frontend">Frontend</option>
              <option value="error">Error</option>
              <option value="access">Access</option>
            </select>
          </div>

          {/* Line Count */}
          <div>
            <label className="label">Lines to Display</label>
            <select
              value={lineCount}
              onChange={(e) => setLineCount(parseInt(e.target.value))}
              className="input-field w-full"
            >
              <option value="100">Last 100</option>
              <option value="500">Last 500</option>
              <option value="1000">Last 1000</option>
              <option value="2500">Last 2500</option>
              <option value="5000">Last 5000</option>
            </select>
          </div>

          {/* Search */}
          <div className="md:col-span-2">
            <label className="label">Search</label>
            <div className="flex space-x-2">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Search logs..."
                className="input-field flex-1"
              />
              <button
                onClick={handleSearch}
                className="btn-primary flex items-center space-x-2"
              >
                <Search size={18} />
                <span>Search</span>
              </button>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="btn-primary flex items-center space-x-2"
          >
            <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>

          <button
            onClick={handleDownload}
            disabled={!logData?.lines?.length}
            className="px-4 py-2 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-600/40 text-blue-400 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            <Download size={18} />
            <span>Download</span>
          </button>

          <button
            onClick={handleClearLog}
            disabled={clearMutation.isPending || !logData?.lines?.length}
            className="px-4 py-2 bg-red-600/20 hover:bg-red-600/30 border border-red-600/40 text-red-400 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            <Trash2 size={18} />
            <span>Clear Log</span>
          </button>

          <label className="flex items-center space-x-2 px-4 py-2 bg-bbs-primary border border-bbs-border rounded cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm text-bbs-text">Auto-refresh (3s)</span>
          </label>
        </div>
      </div>

      {/* Log Stats */}
      <div className="card mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4 text-sm">
            <div className="flex items-center space-x-2">
              <Terminal size={16} className="text-bbs-accent" />
              <span className="text-bbs-muted">Log Type:</span>
              <span className="text-bbs-text font-semibold uppercase">{logType}</span>
            </div>
            <div className="flex items-center space-x-2">
              <Filter size={16} className="text-bbs-accent" />
              <span className="text-bbs-muted">Total Lines:</span>
              <span className="text-bbs-text font-semibold">
                {logData?.totalLines?.toLocaleString() || 0}
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-bbs-muted">Displayed:</span>
              <span className="text-bbs-text font-semibold">
                {logData?.displayedLines?.toLocaleString() || 0}
              </span>
            </div>
          </div>
          {searchTerm && (
            <div className="flex items-center space-x-2 text-sm">
              <span className="text-bbs-muted">Filtered by:</span>
              <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded">
                {searchTerm}
              </span>
              <button
                onClick={() => {
                  setSearchTerm('');
                  setSearchInput('');
                }}
                className="text-bbs-muted hover:text-bbs-text"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Log Content */}
      <div className="card flex-1 overflow-hidden flex flex-col">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-bbs-muted">Loading logs...</div>
          </div>
        ) : logData?.message ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center max-w-2xl px-4">
              <Terminal size={48} className="text-bbs-muted mx-auto mb-4" />
              <pre className="text-sm text-bbs-muted whitespace-pre-wrap text-left bg-bbs-bg p-4 rounded border border-bbs-border">
                {logData.message}
              </pre>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-auto bg-bbs-bg p-4 rounded font-mono text-xs">
            {logData?.lines && logData.lines.length > 0 ? (
              <div className="space-y-1">
                {logData.lines.map((line, index) => (
                  <div key={index} className="hover:bg-bbs-primary/30 px-2 py-1 rounded">
                    <span className="text-bbs-muted mr-3 select-none">
                      {(logData.displayedLines - index).toString().padStart(4, '0')}
                    </span>
                    {highlightSearch(line)}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-bbs-muted py-8">No log entries found</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

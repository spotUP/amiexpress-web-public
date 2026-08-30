import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Search, Trash2, Download, Terminal, Filter, Info, ExternalLink } from 'lucide-react';
import { apiClient } from '../api/client';
import { useNotification } from '../contexts/NotificationContext';

type LogType = 'backend' | 'frontend' | 'error' | 'access' | 'door68k';
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

interface DoorLogFile {
  file: string;
  label: string;
  size: number;
  modifiedAt: string | null;
}

export function LogsPage() {
  const queryClient = useQueryClient();
  const { showSuccess, showError, confirm } = useNotification();
  const [logType, setLogType] = useState<LogType>('backend');
  const [lineCount, setLineCount] = useState(500);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [doorLog, setDoorLog] = useState('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['logs', logType, lineCount, searchTerm, doorLog],
    queryFn: () => apiClient.getLogs(logType, lineCount, searchTerm, logType === 'door68k' ? doorLog : undefined),
    refetchInterval: autoRefresh ? 3000 : false,
  });

  const { data: doorLogsData } = useQuery({
    queryKey: ['door-logs'],
    queryFn: () => apiClient.getDoorLogFiles(),
    enabled: logType === 'door68k',
    refetchInterval: logType === 'door68k' && autoRefresh ? 5000 : false,
  });

  const clearMutation = useMutation({
    mutationFn: (params: { type: string; doorLog?: string }) => apiClient.clearLogs(params.type, params.doorLog),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['logs'] });
      showSuccess(`${logType} log cleared successfully`);
    },
    onError: (error: Error) => {
      showError(`Failed to clear log: ${error.message}`);
    },
  });

  const logData = data?.data as LogData | undefined;
  // Memoised because an effect below depends on it: a fresh [] every render
  // would re-run that effect on every render.
  const doorLogs = useMemo(
    () => (doorLogsData?.data?.files || []) as DoorLogFile[],
    [doorLogsData]
  );

  useEffect(() => {
    if (logType !== 'door68k') {
      return;
    }
    if (doorLogs.length === 0) {
      if (doorLog) {
        setDoorLog('');
      }
      return;
    }
    if (!doorLog || !doorLogs.some((log) => log.file === doorLog)) {
      setDoorLog(doorLogs[0].file);
    }
  }, [logType, doorLogs, doorLog]);

  const handleClearLog = async () => {
    if (logType === 'door68k' && !doorLog) {
      showError('No 68K door log selected');
      return;
    }

    const confirmed = await confirm({
      title: 'Clear Log File?',
      message: `Are you sure you want to clear the ${logType} log file? This action cannot be undone.`,
      confirmText: 'Clear Log',
      cancelText: 'Cancel',
      type: 'danger',
    });

    if (confirmed) {
      clearMutation.mutate({
        type: logType,
        doorLog: logType === 'door68k' ? doorLog : undefined
      });
    }
  };

  const handleSearch = () => {
    setSearchTerm(searchInput);
  };

  const handleDownload = () => {
    if (!logData?.lines) return;

    const content = logData.lines.reverse().join('\n');
    const baseName = logType === 'door68k' && doorLog
      ? doorLog.replace(/\.log$/, '')
      : logType;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${baseName}-${new Date().toISOString().slice(0, 10)}.log`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showSuccess(`Downloaded ${logType} log file`);
  };

  const getLogLevelColor = (line: string): string => {
    const lower = line.toLowerCase();
    if (lower.includes('error') || lower.includes('[error]')) {
      return 'text-status-danger';
    }
    if (lower.includes('warn') || lower.includes('[warn]')) {
      return 'text-status-warn';
    }
    if (lower.includes('info') || lower.includes('[info]')) {
      return 'text-status-info';
    }
    if (lower.includes('debug') || lower.includes('[debug]')) {
      return 'text-content-secondary';
    }
    if (lower.includes('success') || lower.includes('[ok]')) {
      return 'text-status-ok';
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
            <mark key={i} className="bg-status-warn/30 text-status-warn">
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

      {/* Platform Info Banner */}
      {logData?.environment && logData.environment !== 'local' && (
        <div className="card mb-4 bg-accent/10 border-accent/30">
          <div className="flex items-start gap-3">
            <Info size={20} className="text-status-info mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-status-info mb-2">
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
                    className="inline-flex items-center gap-1 text-xs text-status-info hover:text-accent-hover underline"
                  >
                    Open Render Dashboard <ExternalLink size={12} />
                  </a>
                )}
                {logData.environment === 'railway' && (
                  <a
                    href="https://railway.app"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-status-info hover:text-accent-hover underline"
                  >
                    Open Railway Dashboard <ExternalLink size={12} />
                  </a>
                )}
                {logData.environment === 'fly' && (
                  <a
                    href="https://fly.io/dashboard"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-status-info hover:text-accent-hover underline"
                  >
                    Open Fly.io Dashboard <ExternalLink size={12} />
                  </a>
                )}
                {logData.environment === 'heroku' && (
                  <a
                    href="https://dashboard.heroku.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-status-info hover:text-accent-hover underline"
                  >
                    Open Heroku Dashboard <ExternalLink size={12} />
                  </a>
                )}
                {logData.environment === 'vercel' && (
                  <a
                    href="https://vercel.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-status-info hover:text-accent-hover underline"
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
              <option value="door68k">68K Doors</option>
            </select>
          </div>

          {logType === 'door68k' && (
            <div>
              <label className="label">68K Door Log</label>
              <select
                value={doorLog}
                onChange={(e) => setDoorLog(e.target.value)}
                className="input-field w-full"
                disabled={doorLogs.length === 0}
              >
                {doorLogs.length === 0 ? (
                  <option value="">No 68K door logs found</option>
                ) : (
                  doorLogs.map((log) => (
                    <option key={log.file} value={log.file}>
                      {log.label}
                    </option>
                  ))
                )}
              </select>
            </div>
          )}

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
            className="px-4 py-2 bg-accent/20 hover:bg-accent/30 border border-accent/40 text-status-info rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            <Download size={18} />
            <span>Download</span>
          </button>

          <button
            onClick={handleClearLog}
            disabled={clearMutation.isPending || !logData?.lines?.length}
            className="px-4 py-2 bg-status-danger/20 hover:bg-status-danger/30 border border-status-danger/40 text-status-danger rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
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
              <Terminal size={16} className="text-accent" />
              <span className="text-bbs-muted">Log Type:</span>
              <span className="text-bbs-text font-semibold uppercase">{logType}</span>
            </div>
            {logType === 'door68k' && doorLog && (
              <div className="flex items-center space-x-2">
                <span className="text-bbs-muted">Log File:</span>
                <span className="text-bbs-text font-semibold">{doorLog}</span>
              </div>
            )}
            <div className="flex items-center space-x-2">
              <Filter size={16} className="text-accent" />
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
              <span className="px-2 py-1 bg-status-warn/20 text-status-warn rounded">
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

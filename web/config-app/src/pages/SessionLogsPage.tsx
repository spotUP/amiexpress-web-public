import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Copy, Save, Eye, Users, Activity, Clock } from 'lucide-react';
import { apiClient } from '../api/client';
import { useNotification } from '../contexts/NotificationContext';
import type { SessionInfo } from '../types';
import { SessionLogTerminal } from '../components/SessionLogTerminal';

export function SessionLogsPage() {
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useNotification();
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Fetch active sessions
  const { data: sessionsData, isLoading: sessionsLoading } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => apiClient.getSessions(),
    refetchInterval: autoRefresh ? 5000 : false,
  });

  // Fetch session log
  const { data: logData, isLoading: logLoading } = useQuery({
    queryKey: ['session-log', selectedSessionId],
    queryFn: () => selectedSessionId ? apiClient.getSessionLog(selectedSessionId) : null,
    enabled: !!selectedSessionId,
    refetchInterval: autoRefresh ? 5000 : false,
  });

  // Fetch stats
  const { data: statsData } = useQuery({
    queryKey: ['session-stats'],
    queryFn: () => apiClient.getSessionStats(),
    refetchInterval: autoRefresh ? 10000 : false,
  });

  const saveToFileMutation = useMutation({
    mutationFn: (sessionId: string) => apiClient.saveSessionLog(sessionId),
    onSuccess: (response) => {
      const filePath = (response.data as any)?.filePath;
      if (filePath) {
        navigator.clipboard.writeText(filePath);
        showSuccess(`Log saved to: ${filePath}\nFile path copied to clipboard!`);
      } else {
        showSuccess('Log saved successfully');
      }
    },
    onError: (error: Error) => {
      showError(`Failed to save log: ${error.message}`);
    },
  });

  const handleCopyLog = async () => {
    if (!selectedSessionId) return;

    try {
      const logContent = await apiClient.getSessionLogRaw(selectedSessionId);
      await navigator.clipboard.writeText(logContent);
      showSuccess('Log content copied to clipboard (with ANSI codes preserved)');
    } catch (error) {
      showError(`Failed to copy log: ${(error as Error).message}`);
    }
  };

  const handleSaveToFile = () => {
    if (selectedSessionId) {
      saveToFileMutation.mutate(selectedSessionId);
    }
  };

  const sessions = (sessionsData as any)?.sessions || [];
  const stats = (statsData as any)?.stats;
  const sessionLog = (logData as any)?.log;

  // Auto-select most recent session on page load
  useEffect(() => {
    if (sessions.length > 0 && !selectedSessionId) {
      // Find the session with the most recent activity
      const mostRecent = sessions.reduce((latest: SessionInfo, current: SessionInfo) => {
        const latestTime = new Date(latest.lastActivity).getTime();
        const currentTime = new Date(current.lastActivity).getTime();
        return currentTime > latestTime ? current : latest;
      }, sessions[0]);

      setSelectedSessionId(mostRecent.sessionId);
    }
  }, [sessions, selectedSessionId]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-bbs-text">Session Logs</h1>
          <p className="text-bbs-muted mt-1">Real-time BBS session terminal output viewer</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-4 py-2 rounded flex items-center gap-2 ${
              autoRefresh
                ? 'bg-green-600 text-white hover:bg-green-700'
                : 'bg-bbs-surface text-bbs-text hover:bg-bbs-hover'
            }`}
          >
            <RefreshCw className={`w-4 h-4 ${autoRefresh ? 'animate-spin' : ''}`} />
            {autoRefresh ? 'Auto-Refresh On' : 'Auto-Refresh Off'}
          </button>
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ['sessions'] })}
            className="px-4 py-2 bg-bbs-surface text-bbs-text rounded hover:bg-bbs-hover flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-bbs-surface p-4 rounded-lg border border-bbs-border">
            <div className="flex items-center gap-2 text-bbs-muted mb-1">
              <Users className="w-4 h-4" />
              <span className="text-sm">Total Sessions</span>
            </div>
            <div className="text-2xl font-bold text-bbs-text">{stats.totalSessions}</div>
          </div>
          <div className="bg-bbs-surface p-4 rounded-lg border border-bbs-border">
            <div className="flex items-center gap-2 text-bbs-muted mb-1">
              <Activity className="w-4 h-4" />
              <span className="text-sm">Total Log Lines</span>
            </div>
            <div className="text-2xl font-bold text-bbs-text">{stats.totalLines.toLocaleString()}</div>
          </div>
          <div className="bg-bbs-surface p-4 rounded-lg border border-bbs-border">
            <div className="flex items-center gap-2 text-bbs-muted mb-1">
              <Clock className="w-4 h-4" />
              <span className="text-sm">Oldest Session</span>
            </div>
            <div className="text-sm font-mono text-bbs-text">
              {stats.oldestSession ? new Date(stats.oldestSession).toLocaleString() : 'N/A'}
            </div>
          </div>
        </div>
      )}

      {/* Active Sessions Grid */}
      <div>
        <h2 className="text-xl font-semibold text-bbs-text mb-3">Active Sessions</h2>
        <p className="text-bbs-muted text-sm mb-3">Click on a session to view its terminal output</p>
        {sessionsLoading ? (
          <div className="text-bbs-muted">Loading sessions...</div>
        ) : sessions.length === 0 ? (
          <div className="bg-bbs-surface p-8 rounded-lg border border-bbs-border text-center text-bbs-muted">
            No active sessions
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sessions.map((session: SessionInfo) => (
              <button
                key={session.sessionId}
                onClick={() => setSelectedSessionId(session.sessionId)}
                className={`bg-bbs-surface p-4 rounded-lg border text-left transition-all cursor-pointer ${
                  selectedSessionId === session.sessionId
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-bbs-border hover:border-bbs-text/30 hover:shadow-lg'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Eye className="w-4 h-4 text-bbs-accent" />
                  <h3 className="font-semibold text-bbs-text">
                    {session.username || 'Guest'}
                  </h3>
                </div>
                <div className="space-y-1 text-sm text-bbs-muted">
                  <div>Node: {session.nodeId || 'N/A'}</div>
                  <div>Started: {new Date(session.startTime).toLocaleTimeString()}</div>
                  <div>Last Activity: {new Date(session.lastActivity).toLocaleTimeString()}</div>
                  <div>Log Lines: {session.lineCount}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Session Log Viewer */}
      {selectedSessionId && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-semibold text-bbs-text">
              Session Log: {sessionLog?.username || 'Loading...'}
            </h2>
            <div className="flex gap-2">
              <button
                onClick={handleCopyLog}
                className="px-3 py-2 bg-bbs-surface text-bbs-text rounded hover:bg-bbs-hover flex items-center gap-2"
              >
                <Copy className="w-4 h-4" />
                Copy Log Content
              </button>
              <button
                onClick={handleSaveToFile}
                disabled={saveToFileMutation.isPending}
                className="px-3 py-2 bg-bbs-surface text-bbs-text rounded hover:bg-bbs-hover flex items-center gap-2 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {saveToFileMutation.isPending ? 'Saving...' : 'Save to File (Get Path)'}
              </button>
            </div>
          </div>

          {logLoading ? (
            <div className="bg-bbs-surface p-8 rounded-lg border border-bbs-border text-center text-bbs-muted">
              Loading log...
            </div>
          ) : sessionLog ? (
            <div className="border border-bbs-border rounded-lg overflow-hidden" style={{ height: '600px' }}>
              <SessionLogTerminal content={sessionLog.output} />
            </div>
          ) : (
            <div className="bg-bbs-surface p-8 rounded-lg border border-bbs-border text-center text-bbs-muted">
              Session log not found
            </div>
          )}
        </div>
      )}

      {/* Help Text */}
      <div className="bg-blue-500/10 border border-blue-500/30 p-4 rounded-lg">
        <h3 className="font-semibold text-blue-400 mb-2">About Session Logs</h3>
        <ul className="text-sm text-bbs-muted space-y-1">
          <li>• Session logs capture all terminal output including door launches, screen displays, and MCI codes</li>
          <li>• Keypresses are shown with visual markers like [ENTER], [BACKSPACE], etc.</li>
          <li>• ANSI codes are preserved when copying for debugging rendering issues</li>
          <li>• Logs are kept for 1 hour after disconnect, max 5000 lines per session</li>
          <li>• Use "Save to File" to save the log and get a file path to share with Claude</li>
        </ul>
      </div>
    </div>
  );
}

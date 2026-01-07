import { useQuery } from '@tanstack/react-query';
import { Activity, Users, FileUp, FileDown, Clock, Database } from 'lucide-react';
import { apiClient } from '../api/client';

/**
 * Statistics Dashboard Page
 * Real-time BBS activity monitoring based on ACP.e stats display
 *
 * Features:
 * - Last Callers list (recent logins)
 * - Last Downloads list (recent file downloads)
 * - Last Uploads list (recent file uploads)
 * - System Statistics (all-time totals)
 * - Session Statistics (current session activity)
 *
 * Auto-refreshes every 10 seconds for real-time updates
 *
 * Reference: ACP.e lines 1501-1533 (LAST_CALLERS, LAST_DOWNLOADS, LAST_UPLOADS, SYSTEM_STATS, SESSION_STATS)
 */

interface Caller {
  id: number;
  nodeId: number;
  userId: string;
  username: string;
  action: string;
  details: string;
  location: string;
  phone: string;
  timestamp: string;
}

interface FileActivity {
  id: number;
  filename: string;
  description: string;
  size: number;
  uploader: string;
  uploadDate: string;
  downloadCount: number;
  areaId: number;
  areaName: string;
}

interface SystemStats {
  allTime: {
    totalUsers: number;
    totalMessages: number;
    totalFiles: number;
    totalBytes: number;
    totalDownloads: number;
    totalCalls: number;
  };
  today: {
    calls: number;
    activeUsers: number;
  };
}

interface ActiveUser {
  sessionId: string;
  userId: string;
  username: string;
  location: string;
  currentConference: number;
  lastActivity: string;
  timeRemaining: number;
}

interface SessionStats {
  sessionStartTime: string;
  uptime: number;
  activeSessions: number;
  activeUsers: ActiveUser[];
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  timestamp: string;
}

export function StatisticsPage() {
  // Fetch statistics with auto-refresh every 10 seconds
  const { data: callers, isLoading: callersLoading } = useQuery({
    queryKey: ['stats', 'last-callers'],
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<Caller[]>>('/api/stats/last-callers?limit=10');
      return response.data;
    },
    refetchInterval: 10000, // Auto-refresh every 10 seconds
  });

  const { data: downloads, isLoading: downloadsLoading } = useQuery({
    queryKey: ['stats', 'last-downloads'],
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<FileActivity[]>>('/api/stats/last-downloads?limit=10');
      return response.data;
    },
    refetchInterval: 10000,
  });

  const { data: uploads, isLoading: uploadsLoading } = useQuery({
    queryKey: ['stats', 'last-uploads'],
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<FileActivity[]>>('/api/stats/last-uploads?limit=10');
      return response.data;
    },
    refetchInterval: 10000,
  });

  const { data: systemStats, isLoading: systemStatsLoading } = useQuery({
    queryKey: ['stats', 'system'],
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<SystemStats>>('/api/stats/system');
      return response.data;
    },
    refetchInterval: 10000,
  });

  const { data: sessionStats, isLoading: sessionStatsLoading } = useQuery({
    queryKey: ['stats', 'session'],
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<SessionStats>>('/api/stats/session');
      return response.data;
    },
    refetchInterval: 10000,
  });

  const callersList: Caller[] = callers?.data || [];
  const downloadsList: FileActivity[] = downloads?.data || [];
  const uploadsList: FileActivity[] = uploads?.data || [];
  const systemData: SystemStats | null = systemStats?.data || null;
  const sessionData: SessionStats | null = sessionStats?.data || null;

  // Format bytes to human-readable size
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(2)} ${units[unitIndex]}`;
  };

  // Format uptime in seconds to human-readable format
  const formatUptime = (seconds: number): string => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);

    return parts.join(' ');
  };

  // Format timestamp to local time
  const formatTime = (timestamp: string): string => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Activity className="w-6 h-6" />
          Statistics Dashboard
        </h1>
        <div className="text-sm text-gray-500">
          Auto-refreshes every 10 seconds
        </div>
      </div>

      {/* System Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Total Users */}
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-500">Total Users</div>
              <div className="text-2xl font-bold">
                {systemStatsLoading ? '-' : systemData?.allTime.totalUsers.toLocaleString()}
              </div>
            </div>
            <Users className="w-8 h-8 text-blue-500" />
          </div>
        </div>

        {/* Total Messages */}
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-500">Total Messages</div>
              <div className="text-2xl font-bold">
                {systemStatsLoading ? '-' : systemData?.allTime.totalMessages.toLocaleString()}
              </div>
            </div>
            <Database className="w-8 h-8 text-green-500" />
          </div>
        </div>

        {/* Total Files */}
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-500">Total Files</div>
              <div className="text-2xl font-bold">
                {systemStatsLoading ? '-' : systemData?.allTime.totalFiles.toLocaleString()}
              </div>
              <div className="text-xs text-gray-400">
                {systemStatsLoading ? '' : formatBytes(systemData?.allTime.totalBytes || 0)}
              </div>
            </div>
            <FileDown className="w-8 h-8 text-purple-500" />
          </div>
        </div>

        {/* Total Calls */}
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-500">Total Calls</div>
              <div className="text-2xl font-bold">
                {systemStatsLoading ? '-' : systemData?.allTime.totalCalls.toLocaleString()}
              </div>
              <div className="text-xs text-gray-400">
                {systemStatsLoading ? '' : `${systemData?.today.calls || 0} today`}
              </div>
            </div>
            <Activity className="w-8 h-8 text-orange-500" />
          </div>
        </div>
      </div>

      {/* Session Statistics Card */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5" />
          Current Session
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <div className="text-sm text-gray-500">Session Uptime</div>
            <div className="text-xl font-bold">
              {sessionStatsLoading ? '-' : formatUptime(sessionData?.uptime || 0)}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Active Sessions</div>
            <div className="text-xl font-bold">
              {sessionStatsLoading ? '-' : sessionData?.activeSessions}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Active Users</div>
            <div className="text-xl font-bold">
              {sessionStatsLoading ? '-' : sessionData?.activeUsers.length}
            </div>
          </div>
        </div>

        {/* Active Users List */}
        {sessionData && sessionData.activeUsers.length > 0 && (
          <div className="mt-4">
            <div className="text-sm font-semibold text-gray-700 mb-2">Active Users:</div>
            <div className="space-y-2">
              {sessionData.activeUsers.map((user) => (
                <div key={user.sessionId} className="flex items-center justify-between text-sm p-2 bg-gray-50 rounded">
                  <div>
                    <span className="font-medium">{user.username}</span>
                    <span className="text-gray-500 ml-2">({user.location})</span>
                  </div>
                  <div className="text-gray-600">
                    Conference {user.currentConference} • {user.timeRemaining}m left
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Activity Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Last Callers */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="p-4 bg-gray-50 border-b">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Users className="w-5 h-5" />
              Last Callers
            </h2>
          </div>
          <div className="divide-y max-h-96 overflow-y-auto">
            {callersLoading ? (
              <div className="p-4 text-center text-gray-500">Loading...</div>
            ) : callersList.length === 0 ? (
              <div className="p-4 text-center text-gray-500">No recent activity</div>
            ) : (
              callersList.map((caller) => (
                <div key={caller.id} className="p-3 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{caller.username}</div>
                      <div className="text-xs text-gray-500">
                        Node {caller.nodeId} • {caller.action}
                      </div>
                    </div>
                    <div className="text-xs text-gray-400">
                      {formatTime(caller.timestamp)}
                    </div>
                  </div>
                  <div className="text-xs text-gray-600 mt-1">
                    {caller.location}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Last Downloads */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="p-4 bg-gray-50 border-b">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <FileDown className="w-5 h-5" />
              Last Downloads
            </h2>
          </div>
          <div className="divide-y max-h-96 overflow-y-auto">
            {downloadsLoading ? (
              <div className="p-4 text-center text-gray-500">Loading...</div>
            ) : downloadsList.length === 0 ? (
              <div className="p-4 text-center text-gray-500">No recent downloads</div>
            ) : (
              downloadsList.map((file) => (
                <div key={file.id} className="p-3 hover:bg-gray-50">
                  <div className="font-medium text-sm truncate">{file.filename}</div>
                  <div className="text-xs text-gray-500 mt-1">{file.description}</div>
                  <div className="flex items-center justify-between mt-2 text-xs">
                    <span className="text-gray-600">
                      {formatBytes(file.size)} • {file.downloadCount} downloads
                    </span>
                    <span className="text-gray-400">{file.areaName}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Last Uploads */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="p-4 bg-gray-50 border-b">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <FileUp className="w-5 h-5" />
              Last Uploads
            </h2>
          </div>
          <div className="divide-y max-h-96 overflow-y-auto">
            {uploadsLoading ? (
              <div className="p-4 text-center text-gray-500">Loading...</div>
            ) : uploadsList.length === 0 ? (
              <div className="p-4 text-center text-gray-500">No recent uploads</div>
            ) : (
              uploadsList.map((file) => (
                <div key={file.id} className="p-3 hover:bg-gray-50">
                  <div className="font-medium text-sm truncate">{file.filename}</div>
                  <div className="text-xs text-gray-500 mt-1">{file.description}</div>
                  <div className="flex items-center justify-between mt-2 text-xs">
                    <span className="text-gray-600">
                      {formatBytes(file.size)} • by {file.uploader}
                    </span>
                    <span className="text-gray-400">{file.areaName}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

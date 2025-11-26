import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  Database,
  Server,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Info,
  HardDrive,
  Users,
  MessageSquare
} from 'lucide-react';
import { apiClient } from '../api/client';

interface HealthCheck {
  status: 'ok' | 'warning' | 'error';
  message: string;
  details?: any;
}

interface HealthStatus {
  timestamp: string;
  overall: 'healthy' | 'degraded' | 'unhealthy';
  checks: {
    environment: HealthCheck;
    database: HealthCheck;
    fileSystem: HealthCheck;
    dependencies: HealthCheck;
    ports: HealthCheck;
  };
}

interface SystemInfo {
  node: {
    version: string;
    platform: string;
    arch: string;
  };
  memory: {
    total: number;
    free: number;
    used: number;
  };
  uptime: number;
  env: {
    nodeEnv: string;
    bbsName: string;
    sysopName: string;
    databaseDir: string;
  };
  ports: {
    backend: string | number;
    frontend: string | number;
    telnet: string | number;
    ssh: string | number;
  };
}

interface DatabaseStats {
  exists: boolean;
  path: string;
  size?: number;
  sizeFormatted?: string;
  modified?: string;
  users?: number;
  conferences?: number;
  error?: string;
}

export function DeploymentPage() {
  const [activeTab, setActiveTab] = useState<'health' | 'system' | 'database'>('health');

  const healthQuery = useQuery({
    queryKey: ['deployment-health'],
    queryFn: () => apiClient.getDeploymentHealth() as Promise<HealthStatus>,
  });

  const systemInfoQuery = useQuery({
    queryKey: ['deployment-system-info'],
    queryFn: () => apiClient.getDeploymentSystemInfo() as Promise<SystemInfo>,
  });

  const databaseStatsQuery = useQuery({
    queryKey: ['deployment-database-stats'],
    queryFn: () => apiClient.getDeploymentDatabaseStats() as Promise<DatabaseStats>,
  });

  const formatUptime = (seconds: number): string => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ok':
      case 'healthy':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'warning':
      case 'degraded':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case 'error':
      case 'unhealthy':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Info className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ok':
      case 'healthy':
        return 'text-green-500';
      case 'warning':
      case 'degraded':
        return 'text-yellow-500';
      case 'error':
      case 'unhealthy':
        return 'text-red-500';
      default:
        return 'text-gray-500';
    }
  };

  const renderHealthTab = () => {
    const healthStatus = healthQuery.data;
    if (!healthStatus) {
      return <div className="text-center py-8 text-bbs-muted">{healthQuery.isLoading ? 'Loading health status...' : 'No data available'}</div>;
    }

    return (
      <div className="space-y-6">
        {/* Overall Status */}
        <div className="bg-bbs-surface border border-bbs-primary rounded p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {getStatusIcon(healthStatus.overall)}
              <div>
                <h3 className="text-lg font-semibold">Overall System Health</h3>
                <p className={`text-sm ${getStatusColor(healthStatus.overall)}`}>
                  {healthStatus.overall.charAt(0).toUpperCase() + healthStatus.overall.slice(1)}
                </p>
              </div>
            </div>
            <button
              onClick={() => healthQuery.refetch()}
              className="flex items-center space-x-2 px-4 py-2 bg-bbs-primary hover:bg-bbs-primary/80 rounded transition-colors"
              disabled={healthQuery.isFetching}
            >
              <RefreshCw className={`w-4 h-4 ${healthQuery.isFetching ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
          <p className="text-sm text-bbs-muted mt-2">
            Last checked: {new Date(healthStatus.timestamp).toLocaleString()}
          </p>
        </div>

        {/* Individual Checks */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.entries(healthStatus.checks).map(([key, check]) => (
            <div key={key} className="bg-bbs-surface border border-bbs-primary rounded p-4">
              <div className="flex items-start space-x-3">
                {getStatusIcon(check.status)}
                <div className="flex-1">
                  <h4 className="font-semibold capitalize">{key.replace(/([A-Z])/g, ' $1')}</h4>
                  <p className="text-sm text-bbs-muted mt-1">{check.message}</p>
                  {check.details && (
                    <details className="mt-2">
                      <summary className="text-xs text-bbs-accent cursor-pointer">View Details</summary>
                      <pre className="mt-2 text-xs bg-bbs-bg p-2 rounded overflow-auto">
                        {JSON.stringify(check.details, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderSystemTab = () => {
    const systemInfo = systemInfoQuery.data;
    if (!systemInfo) {
      return <div className="text-center py-8 text-bbs-muted">{systemInfoQuery.isLoading ? 'Loading system information...' : 'No data available'}</div>;
    }

    return (
      <div className="space-y-6">
        {/* Node.js Information */}
        <div className="bg-bbs-surface border border-bbs-primary rounded p-6">
          <div className="flex items-center space-x-3 mb-4">
            <Server className="w-5 h-5 text-bbs-accent" />
            <h3 className="text-lg font-semibold">Node.js Runtime</h3>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-bbs-muted">Version:</span>
              <span className="ml-2 text-bbs-text">{systemInfo.node.version}</span>
            </div>
            <div>
              <span className="text-bbs-muted">Platform:</span>
              <span className="ml-2 text-bbs-text">{systemInfo.node.platform}</span>
            </div>
            <div>
              <span className="text-bbs-muted">Architecture:</span>
              <span className="ml-2 text-bbs-text">{systemInfo.node.arch}</span>
            </div>
            <div>
              <span className="text-bbs-muted">Uptime:</span>
              <span className="ml-2 text-bbs-text">{formatUptime(systemInfo.uptime)}</span>
            </div>
          </div>
        </div>

        {/* Memory Information */}
        <div className="bg-bbs-surface border border-bbs-primary rounded p-6">
          <div className="flex items-center space-x-3 mb-4">
            <HardDrive className="w-5 h-5 text-bbs-accent" />
            <h3 className="text-lg font-semibold">Memory Usage</h3>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-bbs-muted">Total:</span>
              <span className="text-bbs-text">{systemInfo.memory.total} MB</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-bbs-muted">Used:</span>
              <span className="text-bbs-text">{systemInfo.memory.used} MB</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-bbs-muted">Free:</span>
              <span className="text-bbs-text">{systemInfo.memory.free} MB</span>
            </div>
            <div className="w-full bg-bbs-bg rounded-full h-2">
              <div
                className="bg-bbs-accent h-2 rounded-full"
                style={{ width: `${(systemInfo.memory.used / systemInfo.memory.total) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* BBS Configuration */}
        <div className="bg-bbs-surface border border-bbs-primary rounded p-6">
          <div className="flex items-center space-x-3 mb-4">
            <Activity className="w-5 h-5 text-bbs-accent" />
            <h3 className="text-lg font-semibold">BBS Configuration</h3>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-bbs-muted">BBS Name:</span>
              <span className="text-bbs-text">{systemInfo.env.bbsName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-bbs-muted">Sysop:</span>
              <span className="text-bbs-text">{systemInfo.env.sysopName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-bbs-muted">Environment:</span>
              <span className="text-bbs-text">{systemInfo.env.nodeEnv}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-bbs-muted">Database Dir:</span>
              <span className="text-bbs-text font-mono text-xs">{systemInfo.env.databaseDir}</span>
            </div>
          </div>
        </div>

        {/* Ports Configuration */}
        <div className="bg-bbs-surface border border-bbs-primary rounded p-6">
          <div className="flex items-center space-x-3 mb-4">
            <Server className="w-5 h-5 text-bbs-accent" />
            <h3 className="text-lg font-semibold">Network Ports</h3>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex justify-between">
              <span className="text-bbs-muted">Backend:</span>
              <span className="text-bbs-text">{systemInfo.ports.backend}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-bbs-muted">Frontend:</span>
              <span className="text-bbs-text">{systemInfo.ports.frontend}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-bbs-muted">Telnet:</span>
              <span className="text-bbs-text">{systemInfo.ports.telnet}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-bbs-muted">SSH:</span>
              <span className="text-bbs-text">{systemInfo.ports.ssh}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderDatabaseTab = () => {
    const databaseStats = databaseStatsQuery.data;
    if (!databaseStats) {
      return <div className="text-center py-8 text-bbs-muted">{databaseStatsQuery.isLoading ? 'Loading database statistics...' : 'No data available'}</div>;
    }

    if (!databaseStats.exists) {
      return (
        <div className="bg-bbs-surface border border-red-500 rounded p-6">
          <div className="flex items-center space-x-3">
            <XCircle className="w-6 h-6 text-red-500" />
            <div>
              <h3 className="text-lg font-semibold">Database Not Found</h3>
              <p className="text-sm text-bbs-muted mt-1">{databaseStats.error}</p>
              <p className="text-xs text-bbs-muted mt-2 font-mono">{databaseStats.path}</p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* Database Overview */}
        <div className="bg-bbs-surface border border-bbs-primary rounded p-6">
          <div className="flex items-center space-x-3 mb-4">
            <Database className="w-5 h-5 text-bbs-accent" />
            <h3 className="text-lg font-semibold">Database Overview</h3>
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-bbs-muted">Status:</span>
              <span className="flex items-center space-x-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span className="text-green-500">Connected</span>
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-bbs-muted">Path:</span>
              <span className="text-bbs-text font-mono text-xs">{databaseStats.path}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-bbs-muted">Size:</span>
              <span className="text-bbs-text">{databaseStats.sizeFormatted}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-bbs-muted">Last Modified:</span>
              <span className="text-bbs-text">
                {databaseStats.modified ? new Date(databaseStats.modified).toLocaleString() : 'Unknown'}
              </span>
            </div>
          </div>
        </div>

        {/* Database Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-bbs-surface border border-bbs-primary rounded p-6">
            <div className="flex items-center space-x-3 mb-2">
              <Users className="w-5 h-5 text-bbs-accent" />
              <h4 className="font-semibold">Users</h4>
            </div>
            <p className="text-3xl font-bold text-bbs-accent">{databaseStats.users || 0}</p>
            <p className="text-xs text-bbs-muted mt-1">Total registered users</p>
          </div>

          <div className="bg-bbs-surface border border-bbs-primary rounded p-6">
            <div className="flex items-center space-x-3 mb-2">
              <MessageSquare className="w-5 h-5 text-bbs-accent" />
              <h4 className="font-semibold">Conferences</h4>
            </div>
            <p className="text-3xl font-bold text-bbs-accent">{databaseStats.conferences || 0}</p>
            <p className="text-xs text-bbs-muted mt-1">Active conferences</p>
          </div>
        </div>

        {/* Database Actions */}
        <div className="bg-bbs-surface border border-bbs-primary rounded p-6">
          <h4 className="font-semibold mb-4">Database Operations</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <button className="flex items-center justify-center space-x-2 px-4 py-3 bg-bbs-primary hover:bg-bbs-primary/80 rounded transition-colors">
              <RefreshCw className="w-4 h-4" />
              <span>Backup Database</span>
            </button>
            <button className="flex items-center justify-center space-x-2 px-4 py-3 bg-bbs-primary hover:bg-bbs-primary/80 rounded transition-colors">
              <Database className="w-4 h-4" />
              <span>Optimize</span>
            </button>
            <button className="flex items-center justify-center space-x-2 px-4 py-3 bg-bbs-primary hover:bg-bbs-primary/80 rounded transition-colors">
              <Activity className="w-4 h-4" />
              <span>Run Tests</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  const error = (healthQuery.error as Error)?.message || (systemInfoQuery.error as Error)?.message || (databaseStatsQuery.error as Error)?.message;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Deployment & Health</h1>
          <p className="text-sm text-bbs-muted mt-1">
            Monitor system health and manage deployment
          </p>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-500/10 border border-red-500 rounded p-4">
          <div className="flex items-center space-x-2">
            <XCircle className="w-5 h-5 text-red-500" />
            <span className="text-red-500">{error}</span>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex space-x-2 border-b border-bbs-primary">
        <button
          onClick={() => setActiveTab('health')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'health'
              ? 'text-bbs-accent border-b-2 border-bbs-accent'
              : 'text-bbs-muted hover:text-bbs-text'
          }`}
        >
          Health Check
        </button>
        <button
          onClick={() => setActiveTab('system')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'system'
              ? 'text-bbs-accent border-b-2 border-bbs-accent'
              : 'text-bbs-muted hover:text-bbs-text'
          }`}
        >
          System Info
        </button>
        <button
          onClick={() => setActiveTab('database')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'database'
              ? 'text-bbs-accent border-b-2 border-bbs-accent'
              : 'text-bbs-muted hover:text-bbs-text'
          }`}
        >
          Database
        </button>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'health' && renderHealthTab()}
        {activeTab === 'system' && renderSystemTab()}
        {activeTab === 'database' && renderDatabaseTab()}
      </div>
    </div>
  );
}

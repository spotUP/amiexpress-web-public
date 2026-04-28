import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { getDeploymentHealth, getDeploymentSystemInfo, getDeploymentDatabaseStats } from '../../api/client.js';

interface HealthData {
  success?: boolean;
  data?: unknown;
  [k: string]: unknown;
}

interface SystemInfoData {
  data?: unknown;
  [k: string]: unknown;
}

interface DbStatsData {
  data?: unknown;
  [k: string]: unknown;
}

export function DeploymentPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [systemInfo, setSystemInfo] = useState<SystemInfoData | null>(null);
  const [dbStats, setDbStats] = useState<DbStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [h, s, d] = await Promise.all([
        getDeploymentHealth(),
        getDeploymentSystemInfo(),
        getDeploymentDatabaseStats(),
      ]);
      setHealth(h ?? null);
      setSystemInfo(s ?? null);
      setDbStats(d ?? null);
      setError(null);
      setLastRefresh(new Date());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  useInput((input) => {
    if (input === 'r') load();
  });

  if (loading && !health) return <Box><Text color="yellow"><Spinner type="dots" /></Text><Text> Loading deployment info...</Text></Box>;
  if (error) return <Text color="red">Error: {error}</Text>;

  const healthData = health?.data as any;
  const sysData = systemInfo?.data as any;
  const dbData = dbStats?.data as any;

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">DEPLOYMENT</Text>
        <Text dimColor>  (auto-refresh 30s)</Text>
      </Box>

      {/* Health */}
      <Box marginBottom={1}>
        <Text bold color="cyan">HEALTH</Text>
      </Box>
      <Box marginLeft={2} marginBottom={2}>
        <Text>
          {healthData?.status === 'healthy' || health?.success ? (
            <Text color="green">● healthy</Text>
          ) : (
            <Text color="red">● unhealthy</Text>
          )}
        </Text>
        {healthData?.uptime && <Text dimColor>  uptime {healthData.uptime}</Text>}
      </Box>

      {/* System Info */}
      <Box marginBottom={1}>
        <Text bold color="cyan">SYSTEM INFO</Text>
      </Box>
      <Box marginLeft={2} marginBottom={2} flexDirection="column">
        {sysData?.hostname && (
          <Box>
            <Text>Hostname</Text>
            <Text dimColor>{' '.repeat(16 - 'Hostname'.length)}</Text>
            <Text>{sysData.hostname}</Text>
          </Box>
        )}
        {sysData?.nodeVersion && (
          <Box>
            <Text>Node.js</Text>
            <Text dimColor>{' '.repeat(16 - 'Node.js'.length)}</Text>
            <Text>{sysData.nodeVersion}</Text>
          </Box>
        )}
        {sysData?.memory && (
          <Box>
            <Text>Memory</Text>
            <Text dimColor>{' '.repeat(16 - 'Memory'.length)}</Text>
            <Text>{sysData.memory}</Text>
          </Box>
        )}
        {sysData?.cpu && (
          <Box>
            <Text>CPU</Text>
            <Text dimColor>{' '.repeat(16 - 'CPU'.length)}</Text>
            <Text>{sysData.cpu}</Text>
          </Box>
        )}
        {sysData?.uptime && (
          <Box>
            <Text>Uptime</Text>
            <Text dimColor>{' '.repeat(16 - 'Uptime'.length)}</Text>
            <Text>{sysData.uptime}</Text>
          </Box>
        )}
      </Box>

      {/* Database Stats */}
      <Box marginBottom={1}>
        <Text bold color="cyan">DATABASE</Text>
      </Box>
      <Box marginLeft={2} flexDirection="column">
        {dbData?.users !== undefined && (
          <Box>
            <Text>Users</Text>
            <Text dimColor>{' '.repeat(16 - 'Users'.length)}</Text>
            <Text>{dbData.users} rows</Text>
          </Box>
        )}
        {dbData?.messages !== undefined && (
          <Box>
            <Text>Messages</Text>
            <Text dimColor>{' '.repeat(16 - 'Messages'.length)}</Text>
            <Text>{dbData.messages} rows</Text>
          </Box>
        )}
        {dbData?.files !== undefined && (
          <Box>
            <Text>Files</Text>
            <Text dimColor>{' '.repeat(16 - 'Files'.length)}</Text>
            <Text>{dbData.files} rows</Text>
          </Box>
        )}
        {dbData?.size && (
          <Box>
            <Text>DB Size</Text>
            <Text dimColor>{' '.repeat(16 - 'DB Size'.length)}</Text>
            <Text>{dbData.size}</Text>
          </Box>
        )}
      </Box>

      {lastRefresh && (
        <Box marginTop={2}>
          <Text dimColor>Last refresh: {lastRefresh.toLocaleTimeString()}</Text>
        </Box>
      )}
    </Box>
  );
}

import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { getSystemStats } from '../../api/client.js';
import { T } from '../../theme/blessed-theme.js';
import type { SystemStats } from '../../api/types.js';

function fmt(n: number | undefined): string {
  if (n === undefined || n === null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtBytes(b: number | undefined): string {
  if (!b) return '—';
  if (b >= 1_073_741_824) return `${(b / 1_073_741_824).toFixed(1)} GB`;
  if (b >= 1_048_576) return `${(b / 1_048_576).toFixed(1)} MB`;
  return `${(b / 1024).toFixed(0)} KB`;
}

export function StatisticsPage() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await getSystemStats();
      setStats(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  if (loading) {
    return <Box><Text color={T.warn}><Spinner type="dots" /></Text><Text> Loading statistics...</Text></Box>;
  }

  if (error) {
    return <Text color={T.alert}>Error: {error}</Text>;
  }

  if (!stats) return null;

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color={T.accent}>STATISTICS</Text>
        <Text dimColor>  (all-time + today)</Text>
      </Box>

      {/* All-time totals */}
      <Box flexDirection="column" marginBottom={1} paddingX={1} borderStyle="round" borderColor={T.accent}>
        <Text bold color={T.accent}>All-Time Totals</Text>
        <Box marginTop={1} flexDirection="column">
          <Box>
            <Text>  Total Users:     </Text>
            <Text color={T.ink}>{fmt(stats.allTime?.totalUsers)}</Text>
          </Box>
          <Box>
            <Text>  Total Messages:  </Text>
            <Text color={T.ink}>{fmt(stats.allTime?.totalMessages)}</Text>
          </Box>
          <Box>
            <Text>  Total Files:     </Text>
            <Text color={T.ink}>{fmt(stats.allTime?.totalFiles)}</Text>
          </Box>
          <Box>
            <Text>  Total Bytes:     </Text>
            <Text color={T.ink}>{fmtBytes(stats.allTime?.totalBytes)}</Text>
          </Box>
          <Box>
            <Text>  Total Downloads: </Text>
            <Text color={T.ink}>{fmt(stats.allTime?.totalDownloads)}</Text>
          </Box>
          <Box>
            <Text>  Total Calls:     </Text>
            <Text color={T.ink}>{fmt(stats.allTime?.totalCalls)}</Text>
          </Box>
        </Box>
      </Box>

      {/* Today */}
      <Box flexDirection="column" paddingX={1} borderStyle="round" borderColor={T.accent}>
        <Text bold color={T.accent}>Today</Text>
        <Box marginTop={1} flexDirection="column">
          <Box>
            <Text>  Calls Today:    </Text>
            <Text color={T.ink}>{fmt(stats.today?.calls)}</Text>
          </Box>
          <Box>
            <Text>  Active Users:   </Text>
            <Text color={T.ink}>{fmt(stats.today?.activeUsers)}</Text>
          </Box>
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>auto-refresh 30s</Text>
      </Box>
    </Box>
  );
}

import React, { useState, useEffect, useRef } from 'react';
import { Box, Text } from 'ink';
import Gradient from 'ink-gradient';
import BigText from 'ink-big-text';
import Spinner from 'ink-spinner';
import { useDashboardStats } from '../../hooks/useDashboardStats.js';
import { buildSparkline } from '../../utils/sparkline.js';

function useFlash(value: unknown): boolean {
  const [flash, setFlash] = useState(false);
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current !== value && prev.current !== undefined) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 800);
      return () => clearTimeout(t);
    }
    prev.current = value;
  }, [value]);
  return flash;
}

function StatCard({
  title,
  lines,
}: {
  title: string;
  lines: { label: string; value: string | number; flash?: boolean }[];
}) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={2} paddingY={0} minWidth={22}>
      <Text bold color="cyan">{title}</Text>
      {lines.map(({ label, value, flash }) => (
        <Box key={label}>
          <Text dimColor>{label.padEnd(12)}</Text>
          <Text color={flash ? 'yellow' : 'white'} bold={flash}>
            {String(value)}
          </Text>
        </Box>
      ))}
    </Box>
  );
}

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

export function DashboardTab() {
  const { stats, nodes, recentCallers, loading, error, lastUpdated } = useDashboardStats(10_000);

  const onlineCount = nodes.filter(n => n.online).length;
  const flashOnline = useFlash(onlineCount);
  const flashCalls = useFlash(stats?.today.calls);

  const sparkline = buildSparkline(recentCallers, 24);

  if (loading && !stats) {
    return (
      <Box flexDirection="column" alignItems="center" justifyContent="center" paddingY={4}>
        <Box>
          <Text color="yellow"><Spinner type="dots" /></Text>
          <Text dimColor> Loading dashboard...</Text>
        </Box>
      </Box>
    );
  }

  if (error) {
    return <Text color="red">Error: {error}</Text>;
  }

  return (
    <Box flexDirection="column" paddingX={1} paddingY={0}>
      {/* Banner */}
      <Box justifyContent="center" marginBottom={0}>
        <Gradient name="rainbow">
          <BigText text="SYSOP" font="tiny" />
        </Gradient>
      </Box>

      {/* Stat cards */}
      <Box gap={2} marginBottom={1} flexWrap="wrap">
        <StatCard
          title="LIVE"
          lines={[
            { label: 'Online', value: onlineCount, flash: flashOnline },
            { label: 'Nodes', value: nodes.length },
            { label: 'Active', value: stats?.today.activeUsers ?? '—' },
          ]}
        />
        <StatCard
          title="TODAY"
          lines={[
            { label: 'Calls', value: stats?.today.calls ?? '—', flash: flashCalls },
            { label: 'Active users', value: stats?.today.activeUsers ?? '—' },
          ]}
        />
        <StatCard
          title="ALL TIME"
          lines={[
            { label: 'Users', value: fmt(stats?.allTime.totalUsers) },
            { label: 'Messages', value: fmt(stats?.allTime.totalMessages) },
            { label: 'Files', value: fmt(stats?.allTime.totalFiles) },
            { label: 'Storage', value: fmtBytes(stats?.allTime.totalBytes) },
            { label: 'Downloads', value: fmt(stats?.allTime.totalDownloads) },
            { label: 'Total calls', value: fmt(stats?.allTime.totalCalls) },
          ]}
        />
      </Box>

      {/* Sparkline */}
      <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={1} marginBottom={1}>
        <Text bold color="cyan">CALLS — last 24h</Text>
        <Text color="green">{sparkline || '(no data)'}</Text>
        <Text dimColor>{'└' + '─'.repeat(24) + '┘  now →'}</Text>
      </Box>

      {/* Recent activity */}
      <Box flexDirection="column">
        <Text bold color="cyan" dimColor>RECENT CALLERS</Text>
        {recentCallers.slice(0, 5).map(c => (
          <Box key={c.id}>
            <Text color={c.action === 'Logged on' ? 'green' : 'gray'}>
              {c.action === 'Logged on' ? '→' : '←'}
            </Text>
            <Text> {c.username.padEnd(14)}</Text>
            <Text dimColor>{new Date(c.timestamp).toLocaleTimeString().slice(0, 8)}</Text>
          </Box>
        ))}
      </Box>

      {lastUpdated && (
        <Box marginTop={1}>
          <Text dimColor>Updated {lastUpdated.toLocaleTimeString()}</Text>
        </Box>
      )}
    </Box>
  );
}

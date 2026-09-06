import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useStdout } from 'ink';
import Gradient from 'ink-gradient';
import BigText from 'ink-big-text';
import { loadLogo, logoFits } from '../../theme/logo.js';
import Spinner from 'ink-spinner';
import { T } from '../../theme/blessed-theme.js';
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
    <Box flexDirection="column" borderStyle="round" borderColor={T.accent} paddingX={2} paddingY={0} minWidth={22}>
      <Text bold color={T.accent}>{title}</Text>
      {lines.map(({ label, value, flash }) => (
        <Box key={label}>
          <Text dimColor>{label.padEnd(12)}</Text>
          <Text color={flash ? T.warn : T.ink} bold={flash}>
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

  // Read once: the art is only drawn where it fits the pane whole.
  const { stdout } = useStdout();
  const [logo] = useState<string[]>(() => (logoFits(stdout?.columns) ? loadLogo() : []));

  if (loading && !stats) {
    return (
      <Box flexDirection="column" alignItems="center" justifyContent="center" paddingY={4}>
        <Box>
          <Text color={T.warn}><Spinner type="dots" /></Text>
          <Text dimColor> Loading dashboard...</Text>
        </Box>
      </Box>
    );
  }

  if (error) {
    return <Text color={T.alert}>Error: {error}</Text>;
  }

  return (
    <Box flexDirection="column" paddingX={1} paddingY={0}>
      {/* Banner: the board's own art where it fits whole, the rainbow
          wordmark on a pane too narrow to hold it. */}
      <Box justifyContent="center" marginBottom={0}>
        {logo.length > 0 ? (
          <Box flexDirection="column">
            {logo.map((line, i) => (
              <Text key={i} color={T.accent}>{line}</Text>
            ))}
          </Box>
        ) : (
          <Gradient name="rainbow">
            <BigText text="SYSOP" font="tiny" />
          </Gradient>
        )}
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
      <Box flexDirection="column" borderStyle="single" borderColor={T.accent} paddingX={1} marginBottom={1}>
        <Text bold color={T.accent}>CALLS — last 24h</Text>
        <Text color={T.ok}>{sparkline || '(no data)'}</Text>
        <Text dimColor>{'└' + '─'.repeat(24) + '┘  now →'}</Text>
      </Box>

      {/* Recent activity */}
      <Box flexDirection="column">
        <Text bold color={T.accent} dimColor>RECENT CALLERS</Text>
        {recentCallers.slice(0, 5).map(c => (
          <Box key={c.id}>
            <Text color={c.action === 'Logged on' ? T.ok : T.dim}>
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

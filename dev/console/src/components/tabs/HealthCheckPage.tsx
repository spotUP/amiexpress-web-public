import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { getHealthCheck, autoFixHealth, type HealthIssue } from '../../api/client.js';

interface HealthData {
  issues?: HealthIssue[];
  healthy?: boolean;
  [k: string]: unknown;
}

export function HealthCheckPage() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fixing, setFixing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getHealthCheck();
      setData(result ?? null);
      setError(null);
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

  const issues = data?.issues ?? [];
  const fixable = issues.filter(i => i.fixable);

  useInput((input) => {
    if (input === 'r') load();
    if (input === 'f' && fixable.length > 0 && !fixing) {
      setFixing(true);
      autoFixHealth()
        .then(res => {
          const fixed = res.data?.fixed ?? 0;
          setStatus(res.message ?? `Auto-fix complete (${fixed} issue${fixed === 1 ? '' : 's'} fixed)`);
          load();
        })
        .catch((e: Error) => setStatus(`Error: ${e.message}`))
        .finally(() => setFixing(false));
    }
  });

  if (loading && !data) return <Box><Text color="yellow"><Spinner type="dots" /></Text><Text> Running health check...</Text></Box>;
  if (error) return <Text color="red">Error: {error}</Text>;

  const sevColor = (sev?: string) =>
    sev === 'error' ? 'red' : sev === 'warning' ? 'yellow' : 'green';
  const sevSymbol = (sev?: string) =>
    sev === 'error' ? '✗' : sev === 'warning' ? '!' : '✓';

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color={data?.healthy ? 'green' : 'yellow'}>
          {data?.healthy ? '✓ HEALTHY' : 'ISSUES FOUND'}
        </Text>
        <Text dimColor>  ({issues.length} issue{issues.length === 1 ? '' : 's'}, {fixable.length} fixable, auto-refresh 30s)</Text>
      </Box>

      {issues.length === 0 && (
        <Text dimColor>No issues detected.</Text>
      )}

      {issues.map((issue, i) => (
        <Box key={i} flexDirection="column" marginBottom={1}>
          <Box>
            <Text color={sevColor(issue.severity)} bold>
              {sevSymbol(issue.severity)} {(issue.severity ?? 'info').toUpperCase()}
            </Text>
            {issue.category && <Text dimColor> [{issue.category}]</Text>}
            {issue.fixable && <Text color="cyan"> [fixable]</Text>}
          </Box>
          <Box marginLeft={2}>
            <Text>{issue.message}</Text>
          </Box>
          {issue.details && (
            <Box marginLeft={2}>
              <Text dimColor>{issue.details}</Text>
            </Box>
          )}
        </Box>
      ))}

      {fixing && (
        <Box marginTop={1}>
          <Text color="yellow"><Spinner type="dots" /></Text>
          <Text> Auto-fixing...</Text>
        </Box>
      )}

      {status && <Box marginTop={1}><Text color="green">{status}</Text></Box>}
    </Box>
  );
}

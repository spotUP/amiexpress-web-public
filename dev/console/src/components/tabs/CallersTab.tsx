import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { getLastCallers } from '../../api/client.js';
import type { CallerRecord } from '../../api/types.js';

export function CallersTab() {
  const [callers, setCallers] = useState<CallerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await getLastCallers(50);
        setCallers(data);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed');
      } finally {
        setLoading(false);
      }
    }
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  if (loading) return <Box><Text color="yellow"><Spinner type="dots" /></Text><Text> Loading...</Text></Box>;
  if (error) return <Text color="red">Error: {error}</Text>;

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">{'  USER'.padEnd(18)}{'NODE'.padEnd(6)}{'ACTION'.padEnd(12)}{'TIME'}</Text>
      </Box>
      {callers.map(c => (
        <Box key={c.id}>
          <Text>{'  '}</Text>
          <Text color="white">{c.username.padEnd(16)}</Text>
          <Text dimColor>{String(c.nodeId ?? '?').padEnd(6)}</Text>
          <Text dimColor>{(c.action ?? '—').padEnd(12)}</Text>
          <Text dimColor>{new Date(c.timestamp).toLocaleString().slice(0, 20)}</Text>
        </Box>
      ))}
    </Box>
  );
}

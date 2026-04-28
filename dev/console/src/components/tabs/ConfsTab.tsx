import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { getConferences } from '../../api/client.js';
import type { ConferenceConfig } from '../../api/types.js';

export function ConfsTab() {
  const [confs, setConfs] = useState<ConferenceConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getConferences();
      setConfs(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useInput((_, key) => {
    if (key.upArrow) setSelectedIdx(i => Math.max(0, i - 1));
    if (key.downArrow) setSelectedIdx(i => Math.min(confs.length - 1, i + 1));
  });

  if (loading) return <Box><Text color="yellow"><Spinner type="dots" /></Text><Text> Loading...</Text></Box>;
  if (error) return <Text color="red">Error: {error}</Text>;

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">{'  #'.padEnd(6)}{'NAME'.padEnd(30)}{'DIRS'}</Text>
      </Box>
      {confs.map((c, i) => (
        <Box key={c.id}>
          <Text color={i === selectedIdx ? 'cyan' : 'white'} bold={i === selectedIdx}>
            {i === selectedIdx ? '▶ ' : '  '}
            {String(c.conference_id).padEnd(4)}
            {c.name.slice(0, 28).padEnd(30)}
            {String(c.ndirs)}
          </Text>
        </Box>
      ))}
    </Box>
  );
}

import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { getConferences, updateConference, getConferenceHealth, fixConference } from '../../api/client.js';
import type { ConferenceConfig, ConferenceHealth } from '../../api/types.js';

type Mode = 'list' | 'health-result' | 'fix-result';

export function ConfsTab() {
  const [confs, setConfs] = useState<ConferenceConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [mode, setMode] = useState<Mode>('list');
  const [healthResult, setHealthResult] = useState<ConferenceHealth | null>(null);
  const [fixResult, setFixResult] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

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

  const selected = confs[selectedIdx];

  useInput((input, key) => {
    if (mode !== 'list') {
      if (key.escape || input === 'q') { setMode('list'); setHealthResult(null); setFixResult(null); }
      return;
    }

    if (key.upArrow) setSelectedIdx(i => Math.max(0, i - 1));
    if (key.downArrow) setSelectedIdx(i => Math.min(confs.length - 1, i + 1));

    if (input === 't' && selected && !actionLoading) {
      const currentEnabled = (selected as any).enabled !== false;
      setActionLoading(true);
      updateConference(selected.conference_id, { enabled: !currentEnabled })
        .then(() => {
          setStatus(`Conf ${selected.conference_id} ${currentEnabled ? 'disabled' : 'enabled'}`);
          load();
        })
        .catch((e: Error) => setStatus(`Error: ${e.message}`))
        .finally(() => setActionLoading(false));
    }

    if (input === 'h' && selected && !actionLoading) {
      setActionLoading(true);
      getConferenceHealth(selected.conference_id)
        .then(result => {
          setHealthResult(result ?? null);
          setMode('health-result');
        })
        .catch((e: Error) => setStatus(`Error: ${e.message}`))
        .finally(() => setActionLoading(false));
    }

    if (input === 'f' && selected && !actionLoading) {
      setActionLoading(true);
      fixConference(selected.conference_id)
        .then(result => {
          setFixResult(result.message ?? 'Auto-fix complete');
          setMode('fix-result');
          load();
        })
        .catch((e: Error) => setStatus(`Error: ${e.message}`))
        .finally(() => setActionLoading(false));
    }

    if (input === 'r') load();
  });

  if (loading) return <Box><Text color="yellow"><Spinner type="dots" /></Text><Text> Loading...</Text></Box>;
  if (error) return <Text color="red">Error: {error}</Text>;

  if (mode === 'health-result' && healthResult) {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor={healthResult.healthy ? 'green' : 'yellow'} padding={1}>
        <Text bold color={healthResult.healthy ? 'green' : 'yellow'}>
          Conf {healthResult.conferenceId}: {healthResult.name}
        </Text>
        <Text color={healthResult.healthy ? 'green' : 'red'}>
          {healthResult.healthy ? '✓ Healthy' : '✗ Issues found'}
        </Text>
        {healthResult.issues.map((issue, i) => (
          <Text key={i} color="yellow">  • {issue}</Text>
        ))}
        {healthResult.fixable && <Text dimColor>  Press [f] to auto-fix</Text>}
        <Box marginTop={1}><Text dimColor>[esc] back</Text></Box>
      </Box>
    );
  }

  if (mode === 'fix-result') {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="green" padding={1}>
        <Text bold color="green">Auto-fix complete</Text>
        <Text>{fixResult}</Text>
        <Box marginTop={1}><Text dimColor>[esc] back</Text></Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">
          {'  #'.padEnd(6)}{'NAME'.padEnd(30)}{'DIRS'.padEnd(6)}{'STATUS'}
        </Text>
      </Box>

      {confs.map((c, i) => {
        const enabled = (c as any).enabled !== false;
        return (
          <Box key={c.id}>
            <Text color={i === selectedIdx ? 'cyan' : enabled ? 'white' : 'gray'} bold={i === selectedIdx}>
              {i === selectedIdx ? '▶ ' : '  '}
              {String(c.conference_id).padEnd(4)}
              {c.name.slice(0, 28).padEnd(30)}
              {String(c.ndirs).padEnd(6)}
              {enabled ? '' : '(disabled)'}
            </Text>
          </Box>
        );
      })}

      {actionLoading && (
        <Box marginTop={1}>
          <Text color="yellow"><Spinner type="dots" /></Text>
          <Text> Working...</Text>
        </Box>
      )}

      {status && <Box marginTop={1}><Text color="green">{status}</Text></Box>}
    </Box>
  );
}

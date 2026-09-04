import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { getLastCallers, getLastUploads, getLastDownloads } from '../../api/client.js';
import type { CallerRecord } from '../../api/types.js';

type Tab = 'callers' | 'uploads' | 'downloads';

interface Upload {
  id: number;
  filename: string;
  size?: number;
  uploader?: string;
  uploadDate?: string;
  areaName?: string;
}

interface Download {
  id: number;
  filename: string;
  size?: number;
  uploader?: string;
  downloadCount?: number;
  areaName?: string;
}

const TABS: Array<{ id: Tab; label: string; hotkey: string }> = [
  { id: 'callers',   label: 'Callers',   hotkey: '1' },
  { id: 'uploads',   label: 'Uploads',   hotkey: '2' },
  { id: 'downloads', label: 'Downloads', hotkey: '3' },
];

export function ActivityPage() {
  const [tab, setTab] = useState<Tab>('callers');
  const [callers, setCallers] = useState<CallerRecord[]>([]);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [downloads, setDownloads] = useState<Download[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [c, u, d] = await Promise.all([
        getLastCallers(30),
        getLastUploads(20),
        getLastDownloads(20),
      ]);
      setCallers(c);
      setUploads(u);
      setDownloads(d);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, []);

  useInput((input) => {
    if (input === '1') setTab('callers');
    if (input === '2') setTab('uploads');
    if (input === '3') setTab('downloads');
    if (input === 'r') load();
  });

  if (loading && callers.length === 0) {
    return <Box><Text color="yellow"><Spinner type="dots" /></Text><Text> Loading activity...</Text></Box>;
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        {TABS.map((t, i) => (
          <Text key={t.id} bold={tab === t.id} color={tab === t.id ? 'cyan' : 'white'}>
            {i > 0 ? '  ' : ''}[{t.hotkey}] {t.label}
          </Text>
        ))}
        <Text dimColor>  [r] refresh</Text>
      </Box>

      {error && <Text color="red">Error: {error}</Text>}

      {tab === 'callers' && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold color="cyan">{'  USER'.padEnd(18)}{'NODE'.padEnd(6)}{'ACTION'.padEnd(12)}{'TIME'}</Text>
          </Box>
          {callers.length === 0 ? (
            <Text dimColor>No recent callers</Text>
          ) : (
            callers.map(c => (
              <Box key={c.id}>
                <Text>{'  '}</Text>
                <Text color="white">{c.username.padEnd(16)}</Text>
                <Text dimColor>{String(c.nodeId ?? '?').padEnd(6)}</Text>
                <Text dimColor>{(c.action ?? '—').padEnd(12)}</Text>
                <Text dimColor>{new Date(c.timestamp).toLocaleString().slice(0, 20)}</Text>
              </Box>
            ))
          )}
        </Box>
      )}

      {tab === 'uploads' && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold color="cyan">{'  FILENAME'.padEnd(40)}{'UPLOADER'.padEnd(16)}{'AREA'}</Text>
          </Box>
          {uploads.length === 0 ? (
            <Text dimColor>No recent uploads</Text>
          ) : (
            uploads.map(u => (
              <Box key={u.id}>
                <Text>{'  '}</Text>
                <Text color="white">{u.filename.slice(0, 38).padEnd(40)}</Text>
                <Text dimColor>{(u.uploader ?? '—').padEnd(16)}</Text>
                <Text dimColor>{u.areaName ?? '—'}</Text>
              </Box>
            ))
          )}
        </Box>
      )}

      {tab === 'downloads' && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold color="cyan">{'  FILENAME'.padEnd(40)}{'UPLOADER'.padEnd(16)}{'COUNT'}</Text>
          </Box>
          {downloads.length === 0 ? (
            <Text dimColor>No recent downloads</Text>
          ) : (
            downloads.map(d => (
              <Box key={d.id}>
                <Text>{'  '}</Text>
                <Text color="white">{d.filename.slice(0, 38).padEnd(40)}</Text>
                <Text dimColor>{(d.uploader ?? '—').padEnd(16)}</Text>
                <Text dimColor>{d.downloadCount ?? 0}</Text>
              </Box>
            ))
          )}
        </Box>
      )}
    </Box>
  );
}

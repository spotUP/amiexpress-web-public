import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { getLogs } from '../../api/client.js';

type LogSource = 'backend' | 'frontend' | 'door68k';

const SOURCE_LABELS: Record<LogSource, string> = {
  backend: 'Backend',
  frontend: 'Preview',
  door68k: '68K Door',
};

export function LogsTab() {
  const [source, setSource] = useState<LogSource>('backend');
  const [lines, setLines] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLines([]);

    async function load() {
      try {
        const data = await getLogs(source, 200);
        if (active && mounted.current) {
          setLines(data.lines ?? []);
          setError(null);
        }
      } catch (e: unknown) {
        if (active && mounted.current) setError(e instanceof Error ? e.message : 'Failed');
      } finally {
        if (active && mounted.current) setLoading(false);
      }
    }

    load();
    const id = setInterval(load, 5_000);
    return () => { active = false; clearInterval(id); };
  }, [source]);

  useInput((input) => {
    if (input === 'b') setSource('backend');
    if (input === 'p') setSource('frontend');
    if (input === '6') setSource('door68k');
  });

  const display = lines.slice(-30);

  return (
    <Box flexDirection="column">
      <Box marginBottom={1} gap={3}>
        {(['backend', 'frontend', 'door68k'] as LogSource[]).map(s => (
          <Text key={s} color={s === source ? 'cyan' : 'white'} bold={s === source} underline={s === source}>
            {SOURCE_LABELS[s]}
          </Text>
        ))}
        {loading && <Text color="yellow"><Spinner type="dots" /></Text>}
      </Box>

      {error && <Text color="red">Error: {error}</Text>}

      {display.map((line, i) => (
        <Text key={i} dimColor={i < display.length - 5}>
          {line.slice(0, 120)}
        </Text>
      ))}
    </Box>
  );
}

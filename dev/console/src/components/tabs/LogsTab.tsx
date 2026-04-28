import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { getLogs } from '../../api/client.js';
import { useMouse, type MouseClick } from '../../hooks/useMouse.js';

type LogSource = 'backend' | 'frontend' | 'door68k';

const SOURCE_LABELS: Record<LogSource, string> = {
  backend: 'Backend',
  frontend: 'Preview',
  door68k: '68K Door',
};

// Switcher row: tab content starts at row 8.
// Labels: "Backend"(7) + gap(3) + "Preview"(7) + gap(3) + "68K Door"(8) starting at col 1.
const SWITCHER_ROW = 8;
const SWITCHER_RANGES: Array<{ from: number; to: number; src: LogSource }> = [
  { from: 1, to: 7, src: 'backend' },     // "Backend"  cols 1-7
  { from: 11, to: 17, src: 'frontend' },  // "Preview"  cols 11-17 (after gap=3)
  { from: 21, to: 28, src: 'door68k' },   // "68K Door" cols 21-28
];

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

  const onSwitcherClick = useCallback((e: MouseClick) => {
    if (e.button !== 0 || e.row !== SWITCHER_ROW) return;
    for (const r of SWITCHER_RANGES) {
      if (e.col >= r.from && e.col <= r.to) { setSource(r.src); return; }
    }
  }, []);
  useMouse(onSwitcherClick);

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

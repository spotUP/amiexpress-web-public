import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { getScreenIndex, type ScreenIndexEntry, type ScreenFileFacts, type ScreenIndex } from '../../api/client.js';
import { T, BlessedBox, BlessedText, BlessedSpinner } from '../../theme/blessed-theme.js';

type Tab = 'all' | 'node' | 'conf' | 'board' | 'unused' | 'bulletins';

const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: 'ALL' },
  { key: 'node', label: 'NODE' },
  { key: 'conf', label: 'CONF' },
  { key: 'board', label: 'BOARD' },
  { key: 'unused', label: 'UNUSED' },
  { key: 'bulletins', label: 'BULL' },
];

const MAX_LIST = 20;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}

export function ScreenFilesPage() {
  const [index, setIndex] = useState<ScreenIndex | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('all');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [detail, setDetail] = useState<ScreenFileFacts | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getScreenIndex();
      setIndex(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load screen index');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Build the list items for the current tab
  const items = useMemo(() => {
    if (!index) return { entries: [] as { label: string; path: string; screen?: string; facts?: ScreenFileFacts }[] };

    if (tab === 'unused') {
      return {
        entries: index.unused.map(f => ({
          label: `${f.path}  ${formatSize(f.bytes)}  ${f.format}`,
          path: f.path,
          facts: f,
        })),
      };
    }

    if (tab === 'bulletins') {
      return {
        entries: index.bulletins.map(b => ({
          label: `#${b.number}  ${b.title ?? '(no title)'}  ${b.file}`,
          path: b.file,
          facts: index.files[b.file],
        })),
      };
    }

    if (tab === 'node' || tab === 'conf' || tab === 'board') {
      const filtered = index.screens.filter(s => {
        const r = s.resolutions[0];
        if (!r) return false;
        if (tab === 'node') return r.scope === 'node';
        if (tab === 'conf') return r.scope === 'conf';
        return r.scope === 'board';
      });
      return {
        entries: filtered.map(s => {
          const r = s.resolutions[0];
          const label = r?.file
            ? `${s.screen.padEnd(30)} ${r.file.padEnd(40)} ${r.scope}${r.id != null ? r.id : ''}`
            : `${s.screen.padEnd(30)} (no resolution)`;
          return { label, path: r?.file ?? s.screen, screen: s.screen, facts: r?.file ? index.files[r.file] : undefined };
        }),
      };
    }

    // 'all' tab
    return {
      entries: index.screens.map(s => {
        const r = s.resolutions[0];
        const label = r?.file
          ? `${s.screen.padEnd(30)} ${r.file.padEnd(40)} ${r.scope}${r.id != null ? r.id : ''}`
          : `${s.screen.padEnd(30)} (no resolution)`;
        return { label, path: r?.file ?? s.screen, screen: s.screen, facts: r?.file ? index.files[r.file] : undefined };
      }),
    };
  }, [index, tab]);

  const selected = items.entries[selectedIdx];

  // Keyboard navigation
  useInput((input, key) => {
    if (key.tab) {
      setTab(t => {
        const keys = TABS.map(t => t.key);
        const idx = keys.indexOf(t);
        return keys[(idx + 1) % keys.length] as Tab;
      });
      setSelectedIdx(0);
      setDetail(null);
      return;
    }
    if (key.upArrow) { setSelectedIdx(i => Math.max(0, i - 1)); return; }
    if (key.downArrow) { setSelectedIdx(i => Math.min(items.entries.length - 1, i + 1)); return; }
    if (input === 'r') { load(); return; }
    if (input === 'd' && selected) {
      setDetail(selected.facts ?? null);
      return;
    }
    if (input === 'q' || input === 'escape') { setDetail(null); return; }
  });

  if (loading) {
    return <Box><BlessedSpinner/><Text> Loading screen index...</Text></Box>;
  }

  if (error) {
    return <Box flexDirection="column">
      <BlessedText variant="alert">Error: {error}</BlessedText>
      <Text>Press [r] to retry</Text>
    </Box>;
  }

  if (!index) return null;

  // Detail view
  if (detail) {
    const f = detail;
    return (
      <Box flexDirection="column" padding={1}>
        <BlessedText variant="accent" bold>{f.path}</BlessedText>
        <Text>Size: {formatSize(f.bytes)}  Format: {f.format}</Text>
        <Text>SHA256: {f.sha256?.slice(0, 16)}...</Text>
        {f.sauce && (
          <Box flexDirection="column">
            <BlessedText variant="accent" bold>SAUCE</BlessedText>
            <Text>Title: {f.sauce.title}</Text>
            <Text>Author: {f.sauce.author}</Text>
            <Text>Group: {f.sauce.group}</Text>
            <Text>Font: {f.sauce.font}</Text>
          </Box>
        )}
        {f.readBy && f.readBy.length > 0 && (
          <Box flexDirection="column">
            <BlessedText variant="accent" bold>Read by ({f.readBy.length} scopes)</BlessedText>
            {f.readBy.slice(0, 10).map((r, i) => <Text key={i}>  {r}</Text>)}
          </Box>
        )}
        {f.mci && f.mci.length > 0 && (
          <Box flexDirection="column">
            <BlessedText variant="accent" bold>MCI refs ({f.mci.length})</BlessedText>
            {f.mci.slice(0, 15).map((m, i) => (
              <Text key={i}>
                {m.resolves ? '\x1b[32mOK\x1b[0m' : '\x1b[31mXX\x1b[0m'} {m.code} {m.target}
              </Text>
            ))}
          </Box>
        )}
        {f.problems && f.problems.length > 0 && (
          <Box flexDirection="column">
            <BlessedText variant="alert" bold>Problems</BlessedText>
            {f.problems.map((p, i) => <Text key={i}>  {p}</Text>)}
          </Box>
        )}
        <Box marginTop={1}><BlessedText variant="dim">[q] Back  [r] Refresh</BlessedText></Box>
      </Box>
    );
  }

  const count = index.screens.length;
  const unusedCount = index.unused.length;
  const bulletinsCount = index.bulletins.length;

  return (
    <Box flexDirection="column" padding={1}>
      {/* Tab bar */}
      <Box flexDirection="row" gap={1} marginBottom={1}>
        {TABS.map(t => (
          <Box key={t.key}>
            <Text
              bold={tab === t.key}
              inverse={tab === t.key}
              color={tab === t.key ? T.accent : T.ink}
            >
              {' '}{tab === t.key ? '>' : ' '}{t.label}{' '}
            </Text>
          </Box>
        ))}
        <BlessedText variant="dim">({count} screens, {unusedCount} unused, {bulletinsCount} bulls)</BlessedText>
      </Box>

      {/* List */}
      <BlessedBox style="line" padding={1} flexDirection="column">
        {items.entries.slice(0, MAX_LIST).map((item, i) => (
          <Box key={item.path} flexDirection="row">
            <Text
              color={i === selectedIdx ? T.accent : T.ink}
              bold={i === selectedIdx}
              inverse={i === selectedIdx}
            >
              {i === selectedIdx ? '> ' : '  '}
              {item.label.slice(0, 80)}
            </Text>
          </Box>
        ))}
        {items.entries.length > MAX_LIST && (
          <BlessedText variant="dim">... and {items.entries.length - MAX_LIST} more</BlessedText>
        )}
      </BlessedBox>

      {/* Selected file summary */}
      {selected && selected.facts && (
        <BlessedBox style="none" padding={1} marginTop={1} flexDirection="column">
          <Box flexDirection="row" gap={1}>
            <BlessedText variant="accent" bold>{selected.facts.path}</BlessedText>
            <Text>  {formatSize(selected.facts.bytes)}  {selected.facts.format}</Text>
          </Box>
          {selected.facts.sauce && (
            <Text>SAUCE: {selected.facts.sauce.title}</Text>
          )}
          {selected.facts.mci && selected.facts.mci.length > 0 && (
            <Text>MCI: {selected.facts.mci.length} refs</Text>
          )}
          {selected.facts.problems && selected.facts.problems.length > 0 && (
            <Text>Problems: {selected.facts.problems.join(', ')}</Text>
          )}
        </BlessedBox>
      )}

      {/* Footer */}
      <Box flexDirection="row" gap={1} marginTop={1}>
        <BlessedText variant="dim">[Tab] Tab  [↑↓] Scroll  [d] Detail  [r] Refresh</BlessedText>
      </Box>
    </Box>
  );
}
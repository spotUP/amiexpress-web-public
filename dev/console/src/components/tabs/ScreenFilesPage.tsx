import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import {
  getScreenIndex, getScreenFile, deleteScreenFile, repairScreenFile,
  type ScreenFileFacts, type ScreenIndex,
} from '../../api/client.js';
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

const ANSI_FG: Record<number, string> = {
  30: 'black', 31: 'red', 32: 'green', 33: 'yellow',
  34: 'blue', 35: 'magenta', 36: 'cyan', 37: 'white',
  90: 'gray', 91: 'red', 92: 'green', 93: 'yellow',
  94: 'blue', 95: 'magenta', 96: 'cyan', 97: 'white',
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}

function AnsiText({ text }: { text: string }) {
  const segments = useMemo(() => {
    const parts: { text: string; color?: string; bold?: boolean }[] = [];
    let last = 0;
    let fg: string | undefined;
    let bold = false;
    const re = /\x1b\[([0-9;]*)m/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) {
        parts.push({ text: text.slice(last, m.index), color: fg, bold });
      }
      for (const code of m[1].split(';').filter(Boolean)) {
        const n = parseInt(code, 10);
        if (n === 0) { fg = undefined; bold = false; }
        else if (n === 1) { bold = true; }
        else if (ANSI_FG[n]) { fg = ANSI_FG[n]; }
      }
      last = re.lastIndex;
    }
    if (last < text.length) {
      parts.push({ text: text.slice(last), color: fg, bold });
    }
    return parts;
  }, [text]);

  return (
    <Text>
      {segments.map((s, i) => (
        <Text key={i} color={s.color} bold={s.bold}>{s.text}</Text>
      ))}
    </Text>
  );
}

function AnsiPreview({ content, path, onClose }: { content: string; path: string; onClose: () => void }) {
  const lines = useMemo(() => content.split(/\r?\n/), [content]);
  const [scrollY, setScrollY] = useState(0);
  const maxScroll = Math.max(0, lines.length - 25);

  useInput((_input, key) => {
    if (key.upArrow) setScrollY(s => Math.max(0, s - 1));
    if (key.downArrow) setScrollY(s => Math.min(maxScroll, s + 1));
    if (key.pageUp) setScrollY(s => Math.max(0, s - 25));
    if (key.pageDown) setScrollY(s => Math.min(maxScroll, s + 25));
    if (_input === 'q' || _input === 'escape') { onClose(); return; }
  });

  const visible = lines.slice(scrollY, scrollY + 25);

  return (
    <Box flexDirection="column" padding={1}>
      <Box flexDirection="row" gap={1} marginBottom={1}>
        <BlessedText variant="accent" bold>PREVIEW: {path}</BlessedText>
        <BlessedText variant="dim">({lines.length} lines)</BlessedText>
      </Box>
      <BlessedBox style="line" padding={1} flexDirection="column">
        {visible.map((line, i) => (
          <Box key={i} height={1}>
            <AnsiText text={line} />
          </Box>
        ))}
      </BlessedBox>
      {maxScroll > 0 && (
        <Box marginTop={1}>
          <BlessedText variant="dim">Line {scrollY + 1}–{scrollY + visible.length} of {lines.length}</BlessedText>
        </Box>
      )}
      <Box flexDirection="row" gap={1} marginTop={1}>
        <BlessedText variant="dim">[↑↓] Scroll  [PgUp/PgDn] Page  [q] Back</BlessedText>
      </Box>
    </Box>
  );
}

function ConfirmDialog({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
  const [confirming, setConfirming] = useState(false);

  useInput((input, key) => {
    if (confirming) return;
    if (input === 'y' || input === 'Y') { setConfirming(true); onConfirm(); return; }
    if (input === 'n' || input === 'N' || key.escape) { onCancel(); return; }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <BlessedText variant="alert" bold>{message}</BlessedText>
      <BlessedText variant="dim">Press [Y] to confirm  [N/Esc] to cancel</BlessedText>
    </Box>
  );
}

export function ScreenFilesPage() {
  const [index, setIndex] = useState<ScreenIndex | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('all');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [detail, setDetail] = useState<ScreenFileFacts | null>(null);
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [operationResult, setOperationResult] = useState<string | null>(null);
  const [showMciAll, setShowMciAll] = useState(false);

  const load = useCallback(async () => {
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
  }, []);

  useEffect(() => { load(); }, [load]);

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

    const filtered = tab === 'all' ? index.screens
      : index.screens.filter(s => {
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
  }, [index, tab]);

  const selected = items.entries[selectedIdx];

  const openPreview = async (path: string) => {
    setPreviewPath(path);
    setPreviewLoading(true);
    try {
      const data = await getScreenFile(path);
      if (data && 'content' in data) {
        const bytes = Uint8Array.from(atob(data.content as string), c => c.charCodeAt(0));
        const text = new TextDecoder('latin1').decode(bytes);
        setPreviewContent(text);
      }
    } catch (e: unknown) {
      setPreviewContent(`Error: ${e instanceof Error ? e.message : 'Failed to load'}`);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDelete = async (path: string) => {
    try {
      const result = await deleteScreenFile(path);
      setOperationResult(`Deleted: ${path} (backup: ${result.backup})`);
      setConfirmDelete(null);
      load();
    } catch (e: unknown) {
      setOperationResult(`Delete failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
      setConfirmDelete(null);
    }
  };

  const handleRepair = async (path: string) => {
    try {
      const result = await repairScreenFile(path);
      setOperationResult(`Repaired: ${path} (${result.repaired} fixes, backup: ${result.backup})`);
      load();
    } catch (e: unknown) {
      setOperationResult(`Repair failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  };

  useInput((input, key) => {
    if (confirmDelete) return; // confirmation dialog handles its own input
    if (operationResult) {
      if (input === 'q' || key.escape) { setOperationResult(null); }
      return;
    }
    if (previewContent !== null || previewLoading) return;

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
    if (input === 'v' && selected) { openPreview(selected.path); return; }
    if (input === 'd' && selected) { setDetail(selected.facts ?? null); return; }
    if (input === 'x' && selected) { setConfirmDelete(selected.path); return; }
    if (input === 'p' && selected) { handleRepair(selected.path); return; }
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

  // Operation result message
  if (operationResult) {
    return (
      <Box flexDirection="column" padding={1}>
        <BlessedText variant={operationResult.startsWith('Deleted') || operationResult.startsWith('Repaired') ? 'accent' : 'alert'} bold>
          {operationResult}
        </BlessedText>
        <Box marginTop={1}><BlessedText variant="dim">[q] Back</BlessedText></Box>
      </Box>
    );
  }

  // Delete confirmation
  if (confirmDelete) {
    return (
      <ConfirmDialog
        message={`Delete screen file: ${confirmDelete}?`}
        onConfirm={() => handleDelete(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />
    );
  }

  // Preview mode
  if (previewContent !== null) {
    return (
      <AnsiPreview
        content={previewContent}
        path={previewPath ?? ''}
        onClose={() => { setPreviewContent(null); setPreviewPath(null); }}
      />
    );
  }

  if (previewLoading) {
    return <Box><BlessedSpinner/><Text> Loading screen content...</Text></Box>;
  }

  // Detail view
  if (detail) {
    const f = detail;
    const brokenMci = f.mci?.filter(m => !m.resolves) ?? [];
    const okMci = f.mci?.filter(m => m.resolves) ?? [];
    const displayMci = showMciAll ? f.mci ?? [] : brokenMci;

    return (
      <Box flexDirection="column" padding={1}>
        <BlessedText variant="accent" bold>{f.path}</BlessedText>
        <Text>Size: {formatSize(f.bytes)}  Format: {f.format}</Text>
        <Text>SHA256: {f.sha256?.slice(0, 16)}...</Text>

        {f.sauce && (
          <Box flexDirection="column" marginTop={1}>
            <BlessedText variant="accent" bold>SAUCE</BlessedText>
            <Text>Title: {f.sauce.title}</Text>
            <Text>Author: {f.sauce.author}</Text>
            <Text>Group: {f.sauce.group}</Text>
            <Text>Font: {f.sauce.font}</Text>
          </Box>
        )}

        {f.readBy && f.readBy.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <BlessedText variant="accent" bold>Read by ({f.readBy.length} scopes)</BlessedText>
            {f.readBy.slice(0, 10).map((r, i) => <Text key={i}>  {r}</Text>)}
          </Box>
        )}

        {f.mci && f.mci.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Box flexDirection="row" gap={1}>
              <BlessedText variant="accent" bold>MCI refs ({f.mci.length})</BlessedText>
              {brokenMci.length > 0 && (
                <BlessedText variant="alert">({brokenMci.length} broken)</BlessedText>
              )}
            </Box>
            {displayMci.slice(0, 20).map((m, i) => (
              <Text key={i}>
                {m.resolves ? '[OK]' : '[XX]'} {m.code} {m.target}
              </Text>
            ))}
            {!showMciAll && brokenMci.length === 0 && okMci.length > 0 && (
              <BlessedText variant="dim">All MCI refs resolve — press [m] to show all</BlessedText>
            )}
            {!showMciAll && brokenMci.length > 0 && okMci.length > 0 && (
              <BlessedText variant="dim">Showing {brokenMci.length} broken — press [m] for all {f.mci.length}</BlessedText>
            )}
            {showMciAll && f.mci.length > 20 && (
              <BlessedText variant="dim">... and {f.mci.length - 20} more</BlessedText>
            )}
          </Box>
        )}

        {f.problems && f.problems.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <BlessedText variant="alert" bold>Problems</BlessedText>
            {f.problems.map((p, i) => <Text key={i}>  {p}</Text>)}
          </Box>
        )}

        <Box flexDirection="row" gap={1} marginTop={1}>
          <BlessedText variant="dim">[q] Back  [v] View  [x] Delete  [p] Repair  [m] MCI all</BlessedText>
        </Box>
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
          {selected.facts.sauce && <Text>SAUCE: {selected.facts.sauce.title}</Text>}
          {selected.facts.mci && selected.facts.mci.length > 0 && (
            <Text>MCI: {selected.facts.mci.length} refs ({selected.facts.mci.filter(m => !m.resolves).length} broken)</Text>
          )}
          {selected.facts.problems && selected.facts.problems.length > 0 && (
            <Text>Problems: {selected.facts.problems.join(', ')}</Text>
          )}
        </BlessedBox>
      )}

      {/* Footer */}
      <Box flexDirection="row" gap={1} marginTop={1}>
        <BlessedText variant="dim">[Tab] Tab  [↑↓] Scroll  [v] View  [d] Detail  [x] Delete  [p] Repair  [r] Refresh</BlessedText>
      </Box>
    </Box>
  );
}
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import {
  getScreenIndex, getScreenFile, deleteScreenFile, repairScreenFile,
  getScreenRevisions, getScreenRevision, restoreScreenRevision, repairAllScreens,
  type ScreenFileFacts, type ScreenIndex, type ScreenRevisionMeta, type RepairAllResult,
} from '../../api/client.js';
import { T, BlessedBox, BlessedText, BlessedSpinner } from '../../theme/blessed-theme.js';
import { useMouse, useHover, type MouseEvent } from '../../hooks/useMouse.js';
import { useTextEntryLock } from '../../hooks/useTextEntryLock.js';
import { ConfirmDialog as SharedConfirmDialog } from '../shared/ConfirmDialog.js';

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

function formatRevisionTs(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString();
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
  const [hoveredTab, setHoveredTab] = useState<Tab | null>(null);

  // Revision history — [h] from the detail view. `historyPath` is the
  // screen's canonical path (the same string used for GET/PUT/DELETE
  // /file), captured by value so a background refresh of `index` can't
  // change which file this view is showing mid-browse.
  const [historyPath, setHistoryPath] = useState<string | null>(null);
  const [revisions, setRevisions] = useState<ScreenRevisionMeta[]>([]);
  const [revisionsLoading, setRevisionsLoading] = useState(false);
  const [revisionIdx, setRevisionIdx] = useState(0);
  const [revisionPreview, setRevisionPreview] = useState<{ file: string; content: string } | null>(null);
  // Captured by value the moment [r]estore is pressed — same reason
  // DoorsTab's delete captures its target instead of re-deriving from an
  // index that can shift under a confirmation dialog.
  const [restoreTarget, setRestoreTarget] = useState<ScreenRevisionMeta | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [historyStatus, setHistoryStatus] = useState<string | null>(null);

  // Bulk repair — [R] from the main list. Dry run first (names every
  // damaged file, writes nothing), then a typed confirmation, then the real
  // pass, reported per file — matches web's repairAllScreens(dryRun) two-step
  // and the reasoning in screens-routes.ts:414-426 ("the decision is still
  // the sysop's").
  const [repairAllMode, setRepairAllMode] = useState<'idle' | 'dry-run-loading' | 'confirm' | 'running' | 'result'>('idle');
  const [repairAllDamaged, setRepairAllDamaged] = useState<string[]>([]);
  const [repairAllResult, setRepairAllResult] = useState<RepairAllResult | null>(null);

  const TAB_ROW = 7;
  const TAB_RANGES: Array<{ from: number; to: number; key: Tab }> = [
    { from: 24, to: 28, key: 'all' },
    { from: 30, to: 35, key: 'node' },
    { from: 37, to: 42, key: 'conf' },
    { from: 44, to: 50, key: 'board' },
    { from: 52, to: 59, key: 'unused' },
    { from: 61, to: 66, key: 'bulletins' },
  ];

  useMouse(useCallback((e: MouseEvent) => {
    if (e.button !== 0 || e.row !== TAB_ROW) return;
    for (const r of TAB_RANGES) {
      if (e.col >= r.from && e.col <= r.to) { setTab(r.key); break; }
    }
  }, []));

  useHover(useCallback((e: { col: number; row: number }) => {
    if (e.row !== TAB_ROW) { setHoveredTab(null); return; }
    let found: Tab | null = null;
    for (const r of TAB_RANGES) {
      if (e.col >= r.from && e.col <= r.to) { found = r.key; break; }
    }
    setHoveredTab(found);
  }, []));
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

  type ScreenEntry = { label: string; path: string | null; screen: string; facts: ScreenFileFacts | undefined };

  const items = useMemo(() => {
    if (!index) return { entries: [] as ScreenEntry[] };

    if (tab === 'unused') {
      return {
        entries: index.unused.map(f => ({
          label: `${f.path}  ${formatSize(f.bytes)}  ${f.format}`,
          path: f.path,
          screen: f.path,
          facts: f,
        })),
      };
    }

    if (tab === 'bulletins') {
      return {
        entries: index.bulletins.map(b => ({
          label: `#${b.number}  ${b.title ?? '(no title)'}  ${b.file}`,
          path: b.file,
          screen: b.file,
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
        if (!r || !r.file) {
          return { label: `${s.screen.padEnd(30)} (no resolution)`, path: null, screen: s.screen, facts: undefined };
        }
        const label = `${s.screen.padEnd(30)} ${r.file.padEnd(40)} ${r.scope}${r.id != null ? r.id : ''}`;
        return { label, path: r.file, screen: s.screen, facts: index.files[r.file] };
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

  const openHistory = (path: string) => {
    setHistoryPath(path);
    setRevisionIdx(0);
    setRevisionPreview(null);
    setHistoryStatus(null);
    setRevisionsLoading(true);
    getScreenRevisions(path)
      .then(setRevisions)
      .catch((e: unknown) => setHistoryStatus(`Failed to load revisions: ${e instanceof Error ? e.message : 'Unknown error'}`))
      .finally(() => setRevisionsLoading(false));
  };

  const closeHistory = () => {
    setHistoryPath(null);
    setRevisions([]);
    setRevisionPreview(null);
    setHistoryStatus(null);
  };

  const openRevisionPreview = async (rev: ScreenRevisionMeta) => {
    if (!historyPath) return;
    try {
      const data = await getScreenRevision(historyPath, rev.file);
      if (data) {
        const bytes = Uint8Array.from(atob(data.content), c => c.charCodeAt(0));
        setRevisionPreview({ file: rev.file, content: new TextDecoder('latin1').decode(bytes) });
      }
    } catch (e: unknown) {
      setHistoryStatus(`Preview failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  };

  const doRestore = async (rev: ScreenRevisionMeta) => {
    if (!historyPath) return;
    setRestoring(true);
    try {
      const res = await restoreScreenRevision(historyPath, rev.file);
      setHistoryStatus(res.message ?? `Restored from ${rev.file}`);
      setRestoreTarget(null);
      openHistory(historyPath); // the restore itself creates a new revision — refresh the list
      load();
    } catch (e: unknown) {
      setHistoryStatus(`Restore failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
      setRestoreTarget(null);
    } finally {
      setRestoring(false);
    }
  };

  const runRepairAllDryRun = () => {
    // The confirm dialog must not render until the dry run actually
    // answers - it used to flip straight to 'confirm' with
    // repairAllDamaged still [], so a sysop fast enough to confirm before
    // the fetch resolved saw (and could accept) "Repair 0 file(s)?" and
    // then ran the REAL pass against whatever the server-side damaged set
    // actually was - the confirmation text and the action it triggered
    // could disagree.
    setRepairAllMode('dry-run-loading');
    setRepairAllDamaged([]);
    repairAllScreens(true)
      .then((res) => { setRepairAllDamaged(res.damaged ?? []); setRepairAllMode('confirm'); })
      .catch((e: unknown) => {
        setOperationResult(`Repair-all failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
        // Back to idle on failure too - otherwise repairAllMode stays
        // stuck at 'dry-run-loading' forever (it matches none of the
        // render branches below, so operationResult's own view still
        // shows correctly) and the useInput guard further down
        // (`if (repairAllMode !== 'idle') return`) would swallow every
        // keypress site-wide once the sysop dismisses that error - [R]
        // included - with nothing on screen to explain why.
        setRepairAllMode('idle');
      });
  };

  const runRepairAllReal = () => {
    setRepairAllMode('running');
    repairAllScreens(false)
      .then((res) => { setRepairAllResult(res); setRepairAllMode('result'); load(); })
      .catch((e: unknown) => {
        setOperationResult(`Repair-all failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
        setRepairAllMode('idle');
      });
  };

  // The restore/repair-all confirmations, the typed target, and the history
  // sub-view's own [esc]-to-back all own the keyboard while active — see
  // dev/console/src/state/text-entry-lock.ts. (The plain y/n ConfirmDialog
  // this page already had for single-file delete doesn't need it — nothing
  // here collides with 'q'/'?'/arrows the way a typed field or a form
  // does — but SharedConfirmDialog's typed-confirmation mode DOES accept
  // arbitrary text, and repair-all's own dialog uses arrows, so both need
  // the lock.)
  useTextEntryLock(historyPath !== null || repairAllMode !== 'idle');

  useInput((input, key) => {
    if (confirmDelete) return; // confirmation dialog handles its own input
    if (operationResult) {
      if (input === 'q' || key.escape) { setOperationResult(null); }
      return;
    }
    if (previewContent !== null || previewLoading) return;

    if (repairAllMode !== 'idle') {
      if (repairAllMode === 'confirm' || repairAllMode === 'result') {
        if (repairAllMode === 'result' && (input === 'q' || key.escape)) {
          setRepairAllMode('idle'); setRepairAllResult(null); return;
        }
        // 'confirm' mode's own y/n is handled by SharedConfirmDialog below.
      }
      return;
    }

    if (historyPath !== null) {
      if (restoreTarget) return; // its own ConfirmDialog owns input
      if (revisionPreview) {
        if (input === 'q' || key.escape) { setRevisionPreview(null); }
        return;
      }
      if (input === 'q' || key.escape) { closeHistory(); return; }
      if (key.upArrow) setRevisionIdx(i => Math.max(0, i - 1));
      if (key.downArrow) setRevisionIdx(i => Math.min(revisions.length - 1, i + 1));
      if (input === 'v' && revisions[revisionIdx]) openRevisionPreview(revisions[revisionIdx]);
      if (input === 'r' && revisions[revisionIdx] && !restoring) setRestoreTarget(revisions[revisionIdx]);
      return;
    }

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
    if (input === 'v' && selected && selected.path) { openPreview(selected.path); return; }
    if (input === 'd' && selected) {
      const f = selected.facts || { path: selected.path ?? selected.screen, bytes: 0, format: '—', sha256: '', readBy: [], mci: [], sauce: null, problems: [] };
      setDetail(f);
      return;
    }
    if (input === 'x' && selected && selected.path) { setConfirmDelete(selected.path); return; }
    if (input === 'p' && selected && selected.path) { handleRepair(selected.path); return; }
    if (input === 'h' && detail) { openHistory(detail.path); return; }
    if (input === 'R' && !detail) { runRepairAllDryRun(); return; }
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

  // Bulk repair — dry run names the damaged files and asks for confirmation
  // before anything is written; the real pass reports each file's outcome.
  //
  // The confirm dialog (below) only ever renders once the dry run has
  // actually answered - never while repairAllDamaged is still its initial
  // [], which would show (and let a fast sysop confirm) "Repair 0 file(s)?"
  // before the real count was known.
  if (repairAllMode === 'dry-run-loading') {
    return <Box><BlessedSpinner/><Text> Checking for damaged screens...</Text></Box>;
  }

  if (repairAllMode === 'confirm') {
    return (
      <Box flexDirection="column" padding={1}>
        <BlessedText variant="accent" bold>REPAIR ALL — dry run</BlessedText>
        {repairAllDamaged.length === 0 ? (
          <Text dimColor>No damaged screens found.</Text>
        ) : (
          <>
            <Text>{repairAllDamaged.length} file{repairAllDamaged.length === 1 ? '' : 's'} would be repaired:</Text>
            {repairAllDamaged.slice(0, 20).map((p, i) => <Text key={i}>  {p}</Text>)}
            {repairAllDamaged.length > 20 && <BlessedText variant="dim">  ... and {repairAllDamaged.length - 20} more</BlessedText>}
          </>
        )}
        <Box marginTop={1}>
          <SharedConfirmDialog
            message={`Repair ${repairAllDamaged.length} file(s)? Each gets a .backup copy first, same as a single-file [p]repair.`}
            onConfirm={runRepairAllReal}
            onCancel={() => setRepairAllMode('idle')}
          />
        </Box>
      </Box>
    );
  }

  if (repairAllMode === 'running') {
    return <Box><BlessedSpinner/><Text> Repairing...</Text></Box>;
  }

  if (repairAllMode === 'result' && repairAllResult) {
    return (
      <Box flexDirection="column" padding={1}>
        <BlessedText variant="accent" bold>REPAIR ALL — done</BlessedText>
        <Text>Repaired: {repairAllResult.repaired?.length ?? 0}</Text>
        {(repairAllResult.repaired ?? []).map((r, i) => (
          <Text key={i}>  [OK] {r.path} ({r.codes} code{r.codes === 1 ? '' : 's'})</Text>
        ))}
        {(repairAllResult.refused ?? []).length > 0 && (
          <>
            <BlessedText variant="alert" bold>Refused: {repairAllResult.refused!.length}</BlessedText>
            {repairAllResult.refused!.map((r, i) => (
              <Text key={i}>  [XX] {r.path} — {r.reason}</Text>
            ))}
          </>
        )}
        <Box marginTop={1}><BlessedText variant="dim">[q] Back</BlessedText></Box>
      </Box>
    );
  }

  // Revision history — [h] from the detail view.
  if (historyPath) {
    if (revisionPreview) {
      return (
        <AnsiPreview
          content={revisionPreview.content}
          path={`${historyPath} @ ${revisionPreview.file}`}
          onClose={() => setRevisionPreview(null)}
        />
      );
    }
    const selectedRev = revisions[revisionIdx];
    const restoreLabel = historyPath.split(/[\\/]/).pop() ?? historyPath;
    return (
      <Box flexDirection="column" padding={1}>
        <Box flexDirection="row" gap={1} marginBottom={1}>
          <BlessedText variant="accent" bold>HISTORY: {historyPath}</BlessedText>
          {revisionsLoading && <BlessedSpinner/>}
        </Box>
        {revisions.length === 0 && !revisionsLoading && (
          <Text dimColor>No revisions yet — a revision is created the next time this file is overwritten.</Text>
        )}
        {revisions.map((rev, i) => (
          <Box key={rev.file}>
            <Text
              color={i === revisionIdx ? T.accent : T.ink}
              bold={i === revisionIdx}
              inverse={i === revisionIdx}
            >
              {i === revisionIdx ? '> ' : '  '}
              {formatRevisionTs(rev.ts).padEnd(24)}
              {formatSize(rev.bytes).padEnd(10)}
              {rev.sha256.slice(0, 12)}
            </Text>
          </Box>
        ))}
        {restoreTarget && (
          <Box marginTop={1}>
            <SharedConfirmDialog
              message={
                `Restore ${restoreLabel} to the ${formatRevisionTs(restoreTarget.ts)} revision? ` +
                'The current content is snapshotted first, so this is itself one revision away from undo.'
              }
              requireTypedConfirmation={restoreLabel}
              onConfirm={() => doRestore(restoreTarget)}
              onCancel={() => setRestoreTarget(null)}
            />
          </Box>
        )}
        {restoring && <Box marginTop={1}><BlessedSpinner/><Text> Restoring...</Text></Box>}
        {historyStatus && <Box marginTop={1}><BlessedText variant={historyStatus.startsWith('Restored') ? 'accent' : 'alert'}>{historyStatus}</BlessedText></Box>}
        <Box marginTop={1}><BlessedText variant="dim">[↑↓] select  [v] preview  [r]estore  [esc] back</BlessedText></Box>
      </Box>
    );
  }

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
          <BlessedText variant="dim">[q] Back  [v] View  [x] Delete  [p] Repair  [h]istory  [m] MCI all</BlessedText>
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
        {TABS.map(t => {
          const active = tab === t.key;
          const hover = hoveredTab === t.key;
          return (
            <Box key={t.key}>
              <Text bold={active || hover} inverse={active} color={active ? undefined : hover ? T.accent : T.ink}>
                {' '}{tab === t.key ? '>' : ' '}{t.label}{' '}
              </Text>
            </Box>
          );
        })}
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
        <BlessedText variant="dim">[Tab] Tab  [↑↓] Scroll  [v] View  [d] Detail  [x] Delete  [p] Repair  [R]epair all  [r] Refresh</BlessedText>
      </Box>
    </Box>
  );
}
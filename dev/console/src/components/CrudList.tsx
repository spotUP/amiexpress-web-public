import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { T } from '../theme/blessed-theme.js';
import { ToggleSwitch } from './shared/InlineEdit.js';
import { useRowClick } from '../hooks/useRowClick.js';
import { ConfirmDialog } from './shared/ConfirmDialog.js';
import { useTextEntryLock } from '../hooks/useTextEntryLock.js';

const ITEMS_START_ROW = 7;

export interface ColumnDef<T> {
  label: string;
  render: (row: T) => string;
  width: number;
}

export interface EditField {
  key: string;
  label: string;
  type: 'string' | 'number' | 'bool';
}

export interface ExtraAction<T> {
  /** Single-character hotkey, active on the selected row while mode === 'list'. */
  key: string;
  /** Shown nowhere by this component — the page using it documents the key
   * in its own registry.ts footerHint/helpKeys, same as every other key. */
  label: string;
  onSelect: (row: T) => void;
}

export interface CrudListProps<T extends { id: number }> {
  title: string;
  columns: ColumnDef<T>[];
  editFields: EditField[];
  getAll: () => Promise<T[]>;
  create?: (row: Partial<T>) => Promise<unknown>;
  update?: (id: number, patch: Partial<T>) => Promise<unknown>;
  remove?: (id: number) => Promise<unknown>;
  /**
   * Extra single-key actions on the selected row, on top of the built-in
   * e/n/d/// r — e.g. FileCheckersPage's "manage this checker's error
   * patterns" drill-down. Reserve letters not already used above
   * ('e','n','d','/','r').
   */
  extraActions?: ExtraAction<T>[];
}

type Mode = 'list' | 'edit' | 'new' | 'confirm-delete';

/**
 * `editValues` accumulates 'number' fields as STRINGS while a field is
 * being typed (the number-editing key handler below does
 * `String(v[field.key] ?? '') + input`, appending digits onto whatever was
 * already there) — so a field that started at 0 (startNew's default)
 * becomes "02" after one keypress, never converted back to an actual number
 * before being sent. Every backend Zod schema this feeds
 * (FileCheckerErrorSchema, NodeConfigSchema, ...) does `z.number()` and
 * rejects a string outright — so create/update for any REQUIRED numeric
 * field 400s every time. Coerce right before the request goes out, using
 * each field's own declared type (editFields already carries it) rather
 * than guessing from the runtime value. Exported as a standalone function
 * (not a closure over component state) so it has a regression test that
 * doesn't need an Ink render harness.
 */
export function coerceEditValuesForSubmit(
  editFields: EditField[],
  values: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...values };
  for (const f of editFields) {
    if (f.type !== 'number') continue;
    const raw = out[f.key];
    if (typeof raw === 'number') continue;
    const n = parseInt(String(raw ?? ''), 10);
    out[f.key] = Number.isFinite(n) ? n : 0;
  }
  return out;
}

export function CrudList<T extends { id: number }>({
  title,
  columns,
  editFields,
  getAll,
  create,
  update,
  remove,
  extraActions,
}: CrudListProps<T>) {
  const [items, setItems] = useState<T[]>([]);
  const [filtered, setFiltered] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [mode, setMode] = useState<Mode>('list');
  const [searchText, setSearchText] = useState('');
  const [searching, setSearching] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // Edit/new state
  const [editFieldIdx, setEditFieldIdx] = useState(0);
  const [editValues, setEditValues] = useState<Record<string, unknown>>({});

  const PAGE = 20;
  const [pageStart, setPageStart] = useState(0);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAll();
      setItems(data);
      setFiltered(data);
      setSelectedIdx(0);
      setPageStart(0);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load items');
    } finally {
      setLoading(false);
    }
  }, [getAll]);

  useEffect(() => { loadItems(); }, [loadItems]);

  const visibleItems = filtered.slice(pageStart, pageStart + PAGE);
  const selected = visibleItems[selectedIdx];

  useRowClick(visibleItems.length, ITEMS_START_ROW, (idx) => {
    setSelectedIdx(idx);
  }, mode === 'list' && !searching);

  // Search, edit, new, and delete-confirm all collect free text or arrow
  // input this component's own idle 'list' mode does not use for anything
  // but browsing — the global 'q'/'?' hotkeys and the sidebar's arrow-key
  // page cycling must not steal keys from a search box or a numeric field.
  // wave 1's review flagged this as latent in every CrudList consumer
  // (Computers/Screen Types/Languages/Protocols/File Checkers) since it only
  // retrofitted the four pages that wave touched directly — fixed here once,
  // for all of them, rather than in each page. See
  // dev/console/src/state/text-entry-lock.ts.
  useTextEntryLock(mode !== 'list' || searching);

  const renderRow = (row: T): string => {
    return columns.map(col => col.render(row).padEnd(col.width)).join('');
  };

  const coerceForSubmit = (values: Record<string, unknown>): Partial<T> =>
    coerceEditValuesForSubmit(editFields, values) as Partial<T>;

  const startEdit = () => {
    if (!selected) return;
    setEditFieldIdx(0);
    const vals: Record<string, unknown> = {};
    editFields.forEach(f => {
      vals[f.key] = (selected as Record<string, unknown>)[f.key] ?? '';
    });
    setEditValues(vals);
    setMode('edit');
  };

  const startNew = () => {
    setEditFieldIdx(0);
    const vals: Record<string, unknown> = {};
    editFields.forEach(f => {
      vals[f.key] = f.type === 'number' ? 0 : f.type === 'bool' ? false : '';
    });
    setEditValues(vals);
    setMode('new');
  };

  const saveEdit = async () => {
    if (!selected || !update) return;
    try {
      await update(selected.id, coerceForSubmit(editValues));
      setStatus(`Row ${selected.id} updated`);
      await loadItems();
      setMode('list');
    } catch (e: unknown) {
      setStatus(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  };

  const saveNew = async () => {
    if (!create) return;
    try {
      await create(coerceForSubmit(editValues));
      setStatus('New row created');
      await loadItems();
      setMode('list');
    } catch (e: unknown) {
      setStatus(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  };

  const startDelete = () => {
    if (selected) setMode('confirm-delete');
  };

  const confirmDelete = async () => {
    if (!selected || !remove) return;
    try {
      await remove(selected.id);
      setStatus(`Row ${selected.id} deleted`);
      await loadItems();
      setMode('list');
    } catch (e: unknown) {
      setStatus(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  };

  useInput((input, key) => {
    if (searching) {
      if (key.escape) { setSearching(false); setSearchText(''); setFiltered(items); return; }
      if (key.return) { setSearching(false); return; }
      if (key.backspace || key.delete) {
        const next = searchText.slice(0, -1);
        setSearchText(next);
        const query = next.toLowerCase();
        setFiltered(items.filter(item => {
          const row = renderRow(item).toLowerCase();
          return row.includes(query);
        }));
        return;
      }
      if (input && !key.ctrl) {
        const next = searchText + input;
        setSearchText(next);
        const query = next.toLowerCase();
        setFiltered(items.filter(item => {
          const row = renderRow(item).toLowerCase();
          return row.includes(query);
        }));
      }
      return;
    }

    if (mode === 'list') {
      if (key.upArrow) {
        if (selectedIdx > 0) setSelectedIdx(i => i - 1);
        else if (pageStart > 0) { setPageStart(p => p - PAGE); setSelectedIdx(PAGE - 1); }
      }
      if (key.downArrow) {
        if (selectedIdx < visibleItems.length - 1) setSelectedIdx(i => i + 1);
        else if (pageStart + PAGE < filtered.length) { setPageStart(p => p + PAGE); setSelectedIdx(0); }
      }
      if (input === 'e' && selected) startEdit();
      if (input === 'n') startNew();
      if (input === 'd' && selected) startDelete();
      if (input === '/') { setSearching(true); setSearchText(''); }
      if (input === 'r') loadItems();
      if (selected) {
        const action = extraActions?.find(a => a.key === input);
        if (action) action.onSelect(selected);
      }
    } else if (mode === 'edit' || mode === 'new') {
      const field = editFields[editFieldIdx];
      if (key.escape) { setMode('list'); return; }

      if (mode === 'edit' && key.return) {
        // Save and move to next field or done
        if (editFieldIdx < editFields.length - 1) {
          setEditFieldIdx(i => i + 1);
        } else {
          saveEdit();
        }
        return;
      }

      if (mode === 'new' && key.return) {
        // Save new and move to next field or done
        if (editFieldIdx < editFields.length - 1) {
          setEditFieldIdx(i => i + 1);
        } else {
          saveNew();
        }
        return;
      }

      // Edit current field value
      if (field.type === 'bool') {
        if (input === ' ') { setEditValues(v => ({ ...v, [field.key]: !v[field.key] })); }
      } else if (field.type === 'number') {
        if (key.backspace || key.delete) {
          setEditValues(v => ({ ...v, [field.key]: String(v[field.key] ?? '').slice(0, -1) }));
        } else if (input && /[0-9]/.test(input)) {
          setEditValues(v => ({ ...v, [field.key]: String(v[field.key] ?? '') + input }));
        } else if (input === '-' && String(editValues[field.key] ?? '')[0] !== '-') {
          setEditValues(v => ({ ...v, [field.key]: '-' + String(v[field.key] ?? '') }));
        }
      } else {
        // string
        if (key.backspace || key.delete) {
          setEditValues(v => ({ ...v, [field.key]: String(v[field.key] ?? '').slice(0, -1) }));
        } else if (input && !key.ctrl) {
          setEditValues(v => ({ ...v, [field.key]: String(v[field.key] ?? '') + input }));
        }
      }
    }
  });

  if (loading) return <Box><Text color={T.warn}><Spinner type="dots" /></Text><Text> Loading {title.toLowerCase()}...</Text></Box>;
  if (error) return <Text color={T.alert}>Error: {error}</Text>;

  const headerRow = columns.map(col => col.label.padEnd(col.width)).join('');

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color={T.accent}>{headerRow}</Text>
        <Text dimColor>  ({filtered.length}/{items.length})</Text>
      </Box>

      {visibleItems.map((item, i) => (
        <Box key={item.id + '-' + i}>
          <Text inverse={i === selectedIdx} bold={i === selectedIdx}>
            {i === selectedIdx ? '▶ ' : '  '}
            {renderRow(item)}
          </Text>
        </Box>
      ))}

      {searching && (
        <Box marginTop={1}>
          <Text color={T.accent}>Search: {searchText}█</Text>
          <Text dimColor>  [esc] clear  [enter] done</Text>
        </Box>
      )}

      {(mode === 'edit' || mode === 'new') && (
        <Box marginTop={1} flexDirection="column">
          {editFields.map((field, i) => (
            <Box key={field.key} marginTop={i > 0 ? 0 : 0}>
              <Text color={i === editFieldIdx ? T.warn : T.ink}>
                {i === editFieldIdx ? '> ' : '  '}
                {field.label}:
                {' '}
                {field.type === 'bool' ? (
                  i === editFieldIdx ? (
                    <ToggleSwitch value={!!editValues[field.key]} onChange={v => setEditValues(vv => ({ ...vv, [field.key]: v }))} />
                  ) : (
                    <Text color={editValues[field.key] ? T.ok : T.alert}>
                      {editValues[field.key] ? 'yes' : 'no'}
                    </Text>
                  )
                ) : (
                  <Text color={T.accent}>{String(editValues[field.key] ?? '')}</Text>
                )}
                {i === editFieldIdx && <Text>█</Text>}
              </Text>
            </Box>
          ))}
          <Box marginTop={1}>
            <Text dimColor>[enter] next field  [esc] cancel</Text>
          </Box>
        </Box>
      )}

      {mode === 'confirm-delete' && selected && (
        <Box marginTop={1}>
          <ConfirmDialog
            message={`Delete row #${selected.id}?`}
            onConfirm={confirmDelete}
            onCancel={() => setMode('list')}
          />
        </Box>
      )}

      {status && <Box marginTop={1}><Text color={T.ok}>{status}</Text></Box>}
    </Box>
  );
}

/**
 * Conference access as checkboxes, not mask strings.
 *
 * Bulls.CFG gives each conference a 20-character `X`/`-` mask, one character
 * per bulletin. Typing those strings right in a settings form is the job the
 * sysop asked to modernise: this matrix puts bulletins across the top and
 * conferences down the side, and a tick means shown. It saves through the
 * door-settings API like any other setting - the masks stay declared (and
 * hidden) in the manifest, so the API accepts them and no second writer is
 * invented for one file.
 *
 * The grid is a DataTable and not a hand-rolled table: a row is one
 * CONFERENCE, addressed by its setting key, so sorting cannot lose an edit -
 * the tick a cell shows is read from `masks[key]`, never from the row's
 * position. That is what keeps this out of the EDITABLE_GRIDS exception in
 * src/test/design-system-usage.test.ts, and it is what buys the failed-request
 * panel: an unreadable door-settings call used to render as an empty matrix.
 */

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { apiClient } from '../api/client';
import { useNotification } from '../contexts/NotificationContext';
import { DataTable, type DataTableColumn } from './ui/DataTable';

interface MaskSetting {
  key: string;
  label: string;
  conf: number;
}

function confOf(key: string): number | null {
  const m = /^conf_(\d+)_mask$/.exec(key);
  return m ? parseInt(m[1], 10) : null;
}

export function BullsMasksMatrix({ titles }: { titles: string[] }) {
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useNotification();
  const [masks, setMasks] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Set<string>>(new Set());

  const settingsQuery = useQuery({
    queryKey: ['door-settings', 'B'],
    queryFn: () => apiClient.getDoorSettings('B'),
  });
  const view = settingsQuery.data?.data as
    | { manifest: { settings: Array<{ key: string; label: string }> }; values: Record<string, string> }
    | undefined;

  // Memoised on the fetched view: DataTable builds its row model from this
  // array, and a fresh array on every render rebuilds the model for nothing.
  const maskSettings: MaskSetting[] = useMemo(
    () =>
      (view?.manifest.settings ?? [])
        .map(s => ({ key: s.key, label: s.label, conf: confOf(s.key) }))
        .filter((s): s is MaskSetting => s.conf !== null)
        .sort((a, b) => a.conf - b.conf),
    [view],
  );

  useEffect(() => {
    if (view && touched.size === 0) {
      const next: Record<string, string> = {};
      for (const s of maskSettings) {
        const v = view.values[s.key];
        if (typeof v === 'string') next[s.key] = v;
      }
      setMasks(next);
    }
    // maskSettings is memoised on `view`, so naming it here is the same
    // trigger the effect always had - without the exhaustive-deps waiver.
  }, [view, maskSettings, touched.size]);

  const setCells = (
    cells: Array<{ key: string; index: number }>,
    to: 'X' | '-',
  ) => {
    setMasks(prev => {
      const next = { ...prev };
      for (const { key, index } of cells) {
        const current = next[key] ?? '';
        if (index >= current.length) continue;
        next[key] = current.slice(0, index) + to + current.slice(index + 1);
      }
      return next;
    });
    setTouched(prev => {
      const next = new Set(prev);
      for (const { key } of cells) next.add(key);
      return next;
    });
  };

  const flip = (key: string, index: number) => {
    const current = masks[key] ?? '';
    if (index >= current.length) return;
    setCells([{ key, index }], current[index] === 'X' ? '-' : 'X');
  };

  /*
   * EIGHT HUNDRED CELLS, AND HE WAS CLICKING THEM ONE AT A TIME.
   *
   * "it's MANY clicks to edit multi select would be nice" (sysop,
   * 2026-09-14). Forty conferences times twenty bulletins is a grid nobody
   * should have to visit cell by cell, and the edits a sysop actually makes
   * are shaped like rows and columns: "this conference sees everything",
   * "nobody sees bulletin 14".
   *
   * A row's own toggle sets the whole conference; a column header's toggle
   * sets that bulletin everywhere. Each one asks what the majority already
   * is and moves the rest to match, so a second click undoes it - the
   * behaviour a "select all" box has everywhere else.
   */
  const rowCells = (key: string) =>
    Array.from({ length: (masks[key] ?? '').length }, (_, index) => ({ key, index }));

  const columnCells = (index: number) =>
    maskSettings
      .filter(s => index < (masks[s.key] ?? '').length)
      .map(s => ({ key: s.key, index }));

  /** What a bulk toggle should set: the opposite of what most of them are. */
  const opposite = (cells: Array<{ key: string; index: number }>): 'X' | '-' => {
    const shown = cells.filter(c => (masks[c.key] ?? '')[c.index] === 'X').length;
    return shown * 2 > cells.length ? '-' : 'X';
  };

  const toggleRow = (key: string) => setCells(rowCells(key), opposite(rowCells(key)));
  const toggleColumn = (index: number) =>
    setCells(columnCells(index), opposite(columnCells(index)));

  const save = async () => {
    const changed: Record<string, string> = {};
    for (const key of touched) changed[key] = masks[key];
    try {
      await apiClient.saveDoorSettings('B', changed);
      setTouched(new Set());
      queryClient.invalidateQueries({ queryKey: ['door-settings', 'B'] });
      showSuccess('Conference access saved');
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Save failed');
    }
  };

  if (settingsQuery.isLoading) {
    return <p className="text-sm text-content-secondary">Reading conference access...</p>;
  }
  // A door with no conference masks declared has no matrix to show. A FAILED
  // read is not that, and falls through to the table's error panel.
  if (!settingsQuery.error && maskSettings.length === 0) return null;

  const columnCount = maskSettings.reduce(
    (widest, s) => Math.max(widest, (masks[s.key] ?? '').length),
    titles.length,
  );

  const columns: DataTableColumn<MaskSetting>[] = [
    {
      id: 'conference',
      header: 'Conference',
      value: row => row.conf,
      align: 'right',
      mono: true,
      width: '8rem',
      cell: row => (
        <button
          type="button"
          title={`Show or hide every bulletin in conference ${row.conf}`}
          aria-label={`Toggle every bulletin in conference ${row.conf}`}
          onClick={() => toggleRow(row.key)}
          className="w-full text-right text-content-primary hover:text-accent"
        >
          {row.conf}
        </button>
      ),
    },
    // One column per mask position, not per menu entry: a mask is 20
    // characters whether or not 20 bulletins are listed, and the bits past the
    // last entry were tickable before this grid became a DataTable.
    ...Array.from({ length: columnCount }, (_, i): DataTableColumn<MaskSetting> => {
      const name = titles[i] || `Bulletin ${i + 1}`;
      return {
        id: `bulletin-${i}`,
        header: (
          <button
            type="button"
            title={`${name} - click to show or hide it in every conference`}
            aria-label={`Toggle ${name} in every conference`}
            onClick={() => toggleColumn(i)}
            className="w-full text-content-primary hover:text-accent"
          >
            {i + 1}
          </button>
        ),
        align: 'center',
        width: '3rem',
        cell: row => {
          const ch = (masks[row.key] ?? '')[i];
          if (ch === undefined) return null;
          return (
            <input
              type="checkbox"
              checked={ch === 'X'}
              aria-label={`${name} in conference ${row.conf}`}
              onChange={() => flip(row.key, i)}
              className="h-4 w-4 accent-accent"
            />
          );
        },
      };
    }),
  ];

  const dirty = touched.size > 0;
  return (
    <div className="space-y-2 pt-4 border-t border-border">
      <div>
        <h3 className="text-lg font-semibold text-content-primary">Conference access</h3>
        <p className="text-xs text-content-secondary mt-1">
          Which bulletins each conference sees. A tick means shown — the 20-character masks in Bulls.CFG, without typing them.
          Click a conference number to set its whole row, or a bulletin number to set that column everywhere; either one flips back on a second click.
        </p>
      </div>
      <DataTable
        columns={columns}
        rows={maskSettings}
        getRowId={row => row.key}
        initialSort={[{ id: 'conference', desc: false }]}
        emptyMessage="No conference masks are declared for this door."
        error={settingsQuery.error as Error | null}
        onRetry={() => settingsQuery.refetch()}
      />
      <button
        type="button"
        onClick={save}
        disabled={!dirty}
        className="btn-secondary inline-flex items-center gap-2 disabled:opacity-50"
      >
        <Save className="h-4 w-4" />
        Save conference access
      </button>
      {dirty && (
        <span className="text-xs text-content-secondary ml-2">
          {touched.size} conference{touched.size === 1 ? '' : 's'} changed
        </span>
      )}
    </div>
  );
}

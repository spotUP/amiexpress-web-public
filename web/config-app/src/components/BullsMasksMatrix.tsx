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

  const flip = (key: string, index: number) => {
    const current = masks[key] ?? '';
    if (index >= current.length) return;
    const next = current.slice(0, index) + (current[index] === 'X' ? '-' : 'X') + current.slice(index + 1);
    setMasks(prev => ({ ...prev, [key]: next }));
    setTouched(prev => new Set(prev).add(key));
  };

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
    },
    // One column per mask position, not per menu entry: a mask is 20
    // characters whether or not 20 bulletins are listed, and the bits past the
    // last entry were tickable before this grid became a DataTable.
    ...Array.from({ length: columnCount }, (_, i): DataTableColumn<MaskSetting> => {
      const name = titles[i] || `Bulletin ${i + 1}`;
      return {
        id: `bulletin-${i}`,
        header: <span title={name}>{i + 1}</span>,
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

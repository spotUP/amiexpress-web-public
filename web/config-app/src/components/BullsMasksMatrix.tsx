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
 */

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { apiClient } from '../api/client';
import { useNotification } from '../contexts/NotificationContext';

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

  const maskSettings: MaskSetting[] = (view?.manifest.settings ?? [])
    .map(s => ({ key: s.key, label: s.label, conf: confOf(s.key) }))
    .filter((s): s is MaskSetting => s.conf !== null)
    .sort((a, b) => a.conf - b.conf);

  useEffect(() => {
    if (view && touched.size === 0) {
      const next: Record<string, string> = {};
      for (const s of maskSettings) {
        const v = view.values[s.key];
        if (typeof v === 'string') next[s.key] = v;
      }
      setMasks(next);
    }
    // maskSettings is derived from view; depending on it loops the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, touched.size]);

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
  if (maskSettings.length === 0) return null;

  const dirty = touched.size > 0;
  return (
    <div className="space-y-2 pt-4 border-t border-border">
      <div>
        <h3 className="text-lg font-semibold text-content-primary">Conference access</h3>
        <p className="text-xs text-content-secondary mt-1">
          Which bulletins each conference sees. A tick means shown — the 20-character masks in Bulls.CFG, without typing them.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="text-sm border-collapse">
          <thead>
            <tr>
              <th className="py-1 pr-2 font-medium text-left text-content-secondary">Conf</th>
              {titles.map((title, i) => (
                <th key={i} className="px-1 font-medium text-content-secondary" title={title || `Bulletin ${i + 1}`}>
                  <span className="block max-w-16 truncate text-xs">{i + 1}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {maskSettings.map(s => (
              <tr key={s.key} className="border-b border-border/50">
                <td className="py-1 pr-2 font-mono text-content-secondary whitespace-nowrap">{s.conf}</td>
                {(masks[s.key] ?? '').split('').map((ch, i) => (
                  <td key={i} className="px-1 text-center">
                    <input
                      type="checkbox"
                      checked={ch === 'X'}
                      aria-label={`${titles[i] || `Bulletin ${i + 1}`} in conference ${s.conf}`}
                      onChange={() => flip(s.key, i)}
                      className="h-4 w-4 accent-accent"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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

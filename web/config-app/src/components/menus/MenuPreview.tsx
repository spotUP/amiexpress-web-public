import { useEffect, useState } from 'react';
import { apiClient, type MenuPreviewView } from '../../api/client';
import type { MenuKind } from '@bbs/screens/menu-config/menu-config';
import { PREVIEW_WIDTHS, previewDefaults } from './menu-edit';
import { INPUT_CLASS } from './menu-styles';

interface Props { kind: MenuKind; saves: number }

/** A reading aid for what a caller of these properties is offered - not the door's own screen. */
export function MenuPreview({ kind, saves }: Props) {
  const [level, setLevel] = useState(255);
  const [conference, setConference] = useState(1);
  const [{ columns, mode }, setDisplay] = useState(previewDefaults(80));
  const [view, setView] = useState<MenuPreviewView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string>('');

  useEffect(() => {
    let live = true;
    setError(null);
    apiClient.previewMenu(kind, { level, columns, conference, mode }).then(
      v => { if (live) setView(v); },
      (e: unknown) => { if (live) setError(e instanceof Error ? e.message : 'The preview failed'); },
    );
    return () => { live = false; };
  }, [kind, level, columns, conference, mode, saves]);

  const gridColumns = Math.max(1, Math.floor(columns / 30));

  return (
    <aside className="space-y-3">
      <h3 className="text-sm font-semibold text-content-primary">Preview</h3>
      <div className="grid grid-cols-2 gap-2 text-sm text-content-primary">
        <label>Preview level
          <input aria-label="Preview level" type="number" min={0} max={255} className={INPUT_CLASS} value={level}
            onChange={e => setLevel(Math.min(255, Math.max(0, Number(e.target.value) || 0)))} />
        </label>
        <label>Preview conference
          <input aria-label="Preview conference" type="number" min={1} className={INPUT_CLASS} value={conference}
            onChange={e => setConference(Math.max(1, Number(e.target.value) || 1))} />
        </label>
        <label>Preview width
          <select aria-label="Preview width" className={INPUT_CLASS} value={columns} onChange={e => setDisplay(previewDefaults(Number(e.target.value)))}>
            {PREVIEW_WIDTHS.map(w => <option key={w} value={w}>{w}</option>)}
          </select>
        </label>
        <label>Preview display mode
          <select aria-label="Preview display mode" className={INPUT_CLASS} value={mode} onChange={e => setDisplay(d => ({ ...d, mode: e.target.value as 'ansi' | 'petscii' }))}>
            <option value="ansi">Amiga ANSI</option>
            <option value="petscii">C64 PETSCII</option>
          </select>
        </label>
      </div>

      {error && <p className="text-sm text-status-danger">{error}</p>}
      {view && 'refusal' in view && <p className="text-sm text-content-secondary">{view.refusal}</p>}
      {view && 'sections' in view && (
        <div className="font-mono text-sm text-content-primary bg-surface-0 border border-border rounded p-2 space-y-2">
          {view.sections.map(s => (
            <div key={s.id}>
              <div className="text-content-secondary">{s.title}</div>
              <div className="grid gap-x-4" style={{ gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))` }}>
                {s.entries.map(e => (
                  <div key={e.key} onMouseEnter={() => setHovered(e.description)} onMouseLeave={() => setHovered('')} className="whitespace-pre truncate">
                    {e.key.padEnd(4)}{e.label}
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="border-t border-border pt-1 text-content-secondary min-h-[1.5em]">{hovered}</div>
        </div>
      )}
    </aside>
  );
}

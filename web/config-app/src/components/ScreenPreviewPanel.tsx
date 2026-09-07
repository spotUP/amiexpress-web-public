import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { apiClient } from '../api/client';
import { ScreenPreview } from './ScreenPreview';
import { PetsciiScreenPreview } from './PetsciiScreenPreview';
import { SkeletonRows } from './ui/states';

/** What the board answered for one screen, one caller, one theme. */
export interface ScreenPreviewResult {
  screen: string;
  theme: string;
  filePath: string;
  isPetscii: boolean;
  isRip: boolean;
  secLevel: number;
  content: string;
  commands: string[];
  searched: { dir: string; desc: string }[];
}

/** The widths a caller's terminal can be, and what each one is called. */
export const TERMINALS = [
  { id: 'ansi' as const, label: 'Amiga ANSI, 80 columns' },
  { id: 'c64' as const, label: 'C64 PETSCII, 40 columns' },
  { id: 'rip' as const, label: 'RIPscrip' },
];

export interface CallerShape {
  screen: string;
  term: 'ansi' | 'c64' | 'rip';
  sec: number;
  node: number;
  conf: number;
}

export interface ScreenPreviewPanelProps {
  /** The theme slug the caller wears - `default` for the board's own screens. */
  theme: string;
  /** How that theme is named to the sysop. */
  themeTitle: string;
  /** The screens the board can display, for the picker. */
  screenNames: string[];
  initial?: Partial<CallerShape>;
}

/**
 * A screen as a caller meets it, in one theme.
 *
 * The board's own loader and MCI parser answer, so what is drawn is the screen
 * a caller would be served - not a rendering of it. One component, used both
 * from the Themes page's preview and from the screens page beside the theme
 * selector: the sysop asked for the preview to live with the selector, and a
 * second copy of this form is how two dialogs drift apart.
 */
export function ScreenPreviewPanel({ theme, themeTitle, screenNames, initial }: ScreenPreviewPanelProps) {
  const [asCaller, setAsCaller] = useState<CallerShape>({
    screen: initial?.screen ?? (screenNames[0] ?? 'BULL'),
    term: initial?.term ?? 'ansi',
    sec: initial?.sec ?? 255,
    node: initial?.node ?? 1,
    conf: initial?.conf ?? 1,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['screen-preview', theme, asCaller],
    queryFn: () => apiClient.previewScreen({ ...asCaller, theme }),
    enabled: asCaller.screen.trim() !== '',
    retry: false,
  });
  const shown = (data as { data?: ScreenPreviewResult } | undefined)?.data;
  const options = screenNames.length ? screenNames : [asCaller.screen];

  return (
    <div data-testid="screen-preview-panel">
      <p className="mt-1 text-sm text-content-secondary">
        The board&apos;s own loader and MCI parser answer this, so what is drawn below is the
        screen a caller wearing {themeTitle} would be served - not a rendering of it. Commands
        are named, never run.
      </p>

      <div className="flex flex-wrap gap-3 my-4">
        <div>
          <label htmlFor="preview-screen" className="label">Screen</label>
          <select
            id="preview-screen"
            className="input-field"
            value={asCaller.screen}
            onChange={event => setAsCaller({ ...asCaller, screen: event.target.value })}
          >
            {options.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>

        <div>
          <label htmlFor="preview-term" className="label">Terminal</label>
          <select
            id="preview-term"
            className="input-field"
            value={asCaller.term}
            onChange={event => setAsCaller({ ...asCaller, term: event.target.value as CallerShape['term'] })}
          >
            {TERMINALS.map(terminal => <option key={terminal.id} value={terminal.id}>{terminal.label}</option>)}
          </select>
        </div>

        <div>
          <label htmlFor="preview-sec" className="label">Security level</label>
          <input
            id="preview-sec"
            className="input-field w-24"
            type="number" min={0} max={255}
            value={asCaller.sec}
            onChange={event => setAsCaller({ ...asCaller, sec: Number(event.target.value) })}
          />
        </div>

        <div>
          <label htmlFor="preview-node" className="label">Node</label>
          <input
            id="preview-node"
            className="input-field w-24"
            type="number" min={0}
            value={asCaller.node}
            onChange={event => setAsCaller({ ...asCaller, node: Number(event.target.value) })}
          />
        </div>

        <div>
          <label htmlFor="preview-conf" className="label">Conference</label>
          <input
            id="preview-conf"
            className="input-field w-24"
            type="number" min={1}
            value={asCaller.conf}
            onChange={event => setAsCaller({ ...asCaller, conf: Number(event.target.value) })}
          />
        </div>
      </div>

      {isLoading && <SkeletonRows rows={6} />}
      {error instanceof Error && <p className="text-sm text-status-danger">{error.message}</p>}

      {shown && !isLoading && (
        <div className="space-y-2">
          {shown.isPetscii
            ? <PetsciiScreenPreview content={shown.content} />
            : <ScreenPreview content={atob(shown.content)} cols={asCaller.term === 'c64' ? 40 : 80} />}

          <dl className="text-xs text-ink-muted">
            <div>
              <dt className="inline">Served from </dt>
              <dd className="inline"><code>{shown.filePath}</code></dd>
            </div>
            <div>
              <dt className="inline">Theme that answered </dt>
              <dd className="inline">{shown.theme}</dd>
            </div>
            {theme !== 'default' && shown.theme !== theme && (
              <div>
                <dd>
                  This screen falls through to the board - {themeTitle} does not carry it, or you
                  may not wear it.
                </dd>
              </div>
            )}
            {shown.commands.length > 0 && (
              <div>
                <dt className="inline">Commands a caller would run </dt>
                <dd className="inline"><code>{shown.commands.join(', ')}</code></dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </div>
  );
}

/**
 * Picking a code, and whatever the code needs pointing at.
 *
 * The editor used to offer four buttons that typed a template with a
 * placeholder in it - `~CC_command|`, and the sysop was expected to know that
 * `command` meant a door and to type its name correctly. This replaces that:
 * every code the board runs, and for the ones that take an argument, the
 * board's OWN list of what they can point at.
 *
 * Three things it refuses to do quietly, each one a way a screen breaks
 * silently rather than loudly:
 *
 *   - Write a code into a file whose first line has no tilde. The board parses
 *     codes only in a file that starts with one, so the code would print at
 *     the caller as text.
 *   - Paint over a drawing. The canvas is a fixed grid and typing overwrites,
 *     so a code dropped into art replaces the cells it covers.
 *   - Write a code with the wrong terminator, which is `buildMciToken`'s job -
 *     four codes want a period and three want a double pipe.
 */

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { Modal } from './ui/Modal';
import {
  groupMciCodes, filterMciCodes, describeMciUsage, buildMciToken,
  canvasEnablesMci, textUnder, splitToken,
  type MciCodeShape, type MciFamilyShape, type MciCanvas,
} from '../pages/screen-mci';

interface MciTarget {
  value: string;
  label: string;
  detail?: string;
}

interface MciPickerProps {
  open: boolean;
  onClose: () => void;
  /** The screen being drawn on, so the picker can see what it would land on. */
  canvas: MciCanvas;
  /** Where the code would be typed. */
  cursor: { x: number; y: number };
  /** Put a tilde on the first line, so the codes in this file run. */
  onEnable: () => void;
  onInsert: (token: string) => void;
  /**
   * A code already in the screen, being changed rather than added.
   *
   * The dialog opens on that code with its argument and width filled in, so
   * editing is the same act as inserting - one picker, one place that knows
   * how a code is written.
   */
  editing?: { text: string; length: number } | null;
}

export function MciPicker({
  open, onClose, canvas, cursor, onEnable, onInsert, editing = null,
}: MciPickerProps) {
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<MciCodeShape | null>(null);
  const [argument, setArgument] = useState('');
  const [width, setWidth] = useState('');

  const { data: catalog } = useQuery({
    queryKey: ['mci-catalog'],
    queryFn: async () => (await apiClient.getMciCatalog()).data as {
      families: MciFamilyShape[];
      codes: MciCodeShape[];
    },
    enabled: open,
  });

  // Only the argument kinds that have a list behind them; text, number and
  // char are typed, and `none` asks nothing.
  const listKind = chosen && ['command', 'screen', 'door', 'menu'].includes(chosen.argument.kind)
    ? (chosen.argument.kind as 'command' | 'screen' | 'door' | 'menu')
    : null;

  const { data: targets } = useQuery({
    queryKey: ['mci-targets', listKind],
    queryFn: async () => (await apiClient.getMciTargets(listKind as 'command')).data as {
      targets: MciTarget[];
    },
    enabled: !!listKind,
  });

  useEffect(() => {
    if (!open) {
      setChosen(null);
      setArgument('');
      setWidth('');
      setQuery('');
    }
  }, [open]);

  /**
   * Open on the code being edited, taken apart into the fields that wrote it.
   *
   * Waits for the catalog: which code `~SS_x|` is cannot be known without the
   * list, and guessing it from the text is a second parser.
   */
  useEffect(() => {
    if (!open || !editing || !catalog) return;

    const split = splitToken(editing.text, catalog.codes);
    if (!split) return;

    const entry = catalog.codes.find(c => c.code === split.code);
    if (!entry) return;

    setChosen(entry);
    setArgument(split.argument);
    setWidth(split.width === null ? '' : String(split.width));
  }, [open, editing, catalog]);

  const sections = useMemo(
    () => groupMciCodes(filterMciCodes(catalog?.codes ?? [], query), catalog?.families ?? []),
    [catalog, query],
  );

  /** The code as it would be written, or why it cannot be written yet. */
  const preview = useMemo(() => {
    if (!chosen) return { token: '', error: '' };
    try {
      const parsed = width.trim() ? Number(width) : null;
      return { token: buildMciToken(chosen, argument, parsed), error: '' };
    } catch (error) {
      return { token: '', error: (error as Error).message };
    }
  }, [chosen, argument, width]);

  // The code's OWN length, so the warning names exactly the characters that
  // would be lost rather than a guess at how wide a code is.
  const overwrites = preview.token
    ? textUnder(canvas, cursor.x, cursor.y, preview.token.length)
    : '';
  const enabled = canvasEnablesMci(canvas);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Change this code' : 'Insert a code'}
      maxWidth="max-w-4xl"
    >
      <div className="space-y-3 p-4 text-sm">
        {!enabled && (
          <div className="border border-status-warn p-2 space-y-1">
            <p className="text-content-primary">
              This screen's first line does not start with a tilde, so the board
              will not run ANY code in it - a code you insert now prints at the
              caller as text.
            </p>
            <button type="button" className="underline" onClick={onEnable}>
              Put a tilde in the top-left cell
            </button>
          </div>
        )}

        {!chosen && (
          <>
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search the codes"
              className="input-field w-full max-w-sm"
            />
            <div className="max-h-96 space-y-3 overflow-auto">
              {sections.map(section => (
                <section key={section.family} className="space-y-1">
                  <h4 className="text-content-primary">{section.label}</h4>
                  <div className="flex flex-wrap gap-2">
                    {section.codes.map(code => (
                      <button
                        key={code.code}
                        type="button"
                        className="border border-border px-2 py-1 text-left"
                        title={`${code.summary} - ${describeMciUsage(code)}`}
                        onClick={() => { setChosen(code); setArgument(''); setWidth(''); }}
                      >
                        <span className="block font-mono text-content-primary">~{code.code}</span>
                        <span className="block text-content-secondary">{code.summary}</span>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
              {sections.length === 0 && (
                <p className="text-content-secondary">No code matches that.</p>
              )}
            </div>
          </>
        )}

        {chosen && (
          <div className="space-y-3">
            <div>
              <span className="font-mono text-content-primary">~{chosen.code}</span>
              <span className="text-content-secondary"> - {chosen.summary}</span>
              <button type="button" className="ml-2 underline" onClick={() => setChosen(null)}>
                pick another
              </button>
            </div>

            {listKind && (
              <label className="block space-y-1">
                <span className="block text-content-secondary">
                  {listKind === 'command' ? 'Which command'
                    : listKind === 'screen' ? 'Which screen'
                      : listKind === 'door' ? 'Which door' : 'Which menu'}
                </span>
                <select
                  className="input-field w-full max-w-lg"
                  value={argument}
                  onChange={e => setArgument(e.target.value)}
                >
                  <option value="">Choose one</option>
                  {(targets?.targets ?? []).map(target => (
                    <option key={target.value} value={target.value}>
                      {target.label}{target.detail ? ` - ${target.detail}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {!listKind && chosen.argument.kind !== 'none' && (
              <label className="block space-y-1">
                <span className="block text-content-secondary">
                  {chosen.argument.label ?? 'What it needs'}
                </span>
                <input
                  type={chosen.argument.kind === 'number' ? 'number' : 'text'}
                  className="input-field w-full max-w-sm"
                  value={argument}
                  onChange={e => setArgument(e.target.value)}
                />
              </label>
            )}

            {chosen.takesWidth && (
              <label className="block space-y-1">
                <span className="block text-content-secondary">
                  Columns to fit it into - leave empty for as long as it comes out
                </span>
                <input
                  type="number"
                  min={1}
                  className="input-field w-full max-w-xs"
                  value={width}
                  onChange={e => setWidth(e.target.value)}
                />
              </label>
            )}

            {!editing && overwrites && (
              <p className="text-status-warn">
                This lands on top of "{overwrites}" - typing paints over what is
                already drawn there. Move the cursor somewhere blank first.
              </p>
            )}

            {editing && preview.token.length > editing.length && (
              <p className="text-status-warn">
                This is {preview.token.length - editing.length} character
                {preview.token.length - editing.length === 1 ? '' : 's'} longer
                than the code it replaces, so it will paint over what is drawn
                to its right.
              </p>
            )}

            {preview.error
              ? <p className="text-status-danger">{preview.error}</p>
              : <p className="font-mono text-content-primary">{preview.token}</p>}

            <button
              type="button"
              className="border border-border px-3 py-1"
              disabled={!preview.token}
              onClick={() => { onInsert(preview.token); onClose(); }}
            >
              {editing ? 'Change it' : 'Insert it'}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

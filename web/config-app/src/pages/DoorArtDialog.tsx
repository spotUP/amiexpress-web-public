/**
 * One door's art block, drawn in the ANSI Studio.
 *
 * Art living INSIDE a config file (Bulls' Title logo in Bulls.CFG) has no
 * screen path, so the file dialog cannot open it. This dialog opens the
 * section through the door-art endpoints instead, on the same ScreenEditor
 * canvas: ANSI art in, ANSI art out. Saving rewrites spacing and line
 * endings to canvas format and flattens bold (said below, as on bulletins);
 * the DOC limits ride along from the manifest and are enforced server-side.
 */

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { apiClient } from '../api/client';
import { useNotification } from '../contexts/NotificationContext';
import { Modal } from '../components/ui/Modal';
import { ScreenEditor } from '../components/ScreenEditor';
import { createSurface, type EditorSurface } from './screen-editor-state';
import { screenToCanvas, base64ToLatin1, latin1ToBase64 } from './screen-bytes';

/**
 * The three canvases. `wide` is the door's own art in its own file; the two
 * variants are the board's, drawn for a caller whose screen is forty
 * columns and served to him by the Empire narrow shadow.
 */
type Variant = 'wide' | 'c64' | 'ttx';

const VARIANT_LABELS: Record<Variant, string> = { wide: 'Wide', c64: 'C64', ttx: 'Teletext' };

/** A narrow drawing is forty columns; the wide one keeps the door's DOC number. */
const VARIANT_COLUMNS = 40;

/** Printable columns of a row: CSI sequences are zero-width. */
const columnsOf = (line: string): number => line.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').length;

export interface DoorArtDialogProps {
  command: string;
  doorName: string;
  file: string;
  section: string;
  label: string;
  maxLines: number;
  maxLineLength: number;
  onClose: () => void;
}

export function DoorArtDialog({
  command, doorName, file, section, label, maxLines, maxLineLength, onClose,
}: DoorArtDialogProps) {
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useNotification();
  const [surface, setSurface] = useState<EditorSurface | null>(null);
  const [building, setBuilding] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lineCount, setLineCount] = useState(0);
  const [variant, setVariant] = useState<Variant>('wide');
  const [drawn, setDrawn] = useState<{ c64: boolean; ttx: boolean }>({ c64: false, ttx: false });
  /** The wide art, kept so a variant can be started from it. */
  const [wideContent, setWideContent] = useState<string | null>(null);
  const [wideLines, setWideLines] = useState(0);

  /**
   * One canvas, per variant.
   *
   * The section listing is read whichever variant is open: it carries the
   * wide art (what a variant is started FROM) and which variants exist (so
   * the switch can say "not drawn" rather than show a blank canvas that
   * looks the same as a drawing somebody emptied).
   */
  useEffect(() => {
    let live = true;
    setBuilding(true);
    setStatus(null);
    apiClient.getDoorArt(command).then(async (res: any) => {
      const sections = (res?.data ?? res) as Array<{
        file: string; section: string; content: string;
        variants?: { c64: boolean; ttx: boolean };
      }>;
      const match = sections.find(s => s.file === file && s.section.toLowerCase() === section.toLowerCase());
      if (!live) return;
      if (!match) {
        setStatus(`No ${label} found on ${doorName}.`);
        setBuilding(false);
        return;
      }
      setDrawn(match.variants ?? { c64: false, ttx: false });
      setWideContent(match.content);
      setWideLines(base64ToLatin1(match.content).split('\n').length);
      try {
        let content = match.content;
        if (variant !== 'wide') {
          const one: any = await apiClient.getDoorArtVariant(command, file, section, variant);
          content = (one?.data ?? one)?.content ?? '';
        }
        // An undrawn variant is a blank page, not an error: the artist
        // starts drawing on it.
        const canvas = await screenToCanvas(content);
        if (live) {
          setSurface(createSurface(canvas));
          setLineCount(content ? base64ToLatin1(content).split('\n').length : 0);
        }
      } catch (e: unknown) {
        if (live) setStatus(`Art preview failed: ${e instanceof Error ? e.message : 'parse error'}`);
      } finally {
        if (live) setBuilding(false);
      }
    }).catch((e: unknown) => {
      if (live) {
        setStatus(`Error: ${e instanceof Error ? e.message : 'Failed'}`);
        setBuilding(false);
      }
    });
    return () => { live = false; };
  }, [command, doorName, file, section, label, variant]);

  const save = async (base64: string) => {
    setSaving(true);
    setStatus(null);
    try {
      // The canvas is always 25 rows; the section is not. Trailing blank
      // rows would bloat the logo past its DOC limit and the door's eyes.
      const lines = base64ToLatin1(base64).split('\n');
      while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
      if (lines.length > maxLines) {
        setStatus(`Error: ${lines.length} lines, at most ${maxLines} — trim the art first.`);
        return;
      }
      // A variant is drawn for a forty-column screen; the wide art keeps the
      // door's own DOC number.
      const limit = variant === 'wide' ? maxLineLength : VARIANT_COLUMNS;
      const over = lines.findIndex(l => columnsOf(l) > limit);
      if (over !== -1) {
        setStatus(`Error: line ${over + 1} is ${columnsOf(lines[over])} columns, at most ${limit}.`);
        return;
      }
      await apiClient.saveDoorArt(
        command, file, section, latin1ToBase64(lines.join('\n')),
        variant === 'wide' ? undefined : variant,
      );
      queryClient.invalidateQueries({ queryKey: ['door-art'] });
      // Taller than the art it replaces is allowed and sometimes wanted, but
      // it costs the door rows it expected to have for its own list.
      if (variant !== 'wide' && wideLines > 0 && lines.length > wideLines) {
        showSuccess(
          `${label} saved - ${lines.length} rows against the wide art's ${wideLines}, ` +
          `so the door has ${lines.length - wideLines} fewer for its list`,
        );
      } else {
        showSuccess(`${label} saved`);
      }
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Save failed';
      setStatus(`Error: ${msg}`);
      showError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    /*
       A dialog announces itself as one. This was a `fixed inset-0` div with
       no `role="dialog"`, no focus trap and an Escape handler of its own, so
       a keyboard user could tab out of the canvas into the page behind it and
       never get back (src/test/modal-semantics.test.tsx). The shared Modal
       owns the shell, Escape and the backdrop; the header below stays, so the
       accessible name comes from the Modal's own hidden title.
    */
    <Modal open title={`${doorName} - ${label}`} maxWidth="max-w-4xl" showHeader={false} onClose={onClose}>
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-content-primary">
            {doorName} — {label}
            <span className="ml-2 font-mono text-xs text-content-secondary">{file} [{section}]</span>
          </h3>
          <button onClick={onClose} className="px-3 py-1 text-content-secondary hover:text-content-primary text-sm">
            Close (ESC)
          </button>
        </div>
        <div className="flex items-center gap-2" role="group" aria-label="Art variant">
          {(['wide', 'c64', 'ttx'] as Variant[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVariant(v)}
              aria-pressed={variant === v}
              className={
                variant === v
                  ? 'px-3 py-1 text-sm rounded bg-surface-2 text-content-primary'
                  : 'px-3 py-1 text-sm rounded text-content-secondary hover:text-content-primary'
              }
            >
              {VARIANT_LABELS[v]}{v !== 'wide' && !drawn[v] ? ' (not drawn)' : ''}
            </button>
          ))}
          {variant !== 'wide' && wideContent && (
            <button
              type="button"
              className="ml-auto px-3 py-1 text-sm text-content-secondary hover:text-content-primary"
              onClick={async () => {
                try {
                  setSurface(createSurface(await screenToCanvas(wideContent)));
                  setStatus('The wide art, to cut down. Nothing is saved until you save it.');
                } catch {
                  setStatus('Could not copy the wide art onto the canvas.');
                }
              }}
            >
              Start from the wide art
            </button>
          )}
        </div>
        {status && <p className="text-sm text-content-primary">{status}</p>}
        {building ? (
          <p className="text-sm text-content-secondary flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Building canvas...
          </p>
        ) : surface ? (
          <>
            <ScreenEditor
              surface={surface}
              mci={[]}
              filePath={`${file}#${section}`}
              onChange={setSurface}
              onSave={save}
              onCancel={onClose}
            />
            <p className="text-xs text-content-secondary">
              {lineCount} lines now; at most {maxLines} lines of{' '}
              {variant === 'wide' ? maxLineLength : VARIANT_COLUMNS} columns{' '}
              {variant === 'wide' ? "(the door's own limits)" : '(a 40-column screen)'}.
              Saving rewrites spacing and line endings to canvas format and flattens bold.
            </p>
          </>
        ) : (
          !status && <p className="text-sm text-content-secondary">No art to show.</p>
        )}
        {saving && <p className="text-sm text-content-secondary">Saving...</p>}
      </div>
    </Modal>
  );
}

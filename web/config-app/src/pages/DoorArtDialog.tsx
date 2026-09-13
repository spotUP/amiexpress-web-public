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

  useEffect(() => {
    let live = true;
    setBuilding(true);
    setStatus(null);
    apiClient.getDoorArt(command).then(async (res: any) => {
      const sections = (res?.data ?? res) as Array<{ file: string; section: string; content: string }>;
      const match = sections.find(s => s.file === file && s.section.toLowerCase() === section.toLowerCase());
      if (!live) return;
      if (!match) {
        setStatus(`No ${label} found on ${doorName}.`);
        setBuilding(false);
        return;
      }
      try {
        const canvas = await screenToCanvas(match.content);
        if (live) {
          setSurface(createSurface(canvas));
          setLineCount(base64ToLatin1(match.content).split('\n').length);
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
  }, [command, doorName, file, section, label]);

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
      const wide = lines.findIndex(l => l.length > maxLineLength);
      if (wide !== -1) {
        setStatus(`Error: line ${wide + 1} is ${lines[wide].length} chars, at most ${maxLineLength}.`);
        return;
      }
      await apiClient.saveDoorArt(command, file, section, latin1ToBase64(lines.join('\n')));
      queryClient.invalidateQueries({ queryKey: ['door-art'] });
      showSuccess(`${label} saved`);
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
              {lineCount} lines now; at most {maxLines} lines of {maxLineLength} chars (the door's own limits).
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

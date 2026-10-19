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
import { ArrowLeft, Loader2, X } from 'lucide-react';
import { apiClient } from '../api/client';
import { useNotification } from '../contexts/NotificationContext';
import { Modal } from '../components/ui/Modal';
import { DialogTabs } from '../components/ui/Tabs';
import { ScreenEditor } from '../components/ScreenEditor';
import { TeletextScreenEditor } from '../components/TeletextScreenEditor';
import { ArtUploadButton, ANSI_UPLOAD_ACCEPT } from '../components/ArtUploadButton';
import { createSurface, type EditorSurface } from './screen-editor-state';
import { screenToCanvas, screenToArt, canvasToScreen, base64ToLatin1, latin1ToBase64 } from './screen-bytes';

/**
 * The three canvases. `wide` is the door's own art in its own file; the two
 * variants are the board's, drawn for a caller whose screen is forty
 * columns and served to him by the Empire narrow shadow.
 */
type Variant = 'wide' | 'c64' | 'ttx';

const VARIANT_LABELS: Record<Variant, string> = { wide: 'Amiga', c64: 'C64', ttx: 'Teletext' };

/** A narrow drawing is forty columns; the wide one keeps the door's DOC number. */
const VARIANT_COLUMNS = 40;

/** Printable columns of a row: CSI sequences are zero-width. */
const columnsOf = (line: string): number => line.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').length;

/**
 * Canvas bytes as rows a door's limits can be measured against.
 *
 * The canvas writes every row the full canvas width and ends it in CRLF, so
 * measured raw a one-word logo was "line 1 is 81 columns, at most 80": the
 * CR counted as a column and the pad of spaces as art. This drops the CR and
 * the trailing spaces that print nothing - spaces standing on a background
 * colour are drawing and stay.
 */
function canvasRows(text: string): string[] {
  let background = 0;
  const follow = (codes: string) => {
    for (const sgr of codes.matchAll(/\x1b\[([0-9;]*)m/g)) {
      for (const code of (sgr[1] === '' ? '0' : sgr[1]).split(';').map(Number)) {
        if (code === 0 || code === 49 || code === 40) background = 0;
        else if ((code >= 41 && code <= 47) || (code >= 100 && code <= 107)) background = code;
      }
    }
  };
  return text.split('\n').map(raw => {
    // The last row ends in the canvas's closing reset, after the pad.
    const line = raw.replace(/\r$/, '');
    const tail = /(?:\x1b\[[0-9;]*m)*$/.exec(line)?.[0] ?? '';
    const body = line.slice(0, line.length - tail.length);
    follow(body);
    const kept = background === 0 ? body.replace(/ +$/, '') : body;
    follow(tail);
    return kept + tail;
  });
}

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

export interface DoorArtEditorProps extends DoorArtDialogProps {
  /** Inside another dialog's Art tab: no tab strip and no dialog of its own. */
  embedded?: boolean;
}

export function DoorArtEditor({
  command, doorName, file, section, label, maxLines, maxLineLength, onClose, embedded = false,
}: DoorArtEditorProps) {
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useNotification();
  const [surface, setSurface] = useState<EditorSurface | null>(null);
  const [building, setBuilding] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lineCount, setLineCount] = useState(0);
  const [variant, setVariant] = useState<Variant>('wide');
  const [drawn, setDrawn] = useState<{ c64: boolean; ttx: boolean; tti: boolean }>({ c64: false, ttx: false, tti: false });
  /**
   * The Teletext tab draws the NATIVE page (`<section>.tti`, variant `tti`),
   * not an ANSI picture: the board serves a teletext caller the .tti first
   * and the .ttx.ans only when no native page exists. Null until loaded.
   */
  const [ttiContent, setTtiContent] = useState<string | null>(null);
  /**
   * The narrow tabs this slot has: the drawings its door actually reads. A
   * tab whose drawing nothing reads was a save that changed nothing a caller
   * saw (MAG's Teletext tab, REQUESTS' C64 one). Wide only until the listing says.
   */
  const [offers, setOffers] = useState<Array<'c64' | 'ttx'>>([]);
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
        variants?: { c64: boolean; ttx: boolean; tti?: boolean };
        offers?: Array<'c64' | 'ttx'>;
      }>;
      const match = sections.find(s => s.file === file && s.section.toLowerCase() === section.toLowerCase());
      if (!live) return;
      if (!match) {
        setStatus(`No ${label} found on ${doorName}.`);
        setBuilding(false);
        return;
      }
      setDrawn({
        c64: match.variants?.c64 ?? false,
        ttx: match.variants?.ttx ?? false,
        tti: match.variants?.tti ?? false,
      });
      setOffers(match.offers ?? []);
      setWideContent(match.content);
      setWideLines(base64ToLatin1(match.content).split('\n').length);
      try {
        if (variant === 'ttx') {
          const one: any = await apiClient.getDoorArtVariant(command, file, section, 'tti');
          if (live) setTtiContent((one?.data ?? one)?.content ?? '');
          return;
        }
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

  /**
   * Write the art, and hand back the bytes that actually landed.
   *
   * It used to end with `onClose()`, which is right for the editor's Save
   * button and wrong for an upload - the sysop picked a file and the dialog
   * vanished before showing what had been uploaded ("when i upload art for
   * the request door the dialog closes when its done, not good"). Closing is
   * the CALLER's decision now; the returned bytes are how the upload path
   * repaints the canvas with what it just saved.
   *
   * @returns the saved bytes, or null if nothing was written.
   */
  /**
   * A refusal is said twice: in the dialog, and as a notification. The line
   * in the dialog sits above the canvas, out of view of an artist who has
   * just scrolled down to "Upload a drawing", and a refusal nobody sees reads
   * as an upload that "doesn't seem to work".
   */
  const refuse = (reason: string) => {
    setStatus(`Error: ${reason}`);
    showError(`${label} not saved: ${reason}`);
  };

  const save = async (base64: string): Promise<string | null> => {
    setSaving(true);
    setStatus(null);
    try {
      // The canvas is always 25 rows; the section is not. Trailing blank
      // rows would bloat the logo past its DOC limit and the door's eyes.
      const lines = canvasRows(base64ToLatin1(base64));
      while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
      if (lines.length > maxLines) {
        refuse(`${lines.length} lines, at most ${maxLines} — trim the art first.`);
        return null;
      }
      // A variant is drawn for a forty-column screen; the wide art keeps the
      // door's own DOC number.
      const limit = variant === 'wide' ? maxLineLength : VARIANT_COLUMNS;
      const over = lines.findIndex(l => columnsOf(l) > limit);
      if (over !== -1) {
        refuse(`line ${over + 1} is ${columnsOf(lines[over])} columns, at most ${limit}.`);
        return null;
      }
      const written = latin1ToBase64(lines.join('\n'));
      await apiClient.saveDoorArt(
        command, file, section, written,
        variant === 'wide' ? undefined : variant,
      );
      queryClient.invalidateQueries({ queryKey: ['door-art'] });
      // Taller than the art it replaces is allowed and sometimes wanted, but
      // it costs the door rows it expected to have for its own list.
      if (variant !== 'wide' && wideLines > 0 && lines.length > wideLines) {
        showSuccess(
          `${label} saved - ${lines.length} rows against the Amiga art's ${wideLines}, ` +
          `so the door has ${lines.length - wideLines} fewer for its list`,
        );
      } else {
        showSuccess(`${label} saved`);
      }
      return written;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Save failed';
      setStatus(`Error: ${msg}`);
      showError(msg);
      return null;
    } finally {
      setSaving(false);
    }
  };

  /**
   * Write the native teletext page. No row trim and no column count: a .tti
   * is packet records, one control code per byte, and the server refuses a
   * page the board cannot render.
   */
  const saveTti = async (base64: string) => {
    setSaving(true);
    setStatus(null);
    try {
      await apiClient.saveDoorArt(command, file, section, base64, 'tti');
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

  /**
   * An upload STAYS in the dialog and shows what landed - the whole point of
   * bringing a file in is to see it on the board's canvas before trusting it.
   */
  const upload = async (base64: string, chosen: File) => {
    /*
     * Through the canvas, like a drawing made here. A file from PabloDraw or
     * Moebius ends every row in CRLF and carries a SAUCE record after ^Z;
     * handed to `save` raw, the CR and the record counted as printable
     * columns and a full-width MAG logo was "line 1 is 81 columns, at most
     * 80" (artist, 2026-10-19: "Upload A Drawing ... doesn't seem to work").
     * The canvas decodes the escapes, the line endings and SAUCE exactly as
     * the editor's own Save does, so both write the same bytes.
     */
    let art: Awaited<ReturnType<typeof screenToArt>>;
    try {
      art = await screenToArt(base64, undefined, chosen.name);
    } catch {
      refuse(`${chosen.name} cannot be read as ANSI art.`);
      return;
    }
    const written = await save(canvasToScreen(art.canvas, undefined, art.amiga));
    if (written === null) return;
    setSurface(createSurface(await screenToCanvas(written)));
    setLineCount(base64ToLatin1(written).split('\n').length);
    if (variant === 'wide') {
      setWideContent(written);
      setWideLines(base64ToLatin1(written).split('\n').length);
    }
  };

  const editorOpen = !building && (variant === 'ttx' ? ttiContent !== null : surface !== null);
  const columns = variant === 'wide' ? maxLineLength : VARIANT_COLUMNS;

  /*
    THE ART TAB: which alphabet, then the editor - and nothing else. The
    limits paragraph, the upload's caption and the file name used to sit
    around the canvas all at once ("cramped and overloaded with stuff",
    sysop, 2026-10-19); the facts about the slot are on the Settings tab.
  */
  const art = (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Art alphabet">
        {(['wide', ...offers] as Variant[]).map((v) => (
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
            {VARIANT_LABELS[v]}{v !== 'wide' && !drawn[v] && !(v === 'ttx' && drawn.tti) ? ' (not drawn)' : ''}
          </button>
        ))}
        {variant === 'c64' && wideContent && (
          <button
            type="button"
            className="ml-auto px-3 py-1 text-sm text-content-secondary hover:text-content-primary"
            onClick={async () => {
              try {
                setSurface(createSurface(await screenToCanvas(wideContent)));
                setStatus('The Amiga art, to cut down. Nothing is saved until you save it.');
              } catch {
                setStatus('Could not copy the Amiga art onto the canvas.');
              }
            }}
          >
            Start from the Amiga art
          </button>
        )}
      </div>
      {status && <p className="text-sm text-content-primary">{status}</p>}
      {building ? (
        <p className="text-sm text-content-secondary flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Building canvas...
        </p>
      ) : variant === 'ttx' ? (
        ttiContent !== null && (
          <>
            {drawn.ttx && !drawn.tti && (
              <p className="text-sm text-content-secondary" data-testid="door-art-ttx-ans-notice">
                This slot has an ANSI teletext drawing (.ttx.ans). The board shows that version
                to teletext callers until a native page is saved here.
              </p>
            )}
            <TeletextScreenEditor
              key={`${file}#${section}`}
              content={ttiContent}
              filePath={`${file}#${section}.tti`}
              saving={saving}
              onSave={saveTti}
              onCancel={onClose}
            />
          </>
        )
      ) : surface ? (
        <>
          <ScreenEditor
            surface={surface}
            mci={[]}
            filePath={`${file}#${section}`}
            onChange={setSurface}
            onSave={async (screen: string) => { if (await save(screen) !== null) onClose(); }}
            onCancel={onClose}
          />
          {/*
            * Sysop, 2026-09-15: "i see no upload button in this dialog: REQ
            * - Bulletin header art". Most ANSI artists arrive with a file
            * from PabloDraw. It feeds `save`, the same function the
            * editor's own Save calls, so the DOC limits, the trailing-row
            * trim and the server's refusals all apply exactly as they do to
            * a drawing made here. ANSI only: a door's art block is ANSI
            * inside its own config file.
            */}
          <ArtUploadButton
            accept={ANSI_UPLOAD_ACCEPT}
            disabled={saving}
            testId="door-art-upload"
            onPick={upload}
          />
        </>
      ) : (
        !status && <p className="text-sm text-content-secondary">No art to show.</p>
      )}
      {saving && <p className="text-sm text-content-secondary">Saving...</p>}
    </div>
  );

  /** THE SETTINGS TAB: what this slot is and what a save does to it. */
  const settings = (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]" data-testid="door-art-settings">
      <dt className="text-content-secondary">File</dt>
      <dd className="font-mono text-content-primary break-all">{file} [{section}]</dd>
      <dt className="text-content-secondary">Size limit</dt>
      <dd className="text-content-primary">
        At most {maxLines} lines of {columns} columns{' '}
        {variant === 'wide' ? "(the door's own limits)" : '(a 40-column screen)'}
      </dd>
      <dt className="text-content-secondary">Now</dt>
      <dd className="text-content-primary">{lineCount} lines</dd>
      <dt className="text-content-secondary">Saving</dt>
      <dd className="text-content-primary">
        Rewrites spacing and line endings to canvas format and flattens bold.
      </dd>
    </dl>
  );

  /*
    ONE WAY OUT. Every editor carries its own Cancel; a second Close beside
    it was two buttons for one job ("too many save and write etc buttons in
    the editors", sysop, 2026-10-19). This one shows only while no editor is
    mounted - loading, an error, no art - so there is never none.
  */
  const leave = !editorOpen && (
    <button type="button" onClick={onClose} className="btn-small btn-secondary">
      {embedded ? <><ArrowLeft size={14} /> Back to the slot list</> : <><X size={14} /> Close</>}
    </button>
  );

  if (embedded) {
    // Inside the door dialog's Art tab: that dialog owns the tabs, so this
    // is the editor for the picked slot and its name, nothing more.
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-semibold text-content-primary">{label}</h3>
          {leave}
        </div>
        {art}
        <p className="text-xs text-content-secondary">
          At most {maxLines} lines of {columns} columns.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-content-primary">{doorName} — {label}</h3>
        {leave}
      </div>
      <DialogTabs
        tabs={[
          { id: 'art', label: 'Art', keepMounted: true, render: () => art },
          { id: 'settings', label: 'Settings', keepMounted: true, render: () => settings },
        ]}
      />
    </div>
  );
}

/**
 * The door-art editor in a dialog of its own, sized near the viewport: the
 * Screen Designer and Screen Health open a slot this way. The Doors page's
 * dialog embeds `DoorArtEditor` in its Art tab instead.
 *
 * A dialog announces itself as one (src/test/modal-semantics.test.tsx); the
 * Modal owns the shell, Escape and the backdrop, and its hidden title is the
 * accessible name.
 */
export function DoorArtDialog(props: DoorArtDialogProps) {
  return (
    <Modal open title={`${props.doorName} - ${props.label}`} fill showHeader={false} onClose={props.onClose}>
      <DoorArtEditor {...props} />
    </Modal>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { Undo2, Redo2, Save, X, Download, Upload } from 'lucide-react';
import type { DrawingTool } from '@amiexpress/bbs-door-sdk/engines/ui/ansi-editor/types';
import { AnsiCanvas } from './AnsiCanvas';
import { ANSI_COLOR_NAMES, ANSI_PALETTE, type PaletteMode } from '../utils/ansi-palette';
import { canvasToScreen } from '../pages/screen-bytes';
import {
  pointerToCanvas, typeCharacter, typeText, insertCharacter, centreLine,
  undo, redo, type EditorSurface, selectionHighlightRuns,
  copySelectedRegion, pasteRegion, cutSelectedRegion, selectedRegionToText, pasteText,
  type ClipboardRegion,
} from '../pages/screen-editor-state';
import { writeSystemText, readSystemText } from './system-clipboard';
import { getSelection } from '@amiexpress/bbs-door-sdk/engines/ui/ansi-editor/tools/drawing-tools';
import { findMciTokens, type MciToken, type MciReferenceShape } from '../pages/mci-tokens';
import { editorShortcut } from './editor-shortcuts';
import { MciPicker } from './MciPicker';
import { CodeChip } from './CodeChip';
import { tokenEdit, tokenRemoval } from '../pages/screen-mci';

/** The code exactly as it is written on the canvas, tilde to terminator. */
function tokenText(canvas: { char?: string }[][], token: MciToken): string {
  const row = canvas[token.line] ?? [];
  return row.slice(token.column, token.column + token.length)
    .map(cell => cell?.char ?? ' ')
    .join('');
}

/**
 * A screen's art, editable.
 *
 * The tools, the undo history and the bytes all belong to the SDK - this is
 * the chrome around them: which tool is chosen, which colours, where the
 * cursor is, and the two buttons that end the session. A screen the caller
 * sees is 80 columns wide, so the canvas is not resizable here; changing a
 * screen's size is a different operation from drawing on it.
 */

/** The tools that make sense on a screen. Named as the SDK names them. */
const TOOLS: { tool: DrawingTool; label: string; hotkey: string }[] = [
  { tool: 'text', label: 'Type', hotkey: 'Alt+T' },
  { tool: 'draw', label: 'Draw', hotkey: 'Alt+D' },
  { tool: 'line', label: 'Line', hotkey: 'Alt+L' },
  { tool: 'box', label: 'Box', hotkey: 'Alt+B' },
  { tool: 'box-fill', label: 'Filled box', hotkey: 'Alt+Shift+B' },
  { tool: 'ellipse', label: 'Ellipse', hotkey: 'Alt+E' },
  { tool: 'ellipse-fill', label: 'Filled ellipse', hotkey: 'Alt+Shift+E' },
  { tool: 'fill', label: 'Fill', hotkey: 'Alt+F' },
  { tool: 'pick', label: 'Pick', hotkey: 'Alt+P' },
  { tool: 'select', label: 'Select', hotkey: 'Alt+S' },
];

/** The characters ANSI art is actually drawn with, in the order a picker wants. */
const BRUSHES = ['█', '▓', '▒', '░', '▀', '▄', '▌', '▐', ' '];

export interface ScreenEditorProps {
  surface: EditorSurface;
  /** The file being edited, so the editor can offer it for download. */
  filePath?: string;
  /**
   * Replace the canvas from a local file the sysop picked.
   *
   * The bytes are decoded by the page, which owns the CP437 bridge; the editor
   * only knows that a new surface arrived. Nothing is written until Save - this
   * loads art INTO the editor, it does not replace the file on the board.
   */
  onLoadFile?: (file: File) => void;
  /**
   * Hand the sysop this file.
   *
   * The PAGE downloads, through the API client, because the endpoint is
   * behind the same auth as everything else and an `<a href>` cannot carry
   * an Authorization header - this button used to be a link, and answered
   * `{"error":"Access token required"}`. Absent means no Download button.
   */
  onDownload?: () => void;
  /** What the index knows about this file's MCI codes - which of them resolve. */
  mci?: MciReferenceShape[];
  onChange?: (surface: EditorSurface) => void;
  /** The edited screen as base64 - the same shape an uploaded file arrives in. */
  onSave?: (base64: string) => void;
  onCancel?: () => void;
  /**
   * A save is in flight. The button disables and says so: without this the
   * click answered with silence while the PUT plus refetch plus decode ran,
   * and "super slow to update" was the only possible reading.
   */
  saving?: boolean;
  /**
   * Show the art and its codes; change nothing.
   *
   * The board's own screen, opened by an artist who has not redrawn it into
   * their theme yet. One component in two modes rather than a viewer beside an
   * editor, for the reason RipScreenEditor gives: two things that draw the
   * same file differently drift, and the artist is then redrawing what the
   * viewer showed rather than what the board serves.
   */
  readOnly?: boolean;
}

export function ScreenEditor({
  surface, mci = [], filePath, onLoadFile, onDownload, onChange, onSave, onCancel, readOnly = false, saving = false,
}: ScreenEditorProps) {
  const [cursor, setCursor] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [pickingCode, setPickingCode] = useState(false);
  /**
   * Which palette the art is SHOWN in.
   *
   * AmiExpress on a real Amiga ran console.device, which has eight pens -
   * sixteen needed `ibmcon`, which almost nobody ran - and the Amiga had no
   * iCE colours at all (sysop, 2026-09-14). An artist drawing here has all
   * sixteen, because a web or telnet caller sees all sixteen; this switch
   * shows what the other half of the board's callers get, before the screen
   * is published rather than after.
   */
  const [palette, setPalette] = useState<PaletteMode>('full');
  /**
   * Typing pushes the rest of the row right instead of overwriting it.
   *
   * Overwrite is what this editor has always done, and it is wrong for the
   * commonest job there is: dropping a missing letter into a finished line
   * without redrawing the rest of it (artists, 2026-09-14). Off by default,
   * because overwrite is what an artist drawing blocks wants, and the Insert
   * key toggles it.
   */
  const [insertMode, setInsertMode] = useState(false);
  /** What Alt+C/X lifted: stamped back down by Alt+V at the cursor. A ref,
   *  not state - the canvas shows it only after a paste, which re-renders
   *  through onChange anyway. Dies with the dialog, like a real clipboard
   *  dies with the program. */
  const clipboard = useRef<ClipboardRegion | null>(null);
  /** The text the last Alt+C/Alt+X put on the SYSTEM clipboard, so Alt+V can
   *  tell our own copy from something copied outside the admin. */
  const exported = useRef<string | null>(null);
  /** A code already on the canvas, opened for changing rather than adding. */
  const [editingToken, setEditingToken] = useState<MciToken | null>(null);

  // Re-found on every change rather than tracked: a code is edited character by
  // character, and half of one is not a code.
  const tokens = useMemo(() => findMciTokens(surface.canvas, mci), [surface.canvas, mci]);
  // The select tool tracked its marquee internally and never showed it:
  // dragging selected invisibly (sysop, 2026-09-10: "can't select anything
  // with the mouse"). Live points first, committed bounds after mouse-up.
  const selectionHighlights = selectionHighlightRuns(getSelection(surface.state));

  const rows = surface.canvas.length;
  const cols = rows > 0 ? surface.canvas[0].length : 0;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Nothing typed reaches a screen that is not the artist's to change.
      if (readOnly) return;

      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

      // Highlighted page text belongs to the browser: Cmd+C on selected
      // help text copies the text, it does not lift canvas cells. (Alt+C
      // has no browser meaning and always means the canvas.)
      if ((event.ctrlKey || event.metaKey) && !event.altKey
        && ['c', 'x', 'v'].includes(event.key.toLowerCase())) {
        const pageSelection = window.getSelection();
        if (pageSelection && !pageSelection.isCollapsed) return;
      }

      // Moebius shortcuts first: undo/redo, colours, tools, cursor. Typing
      // and text-mode keys fall through to the branch below.
      // Backspace in Type mode keeps its typer's meaning (erase behind,
      // step back) rather than the shortcut table's cell-erase.
      if (surface.tool === 'text' && event.key === 'Backspace'
        && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        const x = Math.max(0, cursor.x - 1);
        onChange?.(typeCharacter(surface, x, cursor.y, ' '));
        setCursor({ x, y: cursor.y });
        return;
      }
      const sc = editorShortcut(event);
      if (sc.action !== 'none') {
        event.preventDefault();
        switch (sc.action) {
          case 'undo': onChange?.(undo(surface)); return;
          case 'redo': onChange?.(redo(surface)); return;
          case 'tool': onChange?.({ ...surface, tool: sc.tool }); return;
          case 'fg': onChange?.({ ...surface, fg: sc.index }); return;
          case 'bg': onChange?.({ ...surface, bg: sc.index }); return;
          case 'move':
            setCursor(c => ({
              x: Math.min(cols - 1, Math.max(0, c.x + sc.dx)),
              y: Math.min(rows - 1, Math.max(0, c.y + sc.dy)),
            }));
            return;
          case 'row':
            setCursor(c => ({ ...c, x: sc.edge === 'start' ? 0 : cols - 1 }));
            return;
          case 'page':
            setCursor(c => ({ ...c, y: Math.min(rows - 1, Math.max(0, c.y + sc.dy)) }));
            return;
          case 'delete':
            onChange?.(typeCharacter(surface, cursor.x, cursor.y, ' '));
            return;
          case 'insert-mode':
            setInsertMode(on => !on);
            return;
          case 'centre-line':
            onChange?.(centreLine(surface, cursor.y));
            return;
          case 'copy': {
            // Both clipboards: the system one carries plain text out to the
            // sysop's own editor, the internal one keeps colours for
            // canvas-to-canvas pastes. Either may be absent; Alt+V prefers
            // the internal one and falls back to the system's.
            clipboard.current = copySelectedRegion(surface);
            const text = selectedRegionToText(surface);
            exported.current = text;
            if (text) void writeSystemText(text);
            return;
          }
          case 'cut': {
            const cut = cutSelectedRegion(surface);
            clipboard.current = cut.region;
            const text = selectedRegionToText(surface);
            // Read the text BEFORE the blanking above: cut.surface already
            // committed, but `surface` still holds the lifted cells.
            exported.current = cut.region ? text : exported.current;
            if (cut.region) onChange?.(cut.surface);
            if (cut.region && text) void writeSystemText(text);
            return;
          }
          case 'paste':
            // Async: the system read may ask permission. The surface in this
            // closure is the one Alt+V was pressed on - a stroke drawn in the
            // meantime still applies, last write wins like everywhere else.
            void (async () => {
              const text = await readSystemText();
              const region = clipboard.current;
              /*
               * COLOURS FIRST.
               *
               * Alt+C writes both clipboards, and preferring the system read
               * meant Chrome handed back the plain text Alt+C had just
               * written: every canvas-to-canvas paste went through pasteText
               * and restamped the art in the CURRENT colours, silently losing
               * every foreground and background it had lifted. pasteRegion
               * was reachable only when the system read failed.
               *
               * So a region lifted HERE pastes as art. The system clipboard
               * is the fallback, for text that came from outside the admin -
               * which is exactly what a system clipboard holding something
               * other than our own export means.
               */
              if (region && (text === null || text === exported.current)) {
                onChange?.(pasteRegion(surface, cursor.x, cursor.y, region));
              } else if (text) {
                onChange?.(pasteText(surface, cursor.x, cursor.y, text));
              }
            })();
            return;
        }
      }

      // Typing belongs to the canvas only while the Type tool is chosen -
      // otherwise the sysop is searching, or filling in a field, and a screen
      // that ate those keystrokes would be unusable.
      if (surface.tool !== 'text') return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      if (event.key === 'Enter') { setCursor(c => ({ x: 0, y: Math.min(rows - 1, c.y + 1) })); }
      else if (event.key.length === 1) {
        onChange?.(insertMode
          ? insertCharacter(surface, cursor.x, cursor.y, event.key)
          : typeCharacter(surface, cursor.x, cursor.y, event.key));
        setCursor(c => ({ ...c, x: Math.min(cols - 1, c.x + 1) }));
      } else {
        return;
      }

      event.preventDefault();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [surface, cursor, cols, rows, onChange, readOnly]);

  // Selected tools, colours and brushes all read the same: a ring in the
  // board's accent, not a slightly stronger border (sysop, 2026-09-10:
  // "not clear enough which brushes and colors are selected").
  const selectedRing = (on: boolean) =>
    on ? 'border-border-strong ring-2 ring-accent' : 'border-border';
  const swatches = (which: 'fg' | 'bg') => (
    <div className="flex flex-wrap gap-1">
      {ANSI_PALETTE.map((color, index) => (
        <button
          key={`${which}-${index}`}
          type="button"
          aria-label={`${ANSI_COLOR_NAMES[index]} ${which === 'fg' ? 'foreground' : 'background'}`}
          title={which === 'fg' ? `Ctrl+${index}` : `Alt+${index}`}
          aria-pressed={(which === 'fg' ? surface.fg : surface.bg) === index}
          className={`w-5 h-5 border ${selectedRing((which === 'fg' ? surface.fg : surface.bg) === index)}`}
          style={{ backgroundColor: color }}
          onClick={() => onChange?.({ ...surface, [which]: index })}
        />
      ))}
    </div>
  );

  return (
    // Topaz throughout: the tools name the board's own things - characters,
    // colours, MCI codes - and reading them in the interface face while the
    // canvas was in Topaz made the editor feel like two programs.
    // Topaz is the BOARD's font and belongs to the art. On the section it
    // was inherited by every label, button and heading in the editor, so the
    // tool looked like the thing it edits. The canvas draws its own font and
    // the character picker below shows real board glyphs; those keep it.
    <section className="w-fit max-w-full space-y-3 border border-border p-3">
      {/* The editor is exactly as wide as the art: the section hugs the
          canvas instead of stretching to the dialog, so 80 columns on the
          board is 80 columns here. The viewport scrolls a wider screen
          inside rather than widening the tools with it. */}
      {/* The tools, the palette and the brushes: what a read-only view has no
          use for. The art below is the same in both modes. */}
      {!readOnly && (
      <>
      <div className="flex flex-wrap items-center gap-2">
        {TOOLS.map(({ tool, label, hotkey }) => (
          <button
            key={tool}
            type="button"
            aria-pressed={surface.tool === tool}
            title={hotkey}
            className={`px-2 py-1 text-sm border ${selectedRing(surface.tool === tool)} ${
              surface.tool === tool ? 'text-content-primary' : 'text-content-secondary'
            }`}
            onClick={() => onChange?.({ ...surface, tool })}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="text-xs text-content-secondary">
        Shortcuts: Alt+D/L/B/E/F/S/T/P tools (Shift for filled shapes), Ctrl+Digit foreground,
        Alt+Digit background, Ctrl+Z / Ctrl+Shift+Z undo/redo, arrows/Home/End/PageUp/PageDown/Delete move.
        Alt+S then drag selects; Alt+C/X copies/cuts to the system clipboard as text (and colours internally),
        Alt+V pastes it back at the cursor - click where you want it first. On a Mac, Cmd+C/X/V does the
        same, and the Delete-labelled key erases the cell.
      </p>

      <div className="flex flex-wrap items-start gap-6 text-sm">
        <label className="space-y-1">
          <span className="block text-content-secondary">Foreground</span>
          {swatches('fg')}
        </label>
        <label className="space-y-1">
          <span className="block text-content-secondary">Background</span>
          {swatches('bg')}
        </label>
        <div className="space-y-1">
          <span className="block text-content-secondary">Typing</span>
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              aria-pressed={insertMode}
              title="Insert - typing pushes the rest of the row right"
              className={`px-2 h-6 border ${selectedRing(insertMode)}`}
              onClick={() => setInsertMode(on => !on)}
            >
              {insertMode ? 'Insert' : 'Overwrite'}
            </button>
            <button
              type="button"
              title="Alt+Shift+C - centre this row between the edges"
              className="px-2 h-6 border border-border"
              onClick={() => onChange?.(centreLine(surface, cursor.y))}
            >
              Centre line
            </button>
          </div>
        </div>
        <div className="space-y-1">
          <span className="block text-content-secondary">Preview</span>
          {/*
            Not a restriction: the art keeps every colour it was drawn in and
            a web or telnet caller sees all sixteen. This shows the other half
            of the board - a caller on a real Amiga, where console.device had
            eight pens and no iCE colours - while there is still time to
            change the drawing.
          */}
          <button
            type="button"
            aria-pressed={palette === 'amiga'}
            title="Show the eight pens an Amiga caller has"
            className={`px-2 h-6 border ${selectedRing(palette === 'amiga')}`}
            onClick={() => setPalette(mode => (mode === 'amiga' ? 'full' : 'amiga'))}
          >
            Amiga colours
          </button>
        </div>
        <div className="space-y-1">
          <span className="block text-content-secondary">Character</span>
          <div className="flex flex-wrap gap-1">
            {BRUSHES.map(char => (
              <button
                key={char}
                type="button"
                aria-label={`Draw with ${char === ' ' ? 'a space' : char}`}
                aria-pressed={surface.char === char}
                className={`w-6 h-6 font-topaz border ${selectedRing(surface.char === char)}`}
                onClick={() => onChange?.({ ...surface, char })}
              >
                {char}
              </button>
            ))}
          </div>
        </div>
      </div>
      </>
      )}

      {/*
        A viewport, not the whole canvas.
        
        BBSTITLE on this board is several screens tall, and an unbounded
        container simply grew: the dialog scrolled instead, carrying the tool
        row and the colours off the top, and the sysop had no way to reach the
        bottom of the art while drawing. The canvas scrolls INSIDE its own box
        now, so the tools stay put.

        Black because that is the SCREEN's own background - ANSI colour 0 - not
        a surface of the admin's chrome.
      */}
      <div
        data-testid="canvas-viewport"
        className="max-h-[55vh] overflow-auto bg-black p-2"
      >
        <AnsiCanvas
          canvas={surface.canvas}
          palette={palette}
          cursor={!readOnly && surface.tool === 'text' ? cursor : null}
          highlights={[...tokens.map(token => ({
            x: token.column, y: token.line, length: token.length, broken: !token.resolves,
          })), ...selectionHighlights]}
          onCellPointer={readOnly ? undefined : (x, y, phase) => {
            // The paste cursor follows the mouse in EVERY tool, not just
            // Type: Alt+V stamps at the cursor, and a sysop who selected
            // with the mouse never touched the text cursor - without this
            // every paste landed at 0,0 (sysop, 2026-09-10).
            if (phase === 'down') setCursor({ x, y });
            if (surface.tool === 'text') {
              return;
            }
            onChange?.(pointerToCanvas(surface, x, y, phase));
          }}
        />
      </div>

      {!readOnly && (
      <div className="space-y-1 text-sm">
        <span className="block text-content-secondary">
          Codes go in at the text cursor - click where you want one first
        </span>
        <button
          type="button"
          className="px-2 py-1 border border-border text-content-secondary"
          onClick={() => setPickingCode(true)}
        >
          Insert a code
        </button>
      </div>
      )}

      <MciPicker
        open={pickingCode || editingToken !== null}
        onClose={() => { setPickingCode(false); setEditingToken(null); }}
        canvas={surface.canvas}
        cursor={editingToken ? { x: editingToken.column, y: editingToken.line } : cursor}
        editing={editingToken
          ? { text: tokenText(surface.canvas, editingToken), length: editingToken.length }
          : null}
        // The tilde that switches MCI on has to be the first character of the
        // first line, and the canvas is a grid, so that is cell 0,0.
        onEnable={() => onChange?.(typeText(surface, 0, 0, '~'))}
        onInsert={token => {
          if (editingToken) {
            // Written over the old code's cells, padded so no tail of it is
            // left behind as art - `~CC_a|` over `~CC_gwall|` would otherwise
            // read `~CC_a|all|`.
            const edit = tokenEdit(token, editingToken.length);
            onChange?.(typeText(surface, editingToken.column, editingToken.line, edit.text));
            setEditingToken(null);
            return;
          }

          onChange?.(typeText(surface, cursor.x, cursor.y, token));
          setCursor(c => ({ ...c, x: Math.min(cols - 1, c.x + token.length) }));
        }}
      />

      {tokens.length > 0 && (
        <div className="text-sm space-y-1">
          <h4 className="text-content-primary">
            This screen runs things - {tokens.length} MCI code{tokens.length === 1 ? '' : 's'}
          </h4>
          {/*
            Broken first. A code pointing at nothing is a menu item that fails
            only when a caller presses the key, so it is the one worth finding
            in a list of nine.
          */}
          <ul className="space-y-1">
            {[...tokens]
              .sort((a, b) => Number(a.resolves) - Number(b.resolves))
              .map((token, index) => (
                <li
                  key={`${token.line}-${token.column}-${index}`}
                  className="flex flex-wrap items-baseline gap-2"
                >
                  <span className="text-content-secondary">
                    line {token.line + 1}, column {token.column + 1}
                  </span>
                  {/*
                    A chip, not characters: a code is a thing the board RUNS,
                    and drawn in the board's own font on a line of its own it
                    reads as part of the picture.
                  */}
                  <CodeChip dead={!token.resolves}>
                    {tokenText(surface.canvas, token)}
                  </CodeChip>
                  {!token.resolves && (
                    <span className="text-status-danger">points at nothing</span>
                  )}
                  <button
                    type="button"
                    className="underline text-content-secondary"
                    onClick={() => setEditingToken(token)}
                  >
                    change
                  </button>
                  <button
                    type="button"
                    className="underline text-content-secondary"
                    onClick={() => {
                      // Blanked in place: the canvas is a grid, so a code is
                      // removed by returning its cells to spaces rather than
                      // by closing the gap and shifting the art left.
                      onChange?.(typeText(
                        surface, token.column, token.line, tokenRemoval(token.length),
                      ));
                    }}
                  >
                    remove
                  </button>
                </li>
              ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 text-sm">
        {onLoadFile && !readOnly && (
          <label className="inline-flex items-center gap-1 underline cursor-pointer">
            <Upload size={14} /> Open a file into the editor
            <input
              type="file"
              aria-label="Open a file into the editor"
              className="hidden"
              onChange={event => {
                const chosen = event.target.files?.[0];
                if (chosen) onLoadFile(chosen);
                event.target.value = '';
              }}
            />
          </label>
        )}
        {filePath && onDownload && (
          <button
            type="button"
            className="inline-flex items-center gap-1 underline"
            onClick={onDownload}
          >
            <Download size={14} /> Download
          </button>
        )}
        {!readOnly && (
          <>
            <button type="button" className="inline-flex items-center gap-1 underline"
              onClick={() => onChange?.(undo(surface))}>
              <Undo2 size={14} /> Undo
            </button>
            <button type="button" className="inline-flex items-center gap-1 underline"
              onClick={() => onChange?.(redo(surface))}>
              <Redo2 size={14} /> Redo
            </button>
            <button type="button" className="inline-flex items-center gap-1 underline disabled:opacity-50"
              disabled={saving}
              onClick={() => onSave?.(canvasToScreen(surface.canvas))}>
              <Save size={14} /> {saving ? 'Saving…' : 'Save'}
            </button>
          </>
        )}
        {onCancel && (
          <button type="button" aria-label={readOnly ? 'Close' : 'Cancel editing'}
            className="inline-flex items-center gap-1 underline text-content-secondary" onClick={onCancel}>
            <X size={14} /> {readOnly ? 'Close' : 'Cancel'}
          </button>
        )}
      </div>
    </section>
  );
}

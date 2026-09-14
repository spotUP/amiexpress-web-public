import { useEffect, useMemo, useRef, useState } from 'react';
import { Undo2, Redo2, Save, X, Download, Upload } from 'lucide-react';
import type { DrawingTool } from '@amiexpress/bbs-door-sdk/engines/ui/ansi-editor/types';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { AnsiCanvas } from './AnsiCanvas';
import { CELL_HEIGHT } from './ansi-canvas-paint';
import { ANSI_COLOR_NAMES, ANSI_PALETTE, type PaletteMode } from '../utils/ansi-palette';
import { useBoardPalette } from '../hooks/useBoardPalette';
import { canvasToScreen } from '../pages/screen-bytes';
import {
  pointerToCanvas, typeCharacter, typeText, insertCharacter, centreLine,
  undo, redo, type EditorSurface, selectionHighlightRuns,
  copySelectedRegion, pasteRegion, cutSelectedRegion, selectedRegionToText, pasteText,
  type ClipboardRegion, insertLine, removeLine,
} from '../pages/screen-editor-state';
import { writeSystemText, readSystemText } from './system-clipboard';
import { getSelection } from '@amiexpress/bbs-door-sdk/engines/ui/ansi-editor/tools/drawing-tools';
import { findMciTokens, tokenAt, explainToken, type MciToken, type MciReferenceShape } from '../pages/mci-tokens';
import { editorShortcut } from './editor-shortcuts';
import { editorHelp, onAMac } from './editor-help';
import { MciPicker } from './MciPicker';
import { CodeChip } from './CodeChip';
import { tokenEdit, tokenRemoval } from '../pages/screen-mci';
import { describeFold, foldRows, screenfulRows } from '../pages/screen-fold';

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

  /**
   * Ctrl+K and the Remove line button, which must not disagree.
   *
   * The row comes OUT - the screen is one shorter - so a cursor resting on the
   * last row would be left past the end, where nothing draws it: "the cursor
   * gets removed when i remove a line so its hard to see what i do" (the
   * sysop, 2026-09-14). Clamping it back onto the new last row keeps it where
   * the artist can see it, and keeps the next Ctrl+K working - a cursor past
   * the end is a row `removeLine` refuses.
   *
   * One function for both, because the keyboard and the button were separate
   * calls and only one of them had the clamp.
   */
  const removeCursorLine = () => {
    const shorter = removeLine(surface, cursor.y);
    if (shorter === surface) return;
    onChange?.(shorter);
    setCursor(c => ({ ...c, y: Math.max(0, Math.min(c.y, shorter.canvas.length - 1)) }));
  };
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
  /**
   * `null` until the artist says otherwise, and then their choice for the
   * rest of the session. Until then the preview follows the BOARD: a sysop
   * running eight colours has artists who should be looking at eight, not
   * remembering to press a button.
   */
  const [chosenPalette, setChosenPalette] = useState<PaletteMode | null>(null);
  const boardPalette = useBoardPalette();
  const palette = chosenPalette ?? boardPalette;
  const setPalette = (next: (mode: PaletteMode) => PaletteMode) =>
    setChosenPalette(next(palette));
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

  /*
   * WHAT THE CODE UNDER THE CURSOR DOES.
   *
   * The editor already found these and drew a box round them, which is the
   * least useful half of knowing: an artist could see that `~SS_` was special
   * and not what it was for. The sysop, 2026-09-14: "it would be nice if the
   * editor explained what the mci codes in the screen does as well".
   *
   * The catalog is the board's own (`/api/screens/mci/catalog`, the same
   * source MciPicker offers codes from), so the description here and the
   * description when inserting one cannot drift apart.
   */
  const catalogQuery = useQuery({
    queryKey: ['mci-catalog'],
    queryFn: () => apiClient.getMciCatalog(),
    staleTime: Infinity,
  });
  const catalog: { code: string; summary: string }[] = catalogQuery.data?.data?.codes ?? [];
  const hovered = tokenAt(tokens, cursor.y, cursor.x);
  const explained = hovered ? explainToken(hovered, catalog) : null;
  // The select tool tracked its marquee internally and never showed it:
  // dragging selected invisibly (sysop, 2026-09-10: "can't select anything
  // with the mouse"). Live points first, committed bounds after mouse-up.
  const selectionHighlights = selectionHighlightRuns(getSelection(surface.state));

  const rows = surface.canvas.length;
  /** Where the caller meets a More prompt, and the sentence that says so. */
  const folds = foldRows(rows);
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
          case 'remove-line':
            removeCursorLine();
            return;
          case 'insert-line':
            onChange?.(insertLine(surface, cursor.y));
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
    // `insertMode` belongs here: the listener READS it, so without it the
    // handler registered before the Insert key was pressed keeps the old
    // value. The effect happens to re-run on the next keystroke - `surface`
    // changes - so the cost was exactly one character typed in the wrong
    // mode straight after toggling, which is the hardest kind to notice.
  }, [surface, cursor, cols, rows, onChange, readOnly, insertMode]);

  // Selected tools, colours and brushes all read the same: a ring in the
  // board's accent, not a slightly stronger border (sysop, 2026-09-10:
  // "not clear enough which brushes and colors are selected").
  const selectedRing = (on: boolean) =>
    on ? 'border-border-strong ring-2 ring-accent' : 'border-border';
  /*
   * EIGHT SWATCHES ON AN EIGHT-PEN BOARD.
   *
   * AmiExpress ran console.device, which has eight pens; sixteen needed
   * `ibmcon` and almost nobody ran it, and the Amiga had no iCE colours - so a
   * board with `TERMINAL_COLOURS=8` folds every bright code on the way out
   * (eight-colour-session.util.ts). Offering an artist sixteen there is
   * offering eight choices that do nothing: they pick bright red, the caller
   * is sent red, and nothing in the editor said so.
   *
   * The preview already followed the board (`useBoardPalette`). The PICKER did
   * not, which is the half the artist actually touches. The sysop,
   * 2026-09-14: "the color palettes in the editors needs to respect the mode
   * the bbs is in as well 8/16 color mode".
   *
   * The art is not restricted - a screen already drawn in sixteen keeps every
   * byte, and a web or telnet caller still sees them. This is about what the
   * editor OFFERS.
   */
  const pens = palette === 'amiga' ? 8 : 16;
  const swatches = (which: 'fg' | 'bg') => (
    <div className="flex flex-wrap gap-1">
      {ANSI_PALETTE.slice(0, pens).map((color, index) => (
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
      {pens === 8 && (
        /*
         * Said, not silently missing. An artist who knows there are sixteen
         * and counts eight needs to know whether the editor is broken or the
         * board is eight-pen - and the toggle beside this switches back.
         */
        <span className="self-center text-xs text-content-secondary ml-1">
          8 pens (Amiga)
        </span>
      )}
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

        {/*
          THE LINE TOOLS BELONG WITH THE TOOLS, which is where the sysop looked
          for them: "why are those buttons not among the other buttons at the
          top?". They were below the canvas because that is where the markup
          was easiest to add them, which is not a reason.

          The row number is part of the label rather than a separate readout -
          the button says what it will act on, so there is nothing to look up
          before pressing it.
        */}
        <span className="mx-1 w-px self-stretch bg-border" aria-hidden="true" />
        <button
          type="button"
          title="Push a blank line in at the cursor; everything below moves down"
          className="px-2 py-1 text-sm border border-border text-content-secondary"
          onClick={() => onChange?.(insertLine(surface, cursor.y))}
        >
          Add line {cursor.y + 1}
        </button>
        <button
          type="button"
          title="Take the cursor's line out; everything below moves up"
          className="px-2 py-1 text-sm border border-border text-content-secondary"
          onClick={removeCursorLine}
        >
          Remove line {cursor.y + 1}
        </button>
      </div>
      {/*
        * The shortcuts, grouped by what an artist is trying to do.
        *
        * "this help text is chaotic and hard to read ... i dont even have all
        * the buttons on my mac m1 laptop keyboard" (sysop, 2026-09-14). It was
        * one paragraph listing twenty-odd keys in implementation order, and
        * five of them - Insert, Home, End, PageUp, PageDown - are not on the
        * keyboard he draws with. `editor-help.ts` spells them for THIS
        * platform, and folded away by default so the editor is not fronted by
        * a wall of text.
        */}
      <details className="text-xs">
        <summary className="cursor-pointer text-content-secondary">Keyboard shortcuts</summary>
        <div className="mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {editorHelp(onAMac()).map(group => (
            <div key={group.title} className="space-y-1">
              <h4 className="font-semibold text-content-primary">{group.title}</h4>
              {group.rows.map(row => (
                <div key={row.what} className="flex justify-between gap-3">
                  <span className="text-content-secondary">{row.what}</span>
                  <span className="whitespace-nowrap text-content-primary">{row.keys}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </details>

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
          {/*
            The label says WHICH palette is on the glass, the way the
            Overwrite/Insert button says which typing mode is on. A button
            that reads the same in both states leaves the ring as the only
            clue, and a ring is not a word: "the button itself needs to
            toggle as well it always says amiga colors" (sysop, 2026-09-14).
          */}
          <button
            type="button"
            aria-pressed={palette === 'amiga'}
            title="Switch between all sixteen colours and the eight pens an Amiga caller has"
            className={`px-2 h-6 border ${selectedRing(palette === 'amiga')}`}
            onClick={() => setPalette(mode => (mode === 'amiga' ? 'full' : 'amiga'))}
          >
            {palette === 'amiga' ? 'Amiga 8 colours' : 'All 16 colours'}
          </button>
        </div>
        <div className="space-y-1">
          <span className="block text-content-secondary">Character</span>
          <p className="text-xs text-content-secondary" data-testid="screen-fold-note">
        {describeFold(rows)}
      </p>
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
        className="max-h-[55vh] overflow-auto bg-black p-2 flex items-start"
      >
        {/*
          THE LINE NUMBERS, beside the art rather than over it.
          The board counts rows from 1 and so does a sysop describing a screen
          ("line 4 is the flt"), so this counts from 1 - it is a row number to
          talk about, not an array index. Aligned by sharing the canvas's own
          CELL_HEIGHT, which is the only thing that keeps a gutter honest when
          the art scrolls. The row the cursor is on is marked, because "add a
          line here" needs a visible here.
        */}
        <div
          data-testid="line-numbers"
          aria-hidden="true"
          className="select-none pr-2 text-right text-content-secondary"
          style={{ fontFamily: "'TopazPlus_a1200', 'Topaz_a1200', monospace", fontSize: 12 }}
        >
          {surface.canvas.map((_row, index) => {
            /*
             * The gutter says which screenful a line is on. A line the caller
             * reaches only by pressing a key is dimmed, and the boundary
             * carries the rule - "what is outside the screen", in the place
             * the artist is already looking when counting lines.
             */
            const pastFirst = index >= screenfulRows();
            const atFold = folds.includes(index);
            return (
              <div
                key={index}
                style={{
                  height: CELL_HEIGHT,
                  lineHeight: `${CELL_HEIGHT}px`,
                  borderTop: atFold ? '1px dashed currentColor' : undefined,
                }}
                className={
                  index === cursor.y ? 'text-content'
                    : pastFirst ? 'text-content-muted opacity-60'
                      : undefined
                }
                title={pastFirst ? `Screenful ${Math.floor(index / screenfulRows()) + 1}` : 'First screenful'}
              >
                {index + 1}
              </div>
            );
          })}
        </div>
        <AnsiCanvas
          canvas={surface.canvas}
          palette={palette}
          /* Where the caller's screen ends - see screen-fold.ts. */
          folds={folds}
          /*
           * Shown in EVERY tool, not only Text.
           *
           * It used to appear for the text tool alone, which was fine while
           * the cursor only marked where typing would land. It now says which
           * ROW the line keys and the Add/Remove line buttons will act on, and
           * an artist drawing in any other tool could not see what Ctrl+K was
           * about to take - reported 2026-09-14 as "hard to see what i do".
           */
          cursor={readOnly ? null : cursor}
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

      {/*
        Under the art, where the cursor is, rather than in a panel the artist
        has to look away to read. Shown in both modes: a read-only viewer
        asking "what does this screen do" is exactly who needs it.
      */}
      {explained && (
        <div data-testid="mci-explanation" className="text-sm border border-border p-2">
          <span className="font-mono text-content-primary">{explained.title}</span>
          {explained.target && (
            <span className="font-mono text-content-secondary"> {explained.target}</span>
          )}
          <span className="text-content-secondary"> - {explained.summary}</span>
          {explained.broken && (
            /*
              The fact the artist cannot get any other way. `resolves` is the
              board's own index answering whether this target exists, so a
              screen that will quietly do nothing says so while it is being
              drawn rather than after it ships.
            */
            <span className="block text-xs text-content-secondary mt-1">
              Nothing on this board answers to that yet.
            </span>
          )}
        </div>
      )}

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

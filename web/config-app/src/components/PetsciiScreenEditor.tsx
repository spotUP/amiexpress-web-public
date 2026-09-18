import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Undo2, Redo2, Save, X, Download, Upload } from 'lucide-react';
import {
  PetsciiCanvas, PetsciiMachine, C64_PALETTE_COLODORE,
  type PetsciiHighlight,
} from '@amiexpress/terminal';
import {
  blankSurface, surfaceFromBytes, stamp, stampChar, colorize, floodFill,
  insertLine, removeLine,
  typeChar, liftRegion, stampRegion, conformToBoard, BOARD_BACKGROUND,
  clearSurface, writeSeq,
  type PetsciiBrush, type PetsciiRegion, type PetsciiSurface,
} from '@amiexpress/bbs-door-sdk/petscii';
import { base64ToBytes, bytesToBase64 } from '../pages/screen-bytes';
import { petsciiMci } from '../pages/petscii-mci';
import type { MciReferenceShape } from '../pages/mci-tokens';
import { PetsciiCharsetBrowser } from './PetsciiCharsetBrowser';
import { CodeChip } from './CodeChip';

/**
 * A PETSCII screen, editable.
 *
 * The studio could edit ANSI and RIP and could only LOOK at a `.seq`, which
 * is the gap the sysop named twice. The layout is Petmate9's, which is what
 * they chose: the character set is the primary surface, not a dropdown.
 *
 * This component is chrome. The screen model and every tool are pure
 * functions in `sdk/petscii/editor-surface.ts`, the bytes are `writeSeq`'s,
 * and the picture is `PetsciiCanvas` - the same one the board's own C64
 * sessions are drawn on, so what an artist sees here is what a caller gets.
 *
 * It is never a second write path: it hands `onSave` the bytes and the page
 * writes them exactly as it writes an upload.
 */

/** Petmate's modes, in Petmate's order. Full English words, per the label rule. */
const TOOLS = [
  { tool: 'draw', label: 'Draw', hint: 'Character and colour' },
  { tool: 'character', label: 'Character only', hint: 'Keep the colour underneath' },
  { tool: 'colour', label: 'Colour only', hint: 'Keep the character underneath' },
  { tool: 'fill', label: 'Fill', hint: 'Flood the matching area' },
  { tool: 'brush', label: 'Brush', hint: 'Drag to lift, click to stamp' },
  { tool: 'text', label: 'Text', hint: 'Type on the screen' },
] as const;

type Tool = (typeof TOOLS)[number]['tool'];

/** The PETSCII control bytes the Text tool acts on; everything else is a character. */
const RETURN = 0x0d;
const DELETE = 0x14;
const CURSOR_DOWN = 0x11;
const CURSOR_UP = 0x91;
const CURSOR_RIGHT = 0x1d;
const CURSOR_LEFT = 0x9d;
const HOME = 0x13;

export interface PetsciiScreenEditorProps {
  /** The `.seq` file's own bytes, base64, as the preview route sends them. */
  content: string;
  filePath?: string;
  /** What the index knows about this file's MCI codes - which of them resolve. */
  mci?: MciReferenceShape[];
  /** The edited screen as base64 - the same shape an uploaded file arrives in. */
  onSave?: (base64: string) => void;
  onCancel?: () => void;
  /** Hand the sysop this file. The PAGE downloads, because the endpoint needs auth. */
  onDownload?: () => void;
  /**
   * Replace the screen from a local `.seq` the artist picked.
   *
   * OPTIONAL, and when it is absent the editor loads the file ITSELF - a
   * `.seq` is bytes this component already knows how to read, unlike an ANSI
   * drawing where the page owns the CP437 bridge. The sysop opened the editor
   * and found no way in ("i dont see a way to upload a petscii screen in the
   * petscii editor", 2026-09-14) because both mount sites left this out and
   * the control rendered only when a handler was passed.
   */
  onLoadFile?: (file: File) => void;
  /**
   * The HOST already offers a way to bring a file in, so this editor must not
   * offer a second one.
   *
   * Both were on screen in ArtistScreenDialog - the toolbar's loader and the
   * dialog's "Upload a drawing" - and renaming them was not enough: "still
   * broken" (sysop, 2026-09-15), because two controls is two controls whatever
   * they are called.
   *
   * It is a prop rather than an unconditional removal because the two mount
   * sites genuinely differ. ScreenFilesPage HIDES its own Replace button while
   * this editor is open (`!editingPetscii`, ScreenFilesPage.tsx), so there the
   * toolbar loader is the only way in - which is what "i dont see a way to
   * upload a petscii screen in the petscii editor" (sysop, 2026-09-14) was
   * about. ArtistScreenDialog keeps its upload visible, so there it is a
   * duplicate. The host knows which it is; the editor cannot.
   */
  hostOffersUpload?: boolean;
  saving?: boolean;
  /**
   * Show the art and its codes; change nothing. One component in two modes
   * rather than a viewer beside an editor, for the reason RipScreenEditor
   * gives: two things that draw the same file differently drift, and the
   * artist is then redrawing what the viewer showed rather than what the
   * board serves.
   */
  readOnly?: boolean;
}

export function PetsciiScreenEditor({
  content, filePath, mci = [], onSave, onCancel, onDownload, onLoadFile, hostOffersUpload = false,
  saving = false, readOnly = false,
}: PetsciiScreenEditorProps) {
  const [surface, setSurface] = useState<PetsciiSurface>(() =>
    conformToBoard(content ? surfaceFromBytes(base64ToBytes(content)) : blankSurface()));
  const [past, setPast] = useState<PetsciiSurface[]>([]);
  const [future, setFuture] = useState<PetsciiSurface[]>([]);
  const [brush, setBrush] = useState<PetsciiBrush>({ screenCode: 0x51, color: 1, reverse: false });
  const [tool, setTool] = useState<Tool>('draw');
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  /**
   * Whether this screen's `~` codes RUN.
   *
   * express.e opts a `.seq` into MCI on its first byte, once per file, so it
   * is a property of the file and the artist is the one who decides. A screen
   * full of codes with this off is art that prints its own code letters -
   * which is a legitimate thing to draw, and the reason this is a control
   * rather than something guessed from the content.
   */
  const [mciGate, setMciGate] = useState(() => base64ToBytes(content || '')[0] === 0x7e);
  /** What Brush lifted. A stroke's first corner while the pointer is still down. */
  const [region, setRegion] = useState<PetsciiRegion | null>(null);
  const strokeStart = useRef<{ x: number; y: number } | null>(null);

  const palette = C64_PALETTE_COLODORE;
  const background = palette[surface.background & 0x0f] ?? '#000000';
  const uploadInput = useRef<HTMLInputElement>(null);

  /** One machine for the canvas's lifetime; the surface is copied into it. */
  const machine = useMemo(() => new PetsciiMachine(), []);
  useEffect(() => {
    const state = machine.state;
    state.screen.set(surface.screen);
    state.colorRam.set(surface.colorRam);
    state.charsetBank = surface.charsetBank;
    state.background = surface.background;
    state.border = surface.border;
    state.cursorX = cursor.x;
    state.cursorY = cursor.y;
    state.cursorShown = !readOnly;
    // The canvas collapses a burst of these to one paint per animation frame.
    machine.onUpdate?.(true);
  }, [machine, surface, cursor, readOnly]);

  /** Every change goes through here, so undo never has to be remembered. */
  const commit = useCallback((next: PetsciiSurface) => {
    if (next === surface) return;
    setPast(stack => [...stack, surface]);
    setFuture([]);
    setSurface(next);
  }, [surface]);

  const undo = useCallback(() => {
    setPast(stack => {
      if (stack.length === 0) return stack;
      const previous = stack[stack.length - 1];
      setFuture(f => [surface, ...f]);
      setSurface(previous);
      return stack.slice(0, -1);
    });
  }, [surface]);

  const redo = useCallback(() => {
    setFuture(stack => {
      if (stack.length === 0) return stack;
      setPast(p => [...p, surface]);
      setSurface(stack[0]);
      return stack.slice(1);
    });
  }, [surface]);

  /** One cell, under whichever tool is chosen. */
  const applyAt = useCallback((x: number, y: number): PetsciiSurface => {
    switch (tool) {
      case 'draw': return stamp(surface, x, y, brush);
      case 'character': return stampChar(surface, x, y, brush);
      case 'colour': return colorize(surface, x, y, brush.color);
      case 'fill': return floodFill(surface, x, y, brush);
      case 'brush': return region ? stampRegion(surface, x, y, region) : surface;
      default: return surface;
    }
  }, [tool, surface, brush, region]);

  const onCellPointer = useCallback((event: { type: 'down' | 'move' | 'up'; x: number; y: number; buttons: number }) => {
    if (readOnly) return;
    setCursor({ x: event.x, y: event.y });

    if (tool === 'text') return;                 // the Text tool types; it does not paint
    if (tool === 'brush' && !region) {
      // Dragging with nothing in the brush LIFTS. The corners are the
      // pointer's down and up cells, in either order.
      if (event.type === 'down') strokeStart.current = { x: event.x, y: event.y };
      if (event.type === 'up' && strokeStart.current) {
        setRegion(liftRegion(surface, strokeStart.current, { x: event.x, y: event.y }));
        strokeStart.current = null;
      }
      return;
    }
    // A fill is one act per click; the others paint while the button is held.
    if (event.type === 'up') return;
    if (event.type === 'move' && (event.buttons === 0 || tool === 'fill')) return;
    commit(applyAt(event.x, event.y));
  }, [readOnly, tool, region, surface, commit, applyAt]);

  /**
   * The Text tool, through the canvas's own keyboard path.
   *
   * `PetsciiCanvas` already turns a key event into PETSCII bytes with the
   * board's keymap - the one a real C64 session uses - so the editor reads
   * bytes rather than keys and there is one keyboard model on this board.
   */
  const onData = useCallback((bytes: number[]) => {
    if (readOnly || tool !== 'text') return;
    let next = surface;
    let at = { ...cursor };
    for (const byte of bytes) {
      if (byte === RETURN) { at = { x: 0, y: Math.min(surface.rows - 1, at.y + 1) }; continue; }
      if (byte === HOME) { at = { x: 0, y: 0 }; continue; }
      if (byte === CURSOR_LEFT) { at = { ...at, x: Math.max(0, at.x - 1) }; continue; }
      if (byte === CURSOR_RIGHT) { at = { ...at, x: Math.min(surface.cols - 1, at.x + 1) }; continue; }
      if (byte === CURSOR_UP) { at = { ...at, y: Math.max(0, at.y - 1) }; continue; }
      if (byte === CURSOR_DOWN) { at = { ...at, y: Math.min(surface.rows - 1, at.y + 1) }; continue; }
      if (byte === DELETE) {
        const back = at.x > 0 ? { x: at.x - 1, y: at.y } : { x: surface.cols - 1, y: Math.max(0, at.y - 1) };
        next = stamp(next, back.x, back.y, { screenCode: 0x20, color: brush.color, reverse: false });
        at = back;
        continue;
      }
      const typed = typeChar(next, at.x, at.y, byte, brush.color, brush.reverse);
      next = typed.surface;
      at = typed.cursor;
    }
    setCursor(at);
    commit(next);
  }, [readOnly, tool, surface, cursor, brush, commit]);

  /** The codes, and the pi glyphs that would become codes. Found in the BYTES. */
  const { tokens, piCells } = useMemo(
    () => petsciiMci(surface, mciGate, mci),
    [surface, mciGate, mci],
  );

  const highlight = useMemo<PetsciiHighlight[]>(() => [
    ...tokens.map(token => ({
      x: token.column, y: token.line, w: token.length, h: 1,
      tone: token.resolves ? ('mci' as const) : ('mci-unresolved' as const),
    })),
    ...piCells.map(cell => ({ x: cell.x, y: cell.y, w: 1, h: 1, tone: 'mci-unresolved' as const })),
  ], [tokens, piCells]);

  const save = () => onSave?.(bytesToBase64(writeSeq(surface, { mciGate })));

  return (
    <div data-testid="petscii-screen-editor" className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        {!readOnly && (
          <div className="flex flex-col gap-3" style={{ minWidth: '18rem' }}>
            <PetsciiCharsetBrowser
              brush={brush}
              bank={surface.charsetBank}
              background={background}
              palette={palette}
              onBrush={setBrush}
            />

            <div className="flex flex-col gap-1">
              <span className="text-xs text-content-secondary">Tool</span>
              <div className="flex flex-wrap gap-1">
                {TOOLS.map(entry => (
                  <button
                    key={entry.tool}
                    type="button"
                    title={entry.hint}
                    aria-pressed={tool === entry.tool}
                    className={`px-2 py-1 text-sm border ${tool === entry.tool ? 'border-border-strong text-content-primary' : 'border-border text-content-secondary'}`}
                    onClick={() => { setTool(entry.tool); if (entry.tool !== 'brush') setRegion(null); }}
                  >
                    {entry.label}
                  </button>
                ))}

                {/*
                  WITH THE TOOLS, which is where they were looked for: "why are
                  those buttons not among the other buttons at the top?" (the
                  sysop, 2026-09-14). Below the canvas was where the markup was
                  easiest, which is not a reason.

                  The row number is in the label, so the button says what it
                  will act on rather than making the artist find a readout.
                */}
                <button
                  type="button"
                  title="Push a blank line in at the cursor; everything below moves down"
                  className="px-2 py-1 text-sm border border-border text-content-secondary"
                  onClick={() => commit(insertLine(surface, cursor.y, brush.color))}
                >
                  Add line {cursor.y + 1}
                </button>
                <button
                  type="button"
                  title="Take the cursor's line out; everything below moves up"
                  className="px-2 py-1 text-sm border border-border text-content-secondary"
                  onClick={() => commit(removeLine(surface, cursor.y, brush.color))}
                >
                  Remove line {cursor.y + 1}
                </button>
              </div>
              {tool === 'brush' && (
                <div className="flex items-center gap-2 text-xs text-content-secondary">
                  <span>{region ? `Holding ${region.cols} by ${region.rows}` : 'Drag to lift a shape'}</span>
                  {region && (
                    <button type="button" className="btn-small btn-secondary" onClick={() => setRegion(null)}>
                      Lift another
                    </button>
                  )}
                </div>
              )}
            </div>

            {/*
              No background picker. A C64 BBS runs on black and ties the border
              to it, so a colour chosen here would be a colour no caller sees -
              "dont let the user pick bg color" (sysop, 2026-09-14). The board's
              ground is stated instead, because a missing control with no
              explanation reads as a missing feature.
            */}
            <div className="flex flex-col gap-1">
              <span className="text-xs text-content-secondary">
                Background and border
              </span>
              <div className="flex items-center gap-2" data-testid="petscii-background-fixed">
                <span
                  className="h-5 w-5 border border-border"
                  style={{ background: palette[BOARD_BACKGROUND] }}
                />
                <span className="text-xs text-content-secondary">
                  Black, as every caller sees it.
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="flex-1" style={{ minWidth: '20rem' }}>
          <div data-testid="petscii-editor-canvas">
            <PetsciiCanvas
              machine={machine}
              palette={palette}
              onCellPointer={readOnly ? undefined : onCellPointer}
              onData={readOnly ? undefined : onData}
              focusable={!readOnly && tool === 'text'}
              gridVisible={!readOnly}
              highlight={highlight}
              cursorVisible={!readOnly && tool === 'text'}
            />
          </div>
        </div>
      </div>

      {!readOnly && (
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm text-content-secondary">
            <input
              type="checkbox"
              checked={mciGate}
              onChange={event => setMciGate(event.target.checked)}
            />
            This screen uses MCI codes
          </label>
          {piCells.length > 0 && (
            <div className="text-xs text-status-warn">
              {/* The hazard the 2026-09-02 MCI plan could only write down:
                  in a screen that uses MCI codes, every tilde byte is a code
                  candidate, and the pi glyph IS a tilde byte. */}
              <p>
                This screen uses MCI codes, so every tilde byte in it is read as the start of
                one - and the pi character is written as a tilde byte. The board may try to run
                these as codes:
              </p>
              <ul>
                {piCells.slice(0, 8).map(cell => (
                  <li key={`${cell.x}-${cell.y}`}>row {cell.y}, column {cell.x}</li>
                ))}
                {piCells.length > 8 && <li>and {piCells.length - 8} more</li>}
              </ul>
            </div>
          )}
        </div>
      )}

      {tokens.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-content-secondary">Codes in this screen:</span>
          {tokens.map((token, index) => (
            <CodeChip key={`${token.code}-${token.target}-${index}`} dead={!token.resolves}>
              ~{token.code}_{token.target}
            </CodeChip>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {!readOnly && (
          <>
            <button
              type="button"
              className="inline-flex items-center gap-1 px-2 py-1 border border-border-strong text-sm"
              disabled={saving}
              onClick={save}
            >
              <Save size={14} /> {saving ? 'Saving' : 'Save'}
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 px-2 py-1 border border-border text-sm"
              disabled={past.length === 0}
              onClick={undo}
            >
              <Undo2 size={14} /> Undo
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 px-2 py-1 border border-border text-sm"
              disabled={future.length === 0}
              onClick={redo}
            >
              <Redo2 size={14} /> Redo
            </button>
            <button
              type="button"
              className="px-2 py-1 border border-border text-sm text-content-secondary"
              onClick={() => commit(clearSurface(surface))}
            >
              Clear screen
            </button>
          </>
        )}
        {onCancel && (
          <button
            type="button"
            className="inline-flex items-center gap-1 px-2 py-1 border border-border text-sm"
            onClick={onCancel}
          >
            <X size={14} /> Close
          </button>
        )}
        {onDownload && (
          <button type="button" className="btn-small btn-secondary" onClick={onDownload}>
            <Download size={14} /> Download
          </button>
        )}
        {!readOnly && !hostOffersUpload && (
          <>
            {/*
              * "Open a file into the editor", not "Upload a drawing".
              *
              * This loads bytes ONTO THE CANVAS and writes nothing; the
              * dialog around it has an "Upload a drawing" that replaces the
              * file on the board. Both were on screen at once, both called a
              * drawing, doing opposite things: "this is weird in the petscii
              * editor the bottom row has a duplicate upload a drawing button"
              * (sysop, 2026-09-15). ScreenEditor already names the canvas-level
              * one this way, so this is the wording that existed, not a new one.
              *
              * The control itself stays self-serving - it renders whether or
              * not the page passes a handler - because that was the answer to
              * "i dont see a way to upload a petscii screen in the petscii
              * editor" (sysop, 2026-09-14) and neither mount site passes one.
              */}
            <button
              type="button"
              className="btn-small btn-secondary"
              onClick={() => uploadInput.current?.click()}
            >
              <Upload size={14} /> Open a file into the editor
            </button>
            <input
              ref={uploadInput}
              type="file"
              accept=".seq"
              aria-label="Open a file into the editor"
              className="hidden"
              onChange={async event => {
                const chosen = event.target.files?.[0];
                event.target.value = '';
                if (!chosen) return;
                // The page's handler wins when it has one; otherwise read the
                // bytes here. A `.seq` is screen codes, so it goes through
                // PetsciiMachine exactly as a saved file does - no CP437
                // bridge, nothing the page has to own.
                if (onLoadFile) { onLoadFile(chosen); return; }
                const bytes = new Uint8Array(await chosen.arrayBuffer());
                commit(conformToBoard(surfaceFromBytes(bytes)));
              }}
            />
          </>
        )}
        {filePath && <span className="text-xs text-content-secondary">{filePath}</span>}
      </div>
    </div>
  );
}

/**
 * The native teletext (.tti) editor.
 *
 * Modelled on PetsciiScreenEditor: same props, same layout, same toolbar.
 * The page is edited as the edit.tf frame (25 rows of 40 seven-bit codes,
 * sdk/teletext/editor-surface.ts) and DISPLAYED as the board renders it:
 * `frameToTti` writes the page, `renderNativeTti` renders it, and the ANSI
 * canvas paints the cells (teletext-cells.ts). There is no second teletext
 * renderer here, so what the artist sees is what a caller gets.
 *
 * It works like the ANSI screen editor: pick a foreground and a background
 * from the same swatches, then draw. Teletext has no per-cell colour, so the
 * model (paintMosaic, typeCharColoured) places the colour codes itself in the
 * free cell left of a run; when there is none it draws nothing and says so.
 *
 * The tools are the ANSI editor's, in its order and on its keys
 * (editor-shortcuts.ts), drawn on the 80x75 grid of sixels: Text, Draw
 * Blocks, Line, Box, Filled Box, Fill, Pick, plus Erase. The right button
 * or Alt erases while drawing. One stroke, button down to up, is one undo
 * step. The named control codes are folded away, for experts.
 *
 * Not mirrored: Ellipse (no sixel ellipse in the model yet), Select with
 * copy and paste (the model has liftRegion/stampRegion; the UI is not built),
 * Insert mode and Centre line (row-shuffling that would move colour codes).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Redo2, Save, Undo2, X } from 'lucide-react';
import {
  blankSurface,
  clearSurface,
  COLOUR_NEEDS_ROOM,
  eraseAt,
  fillSixels,
  insertLine,
  paintMosaic,
  paintSixels,
  pickColours,
  removeLine,
  setCode,
  sixelBox,
  sixelLine,
  typeChar,
  typeCharColoured,
  TELETEXT_CODES,
  TELETEXT_COLOUR_NAMES,
  type ColouredEdit,
  type Sixel,
  type TeletextCodeName,
  type TeletextColour,
  type TeletextSurface,
} from '@amiexpress/bbs-door-sdk/teletext/editor-surface';
import { FRAME_COLS, frameToTti, ttiToFrame } from '@amiexpress/bbs-door-sdk/teletext/edittf-frame';
import type { DrawingTool } from '@amiexpress/bbs-door-sdk/engines/ui/ansi-editor/types';
import { AnsiCanvas, type CellPointerDetail } from './AnsiCanvas';
import { ColourSwatches } from './ColourSwatches';
import { editorShortcut } from './editor-shortcuts';
import type { Highlight } from './ansi-canvas-paint';
import { TELETEXT_CELL, TELETEXT_DISPLAY_ROWS, TELETEXT_FONT_FAMILY, teletextCells } from './teletext-cells';
import { base64ToLatin1, latin1ToBase64 } from '../pages/screen-bytes';

export interface TeletextScreenEditorProps {
  /** The page as base64 of its latin1 bytes; empty for a page drawn from nothing. */
  content: string;
  filePath?: string;
  /** Receives the page as base64 of latin1 bytes: one byte per character. */
  onSave?: (base64: string) => void;
  onCancel?: () => void;
  saving?: boolean;
  readOnly?: boolean;
}

type TeletextTool = 'text' | 'blocks' | 'line' | 'box' | 'box-fill' | 'fill' | 'pick' | 'erase' | 'code';

/** The ANSI editor's tools that teletext has, in its order and on its keys. */
const TOOLS: Array<{ tool: TeletextTool; label: string; hotkey: string }> = [
  { tool: 'text', label: 'Type', hotkey: 'Alt+T' },
  { tool: 'blocks', label: 'Draw Blocks', hotkey: 'Alt+D' },
  { tool: 'line', label: 'Line', hotkey: 'Alt+L' },
  { tool: 'box', label: 'Box', hotkey: 'Alt+B' },
  { tool: 'box-fill', label: 'Filled box', hotkey: 'Alt+Shift+B' },
  { tool: 'fill', label: 'Fill', hotkey: 'Alt+F' },
  { tool: 'pick', label: 'Pick', hotkey: 'Alt+P' },
  { tool: 'erase', label: 'Erase', hotkey: 'Right button or Alt while drawing' },
];

/** An ANSI editor tool shortcut, as the teletext tool it means; null for one teletext lacks. */
const TOOL_FOR: Partial<Record<DrawingTool, TeletextTool>> = {
  text: 'text', draw: 'blocks', line: 'line', box: 'box', 'box-fill': 'box-fill', fill: 'fill', pick: 'pick',
};

/** Teletext has eight colours, and black has no Level 1 code as a foreground. */
const TELETEXT_COLOURS = 8;
const NO_BLACK_INK = 'Teletext has no black text or blocks; Black is a background only';

/** Every code by its full name, in the order a teletext artist reaches for them. */
const CODE_LABELS: Record<TeletextCodeName, string> = {
  alphaRed: 'Red Text',
  alphaGreen: 'Green Text',
  alphaYellow: 'Yellow Text',
  alphaBlue: 'Blue Text',
  alphaMagenta: 'Magenta Text',
  alphaCyan: 'Cyan Text',
  alphaWhite: 'White Text',
  graphicsRed: 'Red Graphics',
  graphicsGreen: 'Green Graphics',
  graphicsYellow: 'Yellow Graphics',
  graphicsBlue: 'Blue Graphics',
  graphicsMagenta: 'Magenta Graphics',
  graphicsCyan: 'Cyan Graphics',
  graphicsWhite: 'White Graphics',
  flash: 'Flash',
  steady: 'Steady',
  doubleHeight: 'Double Height',
  normalHeight: 'Normal Height',
  conceal: 'Conceal',
  contiguous: 'Contiguous Graphics',
  separated: 'Separated Graphics',
  blackBackground: 'Black Background',
  newBackground: 'New Background',
  hold: 'Hold Graphics',
  release: 'Release Graphics',
};

const CODE_NAMES = Object.keys(CODE_LABELS) as TeletextCodeName[];

const LAST_ROW = TELETEXT_DISPLAY_ROWS - 1;

function surfaceFrom(content: string): TeletextSurface {
  return content ? ttiToFrame(base64ToLatin1(content)) : blankSurface();
}

/** The sixel under the pointer: three rows of two in every cell. */
function sixelAt(x: number, y: number, detail: CellPointerDetail): Sixel {
  return { px: x * 2 + (detail.fx >= 0.5 ? 1 : 0), py: y * 3 + Math.min(2, Math.floor(detail.fy * 3)) };
}

export function TeletextScreenEditor({
  content, filePath, onSave, onCancel, saving = false, readOnly = false,
}: TeletextScreenEditorProps) {
  const [surface, setSurface] = useState<TeletextSurface>(() => surfaceFrom(content));
  const [past, setPast] = useState<TeletextSurface[]>([]);
  const [future, setFuture] = useState<TeletextSurface[]>([]);
  const [tool, setTool] = useState<TeletextTool>('text');
  const [code, setCodeName] = useState<TeletextCodeName>('alphaWhite');
  const [fg, setFg] = useState<TeletextColour>(7);
  const [bg, setBg] = useState<TeletextColour>(0);
  const [hint, setHint] = useState<string | null>(null);
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const [showCodes, setShowCodes] = useState(false);
  const typingArea = useRef<HTMLDivElement>(null);
  /** The page as the stroke found it, and where the stroke started; null between strokes. */
  const strokeStart = useRef<{ base: TeletextSurface; from: Sixel } | null>(null);

  const cells = useMemo(
    () => teletextCells(frameToTti(surface.cells, surface.meta)),
    [surface],
  );

  const codeCells = useMemo<Highlight[]>(() => {
    if (!showCodes) return [];
    const found: Highlight[] = [];
    for (let y = 0; y <= LAST_ROW; y++) {
      for (let x = 0; x < FRAME_COLS; x++) {
        if (surface.cells[y * FRAME_COLS + x] < 0x20) found.push({ x, y, length: 1 });
      }
    }
    return found;
  }, [surface, showCodes]);

  /** A change outside a stroke: its own undo step. */
  const commit = (next: TeletextSurface) => {
    if (next === surface) return;
    setPast(stack => [...stack, surface]);
    setFuture([]);
    setSurface(next);
  };

  /**
   * A stroke's change: the page is always the stroke's base plus its work so
   * far, and undo returns to the base in one step.
   */
  const strokeTo = (next: TeletextSurface) => {
    if (strokeStart.current && next !== surface) setSurface(next);
  };

  const endStroke = () => {
    const start = strokeStart.current;
    strokeStart.current = null;
    if (!start || start.base === surface) return;
    setPast(stack => [...stack, start.base]);
    setFuture([]);
  };

  /** A coloured edit draws, or says why it could not. */
  const coloured = (edit: ColouredEdit): TeletextSurface => {
    setHint(edit.blocked ? COLOUR_NEEDS_ROOM : null);
    return edit.surface;
  };

  const undo = () => {
    if (past.length === 0) return;
    setFuture(stack => [surface, ...stack]);
    setSurface(past[past.length - 1]);
    setPast(stack => stack.slice(0, -1));
  };

  const redo = () => {
    if (future.length === 0) return;
    setPast(stack => [...stack, surface]);
    setSurface(future[0]);
    setFuture(stack => stack.slice(1));
  };

  const onCellPointer = (x: number, y: number, phase: 'down' | 'move' | 'up', detail: CellPointerDetail) => {
    if (readOnly) return;
    if (phase === 'up') { endStroke(); return; }
    if (tool === 'text') {
      if (phase === 'down') {
        setCursor({ x, y });
        typingArea.current?.focus();
      }
      return;
    }
    if (tool === 'code') {
      if (phase === 'down') commit(setCode(surface, x, y, code));
      return;
    }
    if (tool === 'pick') {
      if (phase === 'down') {
        const picked = pickColours(surface, x, y);
        if (picked.fg !== 0) setFg(picked.fg);
        setBg(picked.bg);
      }
      return;
    }
    const at = sixelAt(x, y, detail);
    if (phase === 'down') strokeStart.current = { base: surface, from: at };
    const start = strokeStart.current;
    if (!start) return;
    const erase = tool === 'erase' || detail.altKey || detail.button === 2 || (detail.buttons & 2) !== 0;
    if (erase) { strokeTo(eraseAt(surface, at.px, at.py)); return; }
    switch (tool) {
      case 'blocks': strokeTo(coloured(paintMosaic(surface, at.px, at.py, fg, bg))); return;
      case 'line': strokeTo(coloured(paintSixels(start.base, sixelLine(start.from, at), fg, bg))); return;
      case 'box':
      case 'box-fill':
        strokeTo(coloured(paintSixels(start.base, sixelBox(start.from, at, tool === 'box-fill'), fg, bg)));
        return;
      case 'fill': if (phase === 'down') strokeTo(coloured(fillSixels(surface, at, fg, bg))); return;
      default: return;
    }
  };

  /* A stroke whose button went up off the page still ends. */
  useEffect(() => {
    const finish = () => { if (strokeStart.current) endStroke(); };
    window.addEventListener('pointerup', finish);
    return () => window.removeEventListener('pointerup', finish);
  });

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (readOnly) return;
    const { x, y } = cursor;
    // The ANSI editor's keys first: undo, redo, colours, tools, the cursor, lines.
    if (!(tool === 'text' && event.key === 'Backspace')) {
      const sc = editorShortcut(event);
      if (sc.action !== 'none') {
        let handled = true;
        switch (sc.action) {
          case 'undo': undo(); break;
          case 'redo': redo(); break;
          case 'tool': { const mapped = TOOL_FOR[sc.tool]; if (mapped) setTool(mapped); else handled = false; break; }
          case 'fg': if (sc.index > 0 && sc.index < TELETEXT_COLOURS) setFg(sc.index as TeletextColour); break;
          case 'bg': if (sc.index < TELETEXT_COLOURS) setBg(sc.index as TeletextColour); break;
          case 'move':
            setCursor({ x: Math.max(0, Math.min(FRAME_COLS - 1, x + sc.dx)), y: Math.max(0, Math.min(LAST_ROW, y + sc.dy)) });
            break;
          case 'row': setCursor({ x: sc.edge === 'start' ? 0 : FRAME_COLS - 1, y }); break;
          case 'page': setCursor({ x, y: Math.max(0, Math.min(LAST_ROW, y + sc.dy)) }); break;
          case 'delete': commit(typeChar(surface, x, y, 0x20).surface); break;
          case 'remove-line': commit(removeLine(surface, y)); break;
          case 'insert-line': commit(insertLine(surface, y)); break;
          default: handled = false;
        }
        if (handled) { event.preventDefault(); return; }
      }
    }
    if (tool !== 'text') return;
    let next = surface;
    let at = cursor;
    if (event.key === 'Enter') {
      at = { x: 0, y: Math.min(LAST_ROW, y + 1) };
    } else if (event.key === 'Backspace') {
      const back = { x: Math.max(0, x - 1), y };
      next = typeChar(surface, back.x, back.y, 0x20).surface;
      at = back;
    } else if (event.key.length === 1 && event.key >= ' ' && event.key <= '~' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const typed = typeCharColoured(surface, x, y, event.key.charCodeAt(0), fg, bg);
      next = coloured(typed);
      at = { x: typed.cursor.x, y: Math.min(LAST_ROW, typed.cursor.y) };
    } else {
      return;
    }
    event.preventDefault();
    setCursor(at);
    commit(next);
  };

  // One byte per character: frameToTti writes control codes as chars 0x80-0x9F.
  const save = () => onSave?.(latin1ToBase64(frameToTti(surface.cells, surface.meta)));

  // Selected is filled, as in the ANSI screen editor's toolbar.
  const toolButton = (pressed: boolean) =>
    `px-2 py-1 text-sm border ${pressed ? 'border-accent bg-accent text-content-inverse' : 'border-border text-content-secondary hover:bg-surface-3'}`;

  return (
    <div data-testid="teletext-screen-editor" className="flex flex-col gap-3">
      {!readOnly && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {TOOLS.map(entry => (
              <button
                key={entry.tool}
                type="button"
                title={entry.hotkey}
                aria-pressed={tool === entry.tool}
                className={toolButton(tool === entry.tool)}
                onClick={() => setTool(entry.tool)}
              >
                {entry.label}
              </button>
            ))}
            <span className="mx-1 w-px self-stretch bg-border" aria-hidden="true" />
            <button
              type="button"
              title="Push a blank line in at the cursor; everything below moves down"
              className={toolButton(false)}
              onClick={() => commit(insertLine(surface, cursor.y))}
            >
              Add line {cursor.y + 1}
            </button>
            <button
              type="button"
              title="Take the cursor's line out; everything below moves up"
              className={toolButton(false)}
              onClick={() => commit(removeLine(surface, cursor.y))}
            >
              Remove line {cursor.y + 1}
            </button>
          </div>

          <div className="flex flex-wrap items-start gap-6 text-sm">
            <div className="space-y-1">
              <span className="block text-content-secondary">Foreground</span>
              <ColourSwatches
                count={TELETEXT_COLOURS}
                role="foreground"
                names={TELETEXT_COLOUR_NAMES}
                selected={fg}
                titleFor={index => (index === 0 ? NO_BLACK_INK : `Ctrl+${index}`)}
                disabledFor={index => index === 0}
                onPick={index => setFg(index as TeletextColour)}
              />
            </div>
            <div className="space-y-1">
              <span className="block text-content-secondary">Background</span>
              <ColourSwatches
                count={TELETEXT_COLOURS}
                role="background"
                names={TELETEXT_COLOUR_NAMES}
                selected={bg}
                titleFor={index => `Alt+${index}`}
                onPick={index => setBg(index as TeletextColour)}
              />
            </div>
          </div>

          {hint && <p role="status" className="text-sm text-content-secondary">{hint}</p>}
        </>
      )}

      <div
        ref={typingArea}
        data-testid="teletext-editor-canvas"
        tabIndex={readOnly ? undefined : 0}
        aria-label="Teletext page"
        onKeyDown={onKeyDown}
        onContextMenu={event => { if (!readOnly) event.preventDefault(); }}
      >
        <AnsiCanvas
          canvas={cells}
          testId="teletext-canvas"
          fontFamily={TELETEXT_FONT_FAMILY}
          cell={TELETEXT_CELL}
          cursor={!readOnly && tool === 'text' ? cursor : null}
          highlights={codeCells}
          onCellPointer={readOnly ? undefined : onCellPointer}
        />
      </div>

      {!readOnly && (
        <details className="text-sm">
          <summary className="cursor-pointer text-content-secondary">Control Codes (experts)</summary>
          <div className="mt-2 space-y-2">
            <label className="flex items-center gap-2 text-content-secondary">
              <input
                type="checkbox"
                checked={showCodes}
                onChange={event => setShowCodes(event.target.checked)}
              />
              Show codes
            </label>
            <div className="flex flex-wrap gap-1" role="group" aria-label="Control codes">
              {CODE_NAMES.map(name => (
                <button
                  key={name}
                  type="button"
                  aria-pressed={tool === 'code' && code === name}
                  title={`Click a cell to put ${CODE_LABELS[name]} there (code ${TELETEXT_CODES[name]})`}
                  className={toolButton(tool === 'code' && code === name)}
                  onClick={() => { setCodeName(name); setTool('code'); }}
                >
                  {CODE_LABELS[name]}
                </button>
              ))}
            </div>
          </div>
        </details>
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
            <X size={14} /> Cancel
          </button>
        )}
        {filePath && <span className="text-xs text-content-secondary">{filePath}</span>}
      </div>
    </div>
  );
}

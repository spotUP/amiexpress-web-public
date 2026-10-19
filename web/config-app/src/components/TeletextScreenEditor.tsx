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
 * Tools:
 *  - Text: click a cell to place the cursor, then type.
 *  - Mosaic: click or drag plots sixels (three rows of two per cell); the
 *    right button, or Alt, clears them. Only cells in graphics mode take
 *    sixels, exactly as on a teletext set.
 *  - Control codes: pick one by name, then click the cell it goes in.
 */
import { useMemo, useRef, useState } from 'react';
import { Redo2, Save, Undo2, X } from 'lucide-react';
import {
  blankSurface,
  clearSurface,
  insertLine,
  plotMosaic,
  removeLine,
  setCode,
  typeChar,
  TELETEXT_CODES,
  type TeletextCodeName,
  type TeletextSurface,
} from '@amiexpress/bbs-door-sdk/teletext/editor-surface';
import { FRAME_COLS, frameToTti, ttiToFrame } from '@amiexpress/bbs-door-sdk/teletext/edittf-frame';
import { AnsiCanvas, type CellPointerDetail } from './AnsiCanvas';
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

type TeletextTool = 'text' | 'mosaic' | 'code';

const TOOLS: Array<{ tool: TeletextTool; label: string; hint: string }> = [
  { tool: 'text', label: 'Text', hint: 'Click a cell, then type' },
  { tool: 'mosaic', label: 'Mosaic', hint: 'Click or drag to plot; right button or Alt clears' },
  { tool: 'code', label: 'Control code', hint: 'Pick a code below, then click the cell it goes in' },
];

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

export function TeletextScreenEditor({
  content, filePath, onSave, onCancel, saving = false, readOnly = false,
}: TeletextScreenEditorProps) {
  const [surface, setSurface] = useState<TeletextSurface>(() => surfaceFrom(content));
  const [past, setPast] = useState<TeletextSurface[]>([]);
  const [future, setFuture] = useState<TeletextSurface[]>([]);
  const [tool, setTool] = useState<TeletextTool>('text');
  const [code, setCodeName] = useState<TeletextCodeName>('alphaWhite');
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const [showCodes, setShowCodes] = useState(false);
  const typingArea = useRef<HTMLDivElement>(null);

  // The board's renderer runs over the whole page; once per edit, not per paint.
  const cells = useMemo(
    () => teletextCells(frameToTti(surface.cells, surface.meta)),
    [surface],
  );

  // Show Codes rings every control-code cell: they draw as spaces on the set.
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

  /** Every change goes through here, so undo never has to be remembered. */
  const commit = (next: TeletextSurface) => {
    if (next === surface) return;
    setPast(stack => [...stack, surface]);
    setFuture([]);
    setSurface(next);
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
    if (readOnly || phase === 'up') return;
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
    // Mosaic: the sixel under the pointer. Right button or Alt clears it.
    const erase = detail.altKey || detail.button === 2 || (detail.buttons & 2) !== 0;
    const px = x * 2 + (detail.fx >= 0.5 ? 1 : 0);
    const py = y * 3 + Math.min(2, Math.floor(detail.fy * 3));
    commit(plotMosaic(surface, px, py, !erase));
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (readOnly || tool !== 'text') return;
    const { x, y } = cursor;
    let next = surface;
    let at = cursor;
    if (event.key === 'ArrowLeft') at = { x: Math.max(0, x - 1), y };
    else if (event.key === 'ArrowRight') at = { x: Math.min(FRAME_COLS - 1, x + 1), y };
    else if (event.key === 'ArrowUp') at = { x, y: Math.max(0, y - 1) };
    else if (event.key === 'ArrowDown' || event.key === 'Enter') {
      at = { x: event.key === 'Enter' ? 0 : x, y: Math.min(LAST_ROW, y + 1) };
    } else if (event.key === 'Backspace') {
      const back = { x: Math.max(0, x - 1), y };
      next = typeChar(surface, back.x, back.y, 0x20).surface;
      at = back;
    } else if (event.key.length === 1 && event.key >= ' ' && event.key <= '~' && !event.ctrlKey && !event.metaKey) {
      const typed = typeChar(surface, x, y, event.key.charCodeAt(0));
      next = typed.surface;
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

  const toolButton = (pressed: boolean) =>
    `px-2 py-1 text-sm border ${pressed ? 'border-border-strong text-content-primary' : 'border-border text-content-secondary'}`;

  return (
    <div data-testid="teletext-screen-editor" className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        {!readOnly && (
          <div className="flex flex-col gap-3" style={{ minWidth: '18rem', maxWidth: '24rem' }}>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-content-secondary">Tool</span>
              <div className="flex flex-wrap gap-1">
                {TOOLS.map(entry => (
                  <button
                    key={entry.tool}
                    type="button"
                    title={entry.hint}
                    aria-pressed={tool === entry.tool}
                    className={toolButton(tool === entry.tool)}
                    onClick={() => setTool(entry.tool)}
                  >
                    {entry.label}
                  </button>
                ))}
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
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs text-content-secondary">Control codes</span>
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

            <label className="flex items-center gap-2 text-sm text-content-secondary">
              <input
                type="checkbox"
                checked={showCodes}
                onChange={event => setShowCodes(event.target.checked)}
              />
              Show codes
            </label>
          </div>
        )}

        <div className="flex-1" style={{ minWidth: '20rem' }}>
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
        </div>
      </div>

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

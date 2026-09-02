import { useEffect, useMemo, useState } from 'react';
import { Undo2, Redo2, Save, X, Download, Upload } from 'lucide-react';
import type { DrawingTool } from '@amiexpress/bbs-door-sdk/engines/ui/ansi-editor/types';
import { AnsiCanvas } from './AnsiCanvas';
import { ANSI_COLOR_NAMES, ANSI_PALETTE } from '../utils/ansi-palette';
import { canvasToScreen } from '../pages/screen-bytes';
import {
  pointerToCanvas, typeCharacter, typeText, undo, redo, type EditorSurface,
} from '../pages/screen-editor-state';
import { findMciTokens, type MciToken, type MciReferenceShape } from '../pages/mci-tokens';
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
const TOOLS: { tool: DrawingTool; label: string }[] = [
  { tool: 'text', label: 'Type' },
  { tool: 'draw', label: 'Draw' },
  { tool: 'line', label: 'Line' },
  { tool: 'box', label: 'Box' },
  { tool: 'box-fill', label: 'Filled box' },
  { tool: 'ellipse', label: 'Ellipse' },
  { tool: 'fill', label: 'Fill' },
  { tool: 'select', label: 'Select' },
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
  /** What the index knows about this file's MCI codes - which of them resolve. */
  mci?: MciReferenceShape[];
  onChange: (surface: EditorSurface) => void;
  /** The edited screen as base64 - the same shape an uploaded file arrives in. */
  onSave: (base64: string) => void;
  onCancel: () => void;
}

export function ScreenEditor({
  surface, mci = [], filePath, onLoadFile, onChange, onSave, onCancel,
}: ScreenEditorProps) {
  const [cursor, setCursor] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [pickingCode, setPickingCode] = useState(false);
  /** A code already on the canvas, opened for changing rather than adding. */
  const [editingToken, setEditingToken] = useState<MciToken | null>(null);

  // Re-found on every change rather than tracked: a code is edited character by
  // character, and half of one is not a code.
  const tokens = useMemo(() => findMciTokens(surface.canvas, mci), [surface.canvas, mci]);

  const rows = surface.canvas.length;
  const cols = rows > 0 ? surface.canvas[0].length : 0;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Typing belongs to the canvas only while the Type tool is chosen -
      // otherwise the sysop is searching, or filling in a field, and a screen
      // that ate those keystrokes would be unusable.
      if (surface.tool !== 'text') return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

      if (event.key === 'ArrowLeft') { setCursor(c => ({ ...c, x: Math.max(0, c.x - 1) })); }
      else if (event.key === 'ArrowRight') { setCursor(c => ({ ...c, x: Math.min(cols - 1, c.x + 1) })); }
      else if (event.key === 'ArrowUp') { setCursor(c => ({ ...c, y: Math.max(0, c.y - 1) })); }
      else if (event.key === 'ArrowDown') { setCursor(c => ({ ...c, y: Math.min(rows - 1, c.y + 1) })); }
      else if (event.key === 'Enter') { setCursor(c => ({ x: 0, y: Math.min(rows - 1, c.y + 1) })); }
      else if (event.key === 'Backspace') {
        const x = Math.max(0, cursor.x - 1);
        onChange(typeCharacter(surface, x, cursor.y, ' '));
        setCursor({ x, y: cursor.y });
      } else if (event.key.length === 1) {
        onChange(typeCharacter(surface, cursor.x, cursor.y, event.key));
        setCursor(c => ({ ...c, x: Math.min(cols - 1, c.x + 1) }));
      } else {
        return;
      }

      event.preventDefault();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [surface, cursor, cols, rows, onChange]);

  const swatches = (which: 'fg' | 'bg') => (
    <div className="flex flex-wrap gap-1">
      {ANSI_PALETTE.map((color, index) => (
        <button
          key={`${which}-${index}`}
          type="button"
          aria-label={`${ANSI_COLOR_NAMES[index]} ${which === 'fg' ? 'foreground' : 'background'}`}
          aria-pressed={(which === 'fg' ? surface.fg : surface.bg) === index}
          className={`w-5 h-5 border ${
            (which === 'fg' ? surface.fg : surface.bg) === index
              ? 'border-border-strong'
              : 'border-border'
          }`}
          style={{ backgroundColor: color }}
          onClick={() => onChange({ ...surface, [which]: index })}
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
    <section className="space-y-3 border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        {TOOLS.map(({ tool, label }) => (
          <button
            key={tool}
            type="button"
            aria-pressed={surface.tool === tool}
            className={`px-2 py-1 text-sm border ${
              surface.tool === tool ? 'border-border-strong text-content-primary' : 'border-border text-content-secondary'
            }`}
            onClick={() => onChange({ ...surface, tool })}
          >
            {label}
          </button>
        ))}
      </div>

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
          <span className="block text-content-secondary">Character</span>
          <div className="flex flex-wrap gap-1">
            {BRUSHES.map(char => (
              <button
                key={char}
                type="button"
                aria-label={`Draw with ${char === ' ' ? 'a space' : char}`}
                aria-pressed={surface.char === char}
                className={`w-6 h-6 font-topaz border ${
                  surface.char === char ? 'border-border-strong' : 'border-border'
                }`}
                onClick={() => onChange({ ...surface, char })}
              >
                {char}
              </button>
            ))}
          </div>
        </div>
      </div>

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
          cursor={surface.tool === 'text' ? cursor : null}
          highlights={tokens.map(token => ({
            x: token.column, y: token.line, length: token.length, broken: !token.resolves,
          }))}
          onCellPointer={(x, y, phase) => {
            if (surface.tool === 'text') {
              if (phase === 'down') setCursor({ x, y });
              return;
            }
            onChange(pointerToCanvas(surface, x, y, phase));
          }}
        />
      </div>

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
        onEnable={() => onChange(typeText(surface, 0, 0, '~'))}
        onInsert={token => {
          if (editingToken) {
            // Written over the old code's cells, padded so no tail of it is
            // left behind as art - `~CC_a|` over `~CC_gwall|` would otherwise
            // read `~CC_a|all|`.
            const edit = tokenEdit(token, editingToken.length);
            onChange(typeText(surface, editingToken.column, editingToken.line, edit.text));
            setEditingToken(null);
            return;
          }

          onChange(typeText(surface, cursor.x, cursor.y, token));
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
                      onChange(typeText(
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
        {onLoadFile && (
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
        {filePath && (
          <a
            className="inline-flex items-center gap-1 underline"
            href={`/api/screens/file?path=${encodeURIComponent(filePath)}&download=1`}
          >
            <Download size={14} /> Download
          </a>
        )}
        <button type="button" className="inline-flex items-center gap-1 underline"
          onClick={() => onChange(undo(surface))}>
          <Undo2 size={14} /> Undo
        </button>
        <button type="button" className="inline-flex items-center gap-1 underline"
          onClick={() => onChange(redo(surface))}>
          <Redo2 size={14} /> Redo
        </button>
        <button type="button" className="inline-flex items-center gap-1 underline"
          onClick={() => onSave(canvasToScreen(surface.canvas))}>
          <Save size={14} /> Save
        </button>
        <button type="button" aria-label="Cancel editing"
          className="inline-flex items-center gap-1 underline text-content-secondary" onClick={onCancel}>
          <X size={14} /> Cancel
        </button>
      </div>
    </section>
  );
}

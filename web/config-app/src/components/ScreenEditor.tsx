import { useEffect, useMemo, useState } from 'react';
import { Undo2, Redo2, Save, X } from 'lucide-react';
import type { DrawingTool } from '@amiexpress/bbs-door-sdk/engines/ui/ansi-editor/types';
import { AnsiCanvas } from './AnsiCanvas';
import { ANSI_COLOR_NAMES, ANSI_PALETTE } from '../utils/ansi-palette';
import { canvasToScreen } from '../pages/screen-bytes';
import {
  pointerToCanvas, typeCharacter, typeText, undo, redo, type EditorSurface,
} from '../pages/screen-editor-state';
import { findMciTokens, MCI_INSERTS, type MciReferenceShape } from '../pages/mci-tokens';

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
  /** What the index knows about this file's MCI codes - which of them resolve. */
  mci?: MciReferenceShape[];
  onChange: (surface: EditorSurface) => void;
  /** The edited screen as base64 - the same shape an uploaded file arrives in. */
  onSave: (base64: string) => void;
  onCancel: () => void;
}

export function ScreenEditor({ surface, mci = [], onChange, onSave, onCancel }: ScreenEditorProps) {
  const [cursor, setCursor] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

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
              ? 'border-bbs-text'
              : 'border-bbs-border'
          }`}
          style={{ backgroundColor: color }}
          onClick={() => onChange({ ...surface, [which]: index })}
        />
      ))}
    </div>
  );

  return (
    <section className="space-y-3 border border-bbs-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        {TOOLS.map(({ tool, label }) => (
          <button
            key={tool}
            type="button"
            aria-pressed={surface.tool === tool}
            className={`px-2 py-1 text-sm border ${
              surface.tool === tool ? 'border-bbs-text text-bbs-text' : 'border-bbs-border text-bbs-muted'
            }`}
            onClick={() => onChange({ ...surface, tool })}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-start gap-6 text-sm">
        <label className="space-y-1">
          <span className="block text-bbs-muted">Foreground</span>
          {swatches('fg')}
        </label>
        <label className="space-y-1">
          <span className="block text-bbs-muted">Background</span>
          {swatches('bg')}
        </label>
        <div className="space-y-1">
          <span className="block text-bbs-muted">Character</span>
          <div className="flex flex-wrap gap-1">
            {BRUSHES.map(char => (
              <button
                key={char}
                type="button"
                aria-label={`Draw with ${char === ' ' ? 'a space' : char}`}
                aria-pressed={surface.char === char}
                className={`w-6 h-6 font-mono border ${
                  surface.char === char ? 'border-bbs-text' : 'border-bbs-border'
                }`}
                onClick={() => onChange({ ...surface, char })}
              >
                {char}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-auto bg-black p-2">
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
        <span className="block text-bbs-muted">Insert a code</span>
        <div className="flex flex-wrap gap-2">
          {MCI_INSERTS.map(insert => (
            <button
              key={insert.code}
              type="button"
              className="px-2 py-1 border border-bbs-border text-bbs-muted"
              onClick={() => {
                onChange(typeText(surface, cursor.x, cursor.y, insert.template));
                setCursor(c => ({ ...c, x: Math.min(cols - 1, c.x + insert.template.length) }));
              }}
            >
              {insert.label}
            </button>
          ))}
        </div>
      </div>

      {tokens.length > 0 && (
        <div className="text-sm space-y-1">
          <h4 className="text-bbs-text">
            This screen runs things - {tokens.length} MCI code{tokens.length === 1 ? '' : 's'}
          </h4>
          <ul className="font-mono">
            {tokens.map((token, index) => (
              <li key={`${token.line}-${token.column}-${index}`}
                className={token.resolves ? 'text-bbs-text' : 'text-red-400'}>
                line {token.line + 1}, column {token.column + 1}: ~{token.code}
                {token.target ? `_${token.target}` : '.'}
                {token.resolves ? '' : ' - points at nothing'}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center gap-3 text-sm">
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
          className="inline-flex items-center gap-1 underline text-bbs-muted" onClick={onCancel}>
          <X size={14} /> Cancel
        </button>
      </div>
    </section>
  );
}
